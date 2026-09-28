package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.dto.ChangePasswordRequest;
import com.kunzz.inventory.dto.ForgotPasswordRequest;
import com.kunzz.inventory.dto.LoginRequest;
import com.kunzz.inventory.dto.LoginResponse;
import com.kunzz.inventory.dto.ResetPasswordRequest;
import com.kunzz.inventory.dto.UserVO;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.security.BoundedExpiryMap;
import com.kunzz.inventory.service.AuthService;
import com.kunzz.inventory.service.PasswordResetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;

    // ---- 登录限速（对齐 Web security basics 第 5 节：15 分钟内最多 5 次失败尝试/IP）----
    private static final int MAX_FAILS = 5;
    private static final long WINDOW_MS = 15 * 60 * 1000L;
    /** 计数容器条数上限：键来自客户端 IP，用无界 Map 会被轮换 IP 头灌爆堆内存 */
    private static final int MAX_TRACKED_IPS = 10_000;

    private final BoundedExpiryMap<long[]> loginFails = new BoundedExpiryMap<>(WINDOW_MS, MAX_TRACKED_IPS); // ip → [次数, 窗口起点ms]
    private final BoundedExpiryMap<Long> blockedUntil = new BoundedExpiryMap<>(WINDOW_MS, MAX_TRACKED_IPS);

    /**
     * 客户端 IP（限速键）。取法必须保证「拿到的地址是代理自己算出来的」，客户端伪造不出来：
     *
     * ① 直连（socket 对端是公网地址）→ 对端就是真实客户端，忽略所有请求头；
     * ② 反代链且 X-Real-IP 已是公网地址 → 用它（nginx 用 $remote_addr 覆写，客户端给不出假值）；
     * ③ 反代链但 X-Real-IP 仍是内网地址 → 生产上 nginx 前面还有 Traefik + socat 转发容器，
     *    nginx 的 $remote_addr 是容器私网 IP，此时取 X-Forwarded-For 里**从右往左第一个公网地址**：
     *    真实客户端 IP 由最外层代理追加在最右，左边才是客户端自己发的（可伪造）——
     *    所以既不能取第一个元素（可伪造），也不能盲取最右（那里可能是内网代理跳）。
     */
    private String clientIp(jakarta.servlet.http.HttpServletRequest req) {
        String peer = req.getRemoteAddr();
        if (!isPrivateOrLoopback(peer)) {
            return peer;
        }
        String realIp = trimIp(req.getHeader("X-Real-IP"));
        if (realIp != null && !isPrivateOrLoopback(realIp)) {
            return realIp;
        }
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null) {
            String[] parts = xff.split(",");
            String rightmost = null;
            for (int i = parts.length - 1; i >= 0; i--) {
                String v = trimIp(parts[i]);
                if (v == null) continue;
                if (rightmost == null) rightmost = v; // 兜底：整条链都是内网时取最右一跳
                if (!isPrivateOrLoopback(v)) return v;
            }
            if (rightmost != null) return rightmost;
        }
        return realIp != null ? realIp : peer;
    }

    /** IP 字面量基本校验（限长 + 拒绝逗号等脏值）：请求头里的异常值不拿来做键 */
    private String trimIp(String raw) {
        if (raw == null) return null;
        String v = raw.trim();
        return (v.isEmpty() || v.length() > 45 || v.indexOf(',') >= 0) ? null : v;
    }

    /**
     * 内网 / 回环 / 链路本地 / ULA —— 这类地址不可能是"来自公网的客户端"，只可能是中间的代理跳。
     * 手写判断而不是 InetAddress.getByName：后者遇到主机名会触发 DNS 解析（公网接口上是可被利用的慢查询）。
     */
    private boolean isPrivateOrLoopback(String ip) {
        if (ip == null) return true;
        if (ip.indexOf(':') >= 0) { // IPv6（本部署是 IPv4，这里只做保守判断）
            String v = ip.toLowerCase();
            return v.equals("::1") || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")
                    || v.startsWith("::ffff:") || !v.matches("[0-9a-f:.]+");
        }
        String[] o = ip.split("\\.");
        if (o.length != 4) return true;
        int a, b;
        try {
            a = Integer.parseInt(o[0]);
            b = Integer.parseInt(o[1]);
        } catch (NumberFormatException e) {
            return true;
        }
        return a == 0 || a == 127 || a == 10
                || (a == 172 && b >= 16 && b <= 31)
                || (a == 192 && b == 168)
                || (a == 169 && b == 254);
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request,
                                            jakarta.servlet.http.HttpServletRequest req) {
        String ip = clientIp(req);
        Long until = blockedUntil.get(ip);
        if (until != null && System.currentTimeMillis() < until) {
            long mins = (until - System.currentTimeMillis()) / 60000 + 1;
            log.warn("[登录限速] 拒绝 IP {} 的登录尝试，约 {} 分钟后解锁", ip, mins);
            return ApiResponse.error(429, "登录尝试过多，请约 " + mins + " 分钟后再试");
        }
        try {
            ApiResponse<LoginResponse> resp = ApiResponse.ok(authService.login(request));
            loginFails.remove(ip); blockedUntil.remove(ip); // 登录成功清除计数（skipSuccessfulRequests 语义）
            return resp;
        } catch (org.springframework.security.core.AuthenticationException
                 | com.kunzz.inventory.common.BusinessException e) {
            long now = System.currentTimeMillis();
            long[] slot = loginFails.get(ip);
            if (slot == null || now - slot[1] > WINDOW_MS) { // 条目到期即视为新窗口
                slot = new long[]{0, now};
                loginFails.put(ip, slot);
            }
            if (++slot[0] >= MAX_FAILS) {
                blockedUntil.put(ip, now + WINDOW_MS);
                loginFails.remove(ip);
                // 打日志而不是静默锁定：办公室 NAT 下一个人连错 5 次会锁住全网出口，
                // 事后要能一眼看出是谁把这个 IP 锁了、锁到几点
                log.warn("[登录限速] IP {} 连续失败 {} 次，锁定 {} 分钟（期间该出口 IP 的所有设备都无法登录）",
                        ip, MAX_FAILS, WINDOW_MS / 60000);
            }
            throw e;
        }
    }

    @GetMapping("/me")
    public ApiResponse<UserVO> me(Authentication authentication) {
        User user = (User) authentication.getPrincipal();
        return ApiResponse.ok(UserVO.from(user));
    }

    /** 首次登录重设密码（需登录态；校验旧密码后更新并清除 is_first_login） */
    @PostMapping("/change-password")
    public ApiResponse<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                            Authentication authentication) {
        User user = (User) authentication.getPrincipal();
        authService.changePassword(user, request.oldPassword(), request.newPassword());
        return ApiResponse.ok();
    }

    /** 忘记密码第一步：往邮箱发 6 位验证码（未登录可访问，路径在 SecurityConfig 白名单里） */
    @PostMapping("/forgot-password")
    public ApiResponse<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request,
                                            jakarta.servlet.http.HttpServletRequest req) {
        passwordResetService.requestCode(request.email(), clientIp(req));
        return ApiResponse.ok();
    }

    /** 忘记密码第二步：校验验证码 → 设置新密码 */
    @PostMapping("/reset-password")
    public ApiResponse<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.resetPassword(request.email(), request.code(), request.newPassword());
        return ApiResponse.ok();
    }
}

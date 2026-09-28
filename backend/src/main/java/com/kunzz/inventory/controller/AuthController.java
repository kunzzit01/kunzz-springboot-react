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

    // ---- 登录限速（对齐 Web security basics 第 5 节）----
    // 分桶维度（2026-09-28 起）：
    //   ① 账号（主）：一个人连错密码只锁他自己，不会连累同网络的其他同事 —— 办公室共用一条出口 IP，
    //      按 IP 当主键会让「同事手误 5 次」把全公司锁 15 分钟（已实际发生）。
    //   ② 出口 IP（兜底）：同一个 IP 累计失败到 MAX_IP_FAILS 才锁整网，专门拦「拿一堆账号轮着试」的扫号器。
    private static final int MAX_FAILS = 5;
    private static final int MAX_IP_FAILS = 25;
    private static final long WINDOW_MS = 15 * 60 * 1000L;
    /** 计数容器条数上限：键来自请求方（账号名/IP），用无界 Map 会被灌爆堆内存 */
    private static final int MAX_TRACKED_KEYS = 10_000;
    /** 账号键长度上限：账号名由请求方给定，截断后再入内存（库里账号名远短于此） */
    private static final int MAX_ACCOUNT_KEY = 190;

    private final BoundedExpiryMap<long[]> accountFails = new BoundedExpiryMap<>(WINDOW_MS, MAX_TRACKED_KEYS); // 账号 → [次数, 窗口起点ms]
    private final BoundedExpiryMap<Long> accountLockedUntil = new BoundedExpiryMap<>(WINDOW_MS, MAX_TRACKED_KEYS);
    private final BoundedExpiryMap<long[]> ipFails = new BoundedExpiryMap<>(WINDOW_MS, MAX_TRACKED_KEYS);      // IP → [次数, 窗口起点ms]
    private final BoundedExpiryMap<Long> ipLockedUntil = new BoundedExpiryMap<>(WINDOW_MS, MAX_TRACKED_KEYS);

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
     * 先做字面量正则再交给 InetAddress：后者遇到主机名会触发 DNS 解析（公网接口上等于一个可被利用的慢查询）。
     */
    private boolean isPrivateOrLoopback(String ip) {
        if (ip == null) return true;
        boolean hasColon = ip.indexOf(':') >= 0;
        boolean looksLiteral = hasColon ? ip.matches("[0-9a-fA-F:.]+") : ip.matches("\\d{1,3}(\\.\\d{1,3}){3}");
        if (!looksLiteral) return true;
        try {
            java.net.InetAddress a = java.net.InetAddress.getByName(ip);
            if (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress()) return true;
            byte[] b = a.getAddress();
            return b.length == 16 && (b[0] & 0xfe) == 0xfc; // IPv6 ULA fc00::/7（isSiteLocalAddress 不覆盖）
        } catch (Exception e) {
            return true;
        }
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request,
                                            jakarta.servlet.http.HttpServletRequest req) {
        String ip = clientIp(req);
        String account = accountKey(request.username());
        long now = System.currentTimeMillis();

        Long accountLeft = lockRemainingMs(accountLockedUntil, account, now);
        if (accountLeft != null) {
            long mins = accountLeft / 60000 + 1;
            log.warn("[登录限速] 拒绝账号 {} 的登录尝试，约 {} 分钟后解锁（仅该账号受影响）", account, mins);
            return ApiResponse.error(429, "该账号登录尝试过多，请约 " + mins + " 分钟后再试");
        }
        Long ipLeft = lockRemainingMs(ipLockedUntil, ip, now);
        if (ipLeft != null) {
            long mins = ipLeft / 60000 + 1;
            log.warn("[登录限速] 拒绝 IP {} 的登录尝试，约 {} 分钟后解锁（同出口 IP 兜底锁定）", ip, mins);
            return ApiResponse.error(429, "登录尝试过多，请约 " + mins + " 分钟后再试");
        }
        try {
            ApiResponse<LoginResponse> resp = ApiResponse.ok(authService.login(request));
            // 登录成功清除计数（skipSuccessfulRequests 语义）：账号与 IP 两边都清 ——
            // 办公室共用出口时，一次正常登录就能把兜底计数归零，进一步减少误锁
            accountFails.remove(account); accountLockedUntil.remove(account);
            ipFails.remove(ip); ipLockedUntil.remove(ip);
            return resp;
        } catch (org.springframework.security.core.AuthenticationException
                 | com.kunzz.inventory.common.BusinessException e) {
            long[] a = bump(accountFails, account, now);
            if (a[0] >= MAX_FAILS) {
                accountLockedUntil.put(account, now + WINDOW_MS);
                accountFails.remove(account);
                // 打日志而不是静默锁定：事后要能一眼看出是哪个账号被锁、锁到几点
                log.warn("[登录限速] 账号 {} 连续失败 {} 次，锁定 {} 分钟（仅该账号；期间正确密码也会被拒）",
                        account, MAX_FAILS, WINDOW_MS / 60000);
            }
            long[] p = bump(ipFails, ip, now);
            if (p[0] >= MAX_IP_FAILS) {
                ipLockedUntil.put(ip, now + WINDOW_MS);
                ipFails.remove(ip);
                log.warn("[登录限速] 出口 IP {} 累计失败 {} 次，锁定 {} 分钟（该出口的所有设备都受影响）",
                        ip, MAX_IP_FAILS, WINDOW_MS / 60000);
            }
            throw e;
        }
    }

    /** 账号键：去空白 + 转小写（登录本身不区分大小写），并截断，避免超长字符串进内存 */
    private String accountKey(String username) {
        if (username == null) return "";
        String k = username.trim().toLowerCase(java.util.Locale.ROOT);
        return k.length() > MAX_ACCOUNT_KEY ? k.substring(0, MAX_ACCOUNT_KEY) : k;
    }

    /** 固定窗口计数：窗口过期就重新起算（返回的数组是容器里的同一个对象，调用方自增即可） */
    private long[] bump(BoundedExpiryMap<long[]> counters, String key, long now) {
        long[] slot = counters.get(key);
        if (slot == null || now - slot[1] > WINDOW_MS) {
            slot = new long[]{0, now};
            counters.put(key, slot);
        }
        slot[0]++;
        return slot;
    }

    /** 剩余锁定毫秒数；未锁或已到期返回 null（到期即解锁） */
    private Long lockRemainingMs(BoundedExpiryMap<Long> locks, String key, long now) {
        Long until = locks.get(key);
        return (until != null && now < until) ? (until - now) : null;
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

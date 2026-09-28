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
     * 客户端 IP（限速键）。只信 nginx 覆写的 X-Real-IP（= $remote_addr，客户端给不出假值），
     * 且仅在直连方是本机/内网代理时才采用；否则退回 socket 对端地址。
     *
     * 不读 X-Forwarded-For 的第一个元素：生产 nginx 用 $proxy_add_x_forwarded_for（追加语义），
     * 第一个元素是客户端自己发的 —— 拿它当键既能被伪造绕过限速，也能被伪造成别人 IP 去锁死对方。
     */
    private String clientIp(jakarta.servlet.http.HttpServletRequest req) {
        String peer = req.getRemoteAddr();
        if (isTrustedPeer(peer)) {
            String realIp = req.getHeader("X-Real-IP");
            if (realIp != null) {
                String v = realIp.trim();
                // $remote_addr 恒为 IP 字面量；这里再挡掉明显的异常值，避免脏键
                if (!v.isEmpty() && v.length() <= 45 && v.indexOf(',') < 0) {
                    return v;
                }
            }
        }
        return peer;
    }

    /** 直连方是本机/内网（生产为 nginx 反代 127.0.0.1:8081）才认为它能代表真实客户端 */
    private boolean isTrustedPeer(String peer) {
        try {
            java.net.InetAddress a = java.net.InetAddress.getByName(peer); // peer 来自 socket，无 DNS 解析风险
            return a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress();
        } catch (Exception e) {
            return false;
        }
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

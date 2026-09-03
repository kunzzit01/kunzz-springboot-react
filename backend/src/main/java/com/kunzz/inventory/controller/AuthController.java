package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.dto.ChangePasswordRequest;
import com.kunzz.inventory.dto.LoginRequest;
import com.kunzz.inventory.dto.LoginResponse;
import com.kunzz.inventory.dto.UserVO;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    // ---- 登录限速（对齐 Web security basics 第 5 节：15 分钟内最多 5 次失败尝试/IP）----
    private static final int MAX_FAILS = 5;
    private static final long WINDOW_MS = 15 * 60 * 1000L;
    private final Map<String, long[]> loginFails = new java.util.concurrent.ConcurrentHashMap<>(); // ip → [次数, 窗口起点ms]
    private final Map<String, Long> blockedUntil = new java.util.concurrent.ConcurrentHashMap<>();

    private String clientIp(jakarta.servlet.http.HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        return (xff != null && !xff.isBlank()) ? xff.split(",")[0].trim() : req.getRemoteAddr();
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request,
                                            jakarta.servlet.http.HttpServletRequest req) {
        String ip = clientIp(req);
        Long until = blockedUntil.get(ip);
        if (until != null && System.currentTimeMillis() < until) {
            long mins = (until - System.currentTimeMillis()) / 60000 + 1;
            return ApiResponse.error(429, "登录尝试过多，请约 " + mins + " 分钟后再试");
        }
        try {
            ApiResponse<LoginResponse> resp = ApiResponse.ok(authService.login(request));
            loginFails.remove(ip); blockedUntil.remove(ip); // 登录成功清除计数（skipSuccessfulRequests 语义）
            return resp;
        } catch (org.springframework.security.core.AuthenticationException
                 | com.kunzz.inventory.common.BusinessException e) {
            long now = System.currentTimeMillis();
            long[] slot = loginFails.computeIfAbsent(ip, k -> new long[]{0, now});
            if (now - slot[1] > WINDOW_MS) { slot[0] = 0; slot[1] = now; }
            if (++slot[0] >= MAX_FAILS) {
                blockedUntil.put(ip, now + WINDOW_MS);
                loginFails.remove(ip);
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
}

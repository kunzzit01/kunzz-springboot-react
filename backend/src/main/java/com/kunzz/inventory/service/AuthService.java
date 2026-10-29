package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.LoginRequest;
import com.kunzz.inventory.dto.LoginResponse;
import com.kunzz.inventory.dto.UserVO;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.repository.UserRepository;
import com.kunzz.inventory.security.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final Argon2PasswordEncoder argon2PasswordEncoder;
    private final JwtService jwtService;
    private final DeviceTokenService deviceTokenService;

    /**
     * 登录。
     *
     * 勾选「记住我」时额外签发一个设备令牌（见 DeviceTokenService）——
     * JWT 仍然只有 24 小时，但设备令牌 90 天滚动，JWT 过期后前端用它静默续登，
     * 所以「重启电脑后打开 /dashboard 直接进页面」成立，而 JWT 生命周期没被拉长。
     */
    public LoginResponse login(LoginRequest request, String userAgent, String ip) {
        String username = request.username().trim();
        User user = userRepository.findByUsername(username)
                .or(() -> userRepository.findByEmail(username))
                .orElseThrow(() -> new BusinessException(401, "用户名或密码错误"));

        boolean bcryptOk = passwordEncoder.matches(request.password(), user.getPassword());
        boolean argon2Ok = !bcryptOk && argon2PasswordEncoder.matches(request.password(), user.getPassword());
        if (!bcryptOk && !argon2Ok) {
            throw new BusinessException(401, "用户名或密码错误");
        }
        String jwt = jwtService.generateToken(user);
        UserVO vo = UserVO.from(user);
        boolean mustChange = Boolean.TRUE.equals(user.getIsFirstLogin());
        LoginResponse plain = LoginResponse.of(jwt, vo, mustChange);
        // 这台浏览器上一轮的设备令牌先作废（避免同一台电脑在「登录设备」里出一条重复行；
        // 未勾选记住我时也要作废，否则旧的「记住」会把用户叉回去）
        try {
            deviceTokenService.revokeByToken(request.previousDeviceToken());
        } catch (Exception e) {
            log.warn("[记住设备] 旧设备令牌回收失败（可忽略）：{}", e.toString());
        }
        if (!request.rememberMe()) return plain;
        try {
            DeviceTokenService.Issued issued = deviceTokenService.issue(
                    user, request.deviceName(), userAgent, ip);
            return new LoginResponse(jwt, vo, mustChange,
                    issued.token(), issued.deviceId(), issued.expiresAtMs());
        } catch (Exception e) {
            // 降级：设备表没建 / 写库失败都不该把用户挡在门外，本次仍按普通登录返回
            log.warn("[记住设备] 设备令牌签发失败，本次仅返回普通 JWT（是否未执行 "
                    + "add_new_tables_user_devices.sql？）：{}", e.toString());
            return plain;
        }
    }

    /**
     * 静默续登：用设备令牌换新 JWT（重启电脑后打开 /dashboard 走这条路）。
     * 令牌无效/过期/已撤销 → 401，前端回登录页。
     */
    public LoginResponse refresh(String deviceToken, String ip) {
        var device = deviceTokenService.verifyAndTouch(deviceToken, ip)
                .orElseThrow(() -> new BusinessException(401, "免登录已失效，请重新登入"));
        User user = userRepository.findById(device.getUserId())
                .orElseThrow(() -> new BusinessException(401, "账号不存在或已停用"));
        return LoginResponse.of(jwtService.generateToken(user), UserVO.from(user),
                Boolean.TRUE.equals(user.getIsFirstLogin()));
    }

    /** 首次登录重设密码：校验旧密码 → 设新密码 → 清除 is_first_login */
    public void changePassword(User user, String oldPassword, String newPassword) {
        boolean bcryptOk = passwordEncoder.matches(oldPassword, user.getPassword());
        boolean argon2Ok = !bcryptOk && argon2PasswordEncoder.matches(oldPassword, user.getPassword());
        if (!bcryptOk && !argon2Ok) {
            throw new BusinessException(400, "当前密码不正确");
        }
        if (newPassword == null || newPassword.trim().length() < 6) {
            throw new BusinessException(400, "新密码至少 6 位");
        }
        if (newPassword.equals(oldPassword)) {
            throw new BusinessException(400, "新密码不能与当前密码相同");
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setIsFirstLogin(false);
        userRepository.save(user);
    }
}

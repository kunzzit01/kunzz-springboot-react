package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.LoginRequest;
import com.kunzz.inventory.dto.LoginResponse;
import com.kunzz.inventory.dto.UserVO;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.repository.UserRepository;
import com.kunzz.inventory.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final Argon2PasswordEncoder argon2PasswordEncoder;
    private final JwtService jwtService;

    public LoginResponse login(LoginRequest request) {
        String username = request.username().trim();
        User user = userRepository.findByUsername(username)
                .or(() -> userRepository.findByEmail(username))
                .orElseThrow(() -> new BusinessException(401, "用户名或密码错误"));

        boolean bcryptOk = passwordEncoder.matches(request.password(), user.getPassword());
        boolean argon2Ok = !bcryptOk && argon2PasswordEncoder.matches(request.password(), user.getPassword());
        if (!bcryptOk && !argon2Ok) {
            throw new BusinessException(401, "用户名或密码错误");
        }
        return new LoginResponse(jwtService.generateToken(user), UserVO.from(user),
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

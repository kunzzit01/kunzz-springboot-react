package com.kunzz.inventory.config;

import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 初始化演示账号（不影响老库已有用户）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        if (!userRepository.existsByUsername("demo")) {
            User demo = new User();
            demo.setUsername("demo");
            demo.setUsernameCn("演示账号");
            demo.setNickname("演示");
            demo.setEmail("demo@kunzz.local");
            demo.setPassword(passwordEncoder.encode("demo123"));
            demo.setAccountType("special");
            demo.setBranch("j1,j2,j3");
            userRepository.save(demo);
            log.info("已创建演示账号 demo/demo123（老库账号亦可登录）");
        }
    }
}

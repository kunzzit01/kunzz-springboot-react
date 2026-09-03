package com.kunzz.inventory.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kunzz.inventory.common.ApiResponse;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final ObjectMapper objectMapper;
    @org.springframework.beans.factory.annotation.Value("${cors.allowed-origins:}")
    private String corsAllowedOrigins;

    /**
     * BCrypt 为主（兼容老库 $2y$ 哈希）
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        // strength 12（对齐 Web security basics 第 3 节建议；旧哈希验证不受影响，bcrypt cost 自包含）
        return new BCryptPasswordEncoder(12);
    }

    /**
     * Argon2 兼容（老系统个别账号使用 argon2id）
     */
    @Bean
    public Argon2PasswordEncoder argon2PasswordEncoder() {
        return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/login", "/api/jobs/website", "/api/timeline_api.php", "/api/comphotos_api.php", "/api/timeline-files/**", "/api/comphotos-files/**", "/media/files/**", "/media/page-files/**", "/api/media/files/**", "/api/media/page-files/**", "/api/media/bgmusic-file/**", "/media/**", "/uploads/**", "/ws/realtime").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/applications").permitAll()
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                // 前端静态资源（SPA 页面/脚本/样式/字体等）公开访问，API 需登录
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll()
            )
            .exceptionHandling(eh -> eh
                .authenticationEntryPoint((req, res, e) -> {
                    res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    res.setContentType("application/json;charset=UTF-8");
                    res.getWriter().write(objectMapper.writeValueAsString(
                            ApiResponse.error(401, "未登录或登录已过期")));
                })
                .accessDeniedHandler((req, res, e) -> {
                    res.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    res.setContentType("application/json;charset=UTF-8");
                    res.getWriter().write(objectMapper.writeValueAsString(
                            ApiResponse.error(403, "无权访问")));
                })
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        // 生产域名通过环境变量 CORS_ALLOWED_ORIGINS 注入（逗号分隔，支持通配符如 https://*.example.com）
        String raw = corsAllowedOrigins == null || corsAllowedOrigins.isBlank()
                ? "http://localhost:*,http://127.0.0.1:*" : corsAllowedOrigins;
        List<String> origins = java.util.Arrays.stream(raw.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}

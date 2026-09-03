package com.kunzz.inventory.config;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * HTTP 安全响应头（对齐 Web security basics 第 6 节，2026-09-03）：
 * - X-Content-Type-Options: nosniff（防 MIME 嗅探）
 * - X-Frame-Options: DENY（防点击劫持）
 * - Referrer-Policy / Permissions-Policy（最小信息泄露 + 限制浏览器 API）
 * - HSTS（HTTPS 环境下生效；本地 http 无影响）
 * - CSP：default-src 'self'；cdnjs（jspdf/autotable CDN）；unsafe-inline 兼容 antd 内联样式与既有内联脚本；
 *   ws/wss 允许实时推送
 */
@Component
@Order(50)
public class SecurityHeadersFilter implements Filter {

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        response.setHeader("Content-Security-Policy",
                "default-src 'self'; "
              + "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://code.jquery.com; "
              + "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
              + "img-src 'self' data: blob: https:; "
              + "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
              + "connect-src 'self' ws: wss: https:; "
              + "object-src 'none'; base-uri 'self'; frame-ancestors 'none'");

        String path = request.getRequestURI();
        if (path.startsWith("/api/") && path.contains("/login")) {
            response.setHeader("Cache-Control", "no-store");
        }
        chain.doFilter(req, res);
    }
}

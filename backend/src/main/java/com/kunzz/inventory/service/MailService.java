package com.kunzz.inventory.service;

import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.time.Year;
import java.util.Map;

/**
 * 邮件发送（对齐旧系统 kunzzgroup-main/backend/generatecodeapi.php sendWelcomeEmail）
 * 用 Gmail SMTP（应用密码），模板复用旧系统的欢迎邮件样式
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailService {

    private final JavaMailSender mailSender;

    @Value("${app.base-url:http://localhost:5174}")
    private String baseUrl;

    @Value("${spring.mail.username:kunzzsup@gmail.com}")
    private String from;

    /** 账户类型 → 中文名（对齐旧系统 sendWelcomeEmail 的 typeNames） */
    private static final Map<String, String> TYPE_NAMES = Map.ofEntries(
            Map.entry("special", "特殊"),
            Map.entry("hr", "人事部"),
            Map.entry("account", "会计部"),
            Map.entry("media", "媒体制作部"),
            Map.entry("marketing", "推广部"),
            Map.entry("support", "支援部"),
            Map.entry("production", "生产部"),
            Map.entry("r&d", "研发部"),
            Map.entry("technical", "科技部"),
            Map.entry("design", "设计部"),
            Map.entry("operation", "Operation"),
            Map.entry("service", "前台"),
            Map.entry("sushi", "Sushi Bar"),
            Map.entry("kitchen", "厨房"));

    /** 发送新成员欢迎邮件（含临时密码）。成功返回 true，失败记日志返回 false（不阻塞建账号） */
    public boolean sendWelcomeEmail(String email, String username, String password, String accountType) {
        String typeName = TYPE_NAMES.getOrDefault(accountType, accountType == null ? "" : accountType);
        String loginUrl = baseUrl;

        String html = """
            <html>
            <head>
                <meta charset='utf-8'>
                <title>欢迎加入 Kunzz Group</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
                    .wrapper { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .header { background: #f97316; color: white; padding: 28px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 22px; }
                    .content { padding: 32px; }
                    .credentials { background: #fff8f0; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #f97316; }
                    .credentials p { margin: 8px 0; }
                    .password { font-family: monospace; font-size: 20px; font-weight: bold; color: #f97316; background: #fdebd0; padding: 10px 16px; border-radius: 6px; letter-spacing: 2px; display: inline-block; margin-top: 6px; }
                    .login-btn { display: inline-block; margin-top: 20px; padding: 12px 28px; background: #f97316; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; }
                    .footer { background: #f9f9f9; padding: 20px 32px; font-size: 12px; color: #999; border-top: 1px solid #eee; text-align: center; }
                </style>
            </head>
            <body>
                <div class='wrapper'>
                    <div class='header'><h1>🎉 欢迎加入 Kunzz Group!</h1></div>
                    <div class='content'>
                        <h2>亲爱的 %s，</h2>
                        <p>您的账户已成功创建。以下是您的登录信息：</p>
                        <div class='credentials'>
                            <p><strong>📧 邮箱：</strong> %s</p>
                            <p><strong>🏷️ 账户类型：</strong> %s</p>
                            <p><strong>🔒 临时密码：</strong></p>
                            <div class='password'>%s</div>
                        </div>
                        <a href='%s' class='login-btn'>前往登录系统</a>
                        <p style='margin-top:24px;'><strong style='color:#f97316;'>重要提醒：</strong></p>
                        <ul>
                            <li>请妥善保管您的登录信息，切勿转发此邮件</li>
                            <li>首次登录后必须立即重设自己的密码</li>
                            <li>如有任何问题，请联系管理员</li>
                        </ul>
                    </div>
                    <div class='footer'>
                        <p>此邮件由系统自动发送，请勿回复。</p>
                        <p>&copy; %d Kunzz Group. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
            """.formatted(username, email, typeName, password, loginUrl, Year.now().getValue());

        String alt = "亲爱的 " + username + "，\n\n您的账户已创建。\n邮箱：" + email
                + "\n账户类型：" + typeName + "\n临时密码：" + password
                + "\n\n请登录：" + loginUrl + "\n\n首次登录后请立即重设自己的密码。\n\n请勿回复此邮件。";

        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
            helper.setFrom(from, "Kunzz Group");
            helper.setTo(email);
            helper.setSubject("欢迎加入 Kunzz Group - 您的登录信息");
            // 纯文本 + HTML 两种内容（setText(plain, html)）
            helper.setText(alt, html);
            mailSender.send(mime);
            return true;
        } catch (Exception e) {
            log.error("[MailService] 欢迎邮件发送失败 email={}: {}", email, e.getMessage());
            return false;
        }
    }
}

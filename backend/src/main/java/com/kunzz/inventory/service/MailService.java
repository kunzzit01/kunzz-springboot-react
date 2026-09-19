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

    /**
     * 启动时把 SMTP_PASS 里的空白字符去掉。
     * Google 显示的应用密码是「4 组 4 位、带空格」（abcd efgh ijkl mnop），复制到环境文件里很容易连空格一起带上，
     * 从 Windows 复制还可能带一个回车 —— 这些都算进密码 → Gmail 直接回 535（密码被拒），
     * 但报错信息看不出是"多了个空格"。这里统一清掉，并把过程记进日志。
     */
    @jakarta.annotation.PostConstruct
    void trimMailPassword() {
        if (mailSender instanceof org.springframework.mail.javamail.JavaMailSenderImpl impl) {
            String raw = impl.getPassword();
            if (raw != null && !raw.isEmpty()) {
                String cleaned = raw.replaceAll("\\s", "");
                if (!cleaned.equals(raw)) {
                    log.warn("[MailService] SMTP_PASS 里含空格/换行，已自动去掉（Gmail 应用密码是 16 位、无空格）");
                    impl.setPassword(cleaned);
                }
            }
            log.info("[MailService] 邮件发送配置：host={} port={} user={} password={}",
                    impl.getHost(), impl.getPort(), impl.getUsername(),
                    (impl.getPassword() == null || impl.getPassword().isEmpty()) ? "（空！邮件会发送失败，请配置 SMTP_PASS）" : "已配置(" + impl.getPassword().length() + "位)");
        }
    }

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
            // JavaMail 常把真正的原因包在 cause 里，只打 e.getMessage() 会看不出问题 → 一并打出来，
            // 并直接点出「检查 SMTP_PASS」：这个功能最常挂的原因就是应用密码没配/失效
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            log.error("[MailService] 欢迎邮件发送失败 email={} —— 请确认服务器环境变量 SMTP_PASS（Gmail 应用密码）已配置且未失效；"
                            + "{}: {}（根因 {}: {}）",
                    email, e.getClass().getSimpleName(), e.getMessage(),
                    root.getClass().getSimpleName(), root.getMessage());
            return false;
        }
    }

    /** 发送忘记密码的 6 位验证码。成功返回 true，失败记日志返回 false（由调用方决定如何提示） */
    public boolean sendResetCodeEmail(String email, String code, int ttlMinutes) {
        String html = """
            <html>
            <head>
                <meta charset='utf-8'>
                <title>Kunzz Group 密码重设验证码</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
                    .wrapper { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .header { background: #f97316; color: white; padding: 28px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 22px; }
                    .content { padding: 32px; }
                    .code-box { background: #fff8f0; padding: 22px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #f97316; text-align: center; }
                    .code { font-family: monospace; font-size: 34px; font-weight: bold; color: #f97316; background: #fdebd0; padding: 12px 24px; border-radius: 6px; letter-spacing: 8px; display: inline-block; }
                    .footer { background: #f9f9f9; padding: 20px 32px; font-size: 12px; color: #999; border-top: 1px solid #eee; text-align: center; }
                </style>
            </head>
            <body>
                <div class='wrapper'>
                    <div class='header'><h1>🔒 密码重设验证码</h1></div>
                    <div class='content'>
                        <p>您正在重设 Kunzz Group 库存系统的登录密码。请在页面上输入以下验证码：</p>
                        <div class='code-box'><div class='code'>%s</div></div>
                        <p><strong>验证码 %d 分钟内有效</strong>，请尽快完成重设。</p>
                        <p style='margin-top:24px;'><strong style='color:#f97316;'>如果这不是您本人的操作：</strong></p>
                        <ul>
                            <li>请忽略本邮件，您的密码不会被修改</li>
                            <li>请勿把验证码转发给任何人（包括自称管理员的人）</li>
                            <li>如需协助，请联系管理员</li>
                        </ul>
                    </div>
                    <div class='footer'>
                        <p>此邮件由系统自动发送，请勿回复。</p>
                        <p>&copy; %d Kunzz Group. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
            """.formatted(code, ttlMinutes, Year.now().getValue());

        String alt = "您正在重设 Kunzz Group 库存系统的登录密码。\n\n验证码：" + code
                + "\n\n验证码 " + ttlMinutes + " 分钟内有效，请尽快完成重设。"
                + "\n\n如果这不是您本人的操作，请忽略本邮件，您的密码不会被修改。"
                + "\n请勿把验证码转发给任何人。\n\n请勿回复此邮件。";

        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
            helper.setFrom(from, "Kunzz Group");
            helper.setTo(email);
            helper.setSubject("密码重设验证码 - Kunzz Group");
            helper.setText(alt, html);
            mailSender.send(mime);
            return true;
        } catch (Exception e) {
            // 同 sendWelcomeEmail：带上根因 + 提示检查 SMTP_PASS
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            log.error("[MailService] 验证码邮件发送失败 email={} —— 请确认服务器环境变量 SMTP_PASS（Gmail 应用密码）已配置且未失效；"
                            + "{}: {}（根因 {}: {}）",
                    email, e.getClass().getSimpleName(), e.getMessage(),
                    root.getClass().getSimpleName(), root.getMessage());
            return false;
        }
    }
}

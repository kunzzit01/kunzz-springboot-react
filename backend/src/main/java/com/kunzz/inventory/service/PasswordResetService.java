package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.EmailVerification;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.repository.EmailVerificationRepository;
import com.kunzz.inventory.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 忘记密码：邮箱验证码签发与校验（对齐老系统「发 6 位验证码 → 输入验证码 → 重设密码」流程）
 *
 * 复用老库 email_verification 表（email 主键 / code / expires_at），不新增列：
 *   - 有效期        → expires_at
 *   - 发送频率限制  → 从 expires_at 反推签发时刻（本表只有本服务在写，写入恒为 now + TTL）
 *   - 错误次数上限  → 内存计数，错满即作废该验证码
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private final UserRepository userRepository;
    private final EmailVerificationRepository verificationRepository;
    private final MailService mailService;
    private final PasswordEncoder passwordEncoder;

    /** 验证码有效期（分钟） */
    private static final int CODE_TTL_MINUTES = 10;
    /** 同一邮箱两次发送之间的最小间隔（秒） */
    private static final int RESEND_COOLDOWN_SECONDS = 60;
    /** 同一验证码最多允许输错几次，超过即作废 */
    private static final int MAX_WRONG_ATTEMPTS = 5;
    /** 同一 IP 每小时最多申请几次（防止拿本接口刷别人邮箱） */
    private static final int MAX_REQUESTS_PER_IP = 10;
    private static final long IP_WINDOW_MS = 60 * 60 * 1000L;

    private static final SecureRandom RANDOM = new SecureRandom();

    /** 错误次数：邮箱 → 次数。放内存的理由同 AuthController.login 的失败计数：单容器部署够用 */
    private final Map<String, Integer> wrongAttempts = new ConcurrentHashMap<>();
    /** 申请次数：IP → [次数, 窗口起点ms] */
    private final Map<String, long[]> ipRequests = new ConcurrentHashMap<>();

    /** 第一步：给已绑定账号的邮箱发 6 位验证码 */
    public void requestCode(String rawEmail, String ip) {
        String email = normalize(rawEmail);

        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            log.info("[PasswordReset] 邮箱未绑定账号，未发送验证码 email={}", email);
            throw new BusinessException(400, "该邮箱未绑定系统账号，请联系管理员核对邮箱");
        }

        verificationRepository.findById(email).ifPresent(old -> {
            LocalDateTime issuedAt = old.getExpiresAt().minusMinutes(CODE_TTL_MINUTES);
            long waited = Duration.between(issuedAt, LocalDateTime.now()).getSeconds();
            if (waited >= 0 && waited < RESEND_COOLDOWN_SECONDS) {
                throw new BusinessException(429,
                        "验证码发送过于频繁，请 " + (RESEND_COOLDOWN_SECONDS - waited) + " 秒后再试");
            }
        });

        // 只对「真的要发信」的请求计数：被上面两条规则挡下的重试不计入，
        // 否则整个公司共用一条出口 IP（办公室 NAT）时，几个人连点几下就能把全公司锁一小时
        checkIpLimit(ip);

        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        // 先发信、成功后再落库：SMTP 故障时不会留一条用户永远收不到的验证码，
        // 也不会平白消耗掉这 60 秒冷却
        if (!mailService.sendResetCodeEmail(email, code, CODE_TTL_MINUTES)) {
            throw new BusinessException(500, "验证码邮件发送失败，请稍后重试；若持续失败请联系管理员");
        }

        EmailVerification record = new EmailVerification();
        record.setEmail(email);
        record.setCode(code);
        record.setExpiresAt(LocalDateTime.now().plusMinutes(CODE_TTL_MINUTES));
        verificationRepository.save(record);
        wrongAttempts.remove(email);
        log.info("[PasswordReset] 验证码已发送 email={}", email);
    }

    /**
     * 第二步：校验验证码并设置新密码
     *
     * 刻意不加 @Transactional：作废/过期验证码的处理是「先删行、再抛业务异常」，
     * 若整个方法在一个事务里，异常会把删除一起回滚——库里验证码还在，作废形同虚设
     * （次数上限会因此失效：连错 5 次后同一验证码仍可再猜）。所以让每次仓储调用各自提交。
     */
    public void resetPassword(String rawEmail, String code, String newPassword) {
        String email = normalize(rawEmail);
        EmailVerification record = verificationRepository.findById(email)
                .orElseThrow(() -> new BusinessException(400, "验证码错误或已过期，请重新获取"));

        if (LocalDateTime.now().isAfter(record.getExpiresAt())) {
            verificationRepository.delete(record);
            wrongAttempts.remove(email);
            throw new BusinessException(400, "验证码已过期，请重新获取");
        }

        if (!MessageDigest.isEqual(record.getCode().getBytes(StandardCharsets.UTF_8),
                code.getBytes(StandardCharsets.UTF_8))) {
            int used = wrongAttempts.merge(email, 1, Integer::sum);
            if (used >= MAX_WRONG_ATTEMPTS) {
                verificationRepository.delete(record);
                wrongAttempts.remove(email);
                log.warn("[PasswordReset] 验证码连续输错 {} 次，已作废 email={}", MAX_WRONG_ATTEMPTS, email);
                throw new BusinessException(400, "验证码错误次数过多，该验证码已作废，请重新获取");
            }
            throw new BusinessException(400, "验证码不正确，还可尝试 " + (MAX_WRONG_ATTEMPTS - used) + " 次");
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BusinessException(400, "该邮箱未绑定系统账号，请联系管理员"));
        if (passwordEncoder.matches(newPassword, user.getPassword())) {
            throw new BusinessException(400, "新密码不能与当前密码相同");
        }

        // 先消费掉验证码、再改密码：万一改密码这步失败，用户重新申请一组验证码即可，
        // 不会留下「密码没改成、验证码却还能用」的状态
        verificationRepository.delete(record);
        wrongAttempts.remove(email);

        user.setPassword(passwordEncoder.encode(newPassword));
        // 已自行设密，下次登录不再强制走重设密码页
        user.setIsFirstLogin(false);
        userRepository.save(user);
        log.info("[PasswordReset] 密码已重设 userId={} username={}", user.getId(), user.getUsername());
    }

    private String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private void checkIpLimit(String ip) {
        String key = ip == null || ip.isBlank() ? "unknown" : ip;
        long now = System.currentTimeMillis();
        long[] slot = ipRequests.computeIfAbsent(key, k -> new long[]{0, now});
        if (now - slot[1] > IP_WINDOW_MS) {
            slot[0] = 0;
            slot[1] = now;
        }
        if (++slot[0] > MAX_REQUESTS_PER_IP) {
            throw new BusinessException(429, "操作过于频繁，请稍后再试");
        }
    }
}

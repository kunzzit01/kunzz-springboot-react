package com.kunzz.inventory.service;

import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.entity.UserDevice;
import com.kunzz.inventory.repository.UserDeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

/**
 * 「记住这台设备」的设备令牌（2026-10-28，WhatsApp 式会话）
 *
 * - 勾选「记住我」登录时签发一个 32 字节随机令牌（base64url，43 字符），
 *   库里只存 SHA-256 十六进制摘要；令牌泄露只能靠撤销，库里被拖走则拿不到明文。
 * - 有效期默认 90 天**滚动**：每次用令牌换 JWT 都把 expires_at_ms 续到 now+90d，
 *   所以「90 天没碰过这台设备」才失效，正常上班天天用不会掉。
 * - 撤销 = 写 revoked_at_ms（不删行，留审计痕迹，也方便以后做「登录历史」）。
 * - 所有时间都是 epoch 毫秒，与 JVM/数据库时区无关。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceTokenService {

    private static final int TOKEN_BYTES = 32;
    private static final int MAX_NAME = 100;
    private static final int MAX_UA = 255;

    private final UserDeviceRepository repository;
    private final SecureRandom random = new SecureRandom();

    /** 设备令牌有效期（天）。生产可用环境变量 AUTH_DEVICE_TTL_DAYS 覆盖 */
    @Value("${jwt.device-ttl-days:90}")
    private long ttlDays;

    /** 新签发的设备令牌（明文只在这里出现一次） */
    public record Issued(String token, Integer deviceId, long expiresAtMs) {
    }

    private long ttlMs() {
        return Math.max(1, ttlDays) * 24L * 3600L * 1000L;
    }

    /** 登录时签发；name 为空则按 User-Agent 猜一个可读的设备名 */
    @Transactional
    public Issued issue(User user, String requestedName, String userAgent, String ip) {
        byte[] raw = new byte[TOKEN_BYTES];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        long now = System.currentTimeMillis();
        UserDevice d = new UserDevice();
        d.setUserId(user.getId());
        d.setTokenHash(sha256Hex(token));
        d.setName(pickName(requestedName, userAgent));
        d.setUserAgent(truncate(userAgent, MAX_UA));
        d.setIp(truncate(ip, 45));
        d.setCreatedAtMs(now);
        d.setLastSeenMs(now);
        d.setExpiresAtMs(now + ttlMs());
        repository.save(d);
        return new Issued(token, d.getId(), d.getExpiresAtMs());
    }

    /**
     * 校验令牌并续期（滚动有效期 + 刷新最后活跃时间）。
     * 令牌不存在/已撤销/已过期 → empty，调用方按「未登录」处理。
     */
    @Transactional
    public Optional<UserDevice> verifyAndTouch(String rawToken, String ip) {
        if (rawToken == null || rawToken.isBlank()) return Optional.empty();
        Optional<UserDevice> found = repository.findByTokenHash(sha256Hex(rawToken.trim()));
        if (found.isEmpty()) return Optional.empty();
        UserDevice d = found.get();
        long now = System.currentTimeMillis();
        if (!d.isUsable(now)) return Optional.empty();
        d.setLastSeenMs(now);
        d.setExpiresAtMs(now + ttlMs());
        if (ip != null && !ip.isBlank()) d.setIp(truncate(ip, 45));
        repository.save(d);
        return Optional.of(d);
    }

    /** 按令牌撤销（登出） */
    @Transactional
    public void revokeByToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return;
        repository.findByTokenHash(sha256Hex(rawToken.trim())).ifPresent(d -> {
            if (d.getRevokedAtMs() == null) {
                d.setRevokedAtMs(System.currentTimeMillis());
                repository.save(d);
            }
        });
    }

    /** 按 id 撤销（属于该用户的设备才允许） */
    @Transactional
    public boolean revokeById(Integer userId, Integer deviceId) {
        if (deviceId == null) return false;
        Optional<UserDevice> found = repository.findById(deviceId);
        if (found.isEmpty() || !found.get().getUserId().equals(userId)) return false;
        UserDevice d = found.get();
        if (d.getRevokedAtMs() == null) {
            d.setRevokedAtMs(System.currentTimeMillis());
            repository.save(d);
        }
        return true;
    }

    /** 撤销该用户除 keepToken 对应设备以外的所有设备，返回撤销条数 */
    @Transactional
    public int revokeOthers(Integer userId, String keepToken) {
        String keepHash = (keepToken == null || keepToken.isBlank()) ? null : sha256Hex(keepToken.trim());
        long now = System.currentTimeMillis();
        int n = 0;
        for (UserDevice d : repository.findByUserIdAndRevokedAtMsIsNull(userId)) {
            if (keepHash != null && keepHash.equals(d.getTokenHash())) continue;
            d.setRevokedAtMs(now);
            repository.save(d);
            n++;
        }
        return n;
    }

    /** 撤销该用户全部设备（重设密码后调用：旧设备必须重新登入） */
    @Transactional
    public int revokeAll(Integer userId) {
        long now = System.currentTimeMillis();
        int n = 0;
        for (UserDevice d : repository.findByUserIdAndRevokedAtMsIsNull(userId)) {
            d.setRevokedAtMs(now);
            repository.save(d);
            n++;
        }
        return n;
    }

    /** 该用户当前仍可用的设备（最近活跃在前） */
    public List<UserDevice> activeDevices(Integer userId) {
        return repository.findByUserIdAndRevokedAtMsIsNullAndExpiresAtMsGreaterThanOrderByLastSeenMsDesc(
                userId, System.currentTimeMillis());
    }

    /** 令牌摘要：用于把「前端带回来的明文」对上库里的 hash（设备列表标「当前设备」） */
    public static String sha256Hex(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] out = md.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(out.length * 2);
            for (byte b : out) sb.append(Character.forDigit((b >> 4) & 0xf, 16)).append(Character.forDigit(b & 0xf, 16));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    // ---------------- 设备名解析 ----------------

    private String pickName(String requested, String userAgent) {
        String name = requested == null ? "" : requested.trim();
        if (!name.isEmpty()) return truncate(name, MAX_NAME);
        return describe(userAgent);
    }

    /** UA → 可读设备名，如「Chrome · Windows」「Safari · iPhone」「App · Android」 */
    static String describe(String ua) {
        if (ua == null || ua.isBlank()) return "未知设备";
        String s = ua.toLowerCase();

        String os;
        if (s.contains("iphone")) os = "iPhone";
        else if (s.contains("ipad")) os = "iPad";
        else if (s.contains("android")) os = "Android";
        else if (s.contains("windows")) os = "Windows";
        else if (s.contains("mac os x") || s.contains("macintosh")) os = "Mac";
        else if (s.contains("linux")) os = "Linux";
        else os = "未知设备";

        String browser;
        if (s.contains("edg/")) browser = "Edge";
        else if (s.contains("opr/") || s.contains("opera")) browser = "Opera";
        else if (s.contains("chrome/") || s.contains("crios/")) browser = "Chrome";
        else if (s.contains("firefox/") || s.contains("fxios/")) browser = "Firefox";
        else if (s.contains("safari/")) browser = "Safari";
        else if (s.contains("okhttp") || s.contains("app/")) browser = "App";
        else browser = "";

        return browser.isEmpty() ? os : browser + " · " + os;
    }

    private static String truncate(String v, int max) {
        if (v == null) return null;
        String t = v.trim();
        return t.length() <= max ? t : t.substring(0, max);
    }
}

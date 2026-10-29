package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 已记住的登录设备（「记住我」= 设备令牌，可单独撤销；WhatsApp 式会话，2026-10-28）
 *
 * 时间列全部是 **epoch 毫秒（BIGINT）**，不用 DATETIME：
 * 生产 JVM 与数据库时区不一定一致（仓库里 start.ps1 用 GMT+8，VPS 的 systemd 没设，
 * 数据库存的是马来西亚时间 +8），用绝对时间戳可以彻底避开「差 8 小时」的坑。
 *
 * 表结构见仓库根目录 add_new_tables_user_devices.sql（ddl-auto=none，不会自动建表）。
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "user_devices")
public class UserDevice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "user_id", nullable = false)
    private Integer userId;

    /** 令牌摘要：SHA-256 十六进制（64 字符）。明文只在签发那一次返回给客户端，库里不留 */
    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    /** 展示用设备名，如「Chrome · Windows」「Safari · iPhone」（由 UA 解析） */
    @Column(name = "name", length = 100)
    private String name;

    @Column(name = "user_agent", length = 255)
    private String userAgent;

    @Column(name = "ip", length = 45)
    private String ip;

    @Column(name = "created_at_ms", nullable = false)
    private Long createdAtMs;

    @Column(name = "last_seen_ms", nullable = false)
    private Long lastSeenMs;

    @Column(name = "expires_at_ms", nullable = false)
    private Long expiresAtMs;

    /** 非空 = 已撤销/已登出，不再可用 */
    @Column(name = "revoked_at_ms")
    private Long revokedAtMs;

    public boolean isUsable(long nowMs) {
        return revokedAtMs == null && expiresAtMs != null && expiresAtMs > nowMs;
    }
}

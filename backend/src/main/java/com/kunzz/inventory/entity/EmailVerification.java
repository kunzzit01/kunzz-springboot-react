package com.kunzz.inventory.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 邮箱验证码（映射老库 email_verification 表）
 *
 * 老表结构：email 主键 + code + expires_at，一个邮箱只留一条记录（重复申请即覆盖）。
 * 忘记密码流程用它存 6 位验证码，不做结构变更（不新增列），
 * 发送频率与错误次数分别在 PasswordResetService 里用「反推签发时刻」和内存计数实现。
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "email_verification")
public class EmailVerification {

    @Id
    @Column(name = "email", length = 255)
    private String email;

    @Column(name = "code", length = 6, nullable = false)
    private String code;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
}

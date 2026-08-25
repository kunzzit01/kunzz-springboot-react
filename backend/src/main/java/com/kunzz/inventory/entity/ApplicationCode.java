package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 注册码（映射老库 application_codes）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "application_codes")
public class ApplicationCode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "code", length = 50)
    private String code;

    /** 账号类型：special/hr/account/... */
    @Column(name = "account_type", length = 20)
    private String accountType;

    /** 是否已使用 */
    @Column(name = "used")
    private Boolean used;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;
}

package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 用户页面权限（映射老库 user_page_permissions）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "user_page_permissions")
public class UserPagePermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "user_id")
    private Integer userId;

    /** 页面 key，如 kpi_upload / stock_inventory */
    @Column(name = "page_key", length = 50)
    private String pageKey;

    @Column(name = "permissions_json", columnDefinition = "TEXT")
    private String permissionsJson;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 用户侧边栏权限（映射老库 user_sidebar_permissions，JSON 字段）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "user_sidebar_permissions")
public class UserSidebarPermission {

    @Id
    private Integer userId;

    /** 主模块权限，如 ["brand","analytics","hr","resource","visual"] */
    @Column(name = "permissions_json", columnDefinition = "TEXT")
    private String permissionsJson;

    /** 页面级权限 JSON */
    @Column(name = "page_permissions_json", columnDefinition = "TEXT")
    private String pagePermissionsJson;

    /** 子菜单权限 JSON */
    @Column(name = "submenu_permissions_json", columnDefinition = "TEXT")
    private String submenuPermissionsJson;

    /** 品牌权限 JSON（三级/四级） */
    @Column(name = "brand_permissions_json", columnDefinition = "TEXT")
    private String brandPermissionsJson;

    @Column(name = "report_permissions_json", columnDefinition = "TEXT")
    private String reportPermissionsJson;

    @Column(name = "restaurant_permissions_json", columnDefinition = "TEXT")
    private String restaurantPermissionsJson;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

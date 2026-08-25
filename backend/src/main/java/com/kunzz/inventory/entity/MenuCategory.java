package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 菜单分类（映射 menu_categories） */
@Getter @Setter @NoArgsConstructor
@Entity @Table(name = "menu_categories")
public class MenuCategory {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "menu_type", length = 50) private String menuType;
    @Column(name = "category_name", length = 100) private String categoryName;
    @Column(name = "sort_order") private Integer sortOrder;
    @Column(name = "created_at", insertable = false, updatable = false) private LocalDateTime createdAt;
}

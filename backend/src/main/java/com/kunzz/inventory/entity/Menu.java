package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 菜单（映射 menus） */
@Getter @Setter @NoArgsConstructor
@Entity @Table(name = "menus")
public class Menu {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "menu_type", length = 50) private String menuType;
    @Column(name = "category_id") private Integer categoryId;
    @Column(name = "item_code", length = 50) private String itemCode;
    @Column(name = "item_name", length = 200) private String itemName;
    @Column(name = "item_name_cn", length = 200) private String itemNameCn;
    @Column(name = "item_desc", length = 500) private String itemDesc;
    @Column(name = "price", precision = 10, scale = 2) private BigDecimal price;
    @Column(name = "image_path", length = 500) private String imagePath;
    @Column(name = "status", length = 20) private String status;
    @Column(name = "sort_order") private Integer sortOrder;
    @Column(name = "created_at", insertable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", insertable = false, updatable = false) private LocalDateTime updatedAt;
}

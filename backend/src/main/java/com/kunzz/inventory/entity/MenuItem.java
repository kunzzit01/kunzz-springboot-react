package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 菜单项（映射 menu_items） */
@Getter @Setter @NoArgsConstructor
@Entity @Table(name = "menu_items")
public class MenuItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "menu_code", length = 50) private String menuCode;
    @Column(name = "menu_name", length = 200) private String menuName;
    @Column(name = "menu_name_cn", length = 200) private String menuNameCn;
    @Column(name = "portion_size", length = 100) private String portionSize;
    @Column(name = "selling_price", precision = 10, scale = 2) private BigDecimal sellingPrice;
    @Column(name = "created_at", insertable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", insertable = false, updatable = false) private LocalDateTime updatedAt;
}

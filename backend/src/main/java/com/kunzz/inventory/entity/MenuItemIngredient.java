package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 菜单配料（映射 menu_item_ingredients） */
@Getter @Setter @NoArgsConstructor
@Entity @Table(name = "menu_item_ingredients")
public class MenuItemIngredient {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "menu_item_id") private Integer menuItemId;
    @Column(name = "ingredient_id") private Integer ingredientId;
    @Column(name = "ingredient_name", length = 200) private String ingredientName;
    @Column(name = "rm_price", precision = 10, scale = 2) private BigDecimal rmPrice;
    @Column(name = "unit", length = 50) private String unit;
    @Column(name = "measurement", length = 50) private String measurement;
    @Column(name = "cost", precision = 10, scale = 2) private BigDecimal cost;
    @Column(name = "sort_order") private Integer sortOrder;
    @Column(name = "created_at", insertable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", insertable = false, updatable = false) private LocalDateTime updatedAt;
}

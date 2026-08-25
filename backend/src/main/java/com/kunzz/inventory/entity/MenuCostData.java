package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 菜单成本数据（映射 menu_cost_data） */
@Getter @Setter @NoArgsConstructor
@Entity @Table(name = "menu_cost_data")
public class MenuCostData {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "product_name", length = 200) private String productName;
    @Column(name = "price", precision = 10, scale = 2) private BigDecimal price;
    @Column(name = "unit", length = 50) private String unit;
    @Column(name = "specification", length = 100) private String specification;
    @Column(name = "created_at", insertable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", insertable = false, updatable = false) private LocalDateTime updatedAt;
}

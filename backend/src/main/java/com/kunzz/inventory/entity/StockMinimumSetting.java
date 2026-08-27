package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 最低库存设置（映射老库 stock_minimum_settings）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "stock_minimum_settings")
public class StockMinimumSetting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    /** 所属系统：central / j1 / j2 / j3（分店独立设置，不互相影响通知） */
    @Column(name = "stock_system", length = 20)
    private String stockSystem = "central";

    @Column(name = "product_name", length = 255)
    private String productName;

    /** 最低库存数量 */
    @Column(name = "minimum_quantity", precision = 10, scale = 2)
    private BigDecimal minimumQuantity;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

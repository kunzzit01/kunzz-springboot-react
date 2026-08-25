package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 分店每日成本基类（j1/j2/j3cost 同构）
 */
@Getter
@Setter
@NoArgsConstructor
@MappedSuperclass
public abstract class BaseBranchCost {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "date")
    private LocalDate date;

    @Column(name = "day_name", length = 20)
    private String dayName;

    /** 饮料成本 */
    @Column(name = "c_beverage", precision = 12, scale = 2)
    private BigDecimal cBeverage;

    /** 厨房成本 */
    @Column(name = "c_kitchen", precision = 12, scale = 2)
    private BigDecimal cKitchen;

    @Column(name = "c_grab", precision = 10, scale = 2)
    private BigDecimal cGrab;

    @Column(name = "c_foodpanda", precision = 10, scale = 2)
    private BigDecimal cFoodpanda;

    @Column(name = "c_shopee", precision = 10, scale = 2)
    private BigDecimal cShopee;

    /** 总成本（生成列，只读） */
    @Column(name = "c_total", precision = 12, scale = 2, insertable = false, updatable = false)
    private BigDecimal cTotal;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;
}

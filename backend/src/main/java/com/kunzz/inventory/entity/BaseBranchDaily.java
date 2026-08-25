package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 分店每日经营数据基类（j1/j2/j3data 同构）
 */
@Getter
@Setter
@NoArgsConstructor
@MappedSuperclass
public abstract class BaseBranchDaily {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "date")
    private LocalDate date;

    /** 总销售额 */
    @Column(name = "gross_sales", precision = 10, scale = 2)
    private BigDecimal grossSales;

    /** 折扣 */
    @Column(name = "discounts", precision = 10, scale = 2)
    private BigDecimal discounts;

    /** 服务费 */
    @Column(name = "service_fee", precision = 10, scale = 2)
    private BigDecimal serviceFee;

    /** 税 */
    @Column(name = "tax", precision = 10, scale = 2)
    private BigDecimal tax;

    /** 四舍五入金额 */
    @Column(name = "adj_amount", precision = 10, scale = 2)
    private BigDecimal adjAmount;

    /** 实收金额 */
    @Column(name = "tender_amount", precision = 10, scale = 2)
    private BigDecimal tenderAmount;

    /** 就餐人数 */
    @Column(name = "diners")
    private Integer diners;

    /** 用桌数 */
    @Column(name = "tables_used")
    private Integer tablesUsed;

    /** 老顾客数量 */
    @Column(name = "returning_customers")
    private Integer returningCustomers;

    /** 新顾客数量 */
    @Column(name = "new_customers")
    private Integer newCustomers;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

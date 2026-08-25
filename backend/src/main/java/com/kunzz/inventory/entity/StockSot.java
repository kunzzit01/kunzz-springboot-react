package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 货品异常扣除记录（映射老库 stock_sot）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "stock_sot")
public class StockSot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "date")
    private LocalDate date;

    /** 货品编号 */
    @Column(name = "product_code", length = 100)
    private String productCode;

    /** 货品名称 */
    @Column(name = "product_name", length = 255)
    private String productName;

    /** 异常数量（正数） */
    @Column(name = "quantity", precision = 10, scale = 2)
    private BigDecimal quantity;

    /** 规格 */
    @Column(name = "specification", length = 100)
    private String specification;

    /** 单价 */
    @Column(name = "price", precision = 10, scale = 2)
    private BigDecimal price;

    /** 总价 */
    @Column(name = "total_price", precision = 10, scale = 2)
    private BigDecimal totalPrice;

    /** 货品类型 */
    @Column(name = "category", length = 100)
    private String category;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

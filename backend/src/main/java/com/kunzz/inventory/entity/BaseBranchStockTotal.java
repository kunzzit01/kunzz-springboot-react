package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 分店库存汇总基类（j1/j2/j3stocklist_total 同构）
 */
@Getter
@Setter
@NoArgsConstructor
@MappedSuperclass
public abstract class BaseBranchStockTotal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "product_name", length = 255)
    private String productName;

    @Column(name = "code_number", length = 100)
    private String codeNumber;

    @Column(name = "specification", length = 255)
    private String specification;

    /** 当前库存总量 */
    @Column(name = "total_qty", precision = 10, scale = 3)
    private BigDecimal totalQty;

    @Column(name = "last_updated", insertable = false, updatable = false)
    private LocalDateTime lastUpdated;
}

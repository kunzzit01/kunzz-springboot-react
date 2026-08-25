package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 碗碟破损记录（映射老库 dishware_break_records）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dishware_break_records")
public class DishwareBreakRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "dishware_id")
    private Integer dishwareId;

    /** 门店类型：wenhua/central/j1/j2/j3 */
    @Column(name = "shop_type", length = 20)
    private String shopType;

    /** 破损数量 */
    @Column(name = "break_quantity")
    private Integer breakQuantity;

    /** 可扣费数量 */
    @Column(name = "chargeable_quantity")
    private Integer chargeableQuantity;

    @Column(name = "unit_price", precision = 10, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "total_price", precision = 10, scale = 2)
    private BigDecimal totalPrice;

    @Column(name = "break_date")
    private LocalDate breakDate;

    @Column(name = "recorded_by", length = 100)
    private String recordedBy;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 套装破损记录（映射老库 dishware_set_break_records）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dishware_set_break_records")
public class DishwareSetBreakRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "set_id")
    private Integer setId;

    @Column(name = "shop_type", length = 20)
    private String shopType;

    @Column(name = "break_quantity")
    private Integer breakQuantity;

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

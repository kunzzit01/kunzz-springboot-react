package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 碗碟调拨记录（映射老库 dishware_transfer_records）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dishware_transfer_records")
public class DishwareTransferRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "dishware_id")
    private Integer dishwareId;

    @Column(name = "from_restaurant_id")
    private Integer fromRestaurantId;

    @Column(name = "to_restaurant_id")
    private Integer toRestaurantId;

    @Column(name = "from_shop_type", length = 20)
    private String fromShopType;

    @Column(name = "to_shop_type", length = 20)
    private String toShopType;

    @Column(name = "quantity")
    private Integer quantity;

    @Column(name = "unit_price", precision = 10, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "total_price", precision = 10, scale = 2)
    private BigDecimal totalPrice;

    @Column(name = "transfer_date")
    private LocalDate transferDate;

    /** 记录类型：transfer/adjust 等 */
    @Column(name = "record_type", length = 50)
    private String recordType;

    @Column(name = "related_record_id")
    private Integer relatedRecordId;

    @Column(name = "recorded_by", length = 100)
    private String recordedBy;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

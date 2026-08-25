package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 套装库存（映射老库 dishware_set_stock）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dishware_set_stock")
public class DishwareSetStock {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "set_id")
    private Integer setId;

    @Column(name = "wenhua_quantity")
    private Integer wenhuaQuantity;

    @Column(name = "central_quantity")
    private Integer centralQuantity;

    @Column(name = "j1_quantity")
    private Integer j1Quantity;

    @Column(name = "j2_quantity")
    private Integer j2Quantity;

    @Column(name = "j3_quantity")
    private Integer j3Quantity;

    @Column(name = "total_quantity")
    private Integer totalQuantity;

    @Column(name = "last_updated", insertable = false, updatable = false)
    private LocalDateTime lastUpdated;
}

package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 套装明细（映射老库 dishware_set_items）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dishware_set_items")
public class DishwareSetItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "set_id")
    private Integer setId;

    @Column(name = "dishware_id")
    private Integer dishwareId;

    /** 套内数量 */
    @Column(name = "quantity_in_set")
    private Integer quantityInSet;

    @Column(name = "sort_order")
    private Integer sortOrder;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

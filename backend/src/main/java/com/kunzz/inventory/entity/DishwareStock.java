package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 碗碟库存（映射老库 dishware_stock，按 文化楼/中央/J1/J2/J3 五地点）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dishware_stock")
public class DishwareStock {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "dishware_id")
    private Integer dishwareId;

    /** 文化楼数量 */
    @Column(name = "wenhua_quantity")
    private Integer wenhuaQuantity;

    /** 中央数量 */
    @Column(name = "central_quantity")
    private Integer centralQuantity;

    @Column(name = "j1_quantity")
    private Integer j1Quantity;

    @Column(name = "j2_quantity")
    private Integer j2Quantity;

    @Column(name = "j3_quantity")
    private Integer j3Quantity;

    /** 总数量 */
    @Column(name = "total_quantity")
    private Integer totalQuantity;

    @Column(name = "last_updated", insertable = false, updatable = false)
    private LocalDateTime lastUpdated;
}

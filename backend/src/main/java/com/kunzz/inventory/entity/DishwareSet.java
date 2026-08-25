package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 碗碟套装（映射老库 dishware_sets）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dishware_sets")
public class DishwareSet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "set_name", length = 255)
    private String setName;

    @Column(name = "set_code", length = 50)
    private String setCode;

    @Column(name = "set_size", length = 255)
    private String setSize;

    /** 套装总价 */
    @Column(name = "set_price", precision = 10, scale = 2)
    private BigDecimal setPrice;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /** 是否启用 */
    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

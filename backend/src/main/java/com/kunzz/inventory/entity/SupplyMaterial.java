package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 供应商物料（映射老库 supply_material）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "supply_material")
public class SupplyMaterial {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "supply_id")
    private Integer supplyId;

    @Column(name = "material_name", length = 255)
    private String materialName;

    @Column(name = "material_type", length = 255)
    private String materialType;

    @Column(name = "price", precision = 10, scale = 2)
    private BigDecimal price;
}

package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 碗碟信息（映射老库 dishware_info）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dishware_info")
public class DishwareInfo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "product_name", length = 255)
    private String productName;

    /** 产品编号 */
    @Column(name = "code_number", length = 100)
    private String codeNumber;

    /** 分类：AG/CU/DN/DR/IP/MA/ME/MU/OM/OT/SA/SU/SAR/SER/SET/TA/TE/WAN/YA */
    @Column(name = "category", length = 10)
    private String category;

    /** 尺寸规格 */
    @Column(name = "size", length = 100)
    private String size;

    /** 单价 */
    @Column(name = "unit_price", precision = 10, scale = 2)
    private BigDecimal unitPrice;

    /** 照片路径 */
    @Column(name = "photo_path", length = 500)
    private String photoPath;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

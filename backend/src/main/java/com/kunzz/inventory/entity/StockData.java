package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 库存总台账（映射老库 stock_data）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "stock_data")
public class StockData {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "date")
    private LocalDate date;

    @Column(name = "time")
    private LocalTime time;

    /** 产品编号 */
    @Column(name = "product_code", length = 50)
    private String productCode;

    /** 产品名称 */
    @Column(name = "product_name", length = 255)
    private String productName;

    /** 规格 */
    @Column(name = "specification", length = 255)
    private String specification;

    /** 货物类型（分类） */
    @Column(name = "category", length = 50)
    private String category;

    /** 供应商 */
    @Column(name = "supplier", length = 255)
    private String supplier;

    /** 申请人 */
    @Column(name = "applicant", length = 100)
    private String applicant;

    /** 批准人 */
    @Column(name = "approver", length = 100)
    private String approver;

    /** 系统分配（多选，逗号分隔：j1/j2/j3） */
    @Column(name = "system_assign", length = 255)
    private String systemAssign;

    /** 冰箱分类 */
    @Column(name = "freezer_category", length = 50)
    private String freezerCategory;

    /** 位次：同冰箱分类内的排序序号（NULL=未设置，排该冰箱最后；仅后台排序，UI 不显示） */
    @Column(name = "freezer_position")
    private Integer freezerPosition;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

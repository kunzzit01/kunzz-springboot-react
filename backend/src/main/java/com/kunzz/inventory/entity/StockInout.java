package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 出入库流水（映射老库 stockinout_data，26222 条历史数据）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "stockinout_data")
public class StockInout {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "date")
    private LocalDate date;

    @Column(name = "time")
    private LocalTime time;

    /** 产品名称 */
    @Column(name = "product_name", length = 255)
    private String productName;

    /** 收件人 */
    @Column(name = "receiver", length = 100)
    private String receiver;

    /** 入库数量 */
    @Column(name = "in_quantity", precision = 10, scale = 3)
    private BigDecimal inQuantity;

    /** 出库数量 */
    @Column(name = "out_quantity", precision = 10, scale = 3)
    private BigDecimal outQuantity;

    /** 规格单位 */
    @Column(name = "specification", length = 50)
    private String specification;

    /** 单价 */
    @Column(name = "price", precision = 15, scale = 5)
    private BigDecimal price;

    /** 编号 */
    @Column(name = "code_number", length = 100)
    private String codeNumber;

    /** 备注 */
    @Column(name = "remark", columnDefinition = "TEXT")
    private String remark;

    /** 目标系统 j1/j2/j3 */
    @Column(name = "target_system", length = 10)
    private String targetSystem;

    /** 是否已核对产品备注 */
    @Column(name = "product_remark_checked")
    private Boolean productRemarkChecked;

    @Column(name = "remark_number", length = 50)
    private String remarkNumber;

    /** 类型：如 入库/出库/调拨 等 */
    @Column(name = "type", length = 100)
    private String type;

    /** 创建人 */
    @Column(name = "created_by", length = 100)
    private String createdBy;

    /** 软删除时间 */
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "deleted_by", length = 50)
    private String deletedBy;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

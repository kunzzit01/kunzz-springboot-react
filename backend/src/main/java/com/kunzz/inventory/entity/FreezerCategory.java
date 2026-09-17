package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 冰箱分类字典（映射 freezer_categories）
 *
 * 只存【名字 + 顺序】：货品上的冰箱分类仍然是 stock_data.freezer_category 里的纯文本
 * （逗号分隔多选），本表不参与货品存储，仅提供可维护的选项名与业务排序依据。
 * 改名时由 FreezerCategoryService 级联改写 stock_data 里对应的 token。
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "freezer_categories")
public class FreezerCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    /** 名字：须与 stock_data.freezer_category 逗号串里的 token 完全一致 */
    @Column(name = "name", length = 50)
    private String name;

    /** 业务顺序：总库存排序用，对应冰箱物理顺序 */
    @Column(name = "sort_order")
    private Integer sortOrder;

    /** 停用后不再出现在下拉选项，历史数据保持原样 */
    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

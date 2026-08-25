package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 考核标准配置（映射老库 evaluation_criteria_config）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "evaluation_criteria_config")
public class EvaluationCriteriaConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "department", length = 100)
    private String department;

    @Column(name = "criteria_order")
    private Integer criteriaOrder;

    @Column(name = "criteria_name_zh", length = 200)
    private String criteriaNameZh;

    @Column(name = "criteria_name_en", length = 200)
    private String criteriaNameEn;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;
}

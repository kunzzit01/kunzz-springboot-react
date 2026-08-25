package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 考核评分标准（映射老库 evaluation_criteria_standards）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "evaluation_criteria_standards")
public class EvaluationCriteriaStandard {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "department", length = 100)
    private String department;

    @Column(name = "criteria_order")
    private Integer criteriaOrder;

    @Column(name = "score")
    private Integer score;

    @Column(name = "description_text", length = 500)
    private String descriptionText;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

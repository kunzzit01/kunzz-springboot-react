package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 考核表单（映射老库 evaluation_forms）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "evaluation_forms")
public class EvaluationForm {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "form_name", length = 100)
    private String formName;

    @Column(name = "department", length = 100)
    private String department;

    @Column(name = "restaurant", length = 50)
    private String restaurant;

    @Column(name = "evaluator_name", length = 100)
    private String evaluatorName;

    @Column(name = "evaluation_date")
    private LocalDate evaluationDate;

    @Column(name = "created_by", length = 100)
    private String createdBy;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 考核表单明细（映射老库 evaluation_form_details，7 项评分）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "evaluation_form_details")
public class EvaluationFormDetail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "form_id")
    private Integer formId;

    @Column(name = "employee_id")
    private Integer employeeId;

    @Column(name = "employee_name", length = 100)
    private String employeeName;

    @Column(name = "criteria_1")
    private String criteria1;

    @Column(name = "criteria_2")
    private String criteria2;

    @Column(name = "criteria_3")
    private String criteria3;

    @Column(name = "criteria_4")
    private String criteria4;

    @Column(name = "criteria_5")
    private String criteria5;

    @Column(name = "criteria_6")
    private String criteria6;

    @Column(name = "criteria_7")
    private String criteria7;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

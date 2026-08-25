package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 排班记录（映射老库 schedule_records）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "schedule_records")
public class ScheduleRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "employee_id")
    private Integer employeeId;

    @Column(name = "schedule_date")
    private LocalDate scheduleDate;

    /** 值类型：shift / leave 等 */
    @Column(name = "value_type", length = 20)
    private String valueType;

    /** 班次代码或假期代码 */
    @Column(name = "value_code", length = 50)
    private String valueCode;

    @Column(name = "notes", length = 200)
    private String notes;

    @Column(name = "created_by", length = 100)
    private String createdBy;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

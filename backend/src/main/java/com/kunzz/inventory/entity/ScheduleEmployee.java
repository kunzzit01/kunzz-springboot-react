package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 排班员工（映射老库 schedule_employees）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "schedule_employees")
public class ScheduleEmployee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "name", length = 100)
    private String name;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "position", length = 100)
    private String position;

    @Column(name = "work_area", length = 100)
    private String workArea;

    /** 所属餐厅 J1/J2/J3 */
    @Column(name = "restaurant", length = 50)
    private String restaurant;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

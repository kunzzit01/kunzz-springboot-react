package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 假期类型（映射老库 schedule_leave_types）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "schedule_leave_types")
public class ScheduleLeaveType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "code", length = 50)
    private String code;

    @Column(name = "name", length = 100)
    private String name;

    @Column(name = "color", length = 20)
    private String color;

    @Column(name = "type", length = 50)
    private String type;

    @Column(name = "description", length = 200)
    private String description;

    @Column(name = "is_active")
    private Boolean isActive;
}

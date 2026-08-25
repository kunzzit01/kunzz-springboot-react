package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 排班班次（映射老库 schedule_shifts）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "schedule_shifts")
public class ScheduleShift {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "shift_code", length = 50)
    private String shiftCode;

    @Column(name = "restaurant", length = 50)
    private String restaurant;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;
}

package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工手机领取/归还记录（phone_records 表，本系统新建）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "phone_records")
public class PhoneRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "employee_id")
    private Integer employeeId;

    @Column(name = "record_date")
    private LocalDate recordDate;

    /** 是否领取手机 */
    @Column(name = "get_checked")
    private Boolean getChecked;

    /** 领取时间 */
    @Column(name = "start_time", length = 10)
    private String startTime;

    /** 归还时间 */
    @Column(name = "end_time", length = 10)
    private String endTime;

    /** 是否归还手机 */
    @Column(name = "return_checked")
    private Boolean returnChecked;

    @Column(name = "restaurant", length = 10)
    private String restaurant;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

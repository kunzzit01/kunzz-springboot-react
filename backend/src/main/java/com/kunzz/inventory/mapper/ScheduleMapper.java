package com.kunzz.inventory.mapper;

import com.kunzz.inventory.entity.*;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 排班管理 Mapper：显式 SQL（对齐 schedule_api.php 行为）
 */
@Mapper
public interface ScheduleMapper {

    // ---------- 排班员工 ----------
    List<ScheduleEmployee> listEmployees(@Param("restaurant") String restaurant, @Param("workArea") String workArea);

    ScheduleEmployee findEmployeeById(@Param("id") Integer id);

    int insertEmployee(ScheduleEmployee e);

    int updateEmployee(ScheduleEmployee e);

    int deleteEmployee(@Param("id") Integer id);

    // ---------- 班次 ----------
    List<ScheduleShift> listShifts(@Param("restaurant") String restaurant);

    int insertShift(ScheduleShift s);

    int deleteShift(@Param("id") Integer id);

    // ---------- 假期类型 ----------
    List<ScheduleLeaveType> listLeaveTypes();

    // ---------- 排班记录 ----------
    List<ScheduleRecord> listRecordsBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    ScheduleRecord findRecord(@Param("employeeId") Integer employeeId, @Param("date") LocalDate date);

    int upsertRecord(ScheduleRecord r);

    int deleteRecordByEmpDate(@Param("employeeId") Integer employeeId, @Param("date") LocalDate date);

    int deleteRecordsBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    int insertRecord(ScheduleRecord r);

    // ---------- 手机记录 ----------
    List<PhoneRecord> listPhoneRecordsByDate(@Param("date") LocalDate date);

    PhoneRecord findPhoneRecord(@Param("employeeId") Integer employeeId, @Param("date") LocalDate date);

    int upsertPhoneRecord(PhoneRecord r);
}

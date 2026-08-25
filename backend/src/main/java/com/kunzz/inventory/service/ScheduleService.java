package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.mapper.ScheduleMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

/**
 * 排班管理（对应 schedule_manager / schedule_api）+ 员工手机记录（phone_manage）
 * 数据访问：MyBatis Mapper（显式 SQL）
 */
@Service
@RequiredArgsConstructor
public class ScheduleService {

    private final ScheduleMapper scheduleMapper;

    // ---------- 员工 ----------

    @Transactional(readOnly = true)
    public List<ScheduleEmployee> listEmployees(String restaurant, String workArea) {
        return scheduleMapper.listEmployees(restaurant, workArea);
    }

    @Transactional
    public ScheduleEmployee saveEmployee(ScheduleEmployee e) {
        if (e.getId() != null) {
            scheduleMapper.updateEmployee(e);
        } else {
            scheduleMapper.insertEmployee(e);
        }
        return e;
    }

    @Transactional
    public void deleteEmployee(Integer id) {
        scheduleMapper.deleteEmployee(id);
    }

    // ---------- 班次 ----------

    @Transactional(readOnly = true)
    public List<ScheduleShift> listShifts(String restaurant) {
        return scheduleMapper.listShifts(restaurant);
    }

    @Transactional
    public ScheduleShift saveShift(ScheduleShift s) {
        scheduleMapper.insertShift(s);
        return s;
    }

    @Transactional
    public void deleteShift(Integer id) {
        scheduleMapper.deleteShift(id);
    }

    // ---------- 假期类型 ----------

    @Transactional(readOnly = true)
    public List<ScheduleLeaveType> listLeaveTypes() {
        return scheduleMapper.listLeaveTypes();
    }

    // ---------- 排班记录 ----------

    /** 取某月全部排班记录 */
    @Transactional(readOnly = true)
    public List<ScheduleRecord> records(YearMonth month) {
        return scheduleMapper.listRecordsBetween(month.atDay(1), month.atEndOfMonth());
    }

    /** 全量保存某月排班记录 */
    @Transactional
    public void saveRecords(YearMonth month, List<ScheduleRecord> records) {
        LocalDate from = month.atDay(1);
        LocalDate to = month.atEndOfMonth();
        scheduleMapper.deleteRecordsBetween(from, to);
        for (ScheduleRecord r : records) {
            if (r.getScheduleDate() != null) {
                scheduleMapper.insertRecord(r);
            }
        }
    }

    /** 单条保存排班记录（对齐线上 save_schedule：ON DUPLICATE KEY 原子 upsert） */
    @Transactional
    public ScheduleRecord upsertRecord(ScheduleRecord r) {
        if (r.getEmployeeId() == null || r.getScheduleDate() == null) {
            throw new BusinessException("缺少必填字段: employeeId/scheduleDate");
        }
        scheduleMapper.upsertRecord(r);
        return r;
    }

    /** 单条删除排班记录 */
    @Transactional
    public void deleteRecord(Integer employeeId, LocalDate date) {
        scheduleMapper.deleteRecordByEmpDate(employeeId, date);
    }

    // ---------- 手机领取/归还记录（phone_manage） ----------

    /** 某日手机记录（含该日所有员工，即使无记录也返回空结构） */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> phoneRecordsByDate(String restaurant, LocalDate date) {
        List<ScheduleEmployee> employees = listEmployees(restaurant, null);
        List<PhoneRecord> records = scheduleMapper.listPhoneRecordsByDate(date);
        java.util.Map<Integer, PhoneRecord> byEmp = new java.util.HashMap<>();
        for (PhoneRecord r : records) byEmp.put(r.getEmployeeId(), r);
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (ScheduleEmployee e : employees) {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("employeeId", e.getId());
            m.put("name", e.getName());
            m.put("position", e.getPosition());
            m.put("workArea", e.getWorkArea());
            PhoneRecord r = byEmp.get(e.getId());
            m.put("getChecked", r != null && Boolean.TRUE.equals(r.getGetChecked()));
            m.put("startTime", r != null ? (r.getStartTime() == null ? "" : r.getStartTime()) : "");
            m.put("endTime", r != null ? (r.getEndTime() == null ? "" : r.getEndTime()) : "");
            m.put("returnChecked", r != null && Boolean.TRUE.equals(r.getReturnChecked()));
            m.put("hasRecord", r != null);
            out.add(m);
        }
        return out;
    }

    /** 保存当日手机记录（按 employee_id + date 逐条 upsert） */
    @Transactional
    public void savePhoneRecords(String restaurant, LocalDate date, List<PhoneRecord> records) {
        for (PhoneRecord r : records) {
            if (r.getEmployeeId() == null) continue;
            r.setRecordDate(date);
            r.setRestaurant(restaurant);
            r.setGetChecked(Boolean.TRUE.equals(r.getGetChecked()));
            r.setStartTime(r.getStartTime() == null ? "" : r.getStartTime());
            r.setEndTime(r.getEndTime() == null ? "" : r.getEndTime());
            r.setReturnChecked(Boolean.TRUE.equals(r.getReturnChecked()));
            scheduleMapper.upsertPhoneRecord(r);
        }
    }

    // ---------- 员工手机记录（按分店，合并排班员工与系统用户） ----------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> phoneRecords(String restaurant) {
        List<ScheduleEmployee> employees = listEmployees(restaurant, null);
        return employees.stream()
                .map(e -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("source", "schedule");
                    m.put("name", e.getName());
                    m.put("phone", e.getPhone());
                    m.put("position", e.getPosition());
                    m.put("workArea", e.getWorkArea());
                    m.put("restaurant", e.getRestaurant());
                    return m;
                })
                .toList();
    }
}

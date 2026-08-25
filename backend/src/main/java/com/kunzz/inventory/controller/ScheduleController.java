package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.service.ScheduleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ScheduleController {

    private final ScheduleService scheduleService;

    // ---------- 排班员工 ----------

    @GetMapping("/schedule/employees")
    public ApiResponse<List<ScheduleEmployee>> listEmployees(
            @RequestParam(required = false) String restaurant,
            @RequestParam(required = false) String workArea) {
        return ApiResponse.ok(scheduleService.listEmployees(restaurant, workArea));
    }

    @PostMapping("/schedule/employees")
    public ApiResponse<ScheduleEmployee> saveEmployee(@RequestBody ScheduleEmployee e) {
        return ApiResponse.ok(scheduleService.saveEmployee(e));
    }

    @DeleteMapping("/schedule/employees/{id}")
    public ApiResponse<Void> deleteEmployee(@PathVariable Integer id) {
        scheduleService.deleteEmployee(id);
        return ApiResponse.ok();
    }

    // ---------- 班次 ----------

    @GetMapping("/schedule/shifts")
    public ApiResponse<List<ScheduleShift>> listShifts(@RequestParam(required = false) String restaurant) {
        return ApiResponse.ok(scheduleService.listShifts(restaurant));
    }

    @PostMapping("/schedule/shifts")
    public ApiResponse<ScheduleShift> saveShift(@RequestBody ScheduleShift s) {
        return ApiResponse.ok(scheduleService.saveShift(s));
    }

    @DeleteMapping("/schedule/shifts/{id}")
    public ApiResponse<Void> deleteShift(@PathVariable Integer id) {
        scheduleService.deleteShift(id);
        return ApiResponse.ok();
    }

    // ---------- 假期类型 ----------

    @GetMapping("/schedule/leave-types")
    public ApiResponse<List<ScheduleLeaveType>> listLeaveTypes() {
        return ApiResponse.ok(scheduleService.listLeaveTypes());
    }

    // ---------- 排班记录 ----------

    @GetMapping("/schedule/records")
    public ApiResponse<List<ScheduleRecord>> records(@RequestParam String month) {
        return ApiResponse.ok(scheduleService.records(YearMonth.parse(month)));
    }

    @PutMapping("/schedule/records")
    public ApiResponse<Void> saveRecords(@RequestParam String month, @RequestBody List<ScheduleRecord> records) {
        scheduleService.saveRecords(YearMonth.parse(month), records);
        return ApiResponse.ok();
    }

    /** 单条保存排班记录（对齐线上 schedule_api.php save_schedule） */
    @PostMapping("/schedule/record")
    public ApiResponse<ScheduleRecord> upsertRecord(@RequestBody ScheduleRecord record) {
        return ApiResponse.ok(scheduleService.upsertRecord(record));
    }

    /** 单条删除排班记录 */
    @DeleteMapping("/schedule/record")
    public ApiResponse<Void> deleteRecord(@RequestParam Integer employeeId, @RequestParam String scheduleDate) {
        scheduleService.deleteRecord(employeeId, java.time.LocalDate.parse(scheduleDate));
        return ApiResponse.ok();
    }

    // ---------- 员工手机记录 ----------

    @GetMapping("/phone")
    public ApiResponse<List<Map<String, Object>>> phoneRecords(@RequestParam String restaurant) {
        return ApiResponse.ok(scheduleService.phoneRecords(restaurant));
    }

    // ---------- 手机领取/归还记录 ----------

    @GetMapping("/phone/records")
    public ApiResponse<List<Map<String, Object>>> phoneRecordsByDate(
            @RequestParam String restaurant, @RequestParam String date) {
        return ApiResponse.ok(scheduleService.phoneRecordsByDate(restaurant, java.time.LocalDate.parse(date)));
    }

    @PostMapping("/phone/records")
    public ApiResponse<Void> savePhoneRecords(
            @RequestParam String restaurant, @RequestParam String date,
            @RequestBody List<PhoneRecord> records) {
        scheduleService.savePhoneRecords(restaurant, java.time.LocalDate.parse(date), records);
        return ApiResponse.ok();
    }
}

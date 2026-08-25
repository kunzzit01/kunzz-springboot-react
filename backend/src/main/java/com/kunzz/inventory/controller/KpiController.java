package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.service.KpiService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Map;

@RestController
@RequestMapping("/api/kpi")
@RequiredArgsConstructor
public class KpiController {

    private final KpiService kpiService;

    /** KPI 报表：某分店某月日报+成本 */
    @GetMapping("/report")
    public ApiResponse<Map<String, Object>> report(
            @RequestParam String branch,
            @RequestParam(required = false) String month) {
        return ApiResponse.ok(kpiService.report(branch,
                month == null || month.isBlank() ? null : YearMonth.parse(month)));
    }

    /** 保存日报 */
    @PostMapping("/daily")
    public ApiResponse<Void> saveDaily(@RequestParam String branch, @RequestBody Map<String, Object> body) {
        BaseBranchDaily d = switch (branch.toLowerCase()) {
            case "j2" -> new J2Daily();
            case "j3" -> new J3Daily();
            default -> new J1Daily();
        };
        d.setDate(LocalDate.parse(String.valueOf(body.get("date"))));
        d.setGrossSales(bd(body, "grossSales"));
        d.setDiscounts(bd(body, "discounts"));
        d.setServiceFee(bd(body, "serviceFee"));
        d.setTax(bd(body, "tax"));
        d.setAdjAmount(bd(body, "adjAmount"));
        d.setTenderAmount(bd(body, "tenderAmount"));
        d.setDiners(num(body, "diners"));
        d.setTablesUsed(num(body, "tablesUsed"));
        d.setReturningCustomers(num(body, "returningCustomers"));
        d.setNewCustomers(num(body, "newCustomers"));
        kpiService.saveDaily(branch, d);
        return ApiResponse.ok();
    }

    /** J1 供应给 J2/J3 的合计（成本仪表盘） */
    @GetMapping("/supply")
    public ApiResponse<Map<String, Object>> supply(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        LocalDate s = startDate == null || startDate.isBlank() ? LocalDate.now().withDayOfMonth(1) : LocalDate.parse(startDate);
        LocalDate e = endDate == null || endDate.isBlank() ? LocalDate.now() : LocalDate.parse(endDate);
        return ApiResponse.ok(kpiService.getSupply(s, e));
    }

    /** 某店某月当前库存 */
    @GetMapping("/month-stock")
    public ApiResponse<Map<String, Object>> monthStock(
            @RequestParam String branch, @RequestParam String yearMonth) {
        return ApiResponse.ok(kpiService.getMonthStock(branch, yearMonth));
    }

    /** 保存某店某月当前库存 */
    @PostMapping("/month-stock")
    public ApiResponse<Void> saveMonthStock(@RequestParam String branch, @RequestBody Map<String, Object> body) {
        kpiService.saveMonthStock(branch, String.valueOf(body.get("yearMonth")), bd(body, "currentStock"));
        return ApiResponse.ok();
    }

    /** 删除某日日报 */
    @DeleteMapping("/daily")
    public ApiResponse<Void> deleteDaily(@RequestParam String branch, @RequestParam String date) {
        kpiService.deleteDaily(branch, LocalDate.parse(date));
        return ApiResponse.ok();
    }

    /** 保存成本 */
    @PostMapping("/cost")
    public ApiResponse<Void> saveCost(@RequestParam String branch, @RequestBody Map<String, Object> body) {
        BaseBranchCost c = switch (branch.toLowerCase()) {
            case "j2" -> new J2Cost();
            case "j3" -> new J3Cost();
            default -> new J1Cost();
        };
        c.setDate(LocalDate.parse(String.valueOf(body.get("date"))));
        c.setDayName(str(body, "dayName"));
        c.setCBeverage(bd(body, "cBeverage"));
        c.setCKitchen(bd(body, "cKitchen"));
        c.setCGrab(bd(body, "cGrab"));
        c.setCFoodpanda(bd(body, "cFoodpanda"));
        c.setCShopee(bd(body, "cShopee"));
        kpiService.saveCost(branch, c);
        return ApiResponse.ok();
    }

    private BigDecimal bd(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return null;
        try { return new BigDecimal(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private Integer num(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return null;
        try { return ((Number) v).intValue(); } catch (Exception e) { return null; }
    }

    private String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v == null ? null : String.valueOf(v);
    }
}

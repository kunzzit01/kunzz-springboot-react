package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.mapper.KpiMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * KPI 报表 + 数据上传（对应 kpi / kpiedit / costedit）
 * 数据访问：MyBatis Mapper（按分店动态表名，显式 SQL）
 */
@Service
@RequiredArgsConstructor
public class KpiService {

    private final KpiMapper kpiMapper;

    private String dailyTable(String branch) {
        return switch (branch.toLowerCase()) {
            case "j1" -> "j1data";
            case "j2" -> "j2data";
            default -> "j3data";
        };
    }

    /** MyBatis 返回的 DATE 可能是 java.sql.Date，统一转 LocalDate */
    private LocalDate toLocalDate(Object o) {
        if (o == null) return null;
        if (o instanceof java.sql.Date) return ((java.sql.Date) o).toLocalDate();
        if (o instanceof LocalDate) return (LocalDate) o;
        try { return LocalDate.parse(String.valueOf(o)); } catch (Exception e) { return null; }
    }

    private String costTable(String branch) {
        return switch (branch.toLowerCase()) {
            case "j1" -> "j1cost";
            case "j2" -> "j2cost";
            default -> "j3cost";
        };
    }

    /** 某月 KPI 报表（合并日报与成本） */
    @Transactional(readOnly = true)
    public Map<String, Object> report(String branch, YearMonth month) {
        String b = branch.toLowerCase();
        String dailyT = dailyTable(b);
        String costT = costTable(b);
        // 按日期范围查询，避免全表扫描（上线数据量大时性能关键）
        LocalDate start = month == null ? null : month.atDay(1);
        LocalDate end = month == null ? null : month.atEndOfMonth();
        List<Map<String, Object>> dailies = kpiMapper.listDailies(dailyT, start, end);
        List<Map<String, Object>> costs = kpiMapper.listCosts(costT, start, end);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> day : dailies) {
            LocalDate date = toLocalDate(day.get("date"));
            if (month != null && (date == null || !YearMonth.from(date).equals(month))) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", date);
            row.put("grossSales", day.get("gross_sales"));
            row.put("discounts", day.get("discounts"));
            row.put("serviceFee", day.get("service_fee"));
            row.put("tax", day.get("tax"));
            row.put("adjAmount", day.get("adj_amount"));
            row.put("tenderAmount", day.get("tender_amount"));
            row.put("diners", day.get("diners"));
            row.put("tablesUsed", day.get("tables_used"));
            row.put("returningCustomers", day.get("returning_customers"));
            row.put("newCustomers", day.get("new_customers"));
            row.put("_type", "daily");
            rows.add(row);
        }
        for (Map<String, Object> cost : costs) {
            LocalDate date = toLocalDate(cost.get("date"));
            if (month != null && (date == null || !YearMonth.from(date).equals(month))) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", date);
            row.put("dayName", cost.get("day_name"));
            row.put("cBeverage", cost.get("c_beverage"));
            row.put("cKitchen", cost.get("c_kitchen"));
            row.put("cGrab", cost.get("c_grab"));
            row.put("cFoodpanda", cost.get("c_foodpanda"));
            row.put("cShopee", cost.get("c_shopee"));
            row.put("cTotal", cost.get("c_total"));
            row.put("_type", "cost");
            rows.add(row);
        }
        rows.sort(Comparator.comparing(r -> String.valueOf(r.get("date")), Comparator.nullsLast(String::compareTo)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("branch", b);
        out.put("month", month == null ? null : month.toString());
        out.put("rows", rows);
        return out;
    }

    /** 保存日报（按日期原子 upsert） */
    @Transactional
    public void saveDaily(String branch, BaseBranchDaily day) {
        if (day.getDate() == null) throw new BusinessException("日期不能为空");
        String t = dailyTable(branch);
        kpiMapper.deleteDailyByDate(t, day.getDate());
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("date", day.getDate());
        d.put("gross_sales", day.getGrossSales());
        d.put("discounts", day.getDiscounts());
        d.put("service_fee", day.getServiceFee());
        d.put("tax", day.getTax());
        d.put("adj_amount", day.getAdjAmount());
        d.put("tender_amount", day.getTenderAmount());
        d.put("diners", day.getDiners());
        d.put("tables_used", day.getTablesUsed());
        d.put("returning_customers", day.getReturningCustomers());
        d.put("new_customers", day.getNewCustomers());
        kpiMapper.insertDaily(t, d);
    }

    /** 删除某日日报 */
    @Transactional
    public void deleteDaily(String branch, LocalDate date) {
        if (date == null) throw new BusinessException("日期不能为空");
        kpiMapper.deleteDailyByDate(dailyTable(branch), date);
    }

    /** 某日期区间 J1 供应给 J2/J3 的合计（成本仪表盘 J1 模式） */
    @Transactional(readOnly = true)
    public Map<String, Object> getSupply(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> row = kpiMapper.listSupplyBetween(startDate, endDate);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("supply_to_j2", row == null ? BigDecimal.ZERO : row.get("supply_to_j2"));
        out.put("supply_to_j3", row == null ? BigDecimal.ZERO : row.get("supply_to_j3"));
        return out;
    }

    /** 查询某店某月当前库存（costedit 页面上方输入框） */
    @Transactional(readOnly = true)
    public Map<String, Object> getMonthStock(String branch, String yearMonth) {
        Map<String, Object> row = kpiMapper.getMonthStock(branch.toLowerCase(), yearMonth);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("current_stock", row == null ? null : row.get("current_stock"));
        return out;
    }

    /** 保存某店某月当前库存 */
    @Transactional
    public void saveMonthStock(String branch, String yearMonth, BigDecimal currentStock) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("restaurant", branch.toLowerCase());
        m.put("year_month", yearMonth);
        m.put("current_stock", currentStock == null ? BigDecimal.ZERO : currentStock);
        kpiMapper.upsertMonthStock(m);
    }

    /** 保存成本（按日期原子 upsert） */
    @Transactional
    public void saveCost(String branch, BaseBranchCost cost) {
        if (cost.getDate() == null) throw new BusinessException("日期不能为空");
        String t = costTable(branch);
        kpiMapper.deleteCostByDate(t, cost.getDate());
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("date", cost.getDate());
        c.put("day_name", cost.getDayName());
        c.put("c_beverage", cost.getCBeverage());
        c.put("c_kitchen", cost.getCKitchen());
        c.put("c_grab", cost.getCGrab());
        c.put("c_foodpanda", cost.getCFoodpanda());
        c.put("c_shopee", cost.getCShopee());
        kpiMapper.insertCost(t, c);
    }
}

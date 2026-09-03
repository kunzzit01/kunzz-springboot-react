package com.kunzz.inventory.service;

import com.kunzz.inventory.mapper.StockSummaryMapper;
import com.kunzz.inventory.repository.StockDataRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 总库存汇总（对齐线上 stocklistall / stocklistapi.php?action=summary）
 * 算式：按 产品+编号+规格+单价 分组；净库存 = SUM(in) - SUM(out)；
 *      总价 = 净库存 × 单价；formatted_total_price 千分位 2 位
 * 数据访问：MyBatis Mapper（显式聚合 SQL）
 */
@Service
@RequiredArgsConstructor
public class StockSummaryService {

    private final StockSummaryMapper stockSummaryMapper;
    private final StockDataRepository stockDataRepository;
    private static final DecimalFormat THOUSANDS = new DecimalFormat("#,##0.00");

    /** 产品名 → 类型(category) 映射（中央无 type 列，从台账补全；8/24 新增） */
    private Map<String, String> productTypeMap() {
        Map<String, String> m = new java.util.HashMap<>();
        for (Object[] row : stockDataRepository.productCategories()) {
            if (row[0] != null && row[1] != null) m.put(String.valueOf(row[0]), String.valueOf(row[1]));
        }
        return m;
    }

    /** 产品名 → [冰箱分类, 位次]（总库存「冰箱分类」列+排序用；同名多记录取 id 最小一条，稳定；9/3 新增） */
    private Map<String, Object[]> productFreezerMap() {
        Map<String, Object[]> m = new java.util.HashMap<>();
        for (Object[] row : stockDataRepository.productFreezerInfo()) {
            if (row[0] != null) m.putIfAbsent(String.valueOf(row[0]), row);
        }
        return m;
    }

    /** 某系统库存汇总 */
    public Map<String, Object> summary(String system) {
        return summary(system, null);
    }

    /** 某系统库存汇总（endDate 非空 = 截至该日期的库存余额，对齐旧系统导出日期范围） */
    public Map<String, Object> summary(String system, java.time.LocalDate endDate) {
        String ts = system == null ? "central" : system;
        boolean isCentral = "central".equals(ts);
        // 数据源：central 用 stockinout_data（全量，不过滤 target_system，对齐线上），分店用各自 stockedit 表
        String table = isCentral ? "stockinout_data" : ts + "stockedit_data";
        List<Map<String, Object>> rows = stockSummaryMapper.summaryRows(table, null, endDate);
        // 中央无 type 列：从台账补全（8/24，对齐分店显示类型）
        Map<String, String> productType = isCentral ? productTypeMap() : Map.of();
        // 冰箱分类+位次（全系统通用台账字段；总库存选中类型后显示分类+排序；9/3 新增）
        Map<String, Object[]> freezerMap = productFreezerMap();
        java.util.function.Function<String, String> normalizeType = t -> {
            if (t == null || t.isBlank()) return "";
            return "Drinks".equalsIgnoreCase(t) ? "Service Line" : t;
        };

        List<Map<String, Object>> summary = new ArrayList<>();
        double totalValue = 0;
        Map<String, Double> typeStats = new LinkedHashMap<>();
        // 合并：同编号同货品不同单价 → 一行（库存合并），单价变体明细保存在 price_variants
        LinkedHashMap<String, Map<String, Object>> merged = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            String name = str(r.get("product_name"));
            String code = r.get("code_number") == null ? "" : String.valueOf(r.get("code_number"));
            String spec = r.get("specification") == null ? "" : String.valueOf(r.get("specification"));
            double stock = toD(r.get("total_stock"));
            double price = toD(r.get("price"));
            double totalPrice = toD(r.get("total_price"));
            String type = r.get("type") == null ? "" : String.valueOf(r.get("type"));
            if (isCentral) {
                type = normalizeType.apply(productType.getOrDefault(name, ""));
            } else {
                type = normalizeType.apply(type);
            }
            String key = name + "\u0000" + code + "\u0000" + spec;
            Map<String, Object> m = merged.get(key);
            if (m == null) {
                m = new LinkedHashMap<>();
                m.put("product_name", name);
                m.put("code_number", code);
                m.put("specification", spec);
                m.put("total_stock", 0.0);
                m.put("total_price", 0.0);
                m.put("type", type);
                m.put("variants", new ArrayList<Map<String, Object>>());
                merged.put(key, m);
            }
            m.put("total_stock", (Double) m.get("total_stock") + stock);
            m.put("total_price", (Double) m.get("total_price") + totalPrice);
            typeStats.merge(type, totalPrice, Double::sum);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> variants = (List<Map<String, Object>>) m.get("variants");
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("price", price);
            v.put("stock", stock);
            v.put("total_price", round2(totalPrice));
            v.put("formatted_stock", fmtStock(stock, spec));
            v.put("formatted_price", String.format("%.2f", price));
            v.put("formatted_total_price", THOUSANDS.format(totalPrice));
            variants.add(v);
        }

        int no = 1;
        for (Map<String, Object> m : merged.values()) {
            double stock = (Double) m.get("total_stock");
            double totalPrice = (Double) m.get("total_price");
            totalValue += totalPrice;
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> variants = (List<Map<String, Object>>) m.get("variants");
            String type = (String) m.get("type");
            double firstPrice = variants.isEmpty() ? 0 : (Double) variants.get(0).get("price");
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("no", no++);
            item.put("product_name", m.get("product_name"));
            item.put("code_number", m.get("code_number"));
            item.put("specification", m.get("specification"));
            item.put("total_stock", stock);
            item.put("price", firstPrice);
            item.put("total_price", round2(totalPrice));
            item.put("formatted_stock", fmtStock(stock, str(m.get("specification"))));
            item.put("formatted_price", String.format("%.2f", firstPrice));
            item.put("formatted_total_price", THOUSANDS.format(totalPrice));
            item.put("price_count", variants.size());
            item.put("price_variants", variants);
            item.put("type", type);
            // 冰箱分类+位次（多值如 "K1-6,S1-2" 原样带出，前端排序取首个；未登记货品为空串/null）
            Object[] fz = freezerMap.get(str(m.get("product_name")));
            item.put("freezer_category", fz == null ? "" : str(fz[1]));
            item.put("freezer_position", fz == null ? null : fz[2]);
            summary.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary);
        out.put("total_value", round2(totalValue));
        out.put("formatted_total_value", THOUSANDS.format(totalValue));
        out.put("total_products", summary.size());
        if (!typeStats.isEmpty()) out.put("type_stats", typeStats);

        // 中央：各分店供应值（对齐线上 stocklistapi.php getSupplyTotal：本月 jXstockinout_data 入库额 SUM(in×price)）
        if (isCentral) {
            java.time.YearMonth ym = java.time.YearMonth.now();
            String monthStart = ym.atDay(1).toString();
            String monthEnd = ym.atEndOfMonth().toString();
            for (String sub : new String[]{"j1", "j2", "j3"}) {
                List<Map<String, Object>> sr = stockSummaryMapper.supplyValue(sub + "stockinout_data", monthStart, monthEnd);
                // 无入库记录时 SUM 返回一行全 NULL，MyBatis 会给出 null 元素，需一并判空
                double v = (sr == null || sr.isEmpty() || sr.get(0) == null) ? 0
                        : toD(sr.get(0).get("total_supply_value"));
                out.put(sub + "_supply_value", round2(v));
            }
        }

        return out;
    }

    /** 库存格式化：规格含 kilo/kg 显示 3 位小数，其余 2 位（对齐线上 formatStockQuantity） */
    private String fmtStock(double v, String spec) {
        String s = spec == null ? "" : spec.trim().toLowerCase();
        if (s.contains("kilo") || s.contains("kg")) {
            return String.format("%.3f", v);
        }
        return String.format("%.2f", v);
    }

    private double toD(Object o) {
        if (o == null) return 0;
        if (o instanceof Number) return ((Number) o).doubleValue();
        try { return Double.parseDouble(String.valueOf(o).trim()); } catch (Exception e) { return 0; }
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private double round2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}

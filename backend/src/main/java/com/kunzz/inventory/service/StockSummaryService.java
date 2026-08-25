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

    /** 某系统库存汇总 */
    public Map<String, Object> summary(String system) {
        String ts = system == null ? "central" : system;
        boolean isCentral = "central".equals(ts);
        // 数据源：central 用 stockinout_data（全量，不过滤 target_system，对齐线上），分店用各自 stockedit 表
        String table = isCentral ? "stockinout_data" : ts + "stockedit_data";
        List<Map<String, Object>> rows = stockSummaryMapper.summaryRows(table, null);
        // 中央无 type 列：从台账补全（8/24，对齐分店显示类型）
        Map<String, String> productType = isCentral ? productTypeMap() : Map.of();
        java.util.function.Function<String, String> normalizeType = t -> {
            if (t == null || t.isBlank()) return "";
            return "Drinks".equalsIgnoreCase(t) ? "Service Line" : t;
        };

        List<Map<String, Object>> summary = new ArrayList<>();
        double totalValue = 0;
        Map<String, Double> typeStats = new LinkedHashMap<>();
        int no = 1;
        for (Map<String, Object> r : rows) {
            double stock = toD(r.get("total_stock"));
            double price = toD(r.get("price"));
            // 总价 = SUM((in - out) × 显示价ROUND2)，由 SQL 计算（对齐线上 8/23 修复：用显示价而非原始单价）
            double totalPrice = toD(r.get("total_price"));
            totalValue += totalPrice;
            String type = r.get("type") == null ? "" : String.valueOf(r.get("type"));
            if (isCentral) {
                type = normalizeType.apply(productType.getOrDefault(String.valueOf(r.get("product_name")), ""));
            } else {
                type = normalizeType.apply(type);
            }
            if (!type.isBlank()) {
                typeStats.merge(type, totalPrice, Double::sum);
            }
            // 原始单价范围（对齐线上 raw_prices：组内原始价与显示价不一致时标记，前端悬浮显示原始价）
            double priceRaw = toD(r.get("price_raw"));
            double priceRawMax = toD(r.get("price_raw_max"));
            boolean hasPriceDiff = Math.abs(priceRaw - price) > 0.0001 || Math.abs(priceRawMax - price) > 0.0001;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("no", no++);
            item.put("product_name", r.get("product_name"));
            item.put("code_number", r.get("code_number") == null ? "" : r.get("code_number"));
            item.put("specification", r.get("specification") == null ? "" : r.get("specification"));
            item.put("total_stock", stock);
            item.put("price", price);
            item.put("total_price", round2(totalPrice));
            item.put("formatted_stock", fmtStock(stock, str(r.get("specification"))));
            item.put("formatted_price", String.format("%.2f", price));
            item.put("formatted_total_price", THOUSANDS.format(totalPrice));
            item.put("price_raw", priceRaw);
            item.put("has_price_diff", hasPriceDiff);
            item.put("type", type);
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
                double v = (sr == null || sr.isEmpty()) ? 0 : toD(sr.get(0).get("total_supply_value"));
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

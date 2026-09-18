package com.kunzz.inventory.service;

import com.kunzz.inventory.common.HtmlText;
import com.kunzz.inventory.mapper.StockEditMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 进出货辅助选项（对齐线上 stockeditapi.php）
 * 下拉选项 + HIFO 价格批次 + 备注编号
 */
@Service
@RequiredArgsConstructor
public class StockEditService {

    private final StockEditMapper stockEditMapper;

    @Transactional(readOnly = true)
    public List<Map<String, Object>> codeNumbers() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : stockEditMapper.codeNumbers()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code_number", str(r.get("code_number")));
            // 货品名解码：与货品种类页/总库存页口径一致（老库有 &amp; 实体，编码/解码两套名字会导致下拉匹配不上）
            m.put("product_name", HtmlText.decode(str(r.get("product_name"))));
            out.add(m);
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> products() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : stockEditMapper.products()) {
            Map<String, Object> m = new LinkedHashMap<>();
            // 货品名/供应商解码：货品种类页（StockProductService）本来就是解码后的值，
            // 进出货这里不解码会出现「同一条货品两套名字」（如 L&amp;L FROZEN vs L&L FROZEN）→ 下拉里认不出、搜不到
            m.put("product_name", HtmlText.decode(str(r.get("product_name"))));
            m.put("product_code", str(r.get("product_code")));
            m.put("supplier", HtmlText.decode(str(r.get("supplier"))));
            // 对齐旧系统 code_by_product：自动补全规格/类型用
            m.put("specification", HtmlText.decode(str(r.get("specification"))));
            String cat = HtmlText.decode(str(r.get("category")));
            if (cat != null && (cat.equalsIgnoreCase("service line") || cat.equals("Drinks"))) {
                cat = "Service Line";
            }
            m.put("category", cat);
            out.add(m);
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<String> shippers() {
        return stockEditMapper.shippers();
    }

    /** HIFO 价格批次：按价格降序（最高价先出） */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> priceBatches(String system, String productName, String codeNumber) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : stockEditMapper.priceBatches(stockTable(system), productName, blankToNull(codeNumber))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("price", str(r.get("price")));
            m.put("available_stock", r.get("available_stock"));
            out.add(m);
        }
        return out;
    }

    /** 价格+库存明细（含 is_sufficient 库存检查） */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> priceStock(String system, String productName, String codeNumber, Double requiredQty) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : stockEditMapper.priceStock(stockTable(system), productName, blankToNull(codeNumber))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("price", str(r.get("price")));
            m.put("available_stock", r.get("available_stock"));
            m.put("total_in", r.get("total_in"));
            m.put("total_out", r.get("total_out"));
            double avail = toD(r.get("available_stock"));
            m.put("is_sufficient", requiredQty == null || avail >= requiredQty);
            out.add(m);
        }
        return out;
    }

    /** 在库备注编号（按系统：中央 stockinout_data / 分店 jXstockedit_data） */
    @Transactional(readOnly = true)
    public List<String> remarkCodes(String productName, String system) {
        return stockEditMapper.remarkCodes(stockTable(system), productName);
    }

    /** 在库备注编号 + 剩余量/单位（出货时下拉选择用；编号自然排序 SA-9 < SA-10） */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> remarkCodeOptions(String productName, String system) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : stockEditMapper.remarkCodeOptions(stockTable(system), productName)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("remark_number", str(r.get("remark_number")));
            m.put("available", r.get("net"));
            m.put("specification", HtmlText.decode(str(r.get("specification"))));
            out.add(m);
        }
        out.sort((a, b) -> naturalCompare(str(a.get("remark_number")), str(b.get("remark_number"))));
        return out;
    }

    /** 备注编号自然排序：同前缀按数字比大小（SA-9 < SA-10），前缀不同按字典序 */
    private int naturalCompare(String a, String b) {
        int da = a.lastIndexOf('-'), db = b.lastIndexOf('-');
        String pa = da >= 0 ? a.substring(0, da) : a;
        String pb = db >= 0 ? b.substring(0, db) : b;
        if (!pa.equals(pb)) return pa.compareTo(pb);
        String na = da >= 0 ? a.substring(da + 1) : "";
        String nb = db >= 0 ? b.substring(db + 1) : "";
        try {
            return Integer.compare(Integer.parseInt(na.trim()), Integer.parseInt(nb.trim()));
        } catch (NumberFormatException e) {
            return a.compareTo(b);
        }
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    /** 分店/中央 → 库存表名（白名单，防 SQL 注入） */
    private String stockTable(String system) {
        if ("j1".equalsIgnoreCase(system)) return "j1stockedit_data";
        if ("j2".equalsIgnoreCase(system)) return "j2stockedit_data";
        if ("j3".equalsIgnoreCase(system)) return "j3stockedit_data";
        return "stockinout_data";
    }

    private String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private double toD(Object o) {
        if (o == null) return 0;
        if (o instanceof Number) return ((Number) o).doubleValue();
        try { return Double.parseDouble(String.valueOf(o).trim()); } catch (Exception e) { return 0; }
    }
}

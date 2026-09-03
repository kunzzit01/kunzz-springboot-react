package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.mapper.PriceChangeLogMapper;
import com.kunzz.inventory.mapper.StockProductMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 货品种类台账（对齐线上 stockapi.php + stockproductname.php）
 * 数量算式：已批准 = approver 非空；待批准 = approver 为空
 * 列表排序：待批准在前、已批准在后（对齐 generateStockTable）
 */
@Service
@RequiredArgsConstructor
public class StockProductService {

    private final StockProductMapper stockProductMapper;
    private final PriceChangeLogMapper priceChangeLogMapper;

    /** 列表 + 统计（exact=true 货品名精确匹配，false 全能多字段模糊） */
    @Transactional(readOnly = true)
    public Map<String, Object> list(String systemAssign, String keyword, boolean exact) {
        String sys = (systemAssign == null || "overview".equals(systemAssign) || systemAssign.isBlank())
                ? null : systemAssign;
        List<Map<String, Object>> rows = stockProductMapper.listRows(sys,
                (keyword == null || keyword.isBlank()) ? null : keyword.trim(), exact);

        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", r.get("id"));
            item.put("date", str(r.get("date")));
            item.put("time", str(r.get("time")));
            item.put("product_code", decodeHtml(str(r.get("product_code"))));
            item.put("product_name", decodeHtml(str(r.get("product_name"))));
            item.put("specification", decodeHtml(str(r.get("specification"))));
            item.put("price", r.get("price"));
            item.put("category", decodeHtml(str(r.get("category"))));
            item.put("supplier", decodeHtml(str(r.get("supplier"))));
            item.put("applicant", decodeHtml(str(r.get("applicant"))));
            item.put("approver", decodeHtml(str(r.get("approver"))));
            item.put("system_assign", decodeHtml(str(r.get("system_assign"))));
            item.put("freezer_category", decodeHtml(str(r.get("freezer_category"))));
            item.put("freezer_position", r.get("freezer_position"));
            items.add(item);
        }

        long approved = items.stream().filter(i -> !((String) i.get("approver")).isBlank()).count();
        long pending = items.size() - approved;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", items.size());
        out.put("approved", approved);
        out.put("pending", pending);
        out.put("items", items);
        return out;
    }

    /** 进货默认单价（货品种类里最新维护的 price；无则返回 null） */
    @Transactional(readOnly = true)
    public Double getDefaultPrice(String productName, String codeNumber) {
        if (productName == null || productName.isBlank()) return null;
        return stockProductMapper.defaultPrice(productName.trim(),
                (codeNumber == null || codeNumber.isBlank()) ? null : codeNumber.trim());
    }

    /** 单价清洗：空串/空白/非法数字 → null（避免 '' 写入 DECIMAL 列报 Data truncation） */
    private Double cleanPrice(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 新增记录（对齐 POST stockapi.php；date/time 为空时用当前日期时间） */
    @Transactional
    public Map<String, Object> create(Map<String, Object> body) {
        String date = str(body.get("date"));
        String time = str(body.get("time"));
        if (date.isBlank()) date = java.time.LocalDate.now().toString();
        if (time.isBlank()) time = java.time.LocalTime.now().withNano(0).toString();
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("date", date);
        r.put("time", time);
        r.put("productCode", body.getOrDefault("product_code", ""));
        r.put("productName", body.getOrDefault("product_name", ""));
        r.put("specification", body.getOrDefault("specification", ""));
        r.put("price", cleanPrice(body.get("price")));
        r.put("category", body.getOrDefault("category", ""));
        r.put("supplier", body.getOrDefault("supplier", ""));
        r.put("applicant", body.getOrDefault("applicant", ""));
        r.put("approver", body.getOrDefault("approver", ""));
        r.put("systemAssign", body.getOrDefault("system_assign", ""));
        r.put("freezerCategory", body.getOrDefault("freezer_category", ""));
        r.put("freezerPosition", parsePos(body.get("freezer_position")));
        stockProductMapper.insertRow(r);
        return Map.of("success", true);
    }

    /** 更新记录（对齐 PUT stockapi.php；approver 由前端传，系统页编辑时清空重新批准） */
    @Transactional
    public Map<String, Object> update(Integer id, Map<String, Object> body) {
        // 部分字段安全：只更新请求里实际携带的字段（未携带的不动），
        // 防止部分字段的 PUT 把其余列清空（数据丢失风险；前端全量发送时行为不变）
        Map<String, Object> r = new LinkedHashMap<>();
        if (body.containsKey("product_code"))  r.put("productCode", str(body.get("product_code")));
        if (body.containsKey("product_name"))  r.put("productName", str(body.get("product_name")));
        if (body.containsKey("specification")) r.put("specification", str(body.get("specification")));
        if (body.containsKey("price"))         r.put("price", cleanPrice(body.get("price")));
        if (body.containsKey("category"))      r.put("category", str(body.get("category")));
        if (body.containsKey("supplier"))      r.put("supplier", str(body.get("supplier")));
        if (body.containsKey("applicant"))     r.put("applicant", str(body.get("applicant")));
        if (body.containsKey("approver"))      r.put("approver", str(body.get("approver")));
        if (body.containsKey("system_assign")) r.put("systemAssign", str(body.get("system_assign")));
        if (body.containsKey("freezer_category")) r.put("freezerCategory", str(body.get("freezer_category")));
        if (body.containsKey("freezer_position")) r.put("freezerPosition", parsePos(body.get("freezer_position")));
        if (r.isEmpty()) return Map.of("success", true);
        // 改价日志必须用【改价前】的旧价：update 前先取旧值（9/3 修复：原来 update 后才 findById，
        // 拿到的是新价，与 body 相等 → “价格未变不记录” → 日志从未写入）
        Map<String, Object> before = stockProductMapper.findById(id);
        int n = stockProductMapper.updateRow(id, r);
        if (n == 0) throw new BusinessException(404, "记录不存在");
        // 改价日志：body 携带 price 且与旧值不同 → 记录当天一条（总库存改价历史展示用）
        if (r.containsKey("price")) logPriceChange(before, body);
        return Map.of("success", true);
    }

    /** 位次解析：空/非法 → 0（=未设置，排序时排该冰箱最后；9/3 新增） */
    private Integer parsePos(Object v) {
        if (v == null) return 0;
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return 0; }
    }

    /** 改价日志：货品种类每次更改单价 → 当天记一条（从旧到最新展示在总库存） */
    /** 改价日志：用改价前的旧值判断/记录（before 为 null = 货品不存在，静默跳过） */
    private void logPriceChange(Map<String, Object> before, Map<String, Object> body) {
        if (before == null) return;
        Double oldPrice = cleanPrice(before.get("price"));
        Double newPrice = cleanPrice(body.get("price"));
        if (newPrice == null) return;
        if (oldPrice != null && oldPrice.compareTo(newPrice) == 0) return; // 价格未变不记录
        Map<String, Object> log = new LinkedHashMap<>();
        // 名字与流水/总库存保持一致（decoded 纯文本）：改价同时改名 → 取新名
        log.put("productName", body.containsKey("product_name") && !str(body.get("product_name")).isBlank()
                ? decodeHtml(str(body.get("product_name"))) : decodeHtml(str(before.get("product_name"))));
        log.put("codeNumber", str(before.get("product_code")));
        log.put("oldPrice", oldPrice);
        log.put("newPrice", newPrice);
        log.put("changeDate", java.time.LocalDate.now().toString());
        log.put("changedBy", decodeHtml(str(body.getOrDefault("applicant", ""))));
        priceChangeLogMapper.insertLog(log);
    }

    /** 删除记录（对齐 DELETE stockapi.php?id=） */
    @Transactional
    public Map<String, Object> delete(Integer id) {
        int n = stockProductMapper.deleteRow(id);
        if (n == 0) throw new BusinessException(404, "记录不存在");
        return Map.of("success", true);
    }

    /** 批准记录（对齐 ?action=approve） */
    @Transactional
    public Map<String, Object> approve(Integer id, String approver) {
        if (approver == null || approver.isBlank()) throw new BusinessException("审批人不能为空");
        int n = stockProductMapper.approveRow(id, approver);
        if (n == 0) throw new BusinessException(404, "记录不存在");
        return Map.of("success", true);
    }

    /** HTML 实体解码（老库 product_name 等字段含 &amp; 等实体，对齐线上 decodeHtml） */
    private String decodeHtml(String s) {
        if (s == null || s.isBlank()) return "";
        return s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ");
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }
}

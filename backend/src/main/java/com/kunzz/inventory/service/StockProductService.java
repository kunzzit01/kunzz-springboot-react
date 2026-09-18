package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.mapper.PriceChangeLogMapper;
import com.kunzz.inventory.mapper.StockDataSystemMapper;
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
    private final StockDataSystemMapper stockDataSystemMapper;
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

        // 总览（无系统）看不到单独的单价/冰箱分类：补上「各系统 4 套」的只读文本，前端直接展示
        if (sys == null) attachPerSystemTexts(items);

        long approved = items.stream().filter(i -> !((String) i.get("approver")).isBlank()).count();
        long pending = items.size() - approved;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", items.size());
        out.put("approved", approved);
        out.put("pending", pending);
        out.put("items", items);
        return out;
    }

    /** 进货默认单价（该货品在**该系统**下维护的 price；无则返回 null） */
    @Transactional(readOnly = true)
    public Double getDefaultPrice(String productName, String codeNumber, String system) {
        if (productName == null || productName.isBlank()) return null;
        return stockDataSystemMapper.defaultPrice(productName.trim(),
                (codeNumber == null || codeNumber.isBlank()) ? null : codeNumber.trim(),
                systemKey(system));
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
        stockProductMapper.insertRow(r);
        // 单价/冰箱分类/位次 按系统写进 stock_data_system（stock_data 上那三列保留但不再读写）
        writePerSystemFields(stockProductMapper.lastInsertId(), body);
        return Map.of("success", true);
    }

    /** 更新记录（对齐 PUT stockapi.php；approver 由前端传，系统页编辑时清空重新批准）
     *  operator = 当前登录用户显示名，只用于改价记录的「谁改的」（改价人不等于货品申请人） */
    @Transactional
    public Map<String, Object> update(Integer id, Map<String, Object> body, String operator) {
        // 部分字段安全：只更新请求里实际携带的字段（未携带的不动），
        // 防止部分字段的 PUT 把其余列清空（数据丢失风险；前端全量发送时行为不变）
        Map<String, Object> r = new LinkedHashMap<>();
        if (body.containsKey("product_code"))  r.put("productCode", str(body.get("product_code")));
        if (body.containsKey("product_name"))  r.put("productName", str(body.get("product_name")));
        if (body.containsKey("specification")) r.put("specification", str(body.get("specification")));
        if (body.containsKey("category"))      r.put("category", str(body.get("category")));
        if (body.containsKey("supplier"))      r.put("supplier", str(body.get("supplier")));
        if (body.containsKey("applicant"))     r.put("applicant", str(body.get("applicant")));
        if (body.containsKey("approver"))      r.put("approver", str(body.get("approver")));
        if (body.containsKey("system_assign")) r.put("systemAssign", str(body.get("system_assign")));

        // 单价/冰箱分类/位次 走 stock_data_system（按系统）；只携带这三个字段时也要照常处理
        boolean perSystem = body.containsKey("price")
                || body.containsKey("freezer_category") || body.containsKey("freezer_position");
        if (r.isEmpty() && !perSystem) return Map.of("success", true);
        // 改价日志必须用【改价前】的旧价：update 前先取旧值（9/3 修复：原来 update 后才 findById，
        // 拿到的是新价，与 body 相等 → “价格未变不记录” → 日志从未写入）
        Map<String, Object> before = stockProductMapper.findById(id);
        if (before == null) throw new BusinessException(404, "记录不存在");
        // 旧价必须在**写之前**取：按系统的三件套也是下面这一步写的，写后再读拿到的就是新价，
        // 会变成"价格未变不记录"（与 9/3 那起 update 后才 findById 的坑同一类，这里直接把值传下去，结构上防住）
        String logSys = explicitSystem(body.get("system"));
        Object beforeId = before.get("id");
        Double oldPriceBefore = (beforeId instanceof Number bn && logSys != null)
                ? stockDataSystemMapper.priceOf(bn.intValue(), logSys) : null;
        if (!r.isEmpty()) stockProductMapper.updateRow(id, r);
        writePerSystemFields(id, body);
        // 改价日志：body 携带 price 且与旧值（该系统那一份）不同 → 记录当天一条
        if (body.containsKey("price")) logPriceChange(before, body, logSys, oldPriceBefore, operator);
        return Map.of("success", true);
    }

    /** 系统名归一：central/j1/j2/j3；总览、空 → central（进出货页 system=overview 也指中央） */
    private String systemKey(Object raw) {
        String v = raw == null ? "" : String.valueOf(raw).trim().toLowerCase();
        if (v.isEmpty() || "overview".equals(v)) return "central";
        if (v.equals("central") || v.equals("j1") || v.equals("j2") || v.equals("j3")) return v;
        return null;
    }

    /** 显式系统名（只认 central/j1/j2/j3）。总览、空、不认识的一律 null —— 总览编辑绝不能写到某个系统去 */
    private String explicitSystem(Object raw) {
        String v = raw == null ? "" : String.valueOf(raw).trim().toLowerCase();
        return (v.equals("central") || v.equals("j1") || v.equals("j2") || v.equals("j3")) ? v : null;
    }

    /** 把请求里携带的「按系统」三件套写进 stock_data_system；没带 system 或值为 null 的字段都不写 */
    private void writePerSystemFields(Integer dataId, Map<String, Object> body) {
        if (dataId == null) return;
        String system = explicitSystem(body.get("system"));
        if (system == null) return;
        Object fc = body.get("freezer_category"), fp = body.get("freezer_position"), pr = body.get("price");
        if (fc == null && fp == null && pr == null) return;
        stockDataSystemMapper.upsert(dataId, system,
                fc != null ? str(fc) : null,
                fp != null ? parsePos(fp) : null,
                pr != null ? cleanPrice(pr) : null);
    }

    /** 总览用：给每行补「各系统」的单价/冰箱分类只读文本（前端在单价、冰箱分类列直接展示） */
    private void attachPerSystemTexts(List<Map<String, Object>> items) {
        if (items.isEmpty()) return;
        Map<Object, Map<String, Map<String, Object>>> byData = new LinkedHashMap<>();
        for (Map<String, Object> r : stockDataSystemMapper.allRows()) {
            byData.computeIfAbsent(r.get("dataId"), k -> new LinkedHashMap<>())
                  .put(str(r.get("stockSystem")), r);
        }
        for (Map<String, Object> item : items) {
            Map<String, Map<String, Object>> per = byData.get(item.get("id"));
            item.put("price_by_system", joinBySystem(per, "price"));
            item.put("freezer_by_system", joinBySystem(per, "freezerCategory"));
        }
    }

    /** 4 套值拼成一行：4 个系统完全一样（含全空）→ 只给一个值；否则「中央 x · J1 y · J2 - · J3 z」 */
    private String joinBySystem(Map<String, Map<String, Object>> per, String key) {
        String[] sysKeys = {"central", "j1", "j2", "j3"};
        String[] labels = {"中央", "J1", "J2", "J3"};
        List<String> vals = new ArrayList<>();
        for (String sk : sysKeys) {
            Map<String, Object> row = per == null ? null : per.get(sk);
            Object v = row == null ? null : row.get(key);
            vals.add(v == null ? "" : formatVal(key, v));
        }
        boolean allSame = true;
        for (String v : vals) if (!v.equals(vals.get(0))) { allSame = false; break; }
        if (allSame) return vals.get(0);
        List<String> parts = new ArrayList<>();
        for (int i = 0; i < sysKeys.length; i++) {
            parts.add(labels[i] + " " + (vals.get(i).isEmpty() ? "-" : vals.get(i)));
        }
        return String.join(" · ", parts);
    }

    /** 单价去尾零（2.67000 → 2.67；4~5 位小数原样保留）；其它字段原样 */
    private String formatVal(String key, Object v) {
        String txt = str(v);
        if (!"price".equals(key) || txt.isEmpty()) return txt;
        try {
            return new java.math.BigDecimal(txt).stripTrailingZeros().toPlainString();
        } catch (Exception e) {
            return txt;
        }
    }

    /** 位次解析：空/非法 → 0（=未设置，排序时排该冰箱最后；9/3 新增） */
    private Integer parsePos(Object v) {
        if (v == null) return 0;
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return 0; }
    }

    /** 改价日志：货品每次改单价 → 当天记一条（同一天同一货品同一系统只保留一条，从旧到最新展示在总库存） */
    /** 改价日志：用改价前的旧值判断/记录（before 为 null = 货品不存在，静默跳过） */
    private void logPriceChange(Map<String, Object> before, Map<String, Object> body,
                                String system, Double oldPrice, String operator) {
        if (before == null) return;
        Double newPrice = cleanPrice(body.get("price"));
        if (newPrice == null) return;
        if (oldPrice != null && oldPrice.compareTo(newPrice) == 0) return; // 价格未变不记录
        // 名字与流水/总库存保持一致（decoded 纯文本）：改价同时改名 → 取新名
        String productName = body.containsKey("product_name") && !str(body.get("product_name")).isBlank()
                ? decodeHtml(str(body.get("product_name"))) : decodeHtml(str(before.get("product_name")));
        // 「谁改的」= 当前登录用户（服务端取，前端伪造不了）。请求体里的 applicant 是货品申请人
        // （当初建这条货品记录的人，可能是很久以前、别人），拿它当改价人是错的 —— 只在没有登录态时兜底
        String changedBy = operator != null && !operator.isBlank()
                ? decodeHtml(operator) : decodeHtml(str(body.getOrDefault("applicant", "")));
        String today = java.time.LocalDate.now().toString();
        // 同一天同一货品同一系统只保留一条：库里已有当天那一条 → 只把「改价后」更新成最新价，不再追加新行
        // old_price 保持当天起点价不动，所以这条记录始终读作「当天开始时是多少 → 现在是多少」
        Map<String, Object> todayRow = priceChangeLogMapper.findToday(productName,
                system == null ? "central" : system, today);
        if (todayRow != null && todayRow.get("id") instanceof Number tid) {
            priceChangeLogMapper.updateTodayPrice(tid.intValue(), newPrice, changedBy);
            return;
        }
        Map<String, Object> log = new LinkedHashMap<>();
        log.put("productName", productName);
        log.put("codeNumber", str(before.get("product_code")));
        log.put("stockSystem", system);
        log.put("oldPrice", oldPrice);
        log.put("newPrice", newPrice);
        log.put("changeDate", today);
        log.put("changedBy", changedBy);
        priceChangeLogMapper.insertLog(log);
    }

    /** 删除记录（对齐 DELETE stockapi.php?id=） */
    @Transactional
    public Map<String, Object> delete(Integer id) {
        int n = stockProductMapper.deleteRow(id);
        if (n == 0) throw new BusinessException(404, "记录不存在");
        // 顺手清掉该货品的按系统行，避免留下看不见也删不掉的孤儿行
        stockDataSystemMapper.deleteByDataId(id);
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

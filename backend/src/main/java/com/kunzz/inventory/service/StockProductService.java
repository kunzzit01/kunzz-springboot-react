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

    /** 列表 + 统计（exact=true 货品名精确匹配，false 全能多字段模糊）
     *  allowedSystems = 当前用户有权限的系统（小写；null = 没配置权限，不限制）。
     *  只影响总览的「各系统单价/冰箱分类」文本：无权限的系统的值不显示（也不提示"另有"）。 */
    @Transactional(readOnly = true)
    public Map<String, Object> list(String systemAssign, String keyword, boolean exact, List<String> allowedSystems) {
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
            // 启用/停用（按系统）：没有该系统的行 = 启用（1）；总览不显示这一列，给 1 即可。
            // 注意 TINYINT(1) 被 MyBatis 读成 Boolean（不是数字），所以按字符串判断，别强转 Number
            Object act = r.get("active");
            item.put("active", act == null ? 1
                    : (Boolean.TRUE.equals(act) || "1".equals(String.valueOf(act))
                       || "true".equalsIgnoreCase(String.valueOf(act)) ? 1 : 0));
            // 创建/编辑信息（前端悬浮提示显示：创建时间 + 编辑人 updated_by）
            item.put("created_at", fmtStamp(r.get("created_at")));
            item.put("updated_at", fmtStamp(r.get("updated_at")));
            item.put("updated_by", decodeHtml(str(r.get("updated_by"))));
            items.add(item);
        }

        // 总览（无系统）看不到单独的单价/冰箱分类：补上「各系统」的只读文本，前端直接展示
        if (sys == null) attachPerSystemTexts(items, allowedSystems);

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

    /** 新增记录（对齐 POST stockapi.php；date/time 为空时用当前日期时间）
     *  autoApprove = 调用者有「批准」权限 → 批准人留空时自动写成本次操作人（保存即批准，2026-09-22 用户要求） */
    @Transactional
    public Map<String, Object> create(Map<String, Object> body, String operator, boolean autoApprove) {
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
        // 有批准权限的人新增 → 直接批准（批准人写成本次操作人），不用再去点「批准」按钮
        autoApproveIfBlank(r, operator, autoApprove, str(body.get("approver")));
        stockProductMapper.insertRow(r);
        // 单价/冰箱分类/位次 按系统写进 stock_data_system（stock_data 上那三列保留但不再读写）
        writePerSystemFields(stockProductMapper.lastInsertId(), body);
        return Map.of("success", true);
    }

    /** 更新记录（对齐 PUT stockapi.php；approver 由前端传，系统页编辑时清空重新批准）
     *  operator = 当前登录用户显示名，只用于改价记录的「谁改的」（改价人不等于货品申请人）
     *  autoApprove = 调用者有「批准」权限 → 本该变回待批准的（approver 为空），自动写成本次操作人（保存即批准） */
    @Transactional
    public Map<String, Object> update(Integer id, Map<String, Object> body, String operator, boolean autoApprove) {
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

        // 单价/冰箱分类/位次/启用 走 stock_data_system（按系统）；只携带这几个字段时也要照常处理
        boolean perSystem = body.containsKey("price")
                || body.containsKey("freezer_category") || body.containsKey("freezer_position")
                || body.containsKey("active");
        if (r.isEmpty() && !perSystem) return Map.of("success", true);
        // 编辑人：真的改动了才记（登录用户；新增时没有编辑人）
        if (operator != null && !operator.isBlank()) r.put("updatedBy", operator);
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
        // 停用（active=0）前先查库存：还有库存不给停（用户要求；按当前系统算）
        if (body.containsKey("active") && Integer.valueOf(0).equals(parseActive(body.get("active")))) {
            assertNoStockBeforeDeactivate(before, logSys);
        }
        // 有批准权限的人保存即批准：这行保存后会掉回待批准（approver 空）时，直接写成本次操作人。
        // 请求体带了 approver 就以它为准，没带就看库里的现值 —— 非空一律不动（不会把别人批的改成自己）
        autoApproveIfBlank(r, operator, autoApprove,
                body.containsKey("approver") ? str(body.get("approver")) : str(before.get("approver")));
        if (!r.isEmpty()) stockProductMapper.updateRow(id, r);
        writePerSystemFields(id, body);
        // 改价日志：body 携带 price 且与旧值（该系统那一份）不同 → 记录当天一条
        if (body.containsKey("price")) logPriceChange(before, body, logSys, oldPriceBefore, operator);
        return Map.of("success", true);
    }

    /** 时间字段转文本（yyyy-MM-dd HH:mm:ss）：MyBatis 取回来是 Timestamp，直接给前端会变成数字 */
    private String fmtStamp(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime().withNano(0).toString().replace('T', ' ');
        if (v instanceof java.time.LocalDateTime dt) return dt.withNano(0).toString().replace('T', ' ');
        return String.valueOf(v).replace('T', ' ').replace(".0", "");
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

    /** 把请求里携带的「按系统」字段（冰箱分类/位次/单价/启用）写进 stock_data_system；没带 system 或值为 null 的字段都不写 */
    private void writePerSystemFields(Integer dataId, Map<String, Object> body) {
        if (dataId == null) return;
        String system = explicitSystem(body.get("system"));
        if (system == null) return;
        Object fc = body.get("freezer_category"), fp = body.get("freezer_position"), pr = body.get("price");
        Object ac = body.get("active");
        if (fc == null && fp == null && pr == null && ac == null) return;
        stockDataSystemMapper.upsert(dataId, system,
                fc != null ? str(fc) : null,
                fp != null ? parsePos(fp) : null,
                pr != null ? cleanPrice(pr) : null,
                ac != null ? parseActive(ac) : null);
    }

    /** 启用标记解析：true/1/yes → 1；其余（含 false/0）→ 0；null → null（不写） */
    private Integer parseActive(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim().toLowerCase();
        return ("true".equals(s) || "1".equals(s) || "yes".equals(s)) ? 1 : 0;
    }

    /**
     * 「有批准权限的人保存即批准」（2026-09-22 用户要求）：这行保存后批准人会变空时，自动写成本次操作人。
     * 非空一律不动 —— 总览页"保持原批准状态"的既有行为不被破坏，也不会把别人批的改成自己。
     * 没有批准权限（autoApprove=false）或拿不到登录用户（operator 空）→ 完全不动，行为与改动前一致。
     * currentApprover = 这行保存后会是什么批准人（请求体带了就是请求体的值，没带就是库里的现值）。
     */
    private void autoApproveIfBlank(Map<String, Object> r, String operator, boolean autoApprove, String currentApprover) {
        if (!autoApprove || operator == null || operator.isBlank()) return;
        if (currentApprover != null && !currentApprover.isBlank()) return;
        r.put("approver", operator);
    }

    /**
     * 停用前的库存校验：当前系统里**该货品编号**的净库存 ≠ 0 → 拒绝（口径与「总库存」一致：台账表 deleted_at IS NULL）。
     * 用户要求"该货品还有货品就无法 inactive"。
     * 2026-09-22 起**按货品编号**算，不再按名字：一个名字在真实数据里常挂多个编号
     * （实测 485 个名字里 92 个，如「CHICKEN BONELESS LEG」= FI 0017/0018/0149/0165），
     * 按名字求和会让没库存的那个编号被同名的别的编号的库存拦下。
     */
    private void assertNoStockBeforeDeactivate(Map<String, Object> before, String system) {
        if (system == null) throw new BusinessException("请在具体系统页面（中央/J1/J2/J3）操作停用");
        String code = str(before.get("product_code")).trim();
        if (code.isEmpty()) return; // 没编号无法核对库存，放行（老数据兜底，与原来名字为空时一致）
        String table = "central".equals(system) ? "stockinout_data" : system + "stockedit_data";
        java.math.BigDecimal net = stockProductMapper.netStockByCode(table, code);
        if (net != null && net.signum() != 0) {
            throw new BusinessException("该货品「" + decodeHtml(str(before.get("product_name")))
                    + "」（编号 " + code + "）在 " + system.toUpperCase() + " 还有库存 "
                    + net.stripTrailingZeros().toPlainString() + "，清完库存后才能停用");
        }
    }

    /** 总览用：给每行补「各系统」的单价/冰箱分类只读文本（前端在单价、冰箱分类列直接展示）
     *  allowedSystems 非空 → 只拼用户有权限的系统，无权限的系统的值不显示（也不提示"另有"，2026-09-19 用户要求） */
    private void attachPerSystemTexts(List<Map<String, Object>> items, List<String> allowedSystems) {
        if (items.isEmpty()) return;
        Map<Object, Map<String, Map<String, Object>>> byData = new LinkedHashMap<>();
        for (Map<String, Object> r : stockDataSystemMapper.allRows()) {
            byData.computeIfAbsent(r.get("dataId"), k -> new LinkedHashMap<>())
                  .put(str(r.get("stockSystem")), r);
        }
        for (Map<String, Object> item : items) {
            Map<String, Map<String, Object>> per = byData.get(item.get("id"));
            item.put("price_by_system", joinBySystem(per, "price", allowedSystems, false));
            // 悬浮提示用：单价带 RM 单位（单元格里不带，列头已写 单价(RM)，短一点不容易被截断）
            item.put("price_by_system_tip", joinBySystem(per, "price", allowedSystems, true));
            item.put("freezer_by_system", joinBySystem(per, "freezerCategory", allowedSystems, false));
        }
    }

    /** 「各系统」值拼成一行：可见的系统完全一样（含全空）→ 只给一个值；否则「J1 x · J2 -」；
     *  allowedSystems 非空时只拼这些系统（用户只关心自己的分店；不显示也不提示无权限系统的值）；
     *  withUnit = 单价前加「RM 」（只给悬浮提示用） */
    private String joinBySystem(Map<String, Map<String, Object>> per, String key,
                                List<String> allowedSystems, boolean withUnit) {
        String[] sysKeys = {"central", "j1", "j2", "j3"};
        String[] labels = {"中央", "J1", "J2", "J3"};
        List<String> vals = new ArrayList<>();
        List<String> shown = new ArrayList<>();
        for (int i = 0; i < sysKeys.length; i++) {
            if (allowedSystems != null && !allowedSystems.contains(sysKeys[i])) continue; // 无权限：不显示它的值
            Map<String, Object> row = per == null ? null : per.get(sysKeys[i]);
            Object v = row == null ? null : row.get(key);
            vals.add(v == null ? "" : formatVal(key, v));
            shown.add(labels[i]);
        }
        if (vals.isEmpty()) return "";
        boolean allSame = true;
        for (String v : vals) if (!v.equals(vals.get(0))) { allSame = false; break; }
        if (allSame) return unit(key, vals.get(0), withUnit);
        List<String> parts = new ArrayList<>();
        for (int i = 0; i < vals.size(); i++) {
            parts.add(shown.get(i) + " " + (vals.get(i).isEmpty() ? "-" : unit(key, vals.get(i), withUnit)));
        }
        return String.join(" · ", parts);
    }

    /** 单价（price）且需要带单位时 → 「RM 2.667」；空值/其它字段原样 */
    private String unit(String key, String v, boolean withUnit) {
        if (!withUnit || !"price".equals(key) || v == null || v.isEmpty()) return v;
        return "RM " + v;
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

    /** 批准记录（对齐 ?action=approve）
     *  approver 必须由 controller 从**登录态**取（operatorOf）；不接受前端传值，否则"谁批的"可以伪造（2026-09-22 修正） */
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

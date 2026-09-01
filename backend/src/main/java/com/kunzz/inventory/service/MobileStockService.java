package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.MobileBatchSaveRequest;
import com.kunzz.inventory.dto.MobileStockRequest;
import com.kunzz.inventory.mapper.MobileStockMapper;
import com.kunzz.inventory.mapper.StockEditMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 手机版进出货（对齐旧系统 jXstockeditmobile_api.php 的完整数据流）
 *
 * 创建/更新/删除四步（事务内）：
 *   ① jXstockeditmobile_data 主写
 *   ② jXstocklist_total 缓存增减（手机总库存页数据源）
 *   ③ jXstockedit_data 镜像同步（receiver='Mobile' + mobile_ref_id 关联）
 *   ④ 出货 HIFO：按价格从高到低跨价格组拆行（无指定价格时）；指定价格层则单行直写并预检该层可用量
 * 删除/更新经 mobile_ref_id 级联桌面表，保证与 live 双跑期间数据互认。
 */
@Service
@RequiredArgsConstructor
public class MobileStockService {

    private final MobileStockMapper mobileStockMapper;
    private final StockEditMapper stockEditMapper;

    private static final BigDecimal EPS = new BigDecimal("0.0001");

    // ---------- 查询 ----------

    public List<Map<String, Object>> records(String system, LocalDate start, LocalDate end, String productName) {
        String sys = sys(system);
        return mobileStockMapper.listRecords(mobileTable(sys),
                start == null ? null : start.toString(),
                end == null ? null : end.toString(),
                normalizeName(productName), 5000);
    }

    public Map<String, Object> record(String system, Integer id) {
        String sys = sys(system);
        Map<String, Object> r = mobileStockMapper.getRecord(mobileTable(sys), id);
        if (r == null) throw new BusinessException("记录不存在");
        return r;
    }

    /** 出货价格层（含可用量；负数=已超扣；价格从高到低） */
    public List<Map<String, Object>> priceTiers(String system, String productName, String codeNumber) {
        String sys = sys(system);
        return mobileStockMapper.tiersWithSpec(editTable(sys), normalizeName(productName), blankToNull(codeNumber));
    }

    /** 货品下拉（stock_data 主数据：产品名/编号/规格/类型） */
    public List<Map<String, Object>> productOptions() {
        return stockEditMapper.products();
    }

    /** 手机总库存（读 jXstocklist_total 缓存，对齐 /mobile/ch/stocklistjX.php；带台账类型） */
    public List<Map<String, Object>> totals(String system) {
        String sys = sys(system);
        return mobileStockMapper.listTotals(totalTable(sys));
    }

    /**
     * 电话版批量出货（对齐旧 batch_save）：前端改「剩余量」→ 差值 = 出货量 → 已按价格层拆行。
     * 事务内：预检（按 product+price 聚合，不按 spec 过滤，与旧版一致）→ 逐行 mobile 主写 + 桌面镜像直写 + total 缓存增减。
     */
    @Transactional
    public List<Map<String, Object>> batchSave(MobileBatchSaveRequest req, String operator) {
        String sys = sys(req.system());
        if (req.rows() == null || req.rows().isEmpty()) throw new BusinessException("没有要保存的出货行");
        LocalDate date = req.documentDate() != null ? req.documentDate() : LocalDate.now();

        // ① 预检：按 (product, code, price) 聚合出货量，跨规格比对可用库存（对齐旧 outSummary 校验）
        Map<String, BigDecimal> summary = new LinkedHashMap<>();
        Map<String, MobileBatchSaveRequest.Row> rowByKey = new LinkedHashMap<>();
        for (MobileBatchSaveRequest.Row row : req.rows()) {
            String pname = normalizeName(row.productName());
            if (pname == null) throw new BusinessException("产品名称不能为空");
            BigDecimal out = nz(row.outQuantity());
            if (out.signum() <= 0) throw new BusinessException("产品 [" + pname + "] 出货数量必须大于 0");
            if (row.price() == null) throw new BusinessException("产品 [" + pname + "] 缺少价格层");
            String key = pname + "|" + blankToNull(row.codeNumber()) + "|" + row.price().stripTrailingZeros().toPlainString();
            summary.merge(key, out, BigDecimal::add);
            rowByKey.putIfAbsent(key, row);
        }
        for (Map.Entry<String, BigDecimal> e : summary.entrySet()) {
            MobileBatchSaveRequest.Row sample = rowByKey.get(e.getKey());
            checkTierStock(sys, normalizeName(sample.productName()), blankToNull(sample.codeNumber()), sample.price(), e.getValue());
        }

        // ② 逐行写入（mobile 主写 → 桌面镜像直写 → total 缓存）
        List<Map<String, Object>> created = new java.util.ArrayList<>();
        for (MobileBatchSaveRequest.Row row : req.rows()) {
            String pname = normalizeName(row.productName());
            BigDecimal out = nz(row.outQuantity());
            LocalTime time = row.time() != null && !row.time().isBlank()
                    ? LocalTime.parse(row.time().length() > 8 ? row.time().substring(0, 8) : row.time())
                    : LocalTime.now();

            Map<String, Object> r = new LinkedHashMap<>();
            r.put("date", date.toString());
            r.put("time", time.toString());
            r.put("productName", pname);
            r.put("codeNumber", blankToNull(row.codeNumber()));
            r.put("specification", blankToNull(row.specification()));
            r.put("type", blankToNull(row.type()));
            r.put("inQuantity", BigDecimal.ZERO);
            r.put("outQuantity", out);
            r.put("receiver", operator);
            mobileStockMapper.insertRecord(mobileTable(sys), r);
            Integer refId = toInt(r.get("id"));

            syncToDesktop(sys, pname, blankToNull(row.codeNumber()), blankToNull(row.specification()),
                    blankToNull(row.type()), BigDecimal.ZERO, out, row.price(), date, time, refId);
            applyTotal(sys, pname, blankToNull(row.codeNumber()), blankToNull(row.specification()),
                    BigDecimal.ZERO, out);
            created.add(record(sys, refId));
        }
        return created;
    }

    // ---------- 创建（对齐 handlePost） ----------

    @Transactional
    public Map<String, Object> create(MobileStockRequest req) {
        String sys = sys(req.system());
        String name = normalizeName(req.productName());
        if (name == null) throw new BusinessException("产品名称不能为空");
        LocalDate date = req.date() != null ? req.date() : LocalDate.now();
        LocalTime time = req.time() != null ? req.time() : LocalTime.now();
        BigDecimal in = nz(req.inQuantity());
        BigDecimal out = nz(req.outQuantity());
        if (in.signum() <= 0 && out.signum() <= 0) throw new BusinessException("进货/出货数量至少填写一项");
        String code = blankToNull(req.codeNumber());
        String spec = blankToNull(req.specification());
        // 出货指定价格层 → 预检该层可用量（对齐旧 batch 预检口径，超扣直接拒绝）
        if (out.signum() > 0 && req.price() != null) {
            checkTierStock(sys, name, code, req.price(), out);
        }

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("date", date.toString());
        r.put("time", time.toString());
        r.put("productName", name);
        r.put("codeNumber", code);
        r.put("specification", spec);
        r.put("type", blankToNull(req.type()));
        r.put("inQuantity", in);
        r.put("outQuantity", out);
        r.put("receiver", blankToNull(req.receiver()));
        mobileStockMapper.insertRecord(mobileTable(sys), r);
        Integer refId = toInt(r.get("id"));

        syncToDesktop(sys, name, code, spec, blankToNull(req.type()), in, out, req.price(), date, time, refId);
        applyTotal(sys, name, code, spec, in, out);
        return record(sys, refId);
    }

    // ---------- 更新（对齐 handlePut：关键字段变更 → 撤旧加新；否则差值回补；桌面镜像删旧重同步） ----------

    @Transactional
    public Map<String, Object> update(Integer id, MobileStockRequest req) {
        String sys = sys(req.system());
        String table = mobileTable(sys);
        Map<String, Object> old = mobileStockMapper.getRecord(table, id);
        if (old == null) throw new BusinessException("记录不存在");

        String newName = req.productName() != null ? normalizeName(req.productName())
                : str(old.get("product_name"));
        LocalDate date = req.date() != null ? req.date() : toLocalDate(old.get("date"));
        LocalTime time = req.time() != null ? req.time() : toLocalTime(old.get("time"));
        String newCode = req.codeNumber() != null ? blankToNull(req.codeNumber()) : str(old.get("code_number"));
        String newSpec = req.specification() != null ? blankToNull(req.specification()) : str(old.get("specification"));
        String newType = req.type() != null ? blankToNull(req.type()) : str(old.get("type"));
        BigDecimal newIn = req.inQuantity() != null ? req.inQuantity() : bd(old.get("in_quantity"));
        BigDecimal newOut = req.outQuantity() != null ? req.outQuantity() : bd(old.get("out_quantity"));
        String newReceiver = req.receiver() != null ? blankToNull(req.receiver()) : str(old.get("receiver"));
        if (newIn.signum() <= 0 && newOut.signum() <= 0) throw new BusinessException("进货/出货数量至少填写一项");
        if (newOut.signum() > 0 && req.price() != null) {
            checkTierStock(sys, newName, newCode, req.price(), newOut);
        }

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", id);
        r.put("date", date.toString());
        r.put("time", time.toString());
        r.put("productName", newName);
        r.put("codeNumber", newCode);
        r.put("specification", newSpec);
        r.put("type", newType);
        r.put("inQuantity", newIn);
        r.put("outQuantity", newOut);
        r.put("receiver", newReceiver);
        mobileStockMapper.updateRecord(table, r);

        // 总数缓存：关键字段变更 → 撤旧键加新键；否则同键差值（对齐旧 updateStocklistTotal 调用）
        String oldName = str(old.get("product_name"));
        String oldCode = str(old.get("code_number"));
        String oldSpec = str(old.get("specification"));
        BigDecimal oldIn = bd(old.get("in_quantity"));
        BigDecimal oldOut = bd(old.get("out_quantity"));
        boolean keyChanged = !newName.equals(oldName) || !eq(newCode, oldCode) || !eq(newSpec, oldSpec);
        if (keyChanged) {
            applyTotal(sys, oldName, oldCode, oldSpec, oldIn.negate(), oldOut.negate());
            applyTotal(sys, newName, newCode, newSpec, newIn, newOut);
        } else {
            applyTotal(sys, newName, newCode, newSpec, newIn.subtract(oldIn), newOut.subtract(oldOut));
        }

        // 桌面镜像：删旧拆行 → 按新数据重新同步（对齐旧 PUT）
        mobileStockMapper.deleteDesktopByRef(editTable(sys), id, sys);
        syncToDesktop(sys, newName, newCode, newSpec, newType, newIn, newOut, req.price(), date, time, id);
        return record(sys, id);
    }

    // ---------- 删除（对齐 handleDelete：mobile 硬删 + total 反冲 + mobile_ref_id 级联删桌面行） ----------

    @Transactional
    public void delete(Integer id, String system) {
        String sys = sys(system);
        Map<String, Object> old = mobileStockMapper.getRecord(mobileTable(sys), id);
        if (old == null) throw new BusinessException("记录不存在");
        mobileStockMapper.deleteRecord(mobileTable(sys), id);
        applyTotal(sys, str(old.get("product_name")), str(old.get("code_number")), str(old.get("specification")),
                bd(old.get("in_quantity")).negate(), bd(old.get("out_quantity")).negate());
        mobileStockMapper.deleteDesktopByRef(editTable(sys), id, sys);
    }

    // ---------- 桌面镜像同步（对齐 syncToJ1StockEditData 'insert'） ----------

    private void syncToDesktop(String sys, String productName, String codeNumber, String specification, String type,
                               BigDecimal in, BigDecimal out, BigDecimal priceIn, LocalDate date, LocalTime time, Integer refId) {
        String table = editTable(sys);

        // 智能匹配信息：最近一条非 Mobile 来源记录 → 台账主数据兜底
        Map<String, Object> match = mobileStockMapper.latestMatchInfo(table, productName);
        if (match == null) match = mobileStockMapper.masterInfo(productName);
        String type2 = (type != null && !type.isBlank()) ? type
                : (match != null && match.get("type") != null ? str(match.get("type")) : null);
        if ((type2 == null || type2.isBlank())) type2 = mobileStockMapper.masterCategory(productName);
        BigDecimal price2 = priceIn != null ? priceIn
                : (match != null && match.get("price") != null ? bd(match.get("price")) : BigDecimal.ZERO);

        // 入库（或无出货）：单行插入（spec 口径：matchInfo 优先，对齐旧版）
        if (out.signum() <= 0) {
            String spec2 = (match != null && match.get("specification") != null)
                    ? str(match.get("specification")) : specification;
            insertDesktopRow(table, date, time, codeNumber, productName, in, BigDecimal.ZERO, spec2, price2, type2, sys, refId);
            return;
        }

        // 出库且已指定价格层（前端选层）：单行直写该层，spec 取该层在库批次规格（对齐 direct 分支）
        if (priceIn != null) {
            String directSpec = mobileStockMapper.resolveInboundSpecForPrice(table, productName, codeNumber, priceIn);
            if (directSpec == null) {
                directSpec = (specification != null && !specification.isBlank()) ? specification
                        : (match != null && match.get("specification") != null ? str(match.get("specification")) : null);
            }
            insertDesktopRow(table, date, time, codeNumber, productName, BigDecimal.ZERO, out, directSpec, priceIn, type2, sys, refId);
            return;
        }

        // 出库未指定价格：HIFO 高价先扣、跨价格组拆行（SELECT … FOR UPDATE）
        List<Map<String, Object>> tiers = mobileStockMapper.hifoTiers(table, productName, codeNumber, specification);
        BigDecimal remaining = out;
        Map<String, Object> lastTier = null;
        for (Map<String, Object> tier : tiers) {
            if (remaining.signum() <= 0) break;
            BigDecimal available = bd(tier.get("available"));
            BigDecimal deduct = available.min(remaining);
            if (deduct.signum() <= 0) continue;
            String tierSpec = str(tier.get("specification"));
            insertDesktopRow(table, date, time, codeNumber, productName, BigDecimal.ZERO, deduct,
                    tierSpec, bd(tier.get("price")),
                    tier.get("type") != null ? str(tier.get("type")) : type2, sys, refId);
            remaining = remaining.subtract(deduct);
            lastTier = tier;
        }
        // 层扣完仍有剩 → 按最低价层兜底插一行（允许负库存，与旧版一致）
        if (remaining.compareTo(EPS) > 0) {
            String fbSpec = lastTier != null && lastTier.get("specification") != null ? str(lastTier.get("specification")) : specification;
            BigDecimal fbPrice = lastTier != null && lastTier.get("price") != null ? bd(lastTier.get("price"))
                    : (match != null && match.get("price") != null ? bd(match.get("price")) : BigDecimal.ZERO);
            insertDesktopRow(table, date, time, codeNumber, productName, BigDecimal.ZERO, remaining, fbSpec, fbPrice, type2, sys, refId);
        }
    }

    private void insertDesktopRow(String table, LocalDate date, LocalTime time, String codeNumber, String productName,
                                  BigDecimal in, BigDecimal out, String spec, BigDecimal price, String type, String sys, Integer refId) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("date", date.toString());
        r.put("time", time.toString());
        r.put("codeNumber", codeNumber);
        r.put("productName", productName);
        r.put("inQuantity", in);
        r.put("outQuantity", out);
        r.put("specification", spec);
        r.put("price", price);
        r.put("targetSystem", sys);
        r.put("type", type);
        r.put("mobileRefId", refId);
        mobileStockMapper.insertDesktopRow(table, r);
    }

    // ---------- 库存总数缓存 ----------

    /** 库存总数缓存：total_qty += inDelta − outDelta */
    private void applyTotal(String sys, String productName, String codeNumber, String specification,
                            BigDecimal inDelta, BigDecimal outDelta) {
        if (productName == null || productName.isBlank()) return;
        String table = totalTable(sys);
        int n = mobileStockMapper.adjustTotal(table, productName, codeNumber, blankToNull(specification), inDelta, outDelta);
        if (n == 0) {
            mobileStockMapper.insertTotal(table, productName, codeNumber, blankToNull(specification),
                    nz(inDelta).subtract(nz(outDelta)));
        }
    }

    private void checkTierStock(String sys, String productName, String codeNumber, BigDecimal price, BigDecimal outQty) {
        BigDecimal avail = mobileStockMapper.availableAtPrice(editTable(sys), productName, codeNumber, price);
        BigDecimal a = avail == null ? BigDecimal.ZERO : avail;
        if (outQty.compareTo(a) > 0) {
            throw new BusinessException("产品 [" + productName + "] (价格 RM" + price.stripTrailingZeros().toPlainString()
                    + ") 库存不足！可用库存: " + a.stripTrailingZeros().toPlainString()
                    + "，请求出库: " + outQty.stripTrailingZeros().toPlainString());
        }
    }

    // ---------- 工具 ----------

    private String sys(String system) {
        String s = system == null ? "" : system.trim().toLowerCase();
        if (!List.of("j1", "j2", "j3").contains(s)) throw new BusinessException("无效的系统参数: " + system);
        return s;
    }

    private String mobileTable(String sys) { return sys + "stockeditmobile_data"; }
    private String editTable(String sys) { return sys + "stockedit_data"; }
    private String totalTable(String sys) { return sys + "stocklist_total"; }

    /** 产品名统一：HTML 实体解码 + 去首尾空格（对齐旧 API Normalize &amp; to &amp;） */
    private String normalizeName(String name) {
        if (name == null) return null;
        String s = name.replace("&amp;", "&").trim();
        return s.isBlank() ? null : s;
    }

    private String blankToNull(String s) { return (s == null || s.isBlank()) ? null : s.trim(); }

    private BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }

    private BigDecimal bd(Object v) {
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal b) return b;
        return new BigDecimal(String.valueOf(v));
    }

    private String str(Object v) { return v == null ? null : String.valueOf(v); }

    private Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        return Integer.parseInt(String.valueOf(v));
    }

    private boolean eq(String a, String b) {
        String x = a == null ? null : a.trim();
        String y = b == null ? null : b.trim();
        return x == null ? y == null : x.equals(y);
    }

    private LocalDate toLocalDate(Object v) {
        if (v == null) return LocalDate.now();
        String s = String.valueOf(v);
        return LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s);
    }

    private LocalTime toLocalTime(Object v) {
        if (v == null) return LocalTime.now();
        String s = String.valueOf(v);
        return LocalTime.parse(s.length() > 8 ? s.substring(0, 8) : s);
    }
}

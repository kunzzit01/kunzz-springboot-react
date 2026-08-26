package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.*;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.mapper.StockInoutMapper;
import com.kunzz.inventory.mapper.StockMinimumMapper;
import com.kunzz.inventory.repository.*;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 库存核心业务：台账 / 出入库 / 最低库存 / 异常扣除 / 分类
 */
@Service
@RequiredArgsConstructor
public class StockService {

    private final StockDataRepository stockDataRepository;
    private final StockInoutRepository stockInoutRepository;
    private final StockMinimumSettingRepository minimumRepository;
    private final StockSotRepository sotRepository;
    private final CompanyCategoryRepository categoryRepository;
    private final StockInoutMapper stockInoutMapper;
    private final StockMinimumMapper stockMinimumMapper;

    // ---------- 库存台账 ----------

    @Transactional(readOnly = true)
    public PageResult<StockData> listRecords(String keyword, String category, String supplier,
                                             LocalDate startDate, LocalDate endDate, int page, int size) {
        Specification<StockData> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (keyword != null && !keyword.isBlank()) {
                String k = "%" + keyword.trim().toLowerCase() + "%";
                ps.add(cb.or(
                        cb.like(cb.lower(root.get("productName")), k),
                        cb.like(cb.lower(root.get("productCode")), k),
                        cb.like(cb.lower(root.get("supplier")), k)
                ));
            }
            if (category != null && !category.isBlank()) ps.add(cb.equal(root.get("category"), category));
            if (supplier != null && !supplier.isBlank()) ps.add(cb.equal(root.get("supplier"), supplier));
            if (startDate != null) ps.add(cb.greaterThanOrEqualTo(root.get("date"), startDate));
            if (endDate != null) ps.add(cb.lessThanOrEqualTo(root.get("date"), endDate));
            return cb.and(ps.toArray(new Predicate[0]));
        };
        Page<StockData> p = stockDataRepository.findAll(spec,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "date", "id")));
        return new PageResult<>(p.getTotalElements(), p.getContent());
    }

    @Transactional
    public StockData createRecord(StockDataRequest req) {
        StockData d = new StockData();
        apply(d, req);
        return stockDataRepository.save(d);
    }

    @Transactional
    public StockData updateRecord(Integer id, StockDataRequest req) {
        StockData d = stockDataRepository.findById(id)
                .orElseThrow(() -> new BusinessException(404, "记录不存在"));
        apply(d, req);
        return stockDataRepository.save(d);
    }

    @Transactional
    public void deleteRecord(Integer id) {
        if (!stockDataRepository.existsById(id)) {
            throw new BusinessException(404, "记录不存在");
        }
        stockDataRepository.deleteById(id);
    }

    private void apply(StockData d, StockDataRequest req) {
        d.setDate(req.date());
        d.setTime(req.time());
        d.setProductCode(req.productCode());
        d.setProductName(req.productName());
        d.setSpecification(req.specification());
        d.setCategory(req.category());
        d.setSupplier(req.supplier());
        d.setApplicant(req.applicant());
        d.setApprover(req.approver());
        d.setSystemAssign(req.systemAssign());
        d.setFreezerCategory(req.freezerCategory());
    }

    // ---------- 出入库流水 ----------

    @Transactional(readOnly = true)
    public PageResult<StockInout> listInout(String keyword, String targetSystem, String type,
                                            LocalDate startDate, LocalDate endDate, int page, int size,
                                            boolean exactMatch) {
        // 分店（j1/j2/j3）进出货来自各自 stockedit 表（对齐 stockeditall?system=jX）
        if (targetSystem != null && List.of("j1", "j2", "j3").contains(targetSystem)) {
            String table = targetSystem + "stockedit_data";
            String k = (keyword == null || keyword.isBlank()) ? null : keyword.trim();
            String sd = startDate == null ? null : startDate.toString();
            String ed = endDate == null ? null : endDate.toString();
            long total = stockInoutMapper.countBranch(table, k, sd, ed, exactMatch);
            List<Map<String, Object>> rows = stockInoutMapper.listBranch(table, k, sd, ed, page * size, size, exactMatch);
            List<StockInout> items = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                StockInout s = new StockInout();
                s.setId(toInt(r.get("id")));
                s.setDate(r.get("date") == null ? null : java.time.LocalDate.parse(String.valueOf(r.get("date"))));
                s.setTime(r.get("time") == null ? null : java.time.LocalTime.parse(String.valueOf(r.get("time"))));
                s.setProductName(str(r.get("product_name")));
                s.setCodeNumber(str(r.get("code_number")));
                s.setInQuantity(toDec(r.get("in_quantity")));
                s.setOutQuantity(toDec(r.get("out_quantity")));
                s.setSpecification(str(r.get("specification")));
                s.setPrice(toDec(r.get("price")));
                s.setReceiver(str(r.get("receiver")));
                s.setRemark(str(r.get("remark")));
                s.setRemarkNumber(str(r.get("remark_number")));
                s.setProductRemarkChecked(toBool(r.get("product_remark_checked")));
                s.setType(str(r.get("type")));
                s.setCreatedBy(str(r.get("created_by")));
                if (r.get("created_at") != null) {
                    try { s.setCreatedAt(java.time.LocalDateTime.parse(String.valueOf(r.get("created_at")).replace(' ', 'T'))); } catch (Exception ignored) {}
                }
                s.setTargetSystem(str(r.get("target_system")));
                items.add(s);
            }
            return new PageResult<>(total, items);
        }

        Specification<StockInout> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.isNull(root.get("deletedAt"))); // 排除软删除
            if (keyword != null && !keyword.isBlank()) {
                String k = keyword.trim().toLowerCase();
                if (exactMatch) {
                    // 精确匹配：产品名 = 关键字（不区分大小写）
                    ps.add(cb.equal(cb.lower(root.get("productName")), k));
                } else {
                    String like = "%" + k + "%";
                    ps.add(cb.or(
                            cb.like(cb.lower(root.get("productName")), like),
                            cb.like(cb.lower(root.get("codeNumber")), like),
                            cb.like(cb.lower(root.get("remark")), like)
                    ));
                }
            }
            if (targetSystem != null && !targetSystem.isBlank()) ps.add(cb.equal(root.get("targetSystem"), targetSystem));
            if (type != null && !type.isBlank()) ps.add(cb.equal(root.get("type"), type));
            if (startDate != null) ps.add(cb.greaterThanOrEqualTo(root.get("date"), startDate));
            if (endDate != null) ps.add(cb.lessThanOrEqualTo(root.get("date"), endDate));
            return cb.and(ps.toArray(new Predicate[0]));
        };
        // 对齐旧系统 stockeditall：ORDER BY date ASC, id ASC（旧在上、新在底）
        Page<StockInout> p = stockInoutRepository.findAll(spec,
                PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "date", "time", "id")));
        // 8/24：中央记录 type 从台账 category 补全（stockinout_data.type 为空；对齐分店显示）
        if (targetSystem == null || targetSystem.isBlank() || !List.of("j1", "j2", "j3").contains(targetSystem)) {
            Map<String, String> catMap = new java.util.HashMap<>();
            for (Object[] row : stockDataRepository.productCategories()) {
                if (row[0] != null && row[1] != null) catMap.put(String.valueOf(row[0]), String.valueOf(row[1]));
            }
            for (StockInout s : p.getContent()) {
                String cat = catMap.get(s.getProductName());
                if (cat != null && !cat.isBlank()) {
                    s.setType("Drinks".equalsIgnoreCase(cat) ? "Service Line" : cat);
                }
            }
        }
        return new PageResult<>(p.getTotalElements(), p.getContent());
    }

    @Transactional
    public StockInout createInout(StockInoutRequest req, String system) {
        boolean isIncoming = req.inQuantity() != null && req.inQuantity().signum() > 0;
        boolean isOutgoing = req.outQuantity() != null && req.outQuantity().signum() > 0;

        // ====== 单价校验（对齐旧系统 saveNewRowRecord：不能为空且不能小于 0；0 合法，RM0 需记录） ======
        if (req.price() == null || req.price().signum() < 0) {
            throw new BusinessException("单价不能为空且不能小于0");
        }

        // ====== 备注编号处理（对齐旧系统 stockeditapi.php） ======
        String remarkNumber = req.remarkNumber();
        if (remarkNumber != null) remarkNumber = remarkNumber.trim().toUpperCase();
        boolean checked = Boolean.TRUE.equals(req.productRemarkChecked());

        // 进货自动生码：needGenerateCode=true 时由后端生成（前缀 + 下一个可用编号，避让在库）
        if (isIncoming && Boolean.TRUE.equals(req.needGenerateCode())) {
            String prefix = (req.prefix() == null || req.prefix().isBlank())
                    ? computePrefix(req.productName()) : req.prefix().trim().toUpperCase();
            if (prefix.isBlank()) throw new BusinessException("无法计算前缀，请确认货品名称不为空");
            remarkNumber = generateRemarkCode(prefix);
            checked = true;
        }

        // 出货备注校验：产品有在库备注编号时，必须填编号且编号必须在库
        if (isOutgoing && stockInoutMapper.countInStockRemarkNumber(req.productName()) > 0) {
            if (remarkNumber == null || remarkNumber.isBlank()) {
                throw new BusinessException("货品 [" + req.productName() + "] 有备注编码在库，出货时必须填写备注编号");
            }
            if (stockInoutMapper.countRemarkNumberInStock(req.productName(), remarkNumber) == 0) {
                throw new BusinessException("备注编号 [" + remarkNumber + "] 不在库中");
            }
        }
        // ====== 备注编号处理结束 ======

        // ====== 出库库存校验（事务内，对齐旧系统 handlePost/handleBatchSave：8/23 修复后前端不再预检查，由后端统一校验） ======
        // RM0 单价出货（用户手动输入 0）跳过库存校验：赠品/损耗类特殊出库，按 0 价匹配不到批次会误报，直接放行
        if (isOutgoing && req.productName() != null && !req.productName().isBlank()
                && req.price() != null && req.price().signum() > 0) {
            java.math.BigDecimal checkPrice = req.price();
            java.math.BigDecimal available;
            String sys2 = normalizeSystem(system);
            if (sys2 != null && List.of("j1", "j2", "j3").contains(sys2)) {
                // 分店本店操作 → 查分店表
                available = stockInoutMapper.availableStockBranch(sys2 + "stockedit_data", req.productName(), checkPrice);
            } else {
                // 中央（本店或出货到分店）→ 查中央表
                available = stockInoutMapper.availableStockCentral(req.productName(), checkPrice);
            }
            java.math.BigDecimal avail = available == null ? java.math.BigDecimal.ZERO : available;
            if (req.outQuantity().compareTo(avail) > 0) {
                throw new BusinessException("产品 [" + req.productName() + "] (价格 RM" + checkPrice.stripTrailingZeros().toPlainString()
                        + ") 库存不足！可用库存: " + avail.stripTrailingZeros().toPlainString()
                        + "，请求出库: " + req.outQuantity().stripTrailingZeros().toPlainString());
            }
        }
        // ====== 出库库存校验结束 ======

        String sys = normalizeSystem(system);
        String target = req.targetSystem() == null ? "central" : req.targetSystem().trim().toLowerCase();
        boolean isBranch = List.of("j1", "j2", "j3").contains(target);

        // 场景 A：中央出货到分店（来源 central + 目标分店 + 出库）→ 三重保存（对齐旧系统 saveToJ1/J2/J3Table）
        boolean centralToBranch = isOutgoing && (sys == null || "central".equals(sys)) && isBranch;
        if (centralToBranch) {
            // A1. 中央表：出库记录
            StockInout s = new StockInout();
            applyInout(s, req);
            s.setTargetSystem(target);
            s.setRemarkNumber(remarkNumber);
            s.setProductRemarkChecked(checked);
            s = stockInoutRepository.save(s);
            // A2. 分店 jXstockinout_data：入库记录（target_system='from_main'，main_record_id 关联）
            insertBranchInout(target, req, s.getId());
            // A3. 分店 jXstockedit_data：入库记录（target_system=jX，type 用台账 category）
            insertBranchEdit(target, req, s.getId());
            return s;
        }

        // 场景 B：分店本店操作（来源 j1/j2/j3）→ 只写 jXstockedit_data（对齐 stockeditall?system=jX）
        if (sys != null && List.of("j1", "j2", "j3").contains(sys)) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("date", req.date());
            r.put("time", req.time());
            r.put("productName", req.productName());
            r.put("codeNumber", req.codeNumber());
            r.put("inQuantity", req.inQuantity());
            r.put("outQuantity", req.outQuantity());
            r.put("specification", req.specification());
            r.put("price", req.price());
            r.put("receiver", req.receiver());
            r.put("remark", req.remark());
            r.put("type", req.type());
            r.put("createdBy", req.createdBy());
            r.put("targetSystem", sys);
            stockInoutMapper.insertBranch(sys + "stockedit_data", r);
            StockInout s = new StockInout();
            s.setId(toInt(r.get("id")));
            return s;
        }

        // 场景 C：中央本店进出货 → 只写中央表
        StockInout s = new StockInout();
        applyInout(s, req);
        s.setTargetSystem(isBranch ? target : ("central".equals(target) ? "central" : null));
        s.setRemarkNumber(remarkNumber);
        s.setProductRemarkChecked(checked);
        return stockInoutRepository.save(s);
    }

    /** 中央出库 → 分店 jXstockinout_data 入库记录（对齐 saveToJ1Table：out_quantity 作为 in_quantity） */
    private void insertBranchInout(String branch, StockInoutRequest req, Integer mainId) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("date", req.date());
        r.put("time", req.time());
        r.put("codeNumber", req.codeNumber());
        r.put("productName", req.productName());
        r.put("inQuantity", req.outQuantity());
        r.put("specification", req.specification());
        r.put("price", req.price());
        r.put("type", categoryOf(req.productName(), req.codeNumber()));
        r.put("receiver", req.receiver());
        r.put("remark", req.remark());
        r.put("mainRecordId", mainId);
        r.put("createdBy", req.createdBy());
        stockInoutMapper.insertBranchInout(branch + "stockinout_data", r);
    }

    /** 中央出库 → 分店 jXstockedit_data 入库记录（对齐 saveToJ1EditTable） */
    private void insertBranchEdit(String branch, StockInoutRequest req, Integer mainId) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("date", req.date());
        r.put("time", req.time());
        r.put("productName", req.productName());
        r.put("codeNumber", req.codeNumber());
        r.put("inQuantity", req.outQuantity());
        r.put("outQuantity", java.math.BigDecimal.ZERO);
        r.put("specification", req.specification());
        r.put("price", req.price());
        r.put("receiver", req.receiver());
        r.put("remark", req.remark());
        r.put("mainRecordId", mainId);
        r.put("type", categoryOf(req.productName(), req.codeNumber()));
        r.put("createdBy", req.createdBy());
        r.put("targetSystem", branch);
        stockInoutMapper.insertBranch(branch + "stockedit_data", r);
    }

    /** 从台账取 type/category（对齐旧系统 saveToJ1Table 的 category 查询） */
    private String categoryOf(String productName, String codeNumber) {
        if (productName != null && !productName.isBlank()) {
            StockData d = stockDataRepository.findFirstByProductName(productName);
            if (d != null && d.getCategory() != null && !d.getCategory().isBlank()) return d.getCategory();
        }
        if (codeNumber != null && !codeNumber.isBlank()) {
            StockData d = stockDataRepository.findFirstByProductCode(codeNumber);
            if (d != null && d.getCategory() != null && !d.getCategory().isBlank()) return d.getCategory();
        }
        return null;
    }

    /** 备注编号自动生成（对齐旧系统 generateRemarkCode：MAX+1 循环递增 1-999，避让在库编号） */
    private String generateRemarkCode(String prefix) {
        List<Map<String, Object>> rows = stockInoutMapper.remarkCodePool(prefix);
        int lastVal = 0;
        java.util.Set<Integer> inStockSet = new java.util.HashSet<>();
        for (Map<String, Object> h : rows) {
            String rn = String.valueOf(h.get("remark_number"));
            java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("^" + java.util.regex.Pattern.quote(prefix) + "-(\\d{1,3})$")
                    .matcher(rn == null ? "" : rn);
            if (m.matches()) {
                int num = Integer.parseInt(m.group(1));
                lastVal = Math.max(lastVal, num);
                java.math.BigDecimal net = dec2(h.get("total_in")).subtract(dec2(h.get("total_out")));
                if (net.signum() > 0) inStockSet.add(num);
            }
        }
        int current = lastVal;
        for (int tries = 0; tries < 999; tries++) {
            current = (current % 999) + 1;
            if (!inStockSet.contains(current)) {
                return prefix + "-" + String.format("%03d", current);
            }
        }
        throw new BusinessException("前缀[" + prefix + "]无可用编号（所有999个编号均在库中）");
    }

    /** 货品名称前缀（对齐旧系统 computePrefix：单词取前两个字母数字，多词取各首字母） */
    private String computePrefix(String productName) {
        if (productName == null) return "";
        String clean = productName.trim().toUpperCase();
        String[] words = clean.split("\\s+");
        java.util.function.Function<String, String> alnum = s -> s == null ? "" : s.replaceAll("[^\\p{L}\\p{N}]", "");
        if (words.length <= 1) {
            String letters = alnum.apply(words.length == 1 ? words[0] : clean);
            return letters.substring(0, Math.min(2, letters.length()));
        }
        String first = alnum.apply(words[0]);
        String second = alnum.apply(words[1]);
        return (first.isEmpty() ? "" : first.substring(0, 1)) + (second.isEmpty() ? "" : second.substring(0, 1));
    }

    private java.math.BigDecimal dec2(Object o) {
        if (o == null) return java.math.BigDecimal.ZERO;
        if (o instanceof Number n) return java.math.BigDecimal.valueOf(n.doubleValue());
        try { return new java.math.BigDecimal(String.valueOf(o).trim()); } catch (Exception e) { return java.math.BigDecimal.ZERO; }
    }

    /** 归一化来源系统：null/空串/central → central */
    private String normalizeSystem(String system) {
        if (system == null) return null;
        String s = system.trim().toLowerCase();
        if (s.isEmpty()) return null;
        if ("central".equals(s)) return "central";
        if (List.of("j1", "j2", "j3").contains(s)) return s;
        return null;
    }

    /** 最低库存货品表名（白名单，防 SQL 注入；对齐线上 stockminimumapi.php 的 tableMap） */
    private String minimumTable(String system) {
        String s = system == null ? "central" : system.trim().toLowerCase();
        if ("central".equals(s)) return "stockinout_data";
        if (List.of("j1", "j2", "j3").contains(s)) return s + "stockedit_data";
        throw new BusinessException("无效的系统：" + system);
    }

    @Transactional
    public StockInout updateInout(Integer id, StockInoutRequest req, String system) {
        // ====== 单价校验（对齐旧系统：不能为空且不能小于 0；0 合法） ======
        if (req.price() == null || req.price().signum() < 0) {
            throw new BusinessException("单价不能为空且不能小于0");
        }
        if (system != null && List.of("j1", "j2", "j3").contains(system)) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("date", req.date());
            r.put("time", req.time());
            r.put("productName", req.productName());
            r.put("codeNumber", req.codeNumber());
            r.put("inQuantity", req.inQuantity());
            r.put("outQuantity", req.outQuantity());
            r.put("specification", req.specification());
            r.put("price", req.price());
            r.put("receiver", req.receiver());
            r.put("remark", req.remark());
            r.put("type", req.type());
            int n = stockInoutMapper.updateBranch(system + "stockedit_data", id, r);
            if (n == 0) throw new BusinessException(404, "记录不存在");
            return new StockInout();
        }

        StockInout s = stockInoutRepository.findById(id)
                .orElseThrow(() -> new BusinessException(404, "记录不存在"));

        // ====== 出货备注校验（对齐 createInout：有在库备注编号时必须填且必须在库） ======
        // 编辑时：保持原备注编号则跳过「在库」校验——该编号可能已被本记录自身消耗（净库存 ≤ 0），
        // 重新校验必然失败导致无法保存编辑（对齐旧系统 PATCH 编辑不做校验）；仅当改动编号时才要求新编号在库。
        boolean isOutgoing = req.outQuantity() != null && req.outQuantity().signum() > 0;
        String remarkNumber = req.remarkNumber() == null ? null : req.remarkNumber().trim().toUpperCase();
        String oldRemark = s.getRemarkNumber() == null ? null : s.getRemarkNumber().trim().toUpperCase();
        if (isOutgoing && stockInoutMapper.countInStockRemarkNumber(req.productName()) > 0) {
            if (remarkNumber == null || remarkNumber.isBlank()) {
                if (oldRemark == null || oldRemark.isBlank()) {
                    throw new BusinessException("货品 [" + req.productName() + "] 有备注编码在库，出货时必须填写备注编号");
                }
                // 原记录已有备注编号但本次提交为空 → 保留原编号（避免编辑误清）
                remarkNumber = oldRemark;
            } else if (!remarkNumber.equals(oldRemark)
                    && stockInoutMapper.countRemarkNumberInStock(req.productName(), remarkNumber) == 0) {
                throw new BusinessException("备注编号 [" + remarkNumber + "] 不在库中");
            }
        }

        // 记录原值，用于判断是否需同步分店表（对齐旧系统 handlePut）
        String oldTarget = s.getTargetSystem();
        String oldProduct = s.getProductName();
        boolean oldOutgoing = s.getOutQuantity() != null && s.getOutQuantity().signum() > 0;

        applyInout(s, req);
        s.setRemarkNumber(remarkNumber);
        s.setProductRemarkChecked(req.productRemarkChecked());
        s = stockInoutRepository.save(s);

        // ====== 分店同步：编辑时目标单位/货品/数量变化 → 中央 ↔ 分店保持一致 ======
        // 修复：原目标为 NULL/central 改成出货到分店时，也必须写入分店记录（旧逻辑要求原记录已是分店出货才同步）
        String newTarget = req.targetSystem() == null ? null : req.targetSystem().trim().toLowerCase();
        boolean nowOutgoing = req.outQuantity() != null && req.outQuantity().signum() > 0;
        boolean newIsBranch = newTarget != null && List.of("j1", "j2", "j3").contains(newTarget);
        String oldBranch = (oldOutgoing && oldTarget != null && List.of("j1", "j2", "j3").contains(oldTarget.toLowerCase()))
                ? oldTarget.toLowerCase() : null;
        boolean productChanged = oldProduct != null && !oldProduct.equals(req.productName());

        // 1) 旧分店清理：不再出货 / 目标改了 / 货品改了 → 删除旧分店记录（避免残留）
        if (oldBranch != null && (!nowOutgoing || !newIsBranch || !oldBranch.equals(newTarget) || productChanged)) {
            stockInoutMapper.softDeleteBranchInoutByMainId(oldBranch + "stockinout_data", id, "System");
            stockInoutMapper.softDeleteBranchEditByMainId(oldBranch + "stockedit_data", id, oldBranch, "System");
        }

        // 2) 新分店写入：出货到分店 → 软删该分店旧记录后重建（保证数量/价格/目标一致）
        if (nowOutgoing && newIsBranch) {
            stockInoutMapper.softDeleteBranchInoutByMainId(newTarget + "stockinout_data", id, "System");
            stockInoutMapper.softDeleteBranchEditByMainId(newTarget + "stockedit_data", id, newTarget, "System");
            insertBranchInout(newTarget, req, id);
            insertBranchEdit(newTarget, req, id);
        }
        return s;
    }

    /** 软删除 */
    @Transactional
    public void deleteInout(Integer id, String deletedBy, String system) {
        if (system != null && List.of("j1", "j2", "j3").contains(system)) {
            // 分店删除：若有中央关联（中央出货生成）→ 联动软删除中央记录（对齐旧系统双向删除）
            Integer mainId = stockInoutMapper.findBranchMainId(system + "stockedit_data", id);
            stockInoutMapper.softDeleteBranch(system + "stockedit_data", id, deletedBy);
            if (mainId != null) {
                StockInout main = stockInoutRepository.findById(mainId).orElse(null);
                if (main != null && main.getDeletedAt() == null) {
                    main.setDeletedAt(LocalDateTime.now());
                    main.setDeletedBy(deletedBy);
                    stockInoutRepository.save(main);
                }
            }
            return;
        }
        StockInout s = stockInoutRepository.findById(id)
                .orElseThrow(() -> new BusinessException(404, "记录不存在"));
        // 原记录为中央出库到分店 → 同步软删除分店入库记录（对齐旧系统 recycle 双向恢复）
        if (s.getOutQuantity() != null && s.getOutQuantity().signum() > 0
                && s.getTargetSystem() != null && List.of("j1", "j2", "j3").contains(s.getTargetSystem().toLowerCase())) {
            String branch = s.getTargetSystem().toLowerCase();
            stockInoutMapper.softDeleteBranchInoutByMainId(branch + "stockinout_data", id, deletedBy);
            // 8/23 修复：按 main_record_id 精确删除分店 edit 记录，避免误删同品名历史记录
            stockInoutMapper.softDeleteBranchEditByMainId(branch + "stockedit_data", id, branch, deletedBy);
        }
        s.setDeletedAt(LocalDateTime.now());
        s.setDeletedBy(deletedBy);
        stockInoutRepository.save(s);
    }

    /** 批量恢复软删除记录（撤销删除，与 deleteInout 双向联动镜像） */
    @Transactional
    public void restoreInout(List<Integer> ids, String system) {
        if (ids == null || ids.isEmpty()) return;
        boolean branch = system != null && List.of("j1", "j2", "j3").contains(system);
        for (Integer id : ids) {
            if (branch) {
                // 分店恢复：先恢复本行，若有中央关联（中央出货生成）→ 同步恢复中央记录（对齐旧系统 restore 双向恢复）
                Integer mainId = stockInoutMapper.findBranchMainId(system + "stockedit_data", id);
                stockInoutMapper.restoreBranch(system + "stockedit_data", id);
                if (mainId != null) {
                    StockInout main = stockInoutRepository.findById(mainId).orElse(null);
                    if (main != null && main.getDeletedAt() != null) {
                        main.setDeletedAt(null);
                        main.setDeletedBy(null);
                        stockInoutRepository.save(main);
                    }
                }
                continue;
            }
            StockInout s = stockInoutRepository.findById(id).orElse(null);
            if (s == null) continue;
            // 中央记录为出库到分店 → 同步恢复分店入库 + 分店 edit 记录（对齐旧系统 restore 双向恢复）
            if (s.getOutQuantity() != null && s.getOutQuantity().signum() > 0
                    && s.getTargetSystem() != null && List.of("j1", "j2", "j3").contains(s.getTargetSystem().toLowerCase())) {
                String b = s.getTargetSystem().toLowerCase();
                stockInoutMapper.restoreBranchInoutByMainId(b + "stockinout_data", id);
                stockInoutMapper.restoreBranchEditByMainId(b + "stockedit_data", id, b);
            }
            s.setDeletedAt(null);
            s.setDeletedBy(null);
            stockInoutRepository.save(s);
        }
    }

    private void applyInout(StockInout s, StockInoutRequest req) {
        s.setDate(req.date());
        s.setTime(req.time());
        s.setProductName(req.productName());
        s.setReceiver(req.receiver());
        s.setInQuantity(req.inQuantity());
        s.setOutQuantity(req.outQuantity());
        s.setSpecification(req.specification());
        s.setPrice(req.price());
        s.setCodeNumber(req.codeNumber());
        s.setRemark(req.remark());
        s.setTargetSystem(req.targetSystem());
        s.setType(req.type());
        s.setCreatedBy(req.createdBy());
    }

    // ---------- 最低库存 ----------

    /** 进出货检查（进出货页面弹窗）：货品名 100% 精确匹配，返回 IN/OUT 数量与金额汇总 + 明细 */
    @Transactional(readOnly = true)
    public Map<String, Object> checkInout(String system, String productName, LocalDate startDate, LocalDate endDate) {
        String name = productName == null ? "" : productName.trim();
        if (name.isEmpty()) throw new BusinessException("请输入货品名称");
        String table = minimumTable(system); // stockinout_data / jXstockedit_data
        List<Map<String, Object>> rows = stockInoutMapper.checkInout(table, name,
                startDate == null ? null : startDate.toString(),
                endDate == null ? null : endDate.toString());

        java.math.BigDecimal inTotal = java.math.BigDecimal.ZERO;
        java.math.BigDecimal outTotal = java.math.BigDecimal.ZERO;
        java.math.BigDecimal inValue = java.math.BigDecimal.ZERO;
        java.math.BigDecimal outValue = java.math.BigDecimal.ZERO;
        java.util.List<Map<String, Object>> records = new java.util.ArrayList<>();
        for (Map<String, Object> r : rows) {
            java.math.BigDecimal in = dec2(r.get("in_quantity"));
            java.math.BigDecimal out = dec2(r.get("out_quantity"));
            java.math.BigDecimal price = dec2(r.get("price"));
            inTotal = inTotal.add(in);
            outTotal = outTotal.add(out);
            inValue = inValue.add(in.multiply(price));
            outValue = outValue.add(out.multiply(price));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", r.get("date"));
            item.put("time", r.get("time"));
            item.put("type", r.get("type") == null ? "" : String.valueOf(r.get("type")));
            item.put("in_quantity", in);
            item.put("out_quantity", out);
            item.put("price", price);
            item.put("receiver", r.get("receiver") == null ? "" : String.valueOf(r.get("receiver")));
            item.put("remark", r.get("remark") == null ? "" : String.valueOf(r.get("remark")));
            item.put("target_system", r.get("target_system") == null ? "" : String.valueOf(r.get("target_system")));
            records.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("product_name", name);
        out.put("in_total", inTotal);
        out.put("out_total", outTotal);
        out.put("in_value", inValue);
        out.put("out_value", outValue);
        out.put("record_count", records.size());
        out.put("records", records);
        return out;
    }

    /** 某系统全部在库货品 + 最低库存设置（对齐线上 stockminimumapi.php?action=list）
     *  current_stock 按产品名汇总（名字不管价格；检测口径与低库存通知一致）
     *  最低库存设置全局（对齐线上：product_name 唯一，不按系统独立） */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listMinimumProducts(String system) {
        String sys = normalizeSystem(system);
        String table = minimumTable(sys);
        boolean central = "central".equals(table);
        List<Map<String, Object>> rows = stockMinimumMapper.productsWithMinimum(table);
        // 产品名汇总库存（覆盖价格行库存，检测按名字统一数量）
        Map<String, java.math.BigDecimal> totals = new java.util.HashMap<>();
        for (Map<String, Object> r : stockMinimumMapper.totalStockByName(table, central)) {
            totals.put(String.valueOf(r.get("product_name")), dec2(r.get("total_stock")));
        }
        for (Map<String, Object> r : rows) {
            String name = String.valueOf(r.get("product_name"));
            r.put("current_stock", totals.getOrDefault(name, java.math.BigDecimal.ZERO));
        }
        return rows;
    }

    /** 按产品名 UPSERT 单条最低库存（对齐线上 saveSingleSetting；全局唯一） */
    @Transactional
    public void saveMinimum(String system, String productName, java.math.BigDecimal quantity) {
        String name = productName == null ? "" : productName.trim();
        if (name.isEmpty()) throw new BusinessException("产品名称不能为空");
        stockMinimumMapper.upsert(name, quantity == null ? java.math.BigDecimal.ZERO : quantity);
    }

    /** 批量 UPSERT 最低库存（事务内，对齐线上 saveBatchSettings；全局唯一） */
    @Transactional
    public void saveMinimumBatch(String system, List<Map<String, Object>> products) {
        if (products == null || products.isEmpty()) throw new BusinessException("没有要保存的数据");
        for (Map<String, Object> p : products) {
            String name = p.get("product_name") == null ? "" : String.valueOf(p.get("product_name")).trim();
            if (name.isEmpty()) throw new BusinessException("货品名称不能为空");
            stockMinimumMapper.upsert(name, dec2(p.get("minimum_quantity")));
        }
    }

    @Transactional(readOnly = true)
    public List<StockMinimumSetting> listMinimum(String system) {
        // 最低库存全局（对齐线上：不按系统分）
        return minimumRepository.findAllByOrderByProductNameAsc();
    }

    @Transactional
    public StockMinimumSetting createMinimum(StockMinimumRequest req) {
        StockMinimumSetting m = new StockMinimumSetting();
        m.setProductName(req.productName());
        m.setMinimumQuantity(req.minimumQuantity());
        return minimumRepository.save(m);
    }

    @Transactional
    public StockMinimumSetting updateMinimum(Integer id, StockMinimumRequest req) {
        StockMinimumSetting m = minimumRepository.findById(id)
                .orElseThrow(() -> new BusinessException(404, "设置不存在"));
        m.setProductName(req.productName());
        m.setMinimumQuantity(req.minimumQuantity());
        return minimumRepository.save(m);
    }

    @Transactional
    public void deleteMinimum(Integer id) {
        if (!minimumRepository.existsById(id)) {
            throw new BusinessException(404, "设置不存在");
        }
        minimumRepository.deleteById(id);
    }

    // ---------- 异常扣除 ----------

    @Transactional(readOnly = true)
    public List<StockSot> listSot() {
        return sotRepository.findAllByOrderByDateDescIdDesc();
    }

    @Transactional
    public StockSot createSot(StockSotRequest req) {
        StockSot s = new StockSot();
        applySot(s, req);
        return sotRepository.save(s);
    }

    @Transactional
    public StockSot updateSot(Integer id, StockSotRequest req) {
        StockSot s = sotRepository.findById(id)
                .orElseThrow(() -> new BusinessException(404, "记录不存在"));
        applySot(s, req);
        return sotRepository.save(s);
    }

    @Transactional
    public void deleteSot(Integer id) {
        if (!sotRepository.existsById(id)) {
            throw new BusinessException(404, "记录不存在");
        }
        sotRepository.deleteById(id);
    }

    private void applySot(StockSot s, StockSotRequest req) {
        s.setDate(req.date());
        s.setProductCode(req.productCode());
        s.setProductName(req.productName());
        s.setQuantity(req.quantity());
        s.setSpecification(req.specification());
        s.setPrice(req.price());
        s.setTotalPrice(req.totalPrice());
        s.setCategory(req.category());
    }

    // ---------- 分类 ----------

    @Transactional(readOnly = true)
    public List<CompanyCategory> listCategories() {
        return categoryRepository.findAllByOrderByIdAsc();
    }

    @Transactional
    public CompanyCategory createCategory(CategoryRequest req) {
        CompanyCategory c = new CompanyCategory();
        c.setCategoryName(req.categoryName());
        return categoryRepository.save(c);
    }

    @Transactional
    public CompanyCategory updateCategory(Integer id, CategoryRequest req) {
        CompanyCategory c = categoryRepository.findById(id)
                .orElseThrow(() -> new BusinessException(404, "分类不存在"));
        c.setCategoryName(req.categoryName());
        return categoryRepository.save(c);
    }

    @Transactional
    public void deleteCategory(Integer id) {
        if (!categoryRepository.existsById(id)) {
            throw new BusinessException(404, "分类不存在");
        }
        categoryRepository.deleteById(id);
    }

    // ---------- 分店表映射辅助 ----------

    private Integer toInt(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(o).trim()); } catch (Exception e) { return null; }
    }

    private java.math.BigDecimal toDec(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return java.math.BigDecimal.valueOf(n.doubleValue());
        try { return new java.math.BigDecimal(String.valueOf(o).trim()); } catch (Exception e) { return null; }
    }

    private Boolean toBool(Object o) {
        if (o == null) return null;
        if (o instanceof Boolean b) return b;
        try { return Integer.parseInt(String.valueOf(o).trim()) != 0; } catch (Exception e) { return null; }
    }

    private String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}

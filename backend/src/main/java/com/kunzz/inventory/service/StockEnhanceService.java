package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.common.ProductName;
import com.kunzz.inventory.entity.StockInout;
import com.kunzz.inventory.mapper.StockInoutMapper;
import com.kunzz.inventory.mapper.StockProductMapper;
import com.kunzz.inventory.repository.StockInoutRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 库存增强：回收站（恢复软删除）/ 产品名称与备注维护
 */
@Service
@RequiredArgsConstructor
public class StockEnhanceService {

    private final StockInoutRepository stockInoutRepository;
    private final StockInoutMapper stockInoutMapper;
    private final StockProductMapper stockProductMapper;
    private final ProductRenameService productRenameService;

    // ---------- 回收站 ----------

    @Transactional(readOnly = true)
    public Page<StockInout> recycleBin(int page, int size) {
        // 软删除记录 = deleted_at 不为空
        return stockInoutRepository.findAll(
                (root, q, cb) -> cb.isNotNull(root.get("deletedAt")),
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "deletedAt")));
    }

    @Transactional
    public void restore(Integer id) {
        StockInout s = stockInoutRepository.findById(id)
                .orElseThrow(() -> new BusinessException(404, "记录不存在"));
        // 中央出库到分店 → 同步恢复分店入库 + 分店 edit 记录（对齐旧系统 restore 双向恢复）
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

    // ---------- 产品名称维护（从流水提取唯一值） ----------

    @Transactional(readOnly = true)
    public List<String> productNames(String keyword) {
        Set<String> names = new LinkedHashSet<>();
        stockInoutRepository.findAll().stream()
                .filter(s -> s.getDeletedAt() == null && s.getProductName() != null)
                .map(StockInout::getProductName)
                .filter(n -> keyword == null || keyword.isBlank() || n.toLowerCase().contains(keyword.toLowerCase()))
                .forEach(names::add);
        return names.stream().sorted().toList();
    }

    /** 重命名产品（更新流水与台账中的名称）
     *  2026-09-24 改造：原来只改中央流水（JPA findAll 全表扫描逐行 save），
     *  分店流水/分店台账/手机台账/最低库存/改价日志全都没跟上 —— 改完名字反而多裂出几份库存。
     *  现在统一走 ProductRenameService 的级联，并且台账也要跟着改（否则下次进货从下拉带出的还是旧名）。 */
    @Transactional
    public void renameProduct(String oldName, String newName) {
        String target = ProductName.normalize(newName);
        if (oldName == null || oldName.isBlank() || target == null || target.isBlank()) {
            throw new BusinessException("名称不能为空");
        }
        String source = oldName.trim();
        if (source.equals(target)) return;
        productRenameService.cascade(source, target);
        stockProductMapper.renameProductName(source, target);
    }

    // ---------- 备注维护（从流水提取唯一值） ----------

    @Transactional(readOnly = true)
    public List<String> remarks(String keyword) {
        Set<String> remarks = new LinkedHashSet<>();
        stockInoutRepository.findAll().stream()
                .filter(s -> s.getDeletedAt() == null && s.getRemark() != null && !s.getRemark().isBlank())
                .map(StockInout::getRemark)
                .filter(n -> keyword == null || keyword.isBlank() || n.toLowerCase().contains(keyword.toLowerCase()))
                .forEach(remarks::add);
        return remarks.stream().sorted().toList();
    }
}

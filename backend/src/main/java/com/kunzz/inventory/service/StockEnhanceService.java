package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.StockInout;
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

    /** 重命名产品（更新流水与台账中的名称） */
    @Transactional
    public void renameProduct(String oldName, String newName) {
        if (oldName == null || newName == null || oldName.isBlank() || newName.isBlank()) {
            throw new BusinessException("名称不能为空");
        }
        stockInoutRepository.findAll().stream()
                .filter(s -> s.getDeletedAt() == null && oldName.equals(s.getProductName()))
                .forEach(s -> {
                    s.setProductName(newName);
                    stockInoutRepository.save(s);
                });
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

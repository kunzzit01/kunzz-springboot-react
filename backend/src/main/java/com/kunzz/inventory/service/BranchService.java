package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 三店（J1/J2/J3）库存汇总、日报、成本
 */
@Service
@RequiredArgsConstructor
public class BranchService {

    private final J1StockTotalRepository j1Repo;
    private final J2StockTotalRepository j2Repo;
    private final J3StockTotalRepository j3Repo;
    private final J1DailyRepository j1DailyRepo;
    private final J2DailyRepository j2DailyRepo;
    private final J3DailyRepository j3DailyRepo;
    private final J1CostRepository j1CostRepo;
    private final J2CostRepository j2CostRepo;
    private final J3CostRepository j3CostRepo;

    /** 合并三店汇总为一张表（按产品名对齐） */
    @Transactional(readOnly = true)
    public List<BranchRow> mergedStock() {
        Map<String, BaseBranchStockTotal> j1 = mapByName(j1Repo.findAllByOrderByProductNameAsc());
        Map<String, BaseBranchStockTotal> j2 = mapByName(j2Repo.findAllByOrderByProductNameAsc());
        Map<String, BaseBranchStockTotal> j3 = mapByName(j3Repo.findAllByOrderByProductNameAsc());
        return j1Repo.findAllByOrderByProductNameAsc().stream()
                .map(r -> new BranchRow(
                        r.getProductName(), r.getCodeNumber(), r.getSpecification(),
                        r.getTotalQty(),
                        j2.getOrDefault(r.getProductName(), r).getTotalQty(),
                        j3.getOrDefault(r.getProductName(), r).getTotalQty(),
                        sum(r.getTotalQty(),
                            j2.getOrDefault(r.getProductName(), r).getTotalQty(),
                            j3.getOrDefault(r.getProductName(), r).getTotalQty())))
                .toList();
    }

    private Map<String, BaseBranchStockTotal> mapByName(List<? extends BaseBranchStockTotal> list) {
        return list.stream().collect(java.util.stream.Collectors.toMap(
                BaseBranchStockTotal::getProductName, Function.identity(), (a, b) -> a));
    }

    private BigDecimal sum(BigDecimal... vs) {
        BigDecimal t = BigDecimal.ZERO;
        for (BigDecimal v : vs) {
            if (v != null) t = t.add(v);
        }
        return t;
    }

    public record BranchRow(String productName, String codeNumber, String specification,
                            BigDecimal j1Qty, BigDecimal j2Qty, BigDecimal j3Qty, BigDecimal totalQty) {
    }

    /** 按店查询汇总 */
    @Transactional(readOnly = true)
    public List<? extends BaseBranchStockTotal> stock(String branch) {
        return switch (branch.toLowerCase()) {
            case "j1" -> j1Repo.findAllByOrderByProductNameAsc();
            case "j2" -> j2Repo.findAllByOrderByProductNameAsc();
            case "j3" -> j3Repo.findAllByOrderByProductNameAsc();
            default -> throw new BusinessException("未知分店: " + branch);
        };
    }

    /** 编辑某店某产品库存 */
    @Transactional
    public BaseBranchStockTotal updateStock(String branch, Integer id, BigDecimal totalQty) {
        BaseBranchStockTotal t = switch (branch.toLowerCase()) {
            case "j1" -> j1Repo.findById(id).orElseThrow(() -> new BusinessException(404, "记录不存在"));
            case "j2" -> j2Repo.findById(id).orElseThrow(() -> new BusinessException(404, "记录不存在"));
            case "j3" -> j3Repo.findById(id).orElseThrow(() -> new BusinessException(404, "记录不存在"));
            default -> throw new BusinessException("未知分店: " + branch);
        };
        t.setTotalQty(totalQty);
        return switch (branch.toLowerCase()) {
            case "j1" -> j1Repo.save((J1StockTotal) t);
            case "j2" -> j2Repo.save((J2StockTotal) t);
            default -> j3Repo.save((J3StockTotal) t);
        };
    }

    @Transactional(readOnly = true)
    public List<?> daily(String branch) {
        return switch (branch.toLowerCase()) {
            case "j1" -> j1DailyRepo.findAllByOrderByDateDesc();
            case "j2" -> j2DailyRepo.findAllByOrderByDateDesc();
            default -> j3DailyRepo.findAllByOrderByDateDesc();
        };
    }

    @Transactional(readOnly = true)
    public List<?> cost(String branch) {
        return switch (branch.toLowerCase()) {
            case "j1" -> j1CostRepo.findAllByOrderByDateDesc();
            case "j2" -> j2CostRepo.findAllByOrderByDateDesc();
            default -> j3CostRepo.findAllByOrderByDateDesc();
        };
    }
}

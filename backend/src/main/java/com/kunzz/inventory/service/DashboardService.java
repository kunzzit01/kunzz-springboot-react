package com.kunzz.inventory.service;

import com.kunzz.inventory.dto.DashboardSummaryVO;
import com.kunzz.inventory.dto.LowStockVO;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.mapper.StockMinimumMapper;
import com.kunzz.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 仪表盘统计
 */
@Service
@RequiredArgsConstructor
public class DashboardService {

    private final StockDataRepository stockDataRepository;
    private final StockInoutRepository stockInoutRepository;
    private final StockMinimumSettingRepository minimumRepository;
    private final DishwareInfoRepository dishwareInfoRepository;
    private final J1StockTotalRepository j1Repo;
    private final J2StockTotalRepository j2Repo;
    private final J3StockTotalRepository j3Repo;
    private final StockMinimumMapper stockMinimumMapper;

    @Transactional(readOnly = true)
    public DashboardSummaryVO summary() {
        LocalDate today = LocalDate.now();

        long totalStockRecords = stockDataRepository.count();
        long todayIn = stockInoutRepository.findAll().stream()
                .filter(s -> s.getDeletedAt() == null && today.equals(s.getDate())
                        && s.getInQuantity() != null && s.getInQuantity().compareTo(BigDecimal.ZERO) > 0)
                .count();
        long todayOut = stockInoutRepository.findAll().stream()
                .filter(s -> s.getDeletedAt() == null && today.equals(s.getDate())
                        && s.getOutQuantity() != null && s.getOutQuantity().compareTo(BigDecimal.ZERO) > 0)
                .count();
        long dishwareCount = dishwareInfoRepository.count();

        Map<String, BaseBranchStockTotal> j1 = mapByName(j1Repo.findAllByOrderByProductNameAsc());
        Map<String, BaseBranchStockTotal> j2 = mapByName(j2Repo.findAllByOrderByProductNameAsc());
        Map<String, BaseBranchStockTotal> j3 = mapByName(j3Repo.findAllByOrderByProductNameAsc());

        // 低库存预警：最低库存设置分系统独立（stock_system 列）
        //  - 按产品名汇总库存（名字不管价格，同一产品所有价格行的库存相加）
        //  - 中央只算中央库存（stockinout_data，排除 SOT）；分店只算各自 stockedit_data，不跨系统加总
        //  - 某系统总库存 < 该系统自己设置的最低库存(>0) 才进入预警；中央设置不影响分店
        List<LowStockVO> lowStockList = new java.util.ArrayList<>();
        Map<String, java.math.BigDecimal> centralQty = nameTotal(stockMinimumMapper.totalStockByName("stockinout_data", true));
        Map<String, java.math.BigDecimal> j1Qty = nameTotal(stockMinimumMapper.totalStockByName("j1stockedit_data", false));
        Map<String, java.math.BigDecimal> j2Qty = nameTotal(stockMinimumMapper.totalStockByName("j2stockedit_data", false));
        Map<String, java.math.BigDecimal> j3Qty = nameTotal(stockMinimumMapper.totalStockByName("j3stockedit_data", false));
        Map<String, Map<String, java.math.BigDecimal>> qtyBySys = Map.of(
                "central", centralQty, "j1", j1Qty, "j2", j2Qty, "j3", j3Qty);
        for (String sys : List.of("central", "j1", "j2", "j3")) {
            // 每个系统只读取自己的最低库存设置（分店独立，互不影响）
            for (StockMinimumSetting m : minimumRepository.findByStockSystemOrderByProductNameAsc(sys)) {
                if (m.getMinimumQuantity() == null
                        || m.getMinimumQuantity().compareTo(BigDecimal.ZERO) <= 0) continue;
                checkLowStock(lowStockList, sys, m.getProductName(), m.getMinimumQuantity(),
                        qtyBySys.get(sys).get(m.getProductName()));
            }
        }

        return new DashboardSummaryVO(
                totalStockRecords, todayIn, todayOut, lowStockList.size(), dishwareCount,
                j1Repo.count(), j2Repo.count(), j3Repo.count(), lowStockList);
    }

    private Map<String, BaseBranchStockTotal> mapByName(List<? extends BaseBranchStockTotal> list) {
        return list.stream().collect(Collectors.toMap(
                BaseBranchStockTotal::getProductName, Function.identity(), (a, b) -> a));
    }

    /** 按产品名汇总净库存（totalStockByName 行 → Map） */
    private Map<String, BigDecimal> nameTotal(List<Map<String, Object>> rows) {
        Map<String, BigDecimal> m = new java.util.HashMap<>();
        for (Map<String, Object> r : rows) {
            String name = r.get("product_name") == null ? "" : String.valueOf(r.get("product_name"));
            Object v = r.get("total_stock");
            BigDecimal q = BigDecimal.ZERO;
            if (v instanceof Number n) q = BigDecimal.valueOf(n.doubleValue());
            else if (v != null) { try { q = new BigDecimal(String.valueOf(v).trim()); } catch (Exception ignored) {} }
            m.put(name, q);
        }
        return m;
    }

    /** 某系统某产品：总库存 < 最低库存(>0) 时加入预警（各系统独立判断） */
    private void checkLowStock(List<LowStockVO> list, String system, String name, BigDecimal min, BigDecimal qty) {
        BigDecimal current = qty == null ? BigDecimal.ZERO : qty;
        if (current.compareTo(min) < 0) {
            list.add(new LowStockVO(system, name, min, current));
        }
    }
}

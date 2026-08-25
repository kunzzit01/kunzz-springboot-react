package com.kunzz.inventory.dto;

import java.util.List;

/**
 * 仪表盘汇总
 */
public record DashboardSummaryVO(
        long totalStockRecords,
        long todayInCount,
        long todayOutCount,
        long lowStockCount,
        long dishwareCount,
        long j1ProductCount,
        long j2ProductCount,
        long j3ProductCount,
        List<LowStockVO> lowStockList
) {
}

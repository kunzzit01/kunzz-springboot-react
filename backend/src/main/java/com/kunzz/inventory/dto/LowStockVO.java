package com.kunzz.inventory.dto;

import java.math.BigDecimal;

/**
 * 低库存预警（按系统独立检测：各系统库存按产品名汇总，不与其它系统加总）
 */
public record LowStockVO(
        String system,
        String productName,
        BigDecimal minimumQuantity,
        BigDecimal currentQty
) {
}

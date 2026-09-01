package com.kunzz.inventory.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * 手机版进出货请求（对齐旧系统 jXstockeditmobile_api.php）
 */
public record MobileStockRequest(
        String system,
        LocalDate date,
        LocalTime time,
        String productName,
        String codeNumber,
        String specification,
        String type,
        BigDecimal inQuantity,
        BigDecimal outQuantity,
        String receiver,
        /** 出货指定价格层（前端选层后传入 → 单行直写该层，后端校验该层可用量）；进货可不传由后端匹配 */
        BigDecimal price
) {
}

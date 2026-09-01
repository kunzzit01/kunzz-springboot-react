package com.kunzz.inventory.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 电话版批量出货（对齐旧系统 batch_save：总库存页改「剩余量」→ 差值 = 出货量 → HIFO 前端拆行）
 */
public record MobileBatchSaveRequest(
        String system,
        /** 工作日期（出货记到哪一天，默认今天） */
        LocalDate documentDate,
        List<Row> rows
) {
    public record Row(
            String time,
            String productName,
            String codeNumber,
            String specification,
            String type,
            BigDecimal outQuantity,
            /** 价格层（前端按 HIFO 拆好层，每层一行） */
            BigDecimal price,
            String receiver
    ) {
    }
}

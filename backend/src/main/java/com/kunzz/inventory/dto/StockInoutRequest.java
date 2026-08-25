package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

public record StockInoutRequest(
        LocalDate date,
        LocalTime time,
        @NotBlank(message = "产品名称不能为空") String productName,
        String receiver,
        BigDecimal inQuantity,
        BigDecimal outQuantity,
        String specification,
        BigDecimal price,
        String codeNumber,
        String remark,
        String targetSystem,
        String type,
        String createdBy,
        String remarkNumber,
        Boolean productRemarkChecked,
        /** 进货时是否由后端自动生成备注编号（对齐旧系统 generateRemarkCode） */
        Boolean needGenerateCode,
        /** 自动生码时使用的备注前缀（如 A5 / H / S），不传则由产品名计算 */
        String prefix
) {
}

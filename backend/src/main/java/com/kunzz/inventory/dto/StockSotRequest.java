package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public record StockSotRequest(
        LocalDate date,
        String productCode,
        @NotBlank(message = "货品名称不能为空") String productName,
        @NotNull BigDecimal quantity,
        String specification,
        BigDecimal price,
        BigDecimal totalPrice,
        String category
) {
}

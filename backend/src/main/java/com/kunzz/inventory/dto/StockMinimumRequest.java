package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record StockMinimumRequest(
        @NotBlank(message = "产品名称不能为空") String productName,
        @NotNull(message = "最低库存不能为空") BigDecimal minimumQuantity
) {
}

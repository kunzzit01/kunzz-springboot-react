package com.kunzz.inventory.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public record DishwareBreakRequest(
        @NotNull(message = "请选择碗碟") Integer dishwareId,
        String shopType,
        @NotNull @Min(1) Integer breakQuantity,
        @Min(0) Integer chargeableQuantity,
        BigDecimal unitPrice,
        BigDecimal totalPrice,
        LocalDate breakDate,
        String recordedBy
) {
}

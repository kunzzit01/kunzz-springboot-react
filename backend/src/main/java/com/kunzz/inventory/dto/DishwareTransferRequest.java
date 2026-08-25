package com.kunzz.inventory.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public record DishwareTransferRequest(
        @NotNull(message = "请选择碗碟") Integer dishwareId,
        Integer fromRestaurantId,
        Integer toRestaurantId,
        String fromShopType,
        String toShopType,
        @NotNull @Min(1) Integer quantity,
        BigDecimal unitPrice,
        BigDecimal totalPrice,
        LocalDate transferDate,
        String recordType,
        String recordedBy
) {
}

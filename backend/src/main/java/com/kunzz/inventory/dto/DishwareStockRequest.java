package com.kunzz.inventory.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record DishwareStockRequest(
        @NotNull @Min(0) Integer wenhuaQuantity,
        @NotNull @Min(0) Integer centralQuantity,
        @NotNull @Min(0) Integer j1Quantity,
        @NotNull @Min(0) Integer j2Quantity,
        @NotNull @Min(0) Integer j3Quantity
) {
}

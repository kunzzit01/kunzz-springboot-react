package com.kunzz.inventory.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record DishwareSetItemRequest(
        @NotNull(message = "请选择碗碟") Integer dishwareId,
        @NotNull @Min(1) Integer quantityInSet
) {
}

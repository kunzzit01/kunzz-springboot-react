package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record DishwareInfoRequest(
        @NotBlank(message = "碗碟名称不能为空") String productName,
        String codeNumber,
        String category,
        String size,
        BigDecimal unitPrice,
        String photoPath
) {
}

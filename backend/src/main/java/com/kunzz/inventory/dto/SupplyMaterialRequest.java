package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record SupplyMaterialRequest(
        @NotBlank(message = "物料名称不能为空") String materialName,
        String materialType,
        BigDecimal price
) {
}

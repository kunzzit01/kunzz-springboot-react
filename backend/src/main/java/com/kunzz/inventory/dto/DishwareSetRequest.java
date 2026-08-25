package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record DishwareSetRequest(
        @NotBlank(message = "套装名称不能为空") String setName,
        @NotBlank(message = "套装编号不能为空") String setCode,
        String setSize,
        BigDecimal setPrice,
        String description,
        Boolean isActive
) {
}

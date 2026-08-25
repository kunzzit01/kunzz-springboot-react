package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;

public record SupplyRequest(
        @NotBlank(message = "供应商名称不能为空") String name
) {
}

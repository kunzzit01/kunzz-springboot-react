package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;

public record CategoryRequest(
        @NotBlank(message = "分类名称不能为空") String categoryName
) {
}

package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "用户名/邮箱不能为空") String username,
        @NotBlank(message = "密码不能为空") String password
) {
}

package com.kunzz.inventory.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 登录请求。
 * remember / deviceName 是 2026-10-28 新增（可为空，老客户端不带也能登录）：
 *   - remember=true → 服务端额外签发「设备令牌」，用于重启后免密码进入
 *   - deviceName    → 客户端自定义设备名（留空由 User-Agent 解析）
 */
public record LoginRequest(
        @NotBlank(message = "用户名/邮箱不能为空") String username,
        @NotBlank(message = "密码不能为空") String password,
        Boolean remember,
        String deviceName,
        /**
         * 这台浏览器上一轮拿到的设备令牌（可为空）。
         * 登录成功后会先把它撤销再发新的 —— 否则每登录一次就多一条设备记录，
         * 「登录设备」页会列出一堆同一台电脑的重复行。
         */
        String previousDeviceToken
) {
    public boolean rememberMe() {
        return Boolean.TRUE.equals(remember);
    }
}

package com.kunzz.inventory.dto;

/** 设备令牌请求体（refresh / logout 用）：把「记住我」签发的设备令牌原样带回来 */
public record DeviceTokenRequest(String deviceToken) {
}

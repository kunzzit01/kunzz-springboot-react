package com.kunzz.inventory.dto;

/**
 * 「登录设备」列表项（/api/auth/devices）
 * 时间为 epoch 毫秒，由前端按本地时区展示（避免服务端/数据库时区差 8 小时）。
 */
public record DeviceVO(
        Integer id,
        String name,
        String ip,
        Long createdAtMs,
        Long lastSeenMs,
        Long expiresAtMs,
        /** 是否当前正在用的这台设备（前端据此显示「当前设备」并禁止误撤销） */
        boolean current
) {
}

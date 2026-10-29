package com.kunzz.inventory.dto;

/**
 * 登录 / 静默续登的返回。
 *
 * deviceToken / deviceId / deviceExpiresAtMs 仅在「勾选了记住我」且签发成功时才有值：
 * 前端把 deviceToken 存 localStorage，JWT 过期后用它静默换新 JWT（用户无感），
 * 并在「登录设备」页用它认出「当前设备」。令牌明文只在这里出现一次，服务端只存 SHA-256。
 */
public record LoginResponse(
        String token,
        UserVO user,
        /** 首次登录（is_first_login=1）→ 前端必须引导重设密码 */
        boolean mustChangePassword,
        String deviceToken,
        Integer deviceId,
        Long deviceExpiresAtMs
) {
    /** 不带设备令牌（未勾选记住我 / 静默续登返回） */
    public static LoginResponse of(String token, UserVO user, boolean mustChangePassword) {
        return new LoginResponse(token, user, mustChangePassword, null, null, null);
    }
}

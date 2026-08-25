package com.kunzz.inventory.dto;

public record LoginResponse(
        String token,
        UserVO user,
        /** 首次登录（is_first_login=1）→ 前端必须引导重设密码 */
        boolean mustChangePassword
) {
}

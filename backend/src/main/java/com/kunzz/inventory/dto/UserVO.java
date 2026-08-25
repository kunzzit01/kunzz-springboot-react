package com.kunzz.inventory.dto;

import com.kunzz.inventory.entity.User;

public record UserVO(
        Integer id,
        String username,
        String displayName,
        String email,
        String accountType,
        String branch,
        String position,
        Boolean isFirstLogin
) {
    public static UserVO from(User u) {
        return new UserVO(u.getId(), u.getUsername(), u.getDisplayName(), u.getEmail(),
                u.getAccountType(), u.getBranch(), u.getPosition(), u.getIsFirstLogin());
    }
}

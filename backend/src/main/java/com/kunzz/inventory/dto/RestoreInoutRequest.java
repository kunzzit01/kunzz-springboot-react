package com.kunzz.inventory.dto;

import java.util.List;

/** 批量恢复（撤销删除）请求：进出货软删除记录 ids + 可选系统（j1/j2/j3） */
public record RestoreInoutRequest(
        List<Integer> ids,
        String system
) {
}

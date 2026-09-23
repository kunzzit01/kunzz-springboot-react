package com.kunzz.inventory.realtime;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 实时更新广播服务：写操作成功后调用 notifyStockChanged(system)
 */
@Service
@RequiredArgsConstructor
public class RealtimeService {

    private final RealtimeWebSocketHandler realtimeWebSocketHandler;

    /** 库存数据变更（central/j1/j2/j3）→ 广播信号，前端自动刷新 */
    public void notifyStockChanged(String system) {
        realtimeWebSocketHandler.broadcastStockChanged(system);
    }

    /** 招聘申请变更（认领 / 转交 / 释放 / 改状态）→ 广播信号，招聘列表自动刷新 */
    public void notifyApplicationChanged() {
        realtimeWebSocketHandler.broadcastApplicationChanged();
    }
}

package com.kunzz.inventory.realtime;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * 全站实时更新：WebSocket 连接管理 + 广播"变更信号"
 * 只广播 { type, system } 信号，前端收到后自行通过已认证 API 拉数据（不传敏感数据）
 */
@Component
public class RealtimeWebSocketHandler extends TextWebSocketHandler {

    private final CopyOnWriteArraySet<WebSocketSession> sessions = new CopyOnWriteArraySet<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
    }

    /** 广播库存变更信号（system: central/j1/j2/j3，null=全部） */
    public void broadcastStockChanged(String system) {
        broadcast("{\"type\":\"stock_changed\",\"system\":\"" + (system == null ? "all" : system) + "\"}");
    }

    /** 广播任意 JSON 消息 */
    public void broadcast(String json) {
        TextMessage msg = new TextMessage(json);
        for (WebSocketSession s : sessions) {
            try {
                if (s.isOpen()) s.sendMessage(msg);
            } catch (IOException ignored) {
                sessions.remove(s);
            }
        }
    }
}

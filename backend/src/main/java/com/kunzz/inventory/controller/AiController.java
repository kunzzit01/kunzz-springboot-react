package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.service.AiService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 本地 AI 助手（Ollama function calling，第一期只读查询）
 * /api/ai/chat 受全局 JWT 保护（/api/** authenticated）
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiService aiService;

    /** 对话：{ message, system } → { reply, toolUsed } */
    @PostMapping("/chat")
    public ApiResponse<Map<String, Object>> chat(@RequestBody Map<String, String> body) {
        String message = body == null ? "" : body.getOrDefault("message", "");
        if (message.isBlank()) return ApiResponse.error("消息不能为空");
        return ApiResponse.ok(aiService.chat(message, body.get("system")));
    }

    /** 订单文本确定性解析（不走模型，毫秒级）：{ text, system } → { draft_count, drafts, unmatched } */
    @PostMapping("/parse-order")
    public ApiResponse<Map<String, Object>> parseOrder(@RequestBody Map<String, String> body) {
        if (body == null || body.getOrDefault("text", "").isBlank()) return ApiResponse.error("订单内容不能为空");
        return ApiResponse.ok(aiService.parseOrderText(body.get("text"), body.get("system")));
    }
}

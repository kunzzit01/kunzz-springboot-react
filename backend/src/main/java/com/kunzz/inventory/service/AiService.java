package com.kunzz.inventory.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kunzz.inventory.entity.StockInout;
import com.kunzz.inventory.mapper.StockSummaryMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 本地 AI 助手（第一期：只读查询问答）
 * 链路：前端聊天球 → /api/ai/chat → 本服务 → Ollama(localhost:11434) /api/chat
 * AI 通过 function calling 决定调用哪些查询工具；工具内部走现有 Service（只读），
 * AI 本身不直接接触数据库。
 */
@Slf4j
@Service
public class AiService {

    private final StockService stockService;
    private final StockSummaryService stockSummaryService;
    private final StockSummaryMapper stockSummaryMapper;
    private static final ObjectMapper JSON = new ObjectMapper();

    @Value("${ollama.base-url:http://localhost:11434}")
    private String ollamaBaseUrl;

    @Value("${ollama.model:kunzz-ai}")
    private String model;

    private RestClient restClient;

    public AiService(StockService stockService, StockSummaryService stockSummaryService, StockSummaryMapper stockSummaryMapper) {
        this.stockService = stockService;
        this.stockSummaryService = stockSummaryService;
        this.stockSummaryMapper = stockSummaryMapper;
    }

    @PostConstruct
    void init() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(5_000);
        f.setReadTimeout(300_000); // 本地 4B 模型首次推理可能数十秒
        this.restClient = RestClient.builder().baseUrl(ollamaBaseUrl).requestFactory(f).build();
    }

    /** 对话入口：自动循环「模型回复 → 执行工具 → 回喂结果」，最多 6 轮 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> chat(String message, String system) {
        String sys = normalize(system, "central");
        List<Map<String, Object>> pendingDrafts = new ArrayList<>();
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt(sys)));
        messages.add(Map.of("role", "user", "content", message == null ? "" : message));

        for (int round = 0; round < 6; round++) {
            Map<String, Object> resp;
            try {
                resp = restClient.post().uri("/api/chat")
                        .body(chatRequest(messages))
                        .retrieve()
                        .body(Map.class);
            } catch (Exception e) {
                log.warn("Ollama 调用失败: {}", e.getMessage());
                return Map.of("reply", "无法连接本地 AI 服务，请确认 Ollama 已启动（runtime/ollama/ollama.exe serve）。");
            }
            if (resp == null || !(resp.get("message") instanceof Map)) break;
            Map<String, Object> assistant = (Map<String, Object>) resp.get("message");
            messages.add(new LinkedHashMap<>(assistant));

            List<Map<String, Object>> toolCalls =
                    assistant.get("tool_calls") instanceof List ? (List<Map<String, Object>>) assistant.get("tool_calls") : null;
            if (toolCalls == null || toolCalls.isEmpty()) {
                String content = str(assistant.get("content"));
                if (content.isBlank()) break;
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("reply", content);
                out.put("toolUsed", round > 0);
                if (!pendingDrafts.isEmpty()) out.put("drafts", pendingDrafts);
                return out;
            }
            for (Map<String, Object> tc : toolCalls) {
                Map<String, Object> fn = tc.get("function") instanceof Map ? (Map<String, Object>) tc.get("function") : Map.of();
                String name = str(fn.get("name"));
                Map<String, Object> args = fn.get("arguments") instanceof Map ? (Map<String, Object>) fn.get("arguments") : Map.of();
                String result;
                try {
                    if ("draft_order_batch".equals(name)) {
                        Map<String, Object> b = draftOrderBatch(args, sys);
                        if (b.get("drafts") instanceof List) {
                            for (Object o : (List<?>) b.get("drafts")) {
                                if (o instanceof Map) pendingDrafts.add((Map<String, Object>) o);
                            }
                        }
                        result = batchSummaryForModel(b); // 摘要回喂（完整草稿直走内存给前端，省一轮 prompt 处理）
                    } else if ("draft_stock_inout".equals(name)) {
                        Map<String, Object> d = draftStockInout(args, sys);
                        if ("draft_ready".equals(d.get("status"))) pendingDrafts.add(d);
                        result = draftSummaryForModel(d);
                    } else {
                        result = executeTool(name, args, sys);
                    }
                } catch (Exception e) {
                    log.warn("AI 工具 {} 执行失败: {}", name, e.getMessage());
                    result = "工具执行失败: " + e.getMessage();
                }
                Map<String, Object> toolMsg = new LinkedHashMap<>();
                toolMsg.put("role", "tool");
                toolMsg.put("content", result);
                messages.add(toolMsg);
            }
        }
        return Map.of("reply", "抱歉，这次没能完成回答，请换个问法或重试。");
    }

    // ---------- Ollama 请求 ----------

    private Map<String, Object> chatRequest(List<Map<String, Object>> messages) {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("model", model);
        req.put("messages", messages);
        req.put("stream", false);
        req.put("think", false); // Qwen3：关闭思考模式，保证工具调用与直接回答
        req.put("tools", toolDefs());
        return req;
    }

    private String systemPrompt(String sys) {
        String sysName = switch (sys) {
            case "j1" -> "J1 分店";
            case "j2" -> "J2 分店";
            case "j3" -> "J3 分店";
            default -> "中央仓";
        };
        return """
                你是 Kunzz 管理系统的库存 AI 助手。当前用户正在查看：%s。
                规则：
                1. 所有库存数据必须通过调用工具获取，禁止编造数字；没有调用工具就无法知道真实库存。
                2. 回答使用与用户提问相同的语言（默认简体中文），简洁、直接给出数字和结论。
                3. 库存数量保留合理小数位；金额用千分位。
                4. 你可以协助用户生成进货/出货草稿（draft_stock_inout，不会直接写入），生成后提醒用户核对卡片信息并点击「确认执行」。
                5. 用户问"库存/还剩多少"通常用 search_products；问"总价值/汇总"用 get_stock_summary；问"进出货记录/流水"用 get_stock_records；问"低于最低库存/预警"用 get_minimum_alerts；要求进货/出货用 draft_stock_inout。
                6. 生成草稿前必须知道货品名和数量，缺少时先用文字追问，不要瞎猜；货品名尽量用 search_products 先确认准确名称。
                7. 用户可能直接粘贴多行订单/点单（编号列表或 "货品-数量" 格式，如 "udon-2"）：必须用 draft_order_batch 一次性解析全部行（items 数组，每项 {name, quantity}），禁止逐行调用 draft_stock_inout。deliver_to=订单所属分店（j1/j2/j3），标题提到分店名时必填。最后汇总：共几条、哪些没匹配上。
                """.formatted(sysName);
    }

    private List<Map<String, Object>> toolDefs() {
        Map<String, Object> sysProp = Map.of(
                "type", "string",
                "description", "要查询的系统，不传则默认当前系统",
                "enum", List.of("central", "j1", "j2", "j3"));
        return List.of(
                fn("search_products", "按货品名或编号关键词模糊搜索某系统的当前库存，返回库存量、单价、类型",
                        Map.of(
                                "type", "object",
                                "properties", Map.of(
                                        "keyword", Map.of("type", "string", "description", "货品名或编号关键词，如 apple sauce"),
                                        "system", sysProp),
                                "required", List.of("keyword"))),
                fn("get_stock_summary", "查询某系统库存总览：总价值、货品总数、分类统计、价值最高的货品",
                        Map.of(
                                "type", "object",
                                "properties", Map.of("system", sysProp),
                                "required", List.of())),
                fn("get_stock_records", "查询某系统的进出货流水记录（可按关键词和日期范围过滤）",
                        Map.of(
                                "type", "object",
                                "properties", Map.of(
                                        "keyword", Map.of("type", "string", "description", "货品名关键词，可选"),
                                        "start_date", Map.of("type", "string", "description", "开始日期 yyyy-MM-dd，可选"),
                                        "end_date", Map.of("type", "string", "description", "结束日期 yyyy-MM-dd，可选"),
                                        "system", sysProp),
                                "required", List.of())),
                fn("get_minimum_alerts", "查询某系统库存量低于最低库存设置(预警线)的货品列表",
                        Map.of(
                                "type", "object",
                                "properties", Map.of("system", sysProp),
                                "required", List.of())),
                fn("draft_stock_inout", "为进货/出货生成操作草稿（不实际写入数据库，用户确认后由页面执行）。货品名和数量至少要有一个",
                        Map.of(
                                "type", "object",
                                "properties", Map.of(
                                        "product_name", Map.of("type", "string", "description", "货品名称（完整或部分）"),
                                        "in_quantity", Map.of("type", "number", "description", "进货数量（出货则不传）"),
                                        "out_quantity", Map.of("type", "number", "description", "出货数量（进货则不传）"),
                                        "price", Map.of("type", "number", "description", "单价，不传则自动使用该货品现有单价"),
                                        "type", Map.of("type", "string", "description", "部门/类型（Kitchen / Sushi Bar / Service Line / Sake），不传则用货品档案类型"),
                                        "deliver_to", Map.of("type", "string", "description", "出货送达的分店（j1/j2/j3），订单出货时传；中央内部出货不传"),
                                        "receiver", Map.of("type", "string", "description", "经手人/收货人，可选"),
                                        "remark", Map.of("type", "string", "description", "备注，可选"),
                                        "system", sysProp),
                                "required", List.of("product_name"))),
                fn("draft_order_batch", "批量订单解析：用户粘贴多行订单/点单时，必须用本工具一次性生成全部出货草稿（禁止逐行调用 draft_stock_inout）",
                        Map.of(
                                "type", "object",
                                "properties", Map.of(
                                        "deliver_to", Map.of("type", "string", "description", "订单送达分店 j1/j2/j3；订单标题提到分店名时必填"),
                                        "items", Map.of("type", "array", "description", "订单条目数组，按原文顺序", "items", Map.of(
                                                "type", "object",
                                                "properties", Map.of(
                                                        "name", Map.of("type", "string", "description", "货品名（原文）"),
                                                        "quantity", Map.of("type", "number", "description", "出货数量（数字）"),
                                                        "price", Map.of("type", "number", "description", "单价，仅订单写明价格时传")))),
                                        "system", sysProp),
                                "required", List.of("items"))));
    }

    private Map<String, Object> fn(String name, String desc, Map<String, Object> parameters) {
        return Map.of("type", "function",
                "function", Map.of("name", name, "description", desc, "parameters", parameters));
    }

    // ---------- 工具实现（全部只读） ----------

    private String executeTool(String name, Map<String, Object> args, String currentSystem) {
        String sys = normalize(str(args.get("system")), currentSystem);
        return switch (name) {
            case "search_products" -> searchProducts(str(args.get("keyword")), sys);
            case "get_stock_summary" -> stockSummary(sys);
            case "get_stock_records" -> stockRecords(args, sys);
            case "get_minimum_alerts" -> minimumAlerts(sys);
            default -> "未知工具: " + name;
        };
    }

    @SuppressWarnings("unchecked")
    private String searchProducts(String keyword, String sys) {
        if (keyword == null || keyword.isBlank()) return "缺少关键词";
        String k = keyword.trim().toLowerCase();
        Map<String, Object> s = stockSummaryService.summary(sys);
        List<Map<String, Object>> items = s.get("summary") instanceof List
                ? (List<Map<String, Object>>) s.get("summary") : List.of();
        List<Map<String, Object>> hits = new ArrayList<>();
        for (Map<String, Object> it : items) {
            String name = str(it.get("product_name")).toLowerCase();
            String code = str(it.get("code_number")).toLowerCase();
            if (name.contains(k) || code.contains(k)) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("product_name", it.get("product_name"));
                row.put("code_number", it.get("code_number"));
                row.put("specification", it.get("specification"));
                row.put("total_stock", it.get("total_stock"));
                row.put("price", it.get("price"));
                row.put("type", it.get("type"));
                hits.add(row);
                if (hits.size() >= 20) break;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("system", sys);
        out.put("matched_count", hits.size());
        out.put("products", hits);
        return toJson(out);
    }

    @SuppressWarnings("unchecked")
    private String stockSummary(String sys) {
        Map<String, Object> s = stockSummaryService.summary(sys);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("system", sys);
        out.put("total_value", s.get("total_value"));
        out.put("formatted_total_value", s.get("formatted_total_value"));
        out.put("total_products", s.get("total_products"));
        out.put("type_stats", s.get("type_stats"));
        // 只回喂价值最高的前 15 个货品，避免撑爆上下文
        List<Map<String, Object>> items = s.get("summary") instanceof List
                ? new ArrayList<>((List<Map<String, Object>>) s.get("summary")) : new ArrayList<>();
        items.sort((a, b) -> Double.compare(toD(b.get("total_price")), toD(a.get("total_price"))));
        List<Map<String, Object>> top = new ArrayList<>();
        for (Map<String, Object> it : items) {
            if (top.size() >= 15) break;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("product_name", it.get("product_name"));
            row.put("total_stock", it.get("total_stock"));
            row.put("total_price", it.get("total_price"));
            row.put("type", it.get("type"));
            top.add(row);
        }
        out.put("top_products_by_value", top);
        return toJson(out);
    }

    private String stockRecords(Map<String, Object> args, String sys) {
        String keyword = blankToNull(str(args.get("keyword")));
        LocalDate start = parseDate(str(args.get("start_date")));
        LocalDate end = parseDate(str(args.get("end_date")));
        var page = stockService.listInout(keyword, sys, null, start, end, 0, 50, false);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object o : page.items()) {
            if (o instanceof StockInout rec) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("date", String.valueOf(rec.getDate()));
                r.put("product_name", rec.getProductName());
                r.put("code_number", rec.getCodeNumber());
                r.put("in_quantity", rec.getInQuantity());
                r.put("out_quantity", rec.getOutQuantity());
                r.put("price", rec.getPrice());
                r.put("receiver", rec.getReceiver());
                r.put("remark", rec.getRemark());
                rows.add(r);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("system", sys);
        out.put("total_matched", page.total());
        out.put("returned", rows.size());
        out.put("records", rows);
        return toJson(out);
    }

    private String minimumAlerts(String sys) {
        List<Map<String, Object>> rows = stockService.listMinimumProducts(sys);
        List<Map<String, Object>> alerts = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            double current = toD(r.get("current_stock"));
            double min = toD(firstNonNull(r, "minimum_quantity", "minimum", "quantity"));
            if (min <= 0) continue;
            if (current <= min) {
                Map<String, Object> a = new LinkedHashMap<>();
                a.put("product_name", r.get("product_name"));
                a.put("current_stock", current);
                a.put("minimum_quantity", min);
                a.put("shortage", round2(min - current));
                alerts.add(a);
            }
            if (alerts.size() >= 30) break;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("system", sys);
        out.put("alert_count", alerts.size());
        out.put("alerts", alerts);
        return toJson(out);
    }

    /** 生成进货/出货草稿（单条）：解析参数后交给 enrichDraft */
    private Map<String, Object> draftStockInout(Map<String, Object> args, String sys) {
        String typeArg = firstNonBlank(args, "type", "department");
        String deliverTo = firstNonBlank(args, "deliver_to", "deliverTo", "branch");
        return enrichDraft(str(args.get("product_name")).trim(),
                toDbl(args.get("in_quantity")), toDbl(args.get("out_quantity")),
                toDbl(args.get("price")),
                typeArg == null ? "" : typeArg.trim(),
                deliverTo == null ? "" : deliverTo.trim(),
                sys, str(args.get("receiver")).trim(), str(args.get("remark")).trim());
    }

    /** 批量订单解析：一次生成全部出货草稿（多行订单性能关键——只耗 1 轮模型推理） */
    private Map<String, Object> draftOrderBatch(Map<String, Object> args, String sys) {
        String deliverTo = firstNonBlank(args, "deliver_to", "deliverTo", "branch");
        deliverTo = (deliverTo == null ? "" : deliverTo.trim().toLowerCase());
        if (!List.of("j1", "j2", "j3").contains(deliverTo)) deliverTo = "";
        if (!(args.get("items") instanceof List)) return batchError("items 不能为空");
        List<Map<String, Object>> drafts = new ArrayList<>();
        List<String> unmatched = new ArrayList<>();
        for (Object o : (List<?>) args.get("items")) {
            if (!(o instanceof Map)) continue;
            @SuppressWarnings("unchecked")
            Map<String, Object> it = (Map<String, Object>) o;
            String name = firstNonBlank(it, "name", "product_name", "product");
            Double qty = toDbl(firstNonNull(it, "quantity", "qty", "out_quantity"));
            if (name != null && qty == null) {
                // 防御：小模型可能把 "udon-2" 整串当名字传 → 自动拆出尾随数量
                java.util.regex.Matcher tm = TRAILING_QTY.matcher(name.trim());
                if (tm.matches() && !tm.group(1).isBlank()) {
                    name = tm.group(1).trim();
                    qty = toDbl(tm.group(2));
                }
            }
            if (name == null || name.isBlank() || qty == null || qty <= 0) {
                unmatched.add(str(name) + "（缺货品名或数量）");
                continue;
            }
            Map<String, Object> d = enrichDraft(name.trim(), null, qty, toDbl(it.get("price")),
                    "", deliverTo, sys, null, null);
            if ("draft_ready".equals(d.get("status"))) drafts.add(d);
            else unmatched.add(name.trim() + "（" + d.get("error") + "）");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("is_batch", true);
        out.put("status", "batch_ready");
        out.put("draft_count", drafts.size());
        out.put("drafts", drafts);
        out.put("unmatched", unmatched);
        return out;
    }

    private Map<String, Object> batchError(String msg) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("is_batch", true);
        m.put("status", "error");
        m.put("error", msg);
        return m;
    }

    private static final java.util.regex.Pattern TRAILING_QTY = java.util.regex.Pattern.compile(
            "^(.*?)[\\s\\-*xX\u00d7]+(\\d+(?:\\.\\d+)?)\\s*(?:kg|kilo|pcs|pieces|units|pkt|btl)?\\s*$");
    private static final java.util.regex.Pattern LEADING_QTY_UNIT = java.util.regex.Pattern.compile(
            "^(\\d+(?:\\.\\d+)?)\\s*(?:kg|kilo|pcs|pieces|units|pkt|btl)\\s+(.+)$");
    private static final java.util.regex.Pattern DATE_P = java.util.regex.Pattern.compile(
            "(\\d{1,2})/(\\d{1,2})/(\\d{2,4})");
    /** 整段分段匹配："udon-2 nama panko -2 ..."（单行多货品，分隔符必须含 -/*xX×，纯空格不算以免误伤普通句子） */
    private static final java.util.regex.Pattern SEGMENT_P = java.util.regex.Pattern.compile(
            "([A-Za-z0-9][A-Za-z0-9 .'/&()\\-]*?)\\s*[-\u2013\u2014*xX\u00d7]\\s*(\\d+(?:\\.\\d+)?)");

    /**
     * 订单文本确定性解析（不走模型，毫秒级）：
     * 支持 "udon-2" / "nama panko -2" / "1. 2 kg A5 AWAGYU" / "hokkigai"（无数量默认1）
     * 自动跳过模板表头（Date/Kitchen/Sushi Bar/Service Line/Extra Add on），
     * 自动识别送达分店（文本含 J1/J2/J3）与订单日期（D/M/YYYY，马来西亚格式）。
     */
    public Map<String, Object> parseOrderText(String text, String sys) {
        List<Map<String, Object>> drafts = new ArrayList<>();
        List<String> unmatched = new ArrayList<>();
        String deliverTo = "";
        if (text != null) {
            java.util.regex.Matcher bm = java.util.regex.Pattern.compile("\\b(J1|J2|J3)\\b", java.util.regex.Pattern.CASE_INSENSITIVE)
                    .matcher(text);
            if (bm.find()) deliverTo = bm.group(1).toLowerCase();
        }
        LocalDate orderDate = null;
        if (text != null) {
            java.util.regex.Matcher dm = DATE_P.matcher(text);
            if (dm.find()) {
                try {
                    int d = Integer.parseInt(dm.group(1)), m = Integer.parseInt(dm.group(2)), y = Integer.parseInt(dm.group(3));
                    if (y < 100) y += 2000;
                    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2020 && y <= 2100) orderDate = LocalDate.of(y, m, d);
                } catch (Exception ignore) { }
            }
        }
        if (text != null && !text.isBlank()) {
            // 先试整段分段匹配（单行/多行 "货品-N" 格式；把分店/日期先剔掉避免误拼进货品名）
            String cleaned = text
                    .replaceAll("(?im)^\\s*\\d{1,2}[.、)]\\s*", "")
                    .replaceAll("(?i)\\bJ[123]\\b", " ")
                    .replaceAll("\\d{1,2}/\\d{1,2}/\\d{2,4}", " ");
            java.util.regex.Matcher sm = SEGMENT_P.matcher(cleaned);
            List<String[]> segs = new ArrayList<>();
            while (sm.find()) segs.add(new String[]{ sm.group(1).trim(), sm.group(2) });
            if (segs.size() >= 2) {
                for (String[] seg : segs) {
                    Map<String, Object> d = enrichDraft(seg[0], null, Double.parseDouble(seg[1]), null, "", deliverTo, sys, null, null);
                    if ("draft_ready".equals(d.get("status"))) {
                        if (orderDate != null) d.put("date", orderDate.toString());
                        drafts.add(d);
                    } else {
                        unmatched.add(seg[0] + "（" + d.get("error") + "）");
                    }
                }
            } else {
            // 逐行解析（支持 "1. 2 kg A5 AWAGYU" 前置数量、无数量默认 1）
            for (String raw : text.split("\\r?\\n|;")) {
                String line = raw.trim();
                if (line.isEmpty()) continue;
                String low = line.toLowerCase();
                // 表头/杂项行：跳过（顺带从 Date 行取过日期了）
                if (low.matches("^(date|kitchen|sushi\\s*bar|service\\s*line|extra\\s*add.*|note|remark).*")) continue;
                line = line.replaceFirst("^\\s*\\d{1,2}[.\u3001)]\\s*", ""); // 去掉行号 "1. "
                if (line.isEmpty()) continue;

                String name;
                Double qty;
                java.util.regex.Matcher t = TRAILING_QTY.matcher(line);
                if (t.matches() && !t.group(1).isBlank()) {
                    name = t.group(1).trim();
                    qty = Double.parseDouble(t.group(2));
                } else {
                    java.util.regex.Matcher l = LEADING_QTY_UNIT.matcher(line);
                    if (l.matches()) {
                        qty = Double.parseDouble(l.group(1));
                        name = l.group(2).trim();
                    } else {
                        name = line;
                        qty = 1.0; // 无数量的行默认 1
                    }
                }
                if (name.replaceAll("[^A-Za-z]", "").length() < 2) continue; // 纯数字/单字母行跳过

                Map<String, Object> d = enrichDraft(name, null, qty, null, "", deliverTo, sys, null, null);
                if ("draft_ready".equals(d.get("status"))) {
                    if (orderDate != null) d.put("date", orderDate.toString());
                    drafts.add(d);
                } else {
                    unmatched.add(name + "（" + d.get("error") + "）");
                }
            }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("draft_count", drafts.size());
        out.put("drafts", drafts);
        out.put("unmatched", unmatched);
        out.put("deliverTo", deliverTo.isEmpty() ? null : deliverTo);
        out.put("orderDate", orderDate == null ? null : orderDate.toString());
        return out;
    }

    /** 工具结果回喂给模型的摘要（避免大 JSON 再进一轮 prompt 处理，提速明显） */
    private String batchSummaryForModel(Map<String, Object> b) {
        if ("error".equals(b.get("status"))) return "批量解析失败：" + b.get("error");
        StringBuilder sb = new StringBuilder("已生成 ").append(b.get("draft_count")).append(" 条出货草稿（数据已直送页面卡片，无需重复生成）。" );
        List<?> un = b.get("unmatched") instanceof List ? (List<?>) b.get("unmatched") : List.of();
        if (!un.isEmpty()) {
            sb.append("以下条目未匹配上，请在回复中列出并请用户确认名称：");
            for (Object u : un) sb.append("\n- ").append(u);
        } else {
            sb.append("无未匹配条目。");
        }
        sb.append("\n请简要告知用户核对页面卡片并点击「确认执行」。禁止在回复中重复罗列草稿明细。");
        return sb.toString();
    }

    private String draftSummaryForModel(Map<String, Object> d) {
        if ("error".equals(d.get("status"))) return "草稿生成失败：" + d.get("error") + "。请向用户追问后重试。";
        return "已生成" + ("in".equals(d.get("kind")) ? "进货" : "出货") + "草稿：" + d.get("productName")
                + " ×" + ("in".equals(d.get("kind")) ? d.get("inQuantity") : d.get("outQuantity"))
                + " @RM" + d.get("price")
                + (d.get("deliverTo") != null ? "（送往 " + d.get("deliverTo") + "）" : "")
                + "。数据已直送页面卡片。请提示用户核对并点击「确认执行」，不要重复罗列明细。";
    }

    /** 草稿构建核心：查货品 → 补全编号/规格/现价 → 生成草稿（不写库） */
    private Map<String, Object> enrichDraft(String productName, Double inQ, Double outQ, Double priceArg,
                                            String typeArg, String deliverTo, String sys,
                                            String receiver, String remark) {
        if (productName == null || productName.isEmpty()) return draftError("缺少货品名称");
        if (inQ == null && outQ == null) return draftError("进货数量和出货数量至少填一个");
        if (inQ != null && inQ <= 0) return draftError("进货数量必须大于0");
        if (outQ != null && outQ <= 0) return draftError("出货数量必须大于0");
        if (inQ != null && outQ != null) return draftError("同一条记录不能同时有进货和出货数量");

        // 从库存中查找货品，补全编号/规格/单价/类型
        Map<String, Object> hit = findProduct(productName, sys);
        if (hit == null) return draftError("在系统 " + sys + " 中找不到货品 [" + productName + "]，请确认名称");

        Double price = (priceArg != null && priceArg >= 0) ? priceArg : toDbl(hit.get("price"));
        if (price == null || price < 0) return draftError("无法确定 [" + productName + "] 的单价，请向用户询问价格");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("is_draft", true);
        out.put("status", "draft_ready");
        out.put("kind", inQ != null ? "in" : "out");
        out.put("date", LocalDate.now().toString());
        out.put("system", sys);
        out.put("productName", hit.get("product_name"));
        out.put("codeNumber", hit.get("code_number"));
        out.put("specification", hit.get("specification"));
        out.put("type", typeArg == null || typeArg.isEmpty() ? hit.get("type") : typeArg);
        deliverTo = deliverTo == null ? "" : deliverTo.trim().toLowerCase();
        out.put("deliverTo", List.of("j1", "j2", "j3").contains(deliverTo) ? deliverTo : null);
        if (inQ == null && "central".equals(sys) && !List.of("j1", "j2", "j3").contains(deliverTo)) {
            out.put("warning", "未指定送达分店，将作为中央内部出货记录");
        }
        if (Boolean.TRUE.equals(hit.get("_no_stock")) && outQ != null) {
            out.put("warning", "该货品当前无库存记录（可能已售罄），出货确认后会被库存校验拦截");
        }
        out.put("inQuantity", inQ);
        out.put("outQuantity", outQ);
        out.put("price", price);
        out.put("receiver", receiver == null || receiver.isEmpty() ? null : receiver);
        out.put("remark", remark == null || remark.isEmpty() ? null : remark);
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findProduct(String keyword, String sys) {
        String table = "central".equals(sys) ? "stockinout_data" : sys + "stockedit_data";
        List<String> words = splitWords(keyword);
        if (words.isEmpty()) return null;
        String full = keyword.trim();
        Map<String, Object> s = stockSummaryService.summary(sys);
        List<Map<String, Object>> items = s.get("summary") instanceof List
                ? (List<Map<String, Object>>) s.get("summary") : List.of();
        Map<String, Object> fuzzy = null;
        for (Map<String, Object> it : items) {
            String name = str(it.get("product_name")).toLowerCase();
            if (name.equals(full.toLowerCase())) { fuzzy = it; break; }   // 精确匹配优先
            if (fuzzy == null && words.stream().allMatch(name::contains)) fuzzy = it; // 分词 AND 匹配备选
        }
        // 最新流水价优先（汇总首行可能是历史异常价）；零库存货品（汇总 HAVING 净库存<>0 排除）也能查到
        Map<String, Object> hit = stockSummaryMapper.latestProductInfo(table, words, full);
        if (hit == null) {
            // 流水无记录/全被软删 → 台账（货品主表）兜底，价格可能为 NULL（AI 会向用户追问）
            hit = stockSummaryMapper.stockDataProductInfo(words, full);
            if (hit != null) hit.put("_no_stock", true); // 台账兜底命中 ⇒ 无任何在库流水 ⇒ 零库存
        }
        if (hit != null) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("product_name", fuzzy != null && fuzzy.get("product_name") != null ? fuzzy.get("product_name") : hit.get("product_name"));
            out.put("code_number", hit.get("code_number"));
            out.put("specification", hit.get("specification"));
            out.put("type", hit.get("type"));
            out.put("price", hit.get("price"));
            if (Boolean.TRUE.equals(hit.get("_no_stock"))) out.put("_no_stock", true);
            return out;
        }
        return fuzzy;
    }

    /** 关键词分词：按非字母数字切分，取最多5个词（用于货品名分词 AND 匹配） */
    private static List<String> splitWords(String keyword) {
        if (keyword == null) return List.of();
        List<String> words = new ArrayList<>();
        for (String w : keyword.trim().toLowerCase().split("[^a-z0-9]+")) {
            if (!w.isBlank() && words.size() < 5) words.add(w);
        }
        return words;
    }

    private Map<String, Object> draftError(String msg) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("is_draft", true);
        m.put("status", "error");
        m.put("error", msg);
        return m;
    }

    private static Double toDbl(Object o) {
        if (o == null) return null;
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ---------- 工具方法 ----------

    private String toJson(Object o) {
        try {
            return JSON.writeValueAsString(o);
        } catch (Exception e) {
            return "{\"error\":\"serialize failed\"}";
        }
    }

    private String normalize(String system, String fallback) {
        if (system == null || system.isBlank()) return fallback;
        String s = system.trim().toLowerCase();
        return List.of("central", "j1", "j2", "j3").contains(s) ? s : fallback;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private static LocalDate parseDate(String s) {
        try {
            return (s == null || s.isBlank()) ? null : LocalDate.parse(s.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static Object firstNonNull(Map<String, Object> m, String... keys) {
        for (String k : keys) if (m.get(k) != null) return m.get(k);
        return null;
    }

    /** 依次取第一个非空字符串值（兼容模型传驼峰/下划线等不同 key） */
    private static String firstNonBlank(Map<String, Object> m, String... keys) {
        for (String k : keys) {
            Object v = m.get(k);
            if (v != null && !String.valueOf(v).isBlank()) return String.valueOf(v);
        }
        return null;
    }

    private static double toD(Object o) {
        if (o == null) return 0;
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}

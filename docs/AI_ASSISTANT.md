# 🤖 本地 AI 助手技术文档

> 2026-08-29 完成。零费用方案：本地 Ollama + Qwen3-4B，无需任何付费 API。
> 使用说明见 README「🤖 本地 AI 助手」章节；本文面向开发/运维。

---

## 1. 架构总览

```
浏览器（进出货页面聊天球 🤖）
   │  POST /api/ai/chat（JWT）
   ▼
Spring Boot AiController
   │
   ├─ 问答 / 单条草稿 ──► AiService.chat()
   │                        │ RestClient
   │                        ▼
   │                 Ollama localhost:11434（模型 kunzz-ai = Qwen3-4B Q4_K_M）
   │                        │ function calling（工具循环 ≤6 轮）
   │                        ▼
   │                 AiService.executeTool() ──► 现有 StockService / StockSummaryService（只读）
   │
   └─ 订单粘贴 ──► AiService.parseOrderText()   ← 确定性正则解析，不经模型
                     │ findProduct() 三级兜底 + 分词 AND 匹配
                     ▼
              批量草稿（毫秒级）

用户确认草稿 → 前端调用原有 POST /api/stock/inout（createStockInout）
             → 后端验证 / HIFO 批次扣减 / 备注码生成 全部保留
```

**安全设计**：AI 与解析器都只生成**草稿**（内存 JSON），绝不直接写库；确认前可取消；
真正写入走与手工操作完全相同的后端校验。

---

## 2. API 接口

### 2.1 POST `/api/ai/chat`（对话 + 单条草稿 + 模型批量）

请求：
```json
{ "message": "帮我进货 apple sauce 2 件", "system": "central" }
```
响应：
```json
{ "code": 0, "data": { "reply": "已生成进货草稿：…", "toolUsed": true,
  "drafts": [ { "is_draft": true, "status": "draft_ready", "kind": "in", … } ] } }
```

### 2.2 POST `/api/ai/parse-order`（订单确定性解析，不经模型）

请求（单行/多行订单原文均可）：
```json
{ "text": "我要出货给 j1 udon-2 nama panko -2 …", "system": "central" }
```
响应：
```json
{ "code": 0, "data": { "draft_count": 11, "drafts": [ … ], "unmatched": [ "100 PLUS（…）" ],
  "deliverTo": "j1", "orderDate": "2026-09-01" } }
```

---

## 3. AI 工具一览（chat 路径）

| 工具 | 用途 | 数据来源 |
| --- | --- | --- |
| `search_products` | 按关键词搜当前库存 | `StockSummaryService.summary()` 过滤 |
| `get_stock_summary` | 总价值/货品数/分类统计/价值 Top15 | 同上（截断防上下文爆炸） |
| `get_stock_records` | 进出货流水（关键词+日期过滤） | `StockService.listInout()` |
| `get_minimum_alerts` | 低于最低库存的货品 | `StockService.listMinimumProducts()` |
| `draft_stock_inout` | 单条进货/出货草稿 | findProduct 三级兜底匹配 |
| `draft_order_batch` | 批量草稿（多行订单一次性） | 同上循环 |

工具结果只回喂**摘要**给模型（大 JSON 直走内存给前端），减少一轮 prompt 处理。

---

## 4. 货品匹配（StockSummaryMapper 新增）

草稿需要把用户口语名称对应到真实货品并补全 编号/规格/单价/类型，三级兜底：

| 级别 | 查询 | 覆盖场景 | 单价 |
| --- | --- | --- | --- |
| 1 | 库存汇总 `summary()`（Java 内存过滤） | 有净库存的货品 | 汇总首行价 |
| 2 | `latestProductInfo(table, words, full)` | 零库存/已售罄（汇总 HAVING 净库存≠0 会排除） | **最新一笔流水的真实价** |
| 3 | `stockDataProductInfo(words, full)` | 从无流水的台账新品 | 台账默认价（NULL 则 AI 追问） |

**分词 AND 匹配**：关键词按非字母数字切分（最多 5 词），货品名需包含全部词、任意词序
（`tanaka sake` → `TANAKA VIET SAKE` ✓）；精确同名优先（ORDER BY `product_name = #{full}` DESC）。

> ⚠️ 级别 2/3 命中即视为「无在库流水」：出货草稿会附加警告
> "该货品当前无库存记录，出货确认后会被库存校验拦截"；级别 3 无价时返回错误让 AI 追问用户。

---

## 5. 订单文本解析规则（parseOrderText，确定性）

1. 预清理：剔除分店词（J1/J2/J3，先捕获为 deliverTo）、日期（D/M/Y → orderDate）、行号 `1. `
2. **分段匹配优先**（整段正则，单行/多行通吃）：`货品名 -/* /x/X 数量`，如
   `udon-2`、`nama panko -2`、`boiled scallop-20`；≥2 段即采用
3. 否则逐行解析：表头行（Date/Kitchen/Sushi Bar/Service Line/Extra Add on）跳过；
   前置数量需带单位（`2 kg A5 AWAGYU`）；无数量的行默认数量 1；纯数字行跳过
4. 每条走 enrichDraft：匹配货品 → 补全 → 草稿；失败进 unmatched（原因说明）
5. 中央出货未指定分店 → 草稿带警告"将作为中央内部出货记录"（前端卡片可选送往分店）

---

## 6. 配置

| 项 | 默认值 | 环境变量覆盖 |
| --- | --- | --- |
| Ollama 地址 | `http://localhost:11434` | `OLLAMA_BASE_URL` |
| 模型名 | `kunzz-ai` | `OLLAMA_MODEL` |
| 跳过 AI 准备 | 否 | `KUNZZ_SKIP_AI=1` |

Modelfile（首次导入自动生成于 `runtime/ollama/Modelfile`）：
```
FROM <gguf 路径>
PARAMETER temperature 0.6 / top_p 0.95 / top_k 20 / num_ctx 3072 / repeat_penalty 1.05
```

---

## 7. start.ps1 集成（一键启动）

| 步骤 | 行为 |
| --- | --- |
| `Ensure-Ollama` | `runtime\ollama\ollama.exe` 缺失 → 8 线程分块下载 zip(1.4GB, GitHub) → 解压 |
| `Start-Ollama` | 起 `ollama serve`（11434，已运行则跳过）；退出脚本时自动停止 |
| `Ensure-AiModel` | `ollama list` 无 kunzz-ai → 8 线程下载 gguf(2.4GB, HuggingFace) → 写 Modelfile → `ollama create` → 删 gguf 释放空间 |
| 旧后端接管 | 8081 被本系统旧 java 进程占用 → 自动终止重启（不再误报"端口被占"） |

下载实现 `Download-Parallel`：Content-Length 分块 → curl.exe `-r start-end` 并行（8 进程）→
逐块校验（不等长自动重试整 pass，最多 3 次）→ 二进制合并 → 总长校验。
实测：HuggingFace ≈1.7MB/s（约 25 分钟/2.4GB）；GitHub ≈350KB/s（多线程叠加）。

---

## 8. 运维与故障排查

| 症状 | 处置 |
| --- | --- |
| 聊天球提示"无法连接本地 AI 服务" | ① `curl http://localhost:11434/api/version` 查 serve 是否活着 ② `ollama list` 看 kunzz-ai 是否已导入 ③ 都正常则看 `backend_run.log` |
| 重建模型 | gguf 在 `Downloads/_ai-model-backup/`（或重新下载）→ `cd runtime/ollama && ollama create kunzz-ai -f Modelfile` |
| 模型跑得慢 | `ollama ps` 看 PROCESSOR 列；CPU 占比高 = 显存不足：降 num_ctx（3072→2048）、关闭大程序、或换 Qwen3-1.7B |
| 出货确认失败"库存不足" | 真实业务校验：该货品无在库批次/价格不匹配批次；先入库或核对单价 |
| jar 被锁无法打包 | 先杀 java 进程（8081 占用者）再 `mvn package` |

**重构/改动后必做**：`mvn -o package -DskipTests` 重打 jar（前端产物已内嵌 `backend/static/`）。

---

## 9. 开发记录

- 工作日志（过程/踩坑）：`docs/ai-assistant-progress.md`
- 版本变更：`CHANGELOG.md` 2026-08-29 节

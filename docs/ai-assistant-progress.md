# AI 助手进度记录（2026-08-29 全部完成 ✅）

## 功能总览（已上线，随时可用）
进出货页面右下角聊天球 🤖 → `/api/ai/chat` → 本地 Ollama（kunzz-ai = Qwen3-4B Q4_K_M，零费用）

### 能力 1：只读查询（已验收）
- 工具：search_products / get_stock_summary / get_stock_records / get_minimum_alerts
- 验收通过："apple sauce 还有多少" → 正确返回 APPLE SAUCE PS 0001 Tub 2.0 @60.0 Kitchen

### 能力 2：进出货草稿（已验收，双路径）
- **订单粘贴（主路径，毫秒级）**：多行订单自动检测 → POST `/api/ai/parse-order` → 后端正则解析（trailing "-N"/leading "N kg"/无数量默认1，跳过 Date/Kitchen 等表头，识别订单日期 D/M/Y 和 J1/J2/J3）→ 分词 AND 匹配货品 → 批量草稿卡（带“送往”下拉）→ 确认执行全部
  - 实测：11 条订单 **1.85 秒**全匹配（模型路径曾需 89~234 秒且漏配）
  - 货品匹配兑底链：汇总（有净库存）→ 最新流水价（零库存也能查）→ 台账 stock_data（无价则追问）；分词 AND 匹配（tanaka sake → TANAKA VIET SAKE）
- **单条口述（AI 路径）**："帮我进货 apple sauce 2 件" → draft_stock_inout → 草稿卡确认（工具结果只回喂摘要，省一轮 prompt）
- 安全设计：AI/解析器都不直接写库；确认前可取消；出货走后端库存校验（HIFO/备注号）

## 架构文件
| 层 | 文件 |
|---|---|
| 后端服务 | `backend/.../service/AiService.java`（RestClient→Ollama /api/chat，think=false，工具循环≤6轮；**parseOrderText 确定性订单解析**；findProduct 三级兑底+分词 AND） |
| 后端接口 | `backend/.../controller/AiController.java`（POST /api/ai/chat + POST /api/ai/parse-order，JWT 保护） |
| 后端查询 | `StockSummaryMapper.latestProductInfo / stockDataProductInfo`（AI 货品匹配专用） |
| 配置 | `application.yml` → ollama.base-url / ollama.model（OLLAMA_BASE_URL / OLLAMA_MODEL 可覆盖） |
| 前端组件 | `inventory-system/frontend/src/components/AiAssistant.tsx`（批量草稿卡+送往下拉+onSaved 刷新） |
| 前端 API | `src/api/ai.ts`（askAi，5 分钟超时，drafts[]） |
| 本地模型 | `runtime/ollama/ollama.exe`（v0.33.1）+ 模型 kunzz-ai（Qwen3-4B Q4_K_M，**num_ctx 3072**，KV q8_0，87% GPU）+ Modelfile（temp 0.6） |
| 启动集成 | `start.ps1`：第 3 步自动起 Ollama（已运行则跳过）；检测到自家旧后端占 8081 时自动重启；退出时停 AI 服务 |

## 运维备忘
- 模型已导入 ollama（ollama list 可见 kunzz-ai:latest）；gguf 原件在 `C:/Users/donho/Downloads/Qwen_Qwen3-4B-Q4_K_M.gguf`，可删可归档
- 下载器：`C:/Users/donho/Downloads/pdownload.sh`（多线程断点续传，HF 全速 ~1.7MB/s，GitHub 仅 ~350KB/s）
- 若浏览器问 AI 报"无法连接"：先查 `curl http://localhost:11434/api/version`；Ollama 活着但报这个错多半是模型没导入（ollama list 看 kunzz-ai）
- jar 需重新 package 才会内嵌最新前端产物；**先杀后端进程再打包**（jar 被锁）
- 小模型（4B）工具传参不稳定（偶漏 deliver_to/price）：已用卡片段落选择+追问自愈兑底；若要更稳可升级 Qwen3-8B（显存不够可量化）或 Qwen3-4B 换更大 num_ctx

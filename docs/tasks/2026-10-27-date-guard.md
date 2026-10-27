# 任务 2026-10-27-date-guard

- 状态：进行中
- 起因：2026-10-27 09:01–09:02 一批 15 条出库的 `date` 被写成 `0015-10-27`（应为 2026-10-27），
  导致这 15 条在按日期的报表 / 区间导出 / 本月供货额里整批消失（金额 RM 2,265.55）。
  库里数据已用 SQL 修正（备份在 VPS `/root/db-backup/2026-10-27-fix0015/`）。
- 目标：后端加日期兜底校验 —— 年份 < 2000 直接拒绝保存（400），前端把年份写坏时立刻报错而不是静默入库。

- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/common/TxnDateGuard.java（新增）
  - backend/src/main/java/com/kunzz/inventory/service/StockService.java
  - backend/src/main/java/com/kunzz/inventory/service/MobileStockService.java
  - docs/tasks/2026-10-27-date-guard.md
  - CHANGELOG.md（仅追加）
- 明确不碰：其它 java / 前端 / static 产物 / database/*.sql
- 计划推送分支：main

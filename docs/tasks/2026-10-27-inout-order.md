# 任务 2026-10-27-inout-order

- 状态：进行中
- 需求（用户 2026-10-27）：进出货列表的排序依据要按**实际创建时间**，不能用录单时填的业务 `time`。
  场景：用户昨天（26 日）晚上录了 27 号的货，结果这条被 `time=17:50` 排到当天最下面；
  期望「昨天录的（业务日期 27）排在这一组的**最上面**」。
- 现状：中央 `ORDER BY date, time, id`（StockService:175）；分店 `ORDER BY date, time, id`（StockInoutMapper.xml:56）。
- 方案（2026-10-27 **定稿 = 方案 B**）：**完全按实际录入时间排序** —— `created_at ASC, id ASC`。
  不再以业务日期 `date` 分组（用户明确选择：列表要按人真实录入先后展示，
  “26 日晚上录 27 号账”就应该在 27 日早上录的内容之前）。
- 数据核对：`stockinout_data` 28,739 行、`j2stockedit_data` 15,889 行，`created_at` 无 NULL，可安全作排序键。

- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/service/StockService.java（中央列表排序）
  - backend/src/main/resources/mapper/StockInoutMapper.xml（分店列表排序，仅 listBranch 一条）
  - docs/tasks/2026-10-27-inout-order.md
  - CHANGELOG.md（仅追加）
- 明确不碰：导出（StockExcelMapper 保持 date,time 便于对账）、checkInout 检查弹窗明细、其它页面
- 计划推送分支：main

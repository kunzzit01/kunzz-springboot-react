# 任务 2026-11-19-out-no-manual-price

- 状态：进行中
- 目标：进出货页「出货」行删除「手动输入价格」，出货只能按库存批次价格出，防止库存被倒扣（进货不动）
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/pages/StockInout.tsx
  - backend/src/main/java/com/kunzz/inventory/service/StockService.java
  - docs/tasks/2026-11-19-out-no-manual-price.md
- 明确不碰：StockSot.tsx、移动端 MobileStockService、构建产物、CHANGELOG 老行
- 计划推送分支：main（用户未要求推送前不推）

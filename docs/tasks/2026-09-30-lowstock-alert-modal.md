# 任务 2026-09-30-lowstock-alert-modal

- 状态：已完成（2026-09-30）
- 开始时间：2026-09-30
- 分支：main
- 目标：总库存页补回旧版的「低库存预警弹窗」（进页自动弹、只看中央）
- 白名单（只允许改这些）：
  - docs/tasks/2026-09-30-lowstock-alert-modal.md
  - docs/tasks/README.md
  - CHANGELOG.md
  - inventory-system/frontend/src/pages/StockRecords.tsx
- 明确不碰：其它 backend/**、inventory-system/**、website/**、database/**、backend/static/**（构建产物）
- 计划推送分支：main

## 问题

新系统总库存页对低库存货品有**行高亮**（`tr.low-stock-row`），但**没有旧版的预警弹窗**。
重写时 CSS 全搬了（`stocklist.css` 里 `.low-stock-modal` / `.low-stock-modal-content` /
`.low-stock-table` / `.stock-critical` / `.stock-warning` / `.alert-summary` 都在），**React 组件丢了**。

## 旧版做法（`backend/js/stocklistall.js`，旧站免登录可读）

- `initApp()` → `checkLowStockAlerts()`（`apiCall('central', '?action=low_stock_alerts')`，**只查中央**）
  → 有预警时 `showLowStockModal(alerts)`
- 弹窗内容：红色提示「发现 N 个货品库存不足，请及时补货！」+ 表格
  **货品名称 / 货品编号 / 规格 / 当前库存 / 最低库存**；当前库存按 `stock-critical`（红）/ `stock-warning`（橙）着色
- 右上角 × 或点遮罩关闭；另有 `goToMinimumSettings()` 跳最低库存设置

## 做法（用户确认：进页自动弹、只看中央）

- 数据不用改后端：页面已加载 `mergedData.central`（含编号/规格/库存）与 `lowStock.central`
- 判定与表格行高亮**完全一致**：按货品名汇总总库存 vs 最低库存，`diff <= 0.001` 即预警
- 首次数据就绪且有预警 → 自动弹出一次；复用**现成的** CSS 类渲染（不再新写样式）
- 弹窗底部加「设置最低库存」→ 复用页面已有的 `goMinimum()`

## 验证

1. `npm run build` 通过（tsc 类型检查）
2. 本地 vite dev 打开总库存页 → 若中央有低库存货品，进页自动弹出清单；名称/编号/规格/库存/最低库存齐全
3. 关闭按钮、点遮罩、底部「设置最低库存」都可用

## 回滚

只改一个前端文件；`git revert` 即可（不涉及数据）。

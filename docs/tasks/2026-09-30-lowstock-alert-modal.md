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
  - inventory-system/frontend/src/styles/stocklist.css
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

## 做法（用户确认：跟随当前系统）

- 数据不用改后端：页面已加载四个系统的 `mergedData` 与 `lowStock`
- 判定与表格行高亮**完全一致**：按货品名汇总总库存 vs 最低库存，`diff <= 0.001` 即预警
- **跟随当前查看的系统**：进页与**每次切换分店**时各自动弹一次（同一分店实时刷新不重复弹）；
  弹窗标题带系统名（如「库存预警 - J3」）
- 复用现成的 CSS 类渲染；并做样式重排：弹窗加宽 `clamp(620px,55vw,1040px)`；
  列宽重分配（名称 34% 不换行、数字列右对齐 `nowrap`）；表头浅橙底 + 深橙字、偶数行淡橙
- 弹窗底部加「设置最低库存」→ 复用页面已有的 `goMinimum()`

## 为什么不是“只查中央”

旧版 `checkLowStockAlerts()` 只调 `apiCall('central', ...)`，而真实数据里**中央最低库存全是 0**
→ 永远不弹（旧站 `low_stock_alerts` 对 central/j1/j2/j3 全返回 0 条）。
真正的预警在分店：实数据 J2 有 3 条、J3 有 4 条。

## 验证

1. `npm run build` 通过（tsc 类型检查）
2. 本地 vite dev：`/records?system=j2` → 自动弹 3 条（COCA COLA 30→21、
   YQ MANGO SAGO MOCHI PKT 20→6、YQ WHITE PEACH MOCHI PKT 10→7）；切 J3 → 4 条
3. 关闭按钮、点遮罩、底部「设置最低库存」都可用

## 回滚

只改一个前端文件；`git revert` 即可（不涉及数据）。

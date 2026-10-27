# 任务 2026-10-27-date-field

- 状态：进行中
- 需求：进出货「新增记录」弹窗的日期输入，原生 `<input type="date">` 会跟随**操作系统语言**显示成
  `MM/DD/YYYY`（截图实测 10/27/2026），用户要求：
  1. 不跟随电脑系统格式，统一显示 **年/月/日**（YYYY/MM/DD）；
  2. 聚焦时**直接高亮「日」**，方便立刻改日期。
- 做法：新增可复用组件 `DateField`（文本输入：数字自动补 `/`，聚焦选中第 9–10 位的「日」；
  右侧保留日历图标，走隐藏的原生 date input 的 `showPicker()` 选日期）。

- 白名单（只允许改这些）：
  - inventory-system/frontend/src/components/DateField.tsx（新增）
  - inventory-system/frontend/src/styles/date-field.css（新增）
  - inventory-system/frontend/src/pages/StockInout.tsx
  - docs/tasks/2026-10-27-date-field.md
  - CHANGELOG.md（仅追加）
- 明确不碰：其它页面/组件、backend/**、backend/static/**（产物由发布流程单独处理）
- 范围说明：只改「新增记录」弹窗（截图所示）这一处；其它页面的 `type="date"` 后续按需再统一替换。
- 计划推送分支：main

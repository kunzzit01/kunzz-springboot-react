# 任务 2026-10-27-date-field

- 状态：进行中
- 需求（迭代 2，2026-10-27 下午）：截图反馈——日历弹层还是**浏览器原生的英文日历**
  （`October 2026 / Su Mo Tu / Clear / Today`），与本站风格不搭。要求：
  1. 好好设计日期选择（自绘中文日历，年/月切换、今天/清除、最小/最大禁用）；
  2. **其它所有 `type="date"` 的日期框统一换成同款组件**（全站一套设计）；
  3. 做成可复用 component（已收敛到 `components/DateField.tsx`）。
- 迭代 1（已完成）：固定 `YYYY/MM/DD` 显示、聚焦高亮「日」、数字自动补 `/`。

- 白名单（只允许改这些）：
  - inventory-system/frontend/src/components/DateField.tsx（新增/重写）
  - inventory-system/frontend/src/styles/date-field.css（新增/重写）
  - inventory-system/frontend/src/pages/StockInout.tsx（4 处）
  - inventory-system/frontend/src/pages/StockSot.tsx（2 处）
  - inventory-system/frontend/src/pages/StockRecords.tsx（2 处）
  - inventory-system/frontend/src/pages/CorporateEdit.tsx（2 处）
  - inventory-system/frontend/src/pages/DishwareBreak.tsx（1 处）
  - inventory-system/frontend/src/pages/Evaluation.tsx（1 处）
  - inventory-system/frontend/src/pages/JobPositions.tsx（1 处）
  - inventory-system/frontend/src/pages/MobileOut.tsx（1 处）
  - inventory-system/frontend/src/pages/Phone.tsx（1 处）
  - inventory-system/frontend/src/pages/Staff.tsx（1 处）
  - inventory-system/frontend/src/pages/MobileRecords.tsx（导出弹窗 3 处）
  - inventory-system/frontend/src/components/SelectField.tsx（新增：自绘下拉）
  - inventory-system/frontend/src/components/DateRangeField.tsx（新增：日期区间）
  - inventory-system/frontend/src/pages/Kpi.tsx（日期范围弹层换 DateRangeField）
  - inventory-system/frontend/src/pages/Cost.tsx（同上）
  - inventory-system/frontend/src/styles/select-field.css（新增）
  - inventory-system/frontend/src/styles/mobile-records.css（select 箭头）
  - docs/tasks/2026-10-27-date-field.md
  - CHANGELOG.md（仅追加）
- 明确不碰：backend/**、backend/static/**、其它页面（除上面列出的）、database/*.sql
- 计划推送分支：main

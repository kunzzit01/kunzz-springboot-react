# 任务 2026-11-25-save-guard-rollout

- 状态：进行中（批次 1 完成）
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/components/SaveGuardDialog.tsx
  - inventory-system/frontend/src/styles/save-guard.css
  - inventory-system/frontend/src/pages/KpiEdit.tsx
  - inventory-system/frontend/src/pages/CostEdit.tsx
  - inventory-system/frontend/src/pages/StockSot.tsx
  - docs/tasks/2026-11-25-save-guard-rollout.md
  - docs/PLAN_2026-11-25-save-guard-rollout.md
  - backend/static/
- 明确不碰：其它页面、后端 Java、CHANGELOG.md
- 计划推送分支：main

## 批次 1（本次）

1. 抽出 `components/SaveGuardDialog.tsx`（portal 到 body），KPI / 成本两页改用它，删除各自的内联弹窗
2. `save-guard.css` 选择器去掉 `.ke-root` 前缀、补 `.ke-ask-btn` 自样式（portal 后拿不到页面 `.btn`）
3. `StockSot.tsx` 上「保存防丢」措施：
   - M2 逐行 try/catch：成功一行摘一行，失败的行留在表单 → **重试不再重复插入**
   - M3 `savingRef` + `savingKey`（只让当前行转圈）
   - M4 `load` 加请求序号（实时推送会并发触发）
   - M5 `useBlocker` + `beforeunload` + 弹窗
   - 校验不通过时明确提示「有 N 行未填写完整」，不再静默过滤

## 实测（vite preview + puppeteer，mock /api）

- 3 行（AAA/BBB/CCC），让 BBB 返回 500 → `已保存 2 条，1 条失败…可重试`，表单剩 1 行（BBB）
- 再点保存 → 只 POST BBB，AAA/CCC 不重复 ← 修复前会整批重发
- 新增一行未保存 → 点侧边栏 → 弹窗出现、URL 不变
- JS 错误：无

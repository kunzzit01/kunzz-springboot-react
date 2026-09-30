# 任务 2026-09-30-phone-page-fixes

- 状态：已完成（2026-09-30）
- 开始时间：2026-09-30
- 分支：main
- 目标：手机版（`/phone?restaurant=jX`）两处修复：① 「下载PDF」改为文字版（纵向 A4）；② 员工管理弹窗加回「编辑」按钮
- 白名单（只允许改这些）：
  - docs/tasks/2026-09-30-phone-page-fixes.md
  - docs/tasks/README.md
  - CHANGELOG.md
  - inventory-system/frontend/src/pages/Phone.tsx
  - inventory-system/frontend/src/styles/phone.css
- 明确不碰：其它 backend/**、inventory-system/**、website/**、database/**、backend/static/**（构建产物，由发布流程处理）
- 计划推送分支：main

## ① PDF 字体小 / 不清晰（用户打印成品不满意）

当前 `downloadPDF` 用 `html2canvas` 把屏幕上的**交互表格截屏**再拉成 A4 宽：
纸上字号 = 屏幕字号 × (210mm ÷ 表格像素宽) → 实测 12px 字 ≈ **6pt**，且位图拉伸发虚；
还会把 `<input type=time>` / 复选框原样截进去，且缺标题/页码、整图硬切可能切半行。

**做法**（用户确认：纵向 A4）：照 `StockRecords.tsx` 的写法改用 `jspdf-autotable`（本地 vendor 已带）：
纵向 A4、11pt 矢量文字、橙底表头、隔行淡橙、标题区（店面/日期/人数/导出时间）、
勾选 → ZapfDingbats 勾号、时间 → 文本、自动按行分页 + 每页重复表头 + 页脚 `Page N`。

## ② 员工管理弹窗没有「编辑」入口（回归）

`Phone.tsx` 员工表格「操作」列只有「删除」；`setEmpId` 只在「添加新员工」时被设为 `null`，
那个 `{empId ? '编辑员工' : '添加员工'}` 的编辑模态框**没人能打开**（死代码）。
旧系统员工管理每行有「编辑/删除」两个钮（见 `CHANGELOG.md:181` /
`docs/tasks/2026-09-25-schedule-align-old.md`「17 行各有编辑/删除按钮」）。

**做法**：表格「操作」列加回「编辑」按钮 → 预填 `name/phone/position/workArea` 并 `setEmpId(e.id)`
打开已有模态框；保存走既有的 `saveScheduleEmployee({ id: empId || undefined, ... })`（后端已支持，不改后端）。
`phone.css` 补 `.btn-edit` 样式（对齐 staff.css 的 `#f59e0b`）。

## 验证

1. `npm run build` 通过（tsc 类型检查）
2. 本地 vite dev（5174）打开 `/phone?restaurant=j1`：
   - 点「下载PDF」→ 字号够大、矢量清晰、勾号、时间文本、标题/页码、多页表头重复
   - 员工管理弹窗 → 每行出现「编辑」+「删除」；点编辑 → 表单预填 → 改完保存后列表更新

## 回滚

只改前端两个文件；`git revert` 即可（不涉及数据）。

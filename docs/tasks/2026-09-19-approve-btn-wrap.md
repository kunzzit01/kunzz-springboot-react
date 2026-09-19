# 任务 2026-09-19-approve-btn-wrap

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：修「批准」按钮在状态列变窄时被竖着折成两行（用户截图反馈"设计跑偏了"）
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/styles/stockproducts.css
  - docs/tasks/2026-09-19-approve-btn-wrap.md
  - docs/tasks/README.md
- 明确不碰：页面逻辑（StockProducts.tsx）、后端、数据库、CHANGELOG.md、构建产物

## 原因

`.sp-root .approve-btn`（`stockproducts.css:240`）是 `display: inline-flex` 且**没有 `white-space: nowrap`**
→ 列一窄，按钮里的「批准」就在 inline-flex 内折成两行（截图中竖排成"批/准"）。
而状态列又只有百分比宽度（总览 = 第 11 列 `8%`、系统页 = 第 12 列 `8%`，`:172/:208`），
表格是 `table-layout: fixed` + 容器 `overflow-x: hidden`（`:168/:167`）——
**fixed 布局下 min-width 无效**（文件里 9/3 的注释也写了这点），所以窗口/缩放一变窄，这一列就跟着缩，
缩到不足按钮的内容宽度（约 61px）就换行。

## 做法

1. `.approve-btn` 加 `white-space: nowrap`（按钮文字永远一行）
2. 状态列从百分比改成**固定像素宽**（跟操作列 90px 同一个套路）：
   - 系统页：`.excel-table.has-pos th/td:nth-child(12) { width: 88px }`
   - 总览：`.excel-table th/td:nth-child(11) { width: 88px }`
   （88px 能放下「✓ 批准」和「待批准」，也不至于白占地方）
3. 页面本身不动（无逻辑改动）

## 本地验证（真实浏览器实测）

本地把一条货品临时改成"待批准"，让「批准」按钮出现；用真实浏览器量：

| 视口 | 状态列宽 | 按钮 | 结果 |
|---|---|---|---|
| 1280（系统页 J1） | 88px | 60×25px、`white-space: nowrap` | 「✓ 批准」**单行**✓ |
| 900（同上，故意收窄） | **仍是 88px** | 60×25px | 单行 ✓（改前这里就折成两行了） |
| 1280（总览） | 88px（表头「批准状态」） | 60×25px | 单行 ✓ |

顺带确认没把表格挤坏：表格宽度比容器**窄 15px**（不溢出、不裁切），操作列 90px 完整可见 ✓。
截图（位次「2」旁边就是修好的「✓ 批准」）已发给用户确认。

## 待用户在生产环境执行

纯前端：`npm run build` + rsync 到 `/var/www/admin/`（无后端/数据库改动）

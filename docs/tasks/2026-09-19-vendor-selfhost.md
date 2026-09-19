# 任务 2026-09-19-vendor-selfhost

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：把 index.html 里依赖外网 CDN 的库改成自托管（弱网/CDN 抽风不再卡首屏、也不再白屏）
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/index.html
  - inventory-system/frontend/public/vendor/**（新增的库文件 + LICENSE）
  - docs/tasks/2026-09-19-vendor-selfhost.md
  - docs/tasks/README.md
- 明确不碰：后端、数据库、页面逻辑、CHANGELOG.md、构建产物

## 现状（自托管前）

`index.html` 依赖 5 个外网库（cdnjs / code.jquery.com）+ 3 个外网 CSS（cdnjs 的 Font Awesome、2 个 Google Fonts）：

| 库 | 版本 | 谁在用 | 关键点 |
|---|---|---|---|
| jQuery | 3.6.0 | `Corporate.tsx` 的 orgchart（`window.jQuery`，有守卫） | — |
| html2canvas | 1.4.1 | `Phone.tsx` / `Schedule.tsx` 用 `window.html2canvas` 导出 PDF（有守卫） | **必须保留全局** |
| jspdf | 2.5.1 | `StockRecords.tsx:640` `const { jsPDF } = window.jspdf` | **必须保留全局** |
| jspdf-autotable | 3.5.31 | 上面那个 doc 的 `.autoTable(...)` | **跟着 jspdf 一起搬**，否则导出坏 |
| Chart.js | 3.9.1 | `Cost.tsx` / `Kpi.tsx` 用 `window.Chart` | **必须保留全局** |
| Font Awesome | 6.4.0 | 全站图标 `fas fa-*` | css 里引用 `../webfonts/*`，目录结构要对 |

（orgchart / pdf-lib / fontkit 本来就是本地的 ✓）

## 做法

1. 把上面 5 个库（含 FA 的 8 个 webfont 文件 + LICENSE）下到 `public/vendor/`，
   版本与现在**完全一致**（避免行为变化），文件名沿用原样便于日后升级对照
2. `index.html`：外链换成本地 `/vendor/...`；Font Awesome 恢复成普通 `<link>`（本地文件毫秒级，不必再异步，也免掉图标闪烁）
3. Google Fonts 先保留（纯观感、且已经是异步，不阻塞）——要彻底离线再说
4. 验证：构建产物里不再出现 cdnjs / code.jquery / googleapis；浏览器里 `window.jQuery / Chart / jspdf / html2canvas` 都在；图标正常

## 本地验证（真实浏览器 + 构建产物）

| 检查 | 结果 |
|---|---|
| 落盘 | `public/vendor/` 共 2.0MB：jquery-3.6.0 / html2canvas-1.4.1 / jspdf-2.5.1.umd / jspdf-autotable-3.5.31 / chart-3.9.1（第五个库）+ fontawesome/{css/all.min.css, webfonts×8, LICENSE} ✓ |
| 版本 | 与自托管前**完全一致**（避免行为变化）✓；LICENSE 已随 FA 一起放进仓库 ✓ |
| 构建 | `npm run build` 通过；`dist/vendor/**` 原样拷出（8 个 webfont 都在）✓ |
| 外链 | `dist/index.html` 里已无 cdnjs / code.jquery 外链 ✓ |
| 浏览器 · 全局变量 | `jQuery=function, Chart=function, jspdf=object, html2canvas=function`，
`jspdf.jsPDF.API.autoTable=function` ✓（**导出 PDF 的 autoTable 插件也正常**）|
| 浏览器 · 图标 | Font Awesome 已加载（`document.fonts` 里状态 loaded ✓，图标的 font-family = "Font Awesome 6 Free" ✓）|
| 剩下的外网请求 | 只有 7 个 Google Fonts 请求（字体，异步、不影响功能）✓ |

**顺带查出的隐患**：`StockRecords.tsx:640` 的导出走的是 `window.jspdf`（全局）+ CDN 那份 autotable 插件，
npm 里根本没有 `jspdf-autotable` —— 所以这次必须把这两个一起搬，否则自托管后导出会坏。现在已验证
`jsPDF.API.autoTable` 存在 ✓。

## 待用户在生产环境执行

纯前端：`npm run build` + rsync 到 `/var/www/admin/`
（`public/vendor/**` 会被 Vite 原样拷进 dist，所以 rsync 一并带过去）

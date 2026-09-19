# 任务 2026-09-19-whitescreen-hardening

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：网络不好时不再出现「白屏」——启动阶段有加载提示、CDN 不再阻塞首屏、任何渲染异常都有兜底页
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/index.html
  - inventory-system/frontend/src/main.tsx
  - inventory-system/frontend/src/App.tsx
  - inventory-system/frontend/src/components/ErrorBoundary.tsx（新增）
  - docs/tasks/2026-09-19-whitescreen-hardening.md
  - docs/tasks/README.md
- 明确不碰：后端、数据库、其它页面逻辑、CHANGELOG.md、构建产物

## 用户报

"偶尔可能网络不好会出现白屏问题"

## 查到的三个白屏来源

1. **`index.html` 里一堆阻塞的 CDN 资源**（最可能）：
   - `<head>` 里有 9 个外部 `<script src>`（jQuery / html2canvas / jspdf / autotable / Chart.js 来自 cdnjs）
     + Font Awesome CSS（cdnjs）+ 2 个 Google Fonts CSS
   - 全是**阻塞**的：只要其中一个 CDN 慢或连不上，浏览器一直不渲染 → **整页白屏**直到超时
2. **没有任何 ErrorBoundary**：任何组件在渲染时抛错（比如接口返回了意料外的结构），
   React 会把整棵树卸载 → 白屏（没有任何提示）
3. **启动阶段 `RequirePage` 权限未就绪时 `return null`**：网络慢时权限接口要等，
   这段时间页面是**纯空白**（没有任何加载提示）

## 做法

**index.html**
- `#root` 里放一个**内联样式**的启动加载提示（转圈 + "正在加载库存系统…" + 网络慢请刷新的提示）——
  它随 HTML 立刻出现（不用等任何 JS/CSS 下载），React 挂载后自动被替换掉
- 9 个外部脚本加 `defer`（不再阻塞首屏渲染，执行顺序不变）
- Font Awesome / Google Fonts 两个 CSS 改成异步加载（`media="print" onload` + `<noscript>` 兜底）——
  网络慢时先出页面（图标稍后补上），而不是一直白屏

**ErrorBoundary（新增）**
- 捕获渲染期异常 → 显示「页面出错了」+ 错误摘要 + 「重新加载」按钮（并 console.error 留痕），不再是白屏

**App.tsx · RequirePage**
- 权限未就绪时显示居中加载提示（不再是 `return null` 的空白页）

## 本地验证（真实浏览器）

| 检查 | 结果 |
|---|---|
| 启动提示 | 开发服 / 构建产物（`dist/index.html`）里都有 `#boot`（转圈 + "正在加载库存系统…"），
随 HTML 立即渲染（`defer` 保证脚本不阻塞首屏）✓ |
| CDN 不再阻塞 | 9 个外部脚本全部 `defer`；Font Awesome / Google Fonts 改 `media=print onload` 异步 ✓ |
| **兜底页** | 临时加一行"渲染即抛错"（`localStorage.__ZZTEST_CRASH` 触发）→ 页面显示
「页面出错了 / 多半是网络不稳定导致数据没取全… / 重新加载 / 返回首页」+ 错误摘要 ✓（**不再是白屏**）；
清掉开关后刷新恢复正常（110 行数据）✓ 测试代码已还原、未提交 ✓ |
| 权限加载中 | `RequirePage` 不再 `return null`，显示转圈 + "正在加载…" ✓ |

`tsc -b` + `npm run build` 均通过。

## 待用户在生产环境执行

纯前端：`npm run build` + rsync 到 `/var/www/admin/`（无后端/数据库改动）

## 说明 / 还可以再做的

- 这次是"网络不好时不要白屏"：加载有提示、CDN 不阻塞、出错有兜底。
- 真正减少 CDN 依赖的做法是**把这些库（jQuery / Chart.js / Font Awesome / html2canvas / jspdf）改成自托管**
  （现在就 orgchart / pdf-lib / fontkit 是本地的）。要做的话另开一个任务，先确认每个库还在哪里用。
- 2MB 的主包在慢网络下仍然要下载一阵（期间显示的是启动提示，不是白屏）；要更快就得做代码分割，
  那是更大的重构。

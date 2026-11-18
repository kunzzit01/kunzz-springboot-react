# 任务 2026-11-18-react-router-v7

- 状态：已完成（2026-11-18，仅在 task 分支，未合入 main、未部署）
- 目标：后台前端 `react-router-dom` 6.x → 7.18.5+，修复 `npm audit` 2 个 moderate（GHSA-wrjc-x8rr-h8h6：`<Link>`/`useNavigate` 反斜杠开放重定向）。
- 白名单（只允许改这些）：
  - inventory-system/frontend/package.json
  - inventory-system/frontend/package-lock.json
  - inventory-system/frontend/src/utils/safeRedirect.ts
  - inventory-system/frontend/src/pages/Login.tsx
  - inventory-system/frontend/src/pages/MobileLogin.tsx
  - docs/tasks/2026-11-18-react-router-v7.md
- 明确不碰：backend/**（含 backend/static/**）、CHANGELOG.md、其它 task 的文件
- 计划推送分支：task/2026-11-18-react-router-v7（不推 main、不部署）

## 结果

- `react-router-dom` 6.30.6 → **7.18.5**（`react-router` 同步 7.18.5；`@remix-run/router` 移除，新增 `cookie`、`set-cookie-parser` 两个小依赖）。lock 只动了这几项，没有用 `npm audit fix --force`。
- `npm audit --omit=dev`：**0 vulnerabilities**（GHSA-wrjc-x8rr-h8h6 反斜杠开放重定向、GHSA-337j-9hxr-rhxg SSR 那条一起清掉）。
- `npx tsc -b`、`npm run build` 均通过。产物只在本地 `dist/`，**未提交 `backend/static/**`**。
- 代码改动：本项目只用 `<BrowserRouter>` + `<Routes>`，没有 data router、`json`/`defer`、future flags、splat 路由里的相对链接，所以 v7 迁移**不需要改任何路由代码**，导入路径 `react-router-dom` 在 v7 仍可用。
- 运行环境：react-router 7 要求 Node ≥ 20；vite 7 本来就要求 Node ≥ 20.19，VPS 现在能构建说明已满足。

## 跳转目标同源校验（比路由 CVE 更直接的问题）

- `Login.tsx` 登录后用 `window.location.replace(?redirect=)` 整页跳转，原校验只有 `startsWith('/') && !startsWith('//')`。
  `/login?redirect=/\evil.com` 能绕过：浏览器把 `\` 当 `/`，变成 `//evil.com` → 外站。**这条不走 react-router，升级本身修不了。**
- 新增 `src/utils/safeRedirect.ts`：用浏览器 URL 解析器按本站解析，必须仍是本站且路径不以 `//` 开头，否则返回 null 走默认页。
  `Login.tsx`（`?redirect=` 和 `state.from` 两处）、`MobileLogin.tsx`（`?redirect=`）改用它。
- 已用 node 验证：`/\evil.com`、`/\/evil.com`、`\evil.com`、`/<Tab>/evil.com`、`/<换行>/evil.com`、`/a/..//evil.com`、`https://…`、`javascript:` 全部拒绝；`/dashboard`、`/mobile/out?system=j1`、带 hash 的正常路径放行。
- 其它 `navigate`/`<Navigate>`/`<Link>` 目标都是写死的路径；URL 参数（`?system=`）只拼在查询串里，改不了跳转站点。

## 本地回归（2026-11-18，worktree 起 vite 5175 → 本机后端 8081，demo 账号）

- 侧边栏 24 个入口逐个点击：路由全部正确，页面正常渲染，无 React Router 警告、无 JS 报错。
- 非侧边栏路由 15 个（/sot /products /inout /settings /cost /cost/upload /recycle /remark /maintain /menu /branches /dishware_break /staff/add /media/:key）正常；未知路径 → /dashboard。
- 仪表板快捷 `<Link>`、浏览器后退、面包屑/「返回查看」按钮正常；`/dishware?tab=transfer` 旧链接 → /dishware_transfer。
- 登出 → /login；未登录访问 `/kpi?x=1` → 登录 → 回到 `/kpi?x=1`。
- 攻击用例：`/login?redirect=/\example.com` 登录后落在 /dashboard；`/mobile/login?redirect=/\example.com` 忽略参数、显示分店选择；正常 `redirect=/mobile/records?system=j2` 直达；`/m/inout?system=j3` → /mobile/out?system=j3。
- 控制台里大量 404 是 `/uploads/dishware/*.jpg`（照片只在服务器上，本机没有），与本任务无关。

## 不在本任务范围

- `npm audit`（含 dev）仍有 4 个 high：`picomatch` ReDoS（GHSA-fc5q-39xc-vjpf），经 vite → fdir/tinyglobby 引入，只在构建时运行，不进浏览器包。`audit fix --force` 会把 vite 降到 6.2.7，不要用；等 vite 上游更新依赖再处理。

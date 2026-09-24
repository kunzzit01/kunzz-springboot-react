# 任务 2026-09-24-schedule-restaurant-sync

- 状态：已完成（本地已验证，待推送）
- 背景：**侧边栏点 J2 的「员工排班表」，地址栏变成 `?restaurant=J2`，页面仍是 J1**
  （标题写 `员工排班管理系统 - J1`、右上角选择器 J1、表格是 J1 的员工）。`/phone` 同样。
- 根因：`Schedule.tsx` / `Phone.tsx` 的分店只在**挂载那一刻**从 `window.location.href` 读一次
  （`useState(() => ... searchParams.get('restaurant'))`）。侧边栏走 `navigate(path)` 前端路由跳转
  （不刷新页面），路径没变、只有查询串变了，React 复用同一个组件实例 → state 停在 J1，
  取数也一直按 J1 取，于是"URL 是 J2、内容是 J1"。
  仓库里 `RemarkAnalysis.tsx` 已记录过同一类坑（注释：「用 useSearchParams 而不是 window.location…
  必须用响应式来源」）。
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/pages/Schedule.tsx   # 分店改为响应式（useSearchParams 派生）
  - inventory-system/frontend/src/pages/Phone.tsx      # 同上（员工手机记录页同一个 bug）
  - backend/static/                                     # 本任务改了前端源码，重新构建产物（整目录）
  - CHANGELOG.md                                       # 只追加一条本任务记录
  - docs/tasks/2026-09-24-schedule-restaurant-sync.md  # 本登记文件
- 明确不碰：backend/src/**、backend/target/*.jar、AppLayout.tsx、其它页面
- 计划推送分支：main
- 验证记录（2026-09-24 本机，浏览器实测）：
  1. mock API(8081) + `npm run dev`(5174)：排班页 J1 上点侧边栏
     `J2 (PARADIGM MALL) → 员工排班表` → **复现**（url=J2 / title=J1 / 员工 J1-ALICE TAN、J1-BOB LIM）。
  2. 改完再点同一条 → 标题 `员工排班管理系统 - J2`、选择器 J2、员工 J2-CAROL NG、J2-DAVID WONG。
  3. 页内分店选择器 J2→J3→J1 仍正常（`setSearchParams` 写回 URL）。
  4. 手机记录页：路由切 J2 → 标题/选择器变 J2，后退回 J1 也跟随。
  5. **生产包**：`npm run build`（`tsc -b` 通过）→ `cp -rf dist/* backend/static/` → 用静态服务
     + `/api` 代理打开 `index-BlCafDrt.js`，重跑第 1 步 → 正确切到 J2。

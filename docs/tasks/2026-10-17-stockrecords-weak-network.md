# 任务 2026-10-17-stockrecords-weak-network

- 状态：已完成（2026-10-17）
- 开始时间：2026-10-17
- 分支：main
- 目标：先优化总库存的查询与分店切换弱网体验；保留现有最低库存判定、每次切换有预警的分店自动弹窗、权限与导出；本地验证后提交，不推送、不部署。
- 白名单（只允许改这些）：
  - docs/tasks/2026-10-17-stockrecords-weak-network.md
  - docs/tasks/README.md
  - CHANGELOG.md
  - inventory-system/frontend/src/pages/StockRecords.tsx
  - inventory-system/frontend/src/api/index.ts
  - inventory-system/frontend/src/styles/stocklist.css
  - inventory-system/frontend/verify-stockrecords-weak-network.cjs
- 明确不碰：其他页面、后端源码、数据库、生产服务、package.json/package-lock.json、backend/static/**、backend/target/**、他人工作区及索引改动。
- 计划推送分支：main；本任务只本地提交，推送待用户明确要求。

## 基线与问题

- 起始 HEAD：d8c5823。
- 原有非本任务改动：backend/target/inventory-backend-1.0.0.jar、docs/tasks/2026-09-18-per-system-delete-cleanup.md 及未跟踪文件；全程原样保留、不暂存。
- 总库存进页同时请求四个系统的库存汇总、四套最低库存；URL 初始系统与切换分店还可能重复请求。
- 实时刷新已有时间节流，但慢请求未完成时仍可能再次触发；查询失败静默，用户分不清加载、失败与无数据。

## 范围与约束

1. 优先请求当前有权限查看的系统；最低库存独立按当前系统加载，不等其他系统。
2. 相同查询在途复用，切换/卸载时取消过时 GET，响应只更新所属系统，避免乱序串数据。
3. 已成功加载的数据仅作为同系统上次数据保留；明确标记正在更新/失败及重试，不把缓存显示为最新库存。
4. 保留每次切换系统的预警体验；库存与该系统最低库存成功就绪后再判断，失败或旧数据不能触发错误预警。
5. 不改出入库写操作，不增加自动写重试或离线写库，不修改全局超时。

## 本地验证计划

- 复用已安装 puppeteer-core，拦截本地 API 模拟延迟/错误，无需写数据库或访问生产。
- 断言首屏只加载所选系统；快速连续切换的旧响应不覆盖当前系统；实时事件不堆叠在途请求。
- 校验旧数据保留且有更新/失败提示；失败可重试，取消请求不报错；首次失败不显示为无数据。
- 校验每次切回有预警的分店重新弹窗；无预警不弹；预警口径与高亮不变。
- npm run build 编译验证，构建只输出被忽略的前端 dist，不同步到 backend/static。

## 验证结果

- `verify-stockrecords-weak-network.cjs`（puppeteer + 拦截 /api）：21 项全部 PASS
  - 首屏只请求当前分店库存/最低库存（j1/j2/j3 为 0 次）
  - 慢分店（1.5s）切走后请求被客户端取消（XHR abort=1），晚到响应不覆盖当前分店
  - 有旧数据 + 刷新失败：保留旧行 + 「更新失败，当前显示的是上次数据」+ 重试；重试后拿到新数据
  - 首次加载失败：「加载失败 + 重试」，不显示「暂无数据」；重试成功
  - 预警：J2 弹「库存预警 - J2」且口径正确；中央无预警不弹；切回 J2 再次弹；切店重新取最低库存
  - 最低库存接口失败时不弹预警；无未捕获页面异常
- 真实后端冒烟（demo 登录，经 dist + /api 代理）：中央 244 行；切 J3 → 298 行并弹出真实 4 条预警；
  切店只请求对应系统的 `/stock/summary` 与 `/stock/minimum`；无报错。
- `npm run build`（tsc -b + vite build）通过；dist 被 .gitignore 忽略，未同步到 `backend/static/`。

## 已知边界

- 本次只改总库存页；进出货等其他页面未改。
- 实时事件仍会触发一次静默刷新（已有 3s 节流；在途请求会被取消）。
- 未给写操作加自动重试（避免重复入账），也未改全局 20s 超时。

## 回滚

仅回退本任务源码提交并重建前端；不涉及数据回滚。

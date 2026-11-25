# 任务 2026-11-25-kpi-save-race-fix

- 状态：已完成（2026-11-25）
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/pages/KpiEdit.tsx
  - inventory-system/frontend/src/styles/kpiedit.css
  - inventory-system/frontend/src/utils/navGuard.ts
  - inventory-system/frontend/src/components/AppLayout.tsx
  - inventory-system/frontend/src/App.tsx
  - inventory-system/frontend/src/main.tsx
  - backend/src/main/java/com/kunzz/inventory/service/KpiService.java
  - backend/src/main/java/com/kunzz/inventory/mapper/KpiMapper.java
  - backend/src/main/resources/mapper/KpiMapper.xml
  - docs/tasks/2026-11-25-kpi-save-race-fix.md
  - backend/static/
- 明确不碰：其它页面（Kpi.tsx / CostEdit.tsx）、其它后端服务、CHANGELOG.md、其它 tasks 登记文件
- 计划推送分支：main

## 背景（Cindy 报障：KPI 数据 key 完不见）

单体用户即可复现，根因在「保存本月数据」：

1. `saveAll` 循环外的 try/catch —— 一条失败带走整批（31 个串行 POST，任何一次失败后面全不发）
2. `saveAll` 用 `hasData(d) || !!rows[d]` 整月重写，且结束时 `await load()` 用的是点击那一刻的旧 `restaurant`
3. 保存期间店家选择器 / 月份 / 编辑按钮全部可点，导致换店后 state 串店
4. `load()` 无请求序号、不先清空 → 旧响应覆盖新响应
5. 双击 / Ctrl+S 用 state 判空 → 单人能并发两个保存循环
6. 后端 `delete + insert` 非原子 upsert，撞 `UNIQUE KEY date` 会回滚
7. 从「新客/常客」列粘贴整行时 `startIdx = -1` → 数值错位

## 修法

- 后端：`upsertDaily` / `upsertCost`（`INSERT ... ON DUPLICATE KEY UPDATE`），删掉先删后插
- 前端：dirty set 只存改过的天；循环内 try/catch 汇总失败；`savingRef` 锁；`loadSeq` 丢过期响应；保存期间禁用选择器；切换前 confirm；粘贴列补齐并拦错起点

## 风险

`dirtyRef` 只在内存，关标签页未保存改动仍会丢（与改动前一致）。不改表结构、不加审计。

## 追加（2026-11-25 部署后 Cindy/Soon 反馈）

Ctrl+S 保存后行仍停在编辑态（绿色保存图标不变回铅笔），与进出货页不一致：
- `saveAll` 现在把**正在编辑的那天**也纳入保存集合（对齐进出货 `saveAllEdits`）
- 全部成功 → `setEditingDay(null)` 退出编辑态；有失败的天保留编辑态方便直接重试
- 行内按钮保存中显示 `fa-spinner` + title「保存中...」，与进出货一致

### 追加 2：切换店/月份的保存询问改为站内弹窗

`window.confirm` 太生硬，改成站内弹窗：「保存并切换」/「继续编辑」。
为此把 `styles/kpiedit.css` 也加进白名单（新增 `.ke-ask-mask/.ke-ask-card` 等样式）。

### 追加 3：离开本页一定先确认保存

侧边栏菜单是 `div + onClick → go(path)`，不是 `<a href>`，拦点击拦不住，所以在 `utils/navGuard.ts`
开了一个注册点：`AppLayout.go()` 跳转前先问 `runNavGuard(path)`，只有 KPI 上传页注册。
另加两道：站内 `<a href>` 点击拦截、`beforeunload`（刷新/关标签页）。

### 追加 4：改用 data router + useBlocker（覆盖后退键）

`navGuard` 注册点只能覆盖侧边栏 `go()`，<a> 点击要另外拦，后退键拦不住。
改为 `createBrowserRouter(routes)` + `<RouterProvider>`（`App.tsx` 导出 `routes`，`main.tsx` 建 router），
KpiEdit 用 `useBlocker` 一处拦下所有站内跳转（侧边栏 / 链接 / navigate() / 后台前进后退）；
`beforeunload` 只留给出站/刷新/关标签页。`utils/navGuard.ts` 与 AppLayout 的改动随之撤销。

实测（vite preview + puppeteer，mock /api）：
- 改 25 日 → 点「成本报表」→ 弹窗，URL 仍 /kpi/upload
- 「继续编辑」→ 留在原页，输入值 123.00 保留
- 「保存并前往」→ POST /kpi/daily 1 次后跳到 /cost/upload
- 跨文档返回 → 浏览器原生 beforeunload 确认框

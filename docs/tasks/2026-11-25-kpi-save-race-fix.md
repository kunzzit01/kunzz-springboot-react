# 任务 2026-11-25-kpi-save-race-fix

- 状态：已完成（2026-11-25）
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/pages/KpiEdit.tsx
  - inventory-system/frontend/src/styles/kpiedit.css
  - inventory-system/frontend/src/styles/save-guard.css
  - inventory-system/frontend/src/pages/CostEdit.tsx
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

### 追加 5：成本上传页（/cost/upload）同步同一套改法

同一套问题在 CostEdit 全部存在（循环外 catch、按 hasData 重写整月、Ctrl+S 不退编辑态、保存时整列转圈、原生 confirm、无请求序号）。
逐条对齐 KpiEdit：dirty set、单天 try/catch、savingRef/savingDay、loadSeq、
`useBlocker` + `beforeunload`、换店换月弹窗、行内 spinner。
弹窗样式从 kpiedit.css 抽到 `styles/save-guard.css`，两页共引。

实测（vite preview + puppeteer，mock /api）：
- 成本页改 26 日 → 点「KPI 报表」链接 → 弹窗，URL 不变
- 继续编辑 → 值 1.00 保留
- 保存并前往 → **POST /api/kpi/cost 只有 1 次**（不再整月 26 条）→ 跳 /kpi/upload
- KPI 页回归：弹窗正常、按钮仍 140x42、无 JS 错误

### 追加 6：按钮文案

「保存本月数据」→「保存修改」：语义已变成“只提交本次改动”，旧文案会让人以为不动也会重写整月
（成本页点一下就提示「没有需要保存的数据」正是这个误会）。

### 追加 7：【Bug】「保存修改」按钮点了没反应，Ctrl+S 却正常

根因：按钮是 `disabled={saving || loading}`。`loading` 在两段时间为真——打开/换店换月时、**每次保存成功后的刷新尾部**。
浏览器对 disabled 按钮的点击直接丢弃，而 Ctrl+S 走函数调用不受影响 → 表现为“点按钮没反应，Ctrl+S 有反应”。

修法：
1. 按钮只在 `saving` 时禁用（那会儿按钮文字已经是「保存中...」）
2. `loading` 期间点了保存 → `pendingSaveRef` 排队 + 提示「正在加载本月数据，加载完自动保存…」，加载完自动补一次
3. `load()` 收尾改 `finally`，任何提前 return 都不会把 `loading` 卡在 true（否则永远排队）
4. 新增 `editSeqRef`：加载期间用户开始输入 → 丢弃这次加载结果，不冲掉刚敲的值
5. `.btn:disabled` 显式样式（opacity .55 / not-allowed），禁用态一眼可见

实测：加载中点保存 → 可点 + 提示；保存后慢刷新期间改另一天再点 → 刷新结束自动补发第 2 条 POST；输入值保留；无 JS 错误

### 追加 8：【Bug】点了保存、马上切换页面，仍然弹「还有 N 天没保存」

`dirty` 只在每条 POST **成功返回后**才清；保存请求在飞的那 0.3~1s 内点跳转，`useBlocker` 判定为未保存 → 弹窗。
用户视角是“我明明点了保存”。

修法：blocker 的判定加一层——若 `saving` 为真，**先不弹窗**，把这次跳转挂起；
保存结束（`saving` 变 false）后：`dirty` 为空 → 自动 `proceed()` 完成跳转；仍有失败的天 → 才弹窗。

实测（保存故意慢 1.2s）：
- 保存中点链接 → 不弹窗、URL 暂不变
- 保存完成 → 自动跳到目标页（POST 1 次）
- 未点保存就跳 → 仍然弹窗（守卫没失效）

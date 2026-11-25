# 计划：把「保存防丢」措施铺到其它页面

> 任务登记：`docs/tasks/2026-11-25-kpi-save-race-fix.md`（KPI / 成本两页已完成）
> 本文只做盘点与排期，不含代码改动。

## 一、今天在 KPI / 成本两页落地的 7 项措施（可复用清单）

| 编号 | 措施 | 一句话目的 | 落点 |
|---|---|---|---|
| M1 | **脏行集合** `dirtyRef` | 只提交用户真正改过的行，杜绝「按整表快照重写」 | 前端页面 |
| M2 | **逐行 try/catch + 失败清单** | 一条失败不带走整批；失败的行留在脏集合里可重试 | 前端页面 |
| M3 | **保存锁用 ref + `savingDay`** | 防双击并发；只让当前行转圈，不整列转 | 前端页面 |
| M4 | **`loadSeq` + `editSeq`** | 过期响应丢弃；加载期间输入的值不被冲掉 | 前端页面 |
| M5 | **离开拦截** `useBlocker` + `beforeunload`，保存中挂起后自动放行 | 有未保存数据不许静默离开 | 前端页面（依赖 data router，已全局就绪） |
| M6 | **禁用态可见 / 加载中点保存要排队** | 不再出现「点了没反应」 | 前端页面 + 共用 CSS |
| M7 | **后端按唯一键原子 upsert**（替代 delete+insert） | 并发写同一天不撞唯一键回滚 | 后端 Mapper |
| M8 | **按钮文案 = 实际语义**（「保存修改」） | 用户不再误以为“整月重写” | 前端页面 |

现有公共件（已入库，直接复用）：

- `inventory-system/frontend/src/styles/save-guard.css` — 离开确认弹窗样式（`.ke-root .ke-ask-*`）
- 弹窗 JSX 目前是两页各抄一份（约 15 行），铺到第 3 个页面前建议抽成
  `components/SaveGuardDialog.tsx`（props：`days/blocked/onKeep/onSaveGo`）

---

## 二、页面盘点（按风险排序）

判断依据：有没有「多行编辑 + 批量保存 + 循环内 await」。

### P0 — 会造成数据丢失/重复，优先

| 页面 | 路由 | 现有问题 | 需要的措施 |
|---|---|---|---|
| `StockSot.tsx` | `/sot` | `saveAll` 的 `catch` 在循环外（`368-392`）。第 3 行失败时，`setNewRows([])` 不执行 → 前 2 行已入库但还留在表单里，**再点一次保存就重复插入** | M1 M2 M3 M4 M5 |
| `StockInout.tsx` | `/inout` | 批量保存新行同样是循环外 catch；失败后整批留在列表里 → 重试重复写库存（库存类页面，重复=账不平）；无离开拦截 | M2 M3 M4 M5 |
| `Price.tsx` | `/price` | `saveNewRows`（`183-220`）循环外 catch；失败后 `setNewRows([])` 不执行 → 重试重复写价 | M1 M2 M3 M5 |
| `Schedule.tsx` | `/schedule` | 一次 PUT 提交整月（原子，还好），但**多人同时排班会互相覆盖**；`window.confirm('保存 N 个更改')` 是保存确认，不是离开拦截；已有 Ctrl+S 与 modifiedRef（形态最接近目标） | M4 M5（+ 覆盖策略要业务确认） |

### P1 — 交互体验问题，不会直接丢数据

| 页面 | 路由 | 现有问题 | 需要的措施 |
|---|---|---|---|
| `StockProducts.tsx` | `/products` | 批量保存已做逐行失败收集（`730-763`，写得好），差：无离开拦截、双击防护用 state、`window.confirm` 有 6 处 | M3 M4 M5 |
| `Dishware.tsx` / `DishwareBreak.tsx` / `DishwareTransfer.tsx` | `/dishware*` | 多行编辑 + `window.confirm` 共 9 处；循环内 await 保存；未做失败隔离 | M1 M2 M3 M5 |
| `Qna.tsx` / `Evaluation.tsx` | `/qna`、`/evaluation` | 单表单/多行评分保存，无脏行概念 | M3 M6 |
| `Suppliers.tsx` | `/suppliers` | 循环内 await + 5 处 confirm | M2 M3 |
| `Settings.tsx` / `Phone.tsx` | 设置类 | 单表单，风险低 | M6 |

### P2 — 只做一致性

`RemarkAnalysis.tsx`、`Jobs.tsx`、`MobileOut.tsx`、`MobileRecords.tsx`、`StockRecords.tsx`
—— 要么是纯查询页（Ctrl+S 只是刷新），要么已经是单条保存（失败弹 toast），
只补 M5/M6 即可，或维持现状。

---

## 三、建议实施顺序（每批可独立上线、可独立回滚）

**批次 1：抽公共件 + 一个 P0 页面验证套路**
1. 抽 `components/SaveGuardDialog.tsx`，KPI / 成本两页改用它（纯重构，行为不变，用现有 e2e 脚本回归）
2. 抽 `utils/useRowSave.ts`? —— **不做**。两页的字段/校验差异大，硬抽会比复制更复杂
3. `StockSot.tsx` 全套 M1/M2/M3/M4/M5
4. 验证：e2e 脚本断言「3 行里第 2 行失败 → 第 1、3 行已存、第 2 行留在表单、重试不重复」

**批次 2：库存类（重复写入影响账目）**
`StockInout.tsx` → `Price.tsx`

**批次 3：主数据/排班**
`StockProducts.tsx` → `Dishware*` → `Schedule.tsx`（排班要先定「多人同时排班谁赢」）

**批次 4：其余 P1/P2 只补 M5/M6**

---

## 四、铺开前必须确认的三件事

1. **「清成 0」与「删除记录」的语义**
   现在 KPI/成本：清成 0 = 写一条 0 值行；删除用垃圾桶。
   其它页面（库存/价格）如果沿用，会不会在报表里出现 0 值垃圾行？要定一条统一规则。
2. **失败重试的幂等性**
   M2 解决「一批全废」，但**重试重复插入**需要后端配合：
   创建类接口（`createSot`、`createStockInout`、价格保存）最好能按业务唯一键 upsert，
   或前端改「只重试失败行」——选一个。
3. **多人同时编辑同一张表谁赢**
   排班、价格是多人协作页面。KPI 靠「只写脏行」把影响面压到最小，
   但同一格被两人改仍是后写覆盖。要不要加 `updated_at` 乐观锁（保存时带上读到的版本，冲突则提示刷新）？

---

## 五、每批的验收手法（今天已经验证可用）

用 `vite preview` + `puppeteer-core`（`inventory-system/frontend/node_modules` 里已有）：

1. 拦截 `/api/**` 返回固定 fixture
2. `localStorage.inv_token` 塞一个伪造 JWT（`exp` 在未来）跳过登录
3. 断言三类结果：
   - POST 次数（证明不再整批重写）
   - 失败注入（某天返回 500）后其余行仍保存
   - 有未保存数据时点链接 → `.ke-ask-card` 出现、URL 不变
4. 截图留档

今天用这套跑出的结论都在 `docs/tasks/2026-11-25-kpi-save-race-fix.md` 的「实测」段里。

---

## 六、工作量粗估

| 批次 | 页面数 | 预估 | 风险 |
|---|---|---|---|
| 批次 1 | 3（含重构） | 半天 | 中（动已上线的 KPI/成本两页，需回归） |
| 批次 2 | 2 | 半天 | **高**（库存页面，写错直接影响账目） |
| 批次 3 | 5 | 1 天 | 中（排班含业务确认） |
| 批次 4 | 8 | 半天 | 低 |

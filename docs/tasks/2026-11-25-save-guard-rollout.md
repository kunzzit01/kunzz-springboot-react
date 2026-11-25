# 任务 2026-11-25-save-guard-rollout

- 状态：进行中（批次 1 完成）
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/components/SaveGuardDialog.tsx
  - inventory-system/frontend/src/styles/save-guard.css
  - inventory-system/frontend/src/pages/KpiEdit.tsx
  - inventory-system/frontend/src/pages/CostEdit.tsx
  - inventory-system/frontend/src/pages/StockSot.tsx
  - inventory-system/frontend/src/pages/StockInout.tsx
  - inventory-system/frontend/src/pages/Price.tsx
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - inventory-system/frontend/src/pages/DishwareTransfer.tsx
  - docs/tasks/2026-11-25-save-guard-rollout.md
  - docs/PLAN_2026-11-25-save-guard-rollout.md
  - backend/static/
  - scripts/check-static.sh
  - .githooks/pre-commit
- 明确不碰：其它页面、后端 Java、CHANGELOG.md
- 计划推送分支：main

## 批次 1（本次）

1. 抽出 `components/SaveGuardDialog.tsx`（portal 到 body），KPI / 成本两页改用它，删除各自的内联弹窗
2. `save-guard.css` 选择器去掉 `.ke-root` 前缀、补 `.ke-ask-btn` 自样式（portal 后拿不到页面 `.btn`）
3. `StockSot.tsx` 上「保存防丢」措施：
   - M2 逐行 try/catch：成功一行摘一行，失败的行留在表单 → **重试不再重复插入**
   - M3 `savingRef` + `savingKey`（只让当前行转圈）
   - M4 `load` 加请求序号（实时推送会并发触发）
   - M5 `useBlocker` + `beforeunload` + 弹窗
   - 校验不通过时明确提示「有 N 行未填写完整」，不再静默过滤

## 实测（vite preview + puppeteer，mock /api）

- 3 行（AAA/BBB/CCC），让 BBB 返回 500 → `已保存 2 条，1 条失败…可重试`，表单剩 1 行（BBB）
- 再点保存 → 只 POST BBB，AAA/CCC 不重复 ← 修复前会整批重发
- 新增一行未保存 → 点侧边栏 → 弹窗出现、URL 不变
- JS 错误：无

## 批次 2（本次）：进出货 / 价格对比

### `StockInout.tsx`（/inout）
- **M2（关键）**：批量保存新行改成逐行 try/catch —— 成功一行摘一行，`savedKeys` 只摘成功的；
  行内校验失败（单价/备注编号）由 `return` 改为 `failedRows.push + continue`，不再中断整批
  → 修复「中途失败后重试把已入库的行再插一遍 → 库存翻倍」
- M3：`savingRef`（saveNewRows / saveEdit / saveAllEdits 三处入口）
- M5：`useBlocker` + `beforeunload` + SaveGuardDialog（未保存 = 新增行数 + 编辑中行数）；
  「保存并前往」先存编辑行再存新增行，全部成功才跳转

### `Price.tsx`（/price）
- M2：`saveNewRows` 逐行隔离，只摘成功行，失败行留表可重试；提示带失败行名与原因
- M3：`savingRef`
- M5：同上（未保存 = 有名字的新增行 + 正在编辑的行）

### 验证情况（重要，别当成全验过）
- `tsc -b` + `vite build` 通过；`/price` 与 `/inout` 页面渲染无 JS 错误
- **进出货**：只做了代码级改造，未跑 UI 驱动 e2e（该页新增行需要货品/价格下拉联动，脚本成本高）
- **价格对比**：同样只到「页面渲染正常」；逐行失败隔离与 StockSot 同构（StockSot 已 e2e 证明）
- 上线后建议手工验一次：进出货填 2 行（第 2 行故意填无效单价）→ 保存 → 第 1 行应入库且从表单消失、第 2 行留着；再点保存只重试第 2 行

## 事故：提交里 index.html 与 assets 不配套（2026-11-25 下午）

`4756944` 我方失误：同步产物时把 index.html 的包名替换成**中间产物** `index-DLajQWp5.js`，
而 assets 拷的是最终产物 `index-CGaW7zFz.js` → 仓库自身不一致 → 部署后全站白屏 + 控制台 404。

修复与防呆：
1. `backend/static/index.html` 改回 `index-CGaW7zFz.js`（与 assets 一致）
2. 新增 `scripts/check-static.sh`：校验 index.html 引用的每个 `/assets/*` 都真实存在
3. `.githooks/pre-commit` 追加一段：提交里含 `backend/static/index.html` 时自动跑上面的脚本，不配套直接拒绝提交

## 批次 3（本次）：货品种类 / 碗碟转卖

### `StockProducts.tsx`（/products）
- M3：`savingRef`（saveEdit / saveNewRow / saveAll 三处入口）
- M5：`useBlocker` + `beforeunload` + SaveGuardDialog（未保存 = 新增行 + 编辑中行）
- 逐行失败收集本来就是对的（`730-763`），未改

### `DishwareTransfer.tsx`（/dishware_transfer）
- M2：`batchSaveTransfers` 逐行 try/catch —— 成功一行从草稿摘一行，失败的行留草稿；
  提示「已保存 N 条，M 条失败（编号：原因），失败的行仍留在草稿里可重试」
  → 修复「中途失败后重试重复插入转卖记录」

### 验证
- `tsc -b` + `vite build` 通过；`/products`、`/dishware`、`/dishware_break`、`/dishware_transfer` 四页渲染无 JS 错误
- 未做 UI 级 e2e（碗碟/货品页都需要上传图片与弹窗联动，脚本成本高）

### 待办
- `Schedule.tsx`（排班）：一次 PUT 提交整月，**多人同时排班会互相覆盖** —— 需要先定「谁赢」策略
  （后写覆盖 / updated_at 乐观锁 / 冲突提示），再动代码
- `Dishware.tsx` / `DishwareBreak.tsx` 主要是弹窗单条保存，只在弹窗内有草稿；是否需要离开拦截待定

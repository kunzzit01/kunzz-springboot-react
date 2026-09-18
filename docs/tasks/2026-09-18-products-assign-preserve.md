# 任务 2026-09-18-products-assign-preserve

- 状态：已完成（2026-09-18）
- 开始时间：2026-09-18
- 分支：main
- 目标：单系统页（中央/J1/J2/J3）保存货品时不再把「系统分配」覆盖成当前系统；总览之外的页面不再展示该列
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - docs/tasks/2026-09-18-products-assign-preserve.md
  - docs/tasks/README.md
- 明确不碰：
  - backend/**（后端是"只更新请求携带的字段"，本身没错）
  - 其它任何页面
  - CHANGELOG.md、README.md、AGENTS.md
  - 构建产物（按 AGENTS.md 第 4 节，VPS 自己构建）

## 问题（数据被覆盖）

用户在**中央**页给货品输入单价保存后，总览里该货品的「系统分配」只剩 `Central`，
J1/J2/J3 全部丢失 → 三家分店从此看不到这个货品（分店的进货/出货也都选不到它）。

## 根因

前端保存时**强制**用当前页面的系统覆盖 `system_assign`（`StockProducts.tsx`）：

```ts
// doSaveEdit   保存编辑行（第 551 行）
await updateStockProduct(id, { ...d, system_assign: system === 'overview' ? (d.system_assign || '') : currentSys.value, ... })

// doSaveNewRow 新增行落库（第 601 行）
await createStockProduct({ ...r, system_assign: system === 'overview' ? (r.system_assign || '') : currentSys.value, ... })
```

- 在总览：用行自己的值 ✓
- 在中央/J1/J2/J3：**一律写成 `currentSys.value`**（当前页的系统）→ `Central,J1,J2,J3` 变成 `Central` ✗

后端没错：`StockProductService.update` 只更新请求里实际携带的字段，是前端把错值塞进去了。

**为什么看不出问题**：单系统页那列显示的是 `currentSys.value`（当前页系统名）而不是真实分配，
还挂着「仅总览可设置系统分配」的提示——所以那格本来就是"假"的，保存后假值被写成了真值。

## 改动

1. **保存时保留原值**（改 2 处）：`system_assign: d.system_assign || ''` / `r.system_assign || ''`
   - 编辑草稿 `drafts[id]` 里存的是整行（`startEdit` 的 `{...r}`），带的就是真实分配 ✓
   - 新增行在单系统页由 `addRow` 预置成当前系统（第 509 行），保留原值行为不变 ✓
   - 总览那边本来就传自己的值，不变 ✓
   - 这样一来「仅总览可设置系统分配」才真正成立：单系统页既不能设、也不会改
2. **总览之外不展示「系统分配」列**：表头、新行单元格、数据行单元格三处按 `system === 'overview'` 条件渲染
   （与既有的「位次」列同一套写法）。列数不变：总览无「位次」有「系统分配」，单系统页反之，都是 12 列，
   所以「暂无数据」的 `colSpan={12}` 不用改。

## 历史数据

被覆盖掉的分配**无法从数据里还原**：`stock_data_backup` 是另一种结构的旧备份（没有 system_assign 列），
也没有别的历史快照。当前分布是 4 系统 69 条 / 3 系统 22 条 / 2 系统 26 条 / 单系统 493 条
（其中 `Central` 单系统 428 条）。要恢复只能由用户点名（「这个货品应该在 J1+J2+J3」）后按名单改回。

## 本地验证（2026-09-18，真实浏览器操作）

⚠️ 验证时发现本机 **8081 被另一个会话的 mock 服务器占用**（`%TEMP%\kunzz-mock\mock-server.js`，
同时还占着 5174/5175），没有去动它：改用**自己的后端跑 8082 + 一份临时 vite 配置**（代理指向 8082，
dev server 落在 5176）做验证，测完把临时配置删掉、进程全部关掉。仓库里没留下临时文件。

用 `Central,J1,J2,J3` 的 **DI 0001（1/7 CUT NORI）** 做测试（正是用户截图里那条）：

| 场景 | 结果 |
|---|---|
| **中央页**表头 | 已无「系统分配」列（序号/编号/名字/规格/单价/类型/供应商/申请人/冰箱分类/**位次**/状态/操作）|
| 在**中央页**把 DI 0001 单价改成 9.99 并保存 | 「记录已保存」；库里 `system_assign` **仍是 `Central,J1,J2,J3`** ✓（改前会被削成 `Central`）|
| 四系统货品总数 | 前后都是 **69 条**，没有货品掉分配 |
| **总览**页表头 | 「系统分配」列在；DI 0001 那格 = **`Central,J1,J2,J3`** ✓ |

测试改的单价已还原为原来的空值，`price IS NOT NULL` 的货品仍是 0 条。

## 待用户在生产环境执行

`npm run build` → rsync 到 `/var/www/admin/`（VPS_DEPLOY 第 1.5 节）。纯前端改动，不用动数据库。

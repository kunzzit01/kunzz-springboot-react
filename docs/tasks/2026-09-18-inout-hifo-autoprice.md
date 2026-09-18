# 任务 2026-09-18-inout-hifo-autoprice

- 状态：已完成（2026-09-18）
- 开始时间：2026-09-18
- 分支：main
- 目标：出货时单价自动带出 HIFO 最高价那一层，不用每次手点下拉
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/StockInout.tsx
  - docs/tasks/2026-09-18-inout-hifo-autoprice.md
  - docs/tasks/README.md
- 明确不碰：
  - backend/**（价格层接口已按价格降序返回，前端拿来即用）
  - CHANGELOG.md
  - README.md
  - AGENTS.md
  - 其它任何页面
  - 构建产物（按 AGENTS.md 第 4 节，VPS 自己构建）

## 问题

出货时单价必须从下拉里手选一次，哪怕那个货品**只有一个价格层**（截图场景：唯一选项 32.000 库存 7，
明明没得选，还是要点一下）。数量填了、货品选了，价格空着。

## 现状（为什么没自动填）

出货行是 `priceMode: 'batch'`，单价格子渲染成价格下拉：

- `handleOutQty` 只做三件事：切 batch 模式、按数量重新拉价格层、算 HIFO 拆行提示 —— **从不选中任何价格**
- `onPickProduct` / `onPickCode` 的出货分支把单价**清空**（`price: ''`）后进入下拉模式
- 后端 `price-stock` / `price-batches` 都是 `ORDER BY price DESC`（见 `StockEditMapper.xml`），
  所以列表**第一条就是 HIFO 最高价那层**，前端 `refreshHifoSplitHint` / `applyHifoSplit` 也正是这么用的（`batches[0]`）

结论：HIFO 的"最高价先出"只用来算拆行提示，没有用来填价格。

## 改动（1 个 helper + 4 处调用）

新增 `autoPickHifoPrice(list, qty)`：`need > 0` 且 `list[0].available_stock >= need` → 返回 `list[0].price`；
否则返回 `null`（不填）。

| 位置 | 改动 |
|---|---|
| `handleOutQty`（新增行·填出货数量）| 价格层加载回来后，**该行还没手选过价格**才自动带价 |
| `onPickProduct` 出货分支 | 换货品后旧价失效 → 直接带新货品的最高价 |
| `onPickCode` 出货分支 | 同上 |
| `applyProductToEdit` 出货分支（编辑行换货品）| 同上 |

**两条刻意保留的边界**：

1. **用户手选过就不覆盖**：`row.price` 非空时一律不自动改（避免把用户故意选的低价层冲掉）。
2. **数量超过最高层库存时仍然不自动填**：因为后端是「按货品+价格」逐层校验库存的
   （`StockService.java:237`，不够直接报 `库存不足！可用库存: 7`），这种数量本来就**必须拆行**
   （7@32 + 3@下一档），该选哪几档属于要用户决策的事，维持现在的「请选择价格 + HIFO 拆 N 行」按钮。

编辑行改数量（`handleEditOutQty`）不动：那条记录已经有存好的价格，跟上次进货编辑一样按"保留原值"处理。

## 本地验证（2026-09-18，真实浏览器操作）

测试货品 `MILD AMERICAN MUSTARD`（编号 S 0020，两个价格层：16.44 库存 5 / 16.00 库存 3）：

| 场景 | 结果 |
|---|---|
| 先填出货数量 1，再选货品 | 单价**自动带出 16.44**（最高价那层），总价 RM 16.44 |
| 先选货品（不填数量）再填数量 | 同样自动带出 16.44 |
| 数量填 9 / 7（超过最高层库存 5）| 不自动改价；「HIFO 拆 2 行」按钮正常出现 |
| 点「HIFO 拆行」（数量 7）| 正确拆成 5@16.44（RM 82.20）+ 2@16.00（RM 32.00）|
| 手动改选低价层 16.00 后再改数量 | 单价**保持 16.00 不被覆盖** |
| 端到端保存 | 成功，落库 单价 16.44 / 出货 1（测试记录已删除，库存已还原）|

> 附带确认：出货行的「收货人」仍需手填（未填时保存报「请确保所有行都填写了货品名称、规格单位和收货人」）——
> 这是原有行为，与本次改动无关，没有动它。

## 待用户在生产环境执行

`npm run build` → rsync 到 `/var/www/admin/`（VPS_DEPLOY 第 1.5 节）。不用重建后端、不用动数据库。

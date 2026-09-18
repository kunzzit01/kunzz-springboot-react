# 任务 2026-09-18-branch-remark-codes

- 状态：进行中
- 开始时间：2026-09-18
- 分支：main
- 目标：货品备注编号支持分店 —— 分店台账各自记编号，货品备注页按系统看各自的数据
- 白名单（只允许改这些文件）：
  - add_new_tables.sql
  - backend/src/main/java/com/kunzz/inventory/controller/StockController.java
  - backend/src/main/java/com/kunzz/inventory/controller/StockEnhanceController.java
  - backend/src/main/java/com/kunzz/inventory/mapper/StockEditMapper.java
  - backend/src/main/java/com/kunzz/inventory/mapper/StockInoutMapper.java
  - backend/src/main/java/com/kunzz/inventory/mapper/StockRemarkMapper.java
  - backend/src/main/java/com/kunzz/inventory/service/StockEditService.java
  - backend/src/main/java/com/kunzz/inventory/service/StockRemarkService.java
  - backend/src/main/java/com/kunzz/inventory/service/StockService.java
  - backend/src/main/resources/mapper/StockEditMapper.xml
  - backend/src/main/resources/mapper/StockInoutMapper.xml
  - backend/src/main/resources/mapper/StockRemarkMapper.xml
  - inventory-system/frontend/src/api/index.ts
  - inventory-system/frontend/src/pages/RemarkAnalysis.tsx
  - inventory-system/frontend/src/pages/StockInout.tsx
  - docs/tasks/2026-09-18-branch-remark-codes.md
  - docs/tasks/README.md
- 明确不碰：
  - 其它任何文件
  - CHANGELOG.md、README.md、AGENTS.md
  - 构建产物（按 AGENTS.md 第 4 节，VPS 自己构建）

## 问题

用户反馈「货品备注：所有分店都需要这个页面功能，目前只有中央有」。查下来是三件事：

1. **数据层**：`remark_number` / `product_remark_checked` 两列**只在中央表 `stockinout_data` 上**，
   三张分店台账表（`j1/j2/j3stockedit_data`）都没有 → 分店进出货填了编号也无处可存（静默丢弃）
2. **后端写死中央**：备注分析、备注编号下拉（`remark-codes` / `remark-code-options`）、
   出货「有在库编号必须填」的校验、编号自动生成 —— 全部只查 `stockinout_data`
3. **入口**：备注页前端其实已经支持 `?system=`，但页头的系统是个**静态按钮**（不能切），
   侧栏链接也不带 system → 点进去永远落在中央

## 改动

**SQL（第 9 节，幂等）**：给 `j1/j2/j3stockedit_data` 各加 `remark_number VARCHAR(50)`
+ `product_remark_checked TINYINT(1)`。分店从此有自己的编号序列（各自从 1 开始，互不干扰）。

**后端**：把备注相关的取表统一成"按系统"（沿用仓库既有的 `${table}` 白名单写法，与
`availableStockBranch`、`minimumTable` 同一套路）：

| 位置 | 改动 |
|---|---|
| `StockInoutMapper`（3 个查询）| 加 `table` 参数：`remarkCodePool` / `countInStockRemarkNumber` / `countRemarkNumberInStock` |
| `StockEditMapper`（2 个查询）| 同上：`remarkCodes` / `remarkCodeOptions` |
| `StockEditService` | 两个方法带 `system`，用既有的 `stockTable(system)` |
| `StockRemarkMapper/Service` | 备注分析 `analysisRows(table)`；`analysis(system)` |
| `StockService` | 新增 `remarkTable(system)`；生成/校验按系统；**场景 B 分店本店进出货写入备注**；**场景 A 中央调拨把编号继承给分店入库行** |
| `StockInoutMapper.xml` | `insertBranch` / `updateBranch` 带上备注两列 |
| Controller | 三个接口加 `system` 参数（可选，省略按中央）|

**前端**：备注页的取数带 `system`，页头那个静态系统按钮改成**可切换的下拉**（复用页面既有的
`view-selector` 样式）；进出货页的编号下拉与校验不再限定中央（一律按当前系统查）。

## 已知边界（用户需知晓）

1. **历史数据没有编号**：分店表这两列是新加的，过去的进出货记录没有编号
   → 分店备注页初期只显示**新发生**的带编号记录；中央的数据不受影响。
2. **手机版出货不记编号**：手机版（电话版）出货走的是另一条写入路径，没有编号输入
   → 分店如果用手机版出掉带编号的货，编号的剩余量不会自动扣减。中央一直是这个行为（手机版归分店用）。
   需要的话后续可以单独做。
3. **分店的编号与中央各自独立**：同一个货品在中央是 `A5-061`，调拨到 J1 后 J1 记录里也是
   `A5-061`（继承），但 J1 自己进货生成的是 J1 自己的序列 —— 两边的序号可能重名，靠系统区分。

## 待用户在生产环境执行

1. `git pull` → 在 live 库跑 `add_new_tables.sql`（第 9 节，幂等）
2. 重建后端 + 前端

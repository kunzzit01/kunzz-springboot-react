# 任务 2026-09-18-per-system-fields

- 状态：已完成（2026-09-18）
- 开始时间：2026-09-18
- 分支：main
- 白名单（只允许改这些文件）：
  - add_new_tables.sql
  - backend/src/main/java/com/kunzz/inventory/mapper/StockDataSystemMapper.java
  - backend/src/main/resources/mapper/StockDataSystemMapper.xml
  - backend/src/main/java/com/kunzz/inventory/mapper/StockProductMapper.java
  - backend/src/main/resources/mapper/StockProductMapper.xml
  - backend/src/main/java/com/kunzz/inventory/mapper/MobileStockMapper.java
  - backend/src/main/resources/mapper/MobileStockMapper.xml
  - backend/src/main/java/com/kunzz/inventory/mapper/PriceChangeLogMapper.java
  - backend/src/main/resources/mapper/PriceChangeLogMapper.xml
  - backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
  - backend/src/main/java/com/kunzz/inventory/service/StockSummaryService.java
  - backend/src/main/java/com/kunzz/inventory/service/MobileStockService.java
  - backend/src/main/java/com/kunzz/inventory/service/FreezerCategoryService.java
  - backend/src/main/java/com/kunzz/inventory/repository/StockDataRepository.java
  - backend/src/main/java/com/kunzz/inventory/controller/StockEnhanceController.java
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - inventory-system/frontend/src/pages/StockInout.tsx
  - inventory-system/frontend/src/pages/StockRecords.tsx
  - inventory-system/frontend/src/api/index.ts
  - docs/tasks/2026-09-18-per-system-fields.md
  - docs/tasks/README.md

> **追加 `FreezerCategoryService.java` 的原因（动手后才发现）**：冰箱分类字典的
> 「改名 / 删分类 / 用量统计」原来是打 `stock_data.freezer_category`（
> `findByFreezerToken` / `updateFreezerOnly` / `freezerUsageGroups`）。
> 这三件事必须跟着改到新表，否则改名会静默失效、用量统计会读到过期数据。
> 那三个 SQL 一并搬到 `StockDataSystemMapper`（按系统存的三件套集中在一个 mapper 里）。

- 明确不碰：
  - stock_data 表里旧的三个列（保留、不再读写，留回滚余地；**不做任何删除/覆盖**）
  - 台账表（进出货单价本来就按分店分表）、其它页面
  - CHANGELOG.md、README.md、AGENTS.md
  - 构建产物（按 AGENTS.md 第 4 节，VPS 自己构建）

## 问题

`stock_data` 里 `freezer_category` / `freezer_position` / `price` 都是**一行货品一个值、与系统无关**的列
（`system_assign` 是唯一带系统维度的字段）。三个读取方（总库存 `productFreezerMap()`、进货默认单价
`defaultPrice(name,code)`、手机版区域筛选的子查询）都只按"货品名"取这一份，所以中央页改了、分店全跟着变。

## 方案（用户已确认）

新建按系统存值的表 `stock_data_system`（照 `stock_minimum_settings` 的先例：按系统一行 + 联合唯一键），
三个字段都放进去。

**关键安全点**：初始化时把现有三列的值**按每个货品已分配的系统**复制进新表 ——
所以部署完每个系统看到的还是原来那一套，直到你到分店页分别设置。位次现在全 NULL，复制过去也是 NULL。

## 本地验证（2026-09-18，API + 真实浏览器 + 查库）

| 验证点 | 结果 |
|---|---|
| 中央页保存（位次5/分类TESTC/单价2.6666，带 `system=central`）| 只有 central 那一行变；**j1/j2/j3 原值未动** ✓ |
| J1 页保存（位次3/分类TESTJ1/单价9.99，带 `system=j1`）| 只有 j1 那一行变；central 仍是 5/TESTC/2.6666 ✓ |
| 进货默认单价 `default-price` | central → 2.6666；j1 → 9.99；j2 → null ✓ |
| 中央视图 / J1 视图列表 | 各取自己那套（2.6666/TESTC/5 与 9.99/TESTJ1/3）✓ |
| **总览**（只读展示 4 套）| 单价列 `中央 - · J1 - · J2 2.6666 · J3 -`；分类列 `中央 SBDI-1 · J1 SBDI-1 · J2 SBDI-2 · J3 SBDI-1`；均只读 ✓ |
| 总库存 summary（排序数据来源）| central → TESTC/5；j1 → TESTJ1/3 ✓ |
| 改价日志 | 新记录带 `stock_system`（central: 2.6666→3.5 / j1: 9.99→11.25）；按系统查询各见自己那条 ✓ |
| 手机版出货区域筛选 | J2 显示 SBDI-2、J1 显示 SBDI-1 ✓ |
| 冰箱分类字典 | 新建→赋给中央→改名（只动中央那行）→删除（清引用）全通；用量按**货品**去重 ✓ |
| SQL 补丁 | 建表 + 按已分配系统初始化（central 511 / j1 108 / j2 91 / j3 177 行）；**跑第二遍不重复插入** ✓ |

> **过程中自己引入又抓出来的一个 bug**（值得记）：改价日志一开始没写进库 —— 因为我把
> 「取改价前旧价」放在了"写新价"之后，读到的就是刚写进去的新价 → 判定"价格未变"→ 不记录。
> 这正是代码注释里 9/3 那起事故的同一类坑（update 后才 findById）。现在旧价在写之前取好、
> 作为参数传进 `logPriceChange`，结构上防住再犯。

测试数据已全部还原（DI 0001 的 4 套恢复 SBDI-1/0/空、测试分类删除、测试改价日志清空）。

## 待用户在生产环境执行

1. `git pull` 拿到新的 `add_new_tables.sql`
2. 在 live 库跑补丁（幂等：建表 + 按现分配复制，**无删除/覆盖**）
3. 重建后端 + 前端

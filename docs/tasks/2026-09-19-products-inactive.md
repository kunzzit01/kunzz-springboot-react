# 任务 2026-09-19-products-inactive

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：货品种类加「停用（inactive）」——停用后不出现在**进出货货品下拉 / 总库存 / 手机版出货列表**；**还有库存的不允许停用**
- 白名单（只允许改这些文件）：
  - add_new_tables.sql（第 12 节：stock_data_system 加 active 列）
  - backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
  - backend/src/main/java/com/kunzz/inventory/service/StockSummaryService.java
  - backend/src/main/java/com/kunzz/inventory/service/MobileStockService.java
  - backend/src/main/java/com/kunzz/inventory/controller/StockEnhanceController.java
  - backend/src/main/java/com/kunzz/inventory/service/StockEditService.java（进出货货品/编号下拉按系统过滤）
  - backend/src/main/java/com/kunzz/inventory/mapper/StockDataSystemMapper.java
  - backend/src/main/resources/mapper/StockDataSystemMapper.xml
  - backend/src/main/resources/mapper/StockProductMapper.xml
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - docs/tasks/2026-09-19-products-inactive.md
  - docs/tasks/README.md
- 明确不碰：其它页面逻辑、CHANGELOG.md、构建产物

## 用户要求（截图：货品种类 J1 页 + 进出货页的货品下拉）

"货品种类我添加 inactive 功能 for 那些不想让他出现在我进出货的货品选项栏和总库存展示；
如果该货品还有货品就无法去 inactive"

## 用户确认的四个设计点

| 问题 | 选择 |
|---|---|
| 按系统还是全局 | **按系统**（与单价/冰箱分类/位次同一套：stock_data_system 里各存一份） |
| "还有库存就不允许停用"的库存口径 | **按当前系统**（当前系统净库存 ≠ 0 就拦下） |
| 停用货品在总库存 | **彻底不显示** |
| 其它页面 | **只隐藏"选项类"入口**：进出货下拉 / 总库存 / 手机版出货列表隐藏；最低库存设置、货品备注、价格对比照常显示 |

## 设计要点

- **数据**：`stock_data_system` 加 `active TINYINT(1) NOT NULL DEFAULT 1`（按系统）；
  **没有该系统的行 = 启用**（所以不用迁移，历史数据默认全部启用）
- **谁能停用**：需要「批准」权限（canApprove）——与刚做的"删除按钮"同一条规则；后端也校验
- **库存校验**：停用前查**当前系统**的净库存（与总库存同一口径：SUM(in)−SUM(out)，排除软删）
  ≠ 0 → 拒绝并提示当前库存；= 0 → 允许
- **总库存**：汇总时按当前系统过滤掉停用货品，且**过滤要发生在统计之前**（否则总额/分类小计与列表对不上）
- **货品种类页**：系统页显示"启用/停用"开关 + 「已停用」标记（总览不显示该列，与位次一样）；
  停用行不隐藏（否则没法再启用）

## 本地验证（真后端 + 真实浏览器）

**接口层**（本地库，AGEBALL 无 J1 库存 / APPLE SODA J1 有 132）

| 场景 | 结果 |
|---|---|
| 停用「有库存」的货品 | **400**「该货品在 J1 还有库存 132，清完库存后才能停用」✓ |
| 停用「无库存」的货品 | 200 ✓；库里只有 **j1** 那行 active=0（central/j2/j3 仍为 1）✓ 按系统 ✓ |
| 进出货货品下拉 `?system=j1` | 已停用的消失（610 条）✓；`?system=central` 仍有（611 条）✓ |
| 总库存 `?system=j1` | 已停用的不显示 ✓（直接改库把「有库存的 APPLE SODA」标停用来验证 → 列表里没有它 ✓） |
| 手机版 `?system=j1` totals | 同上，不显示 ✓ |
| 只有「申请」权限的账号改 active | **403**「没有停用/启用货品的权限（需要「批准」权限…）」✓ |
| 有「批准」权限的账号改 active | 200 ✓ |
| 停用名单口径 | 该「名字+编号」下所有货品行都停用才算停用；**没有 stock_data_system 行 = 启用**（历史数据默认启用，无需迁移）✓ |

**页面层**：J1 视图表头出现「启用」列（第 12 列，位次之后、状态之前）✓；
已停用的行显示绿色「启用」按钮、正常的显示灰色「停用」按钮 ✓；
点 AGEBALL 的「启用」→ 变回「停用」并写库 ✓（14 列的单元格顺序全部对齐 ✓）。

**过程中查出并修掉的问题**：`active` 是 `TINYINT(1)`，MyBatis 读回来是 **Boolean** 不是数字，
第一版强转 `(Number)` 直接 500（列表打不开）→ 改成按字符串判断 ✓（已复测列表正常）。

测试数据已还原（两个货品的 active 都回到 1），本地库跑完重新导入生产快照 + 补丁。

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. `sudo mariadb < add_new_tables.sql`（第 12 节加列，幂等）
3. 重建后端 jar 并重启 + 前端 `npm run build` 并 rsync

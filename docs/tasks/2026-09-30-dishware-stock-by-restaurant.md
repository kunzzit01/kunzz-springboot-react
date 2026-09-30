# 任务 2026-09-30-dishware-stock-by-restaurant

- 状态：已完成（2026-09-30）
- 开始时间：2026-09-30
- 分支：main
- 目标：碗碟页数量改为从 `dishware_stock_by_restaurant` 按启用店面汇总（对齐旧版 live PHP），不再读那张近乎全 0 的 `dishware_stock`
- 白名单（只允许改这些）：
  - docs/tasks/2026-09-30-dishware-stock-by-restaurant.md
  - docs/tasks/README.md
  - CHANGELOG.md
  - backend/src/main/java/com/kunzz/inventory/service/DishwareService.java
  - backend/src/main/java/com/kunzz/inventory/mapper/DishwareStockMapper.java
  - backend/src/main/resources/mapper/DishwareStockMapper.xml
- 明确不碰：其它 backend/**、inventory-system/**、website/**、database/**、历史数据、构建产物（backend/static/**、backend/target/*.jar 由发布 task 统一构建）
- 计划推送分支：main

## 问题

碗碟页数量几乎全 0（文化楼 0 / 中央 0 / J1 4 / J2 6 / J3 3，合计 13），而实际应按店面
`dishware_stock_by_restaurant` 汇总（合计约 1 万件）。

- 新系统 `DishwareService.listStocks` 读的是 `dishware_stock`（几乎全 0 的聚合表）
- 旧版 live PHP（`https://www.kunzzgroup.com/backend/dishware_api.php?action=stock`，实测仍可访问）
  从 `dishware_stock_by_restaurant` 汇总，映射为 `restaurants = [17 文华楼, 2 中央, 3 J1, 4 J2, 5 J3]`
  （= 启用店面按 `display_order` 前 5 个），五桶合计 `[585,1701,2520,2451,2901]`
- 本地 `dishware_stock_by_restaurant` 按 (17,2,3,4,5) 汇总与之**完全一致**（本地多 9 是已停用的"文化楼" id1，
  旧站 `is_active=0` 不计）
- 旧站 `action=list` 也读 `dishware_stock` → 同样全 0（说明该表在旧系统里就没在维护）

## 做法（用户确认：只修显示，编辑先不动）

- 新增 `DishwareStockMapper.stockByRestaurant()`：`SELECT dishware_id, restaurant_id, SUM(quantity) FROM dishware_stock_by_restaurant GROUP BY ...`
- `DishwareService.listStocks`：取启用店面（按 display_order）前 5 → 文化楼/中央/J1/J2/J3；
  按 `dishware_stock_by_restaurant` 汇总填充五个桶；total = 五桶之和
- `updateStock`（编辑弹窗）**本次不动**（仍写 `dishware_stock`）——副作用：编辑后页面数字不会变（已与用户确认）
- VO 的 `id` 仍取 `dishware_stock` 的行 id（页面编辑用 `dishwareId`，不受影响）

## 验证

1. 重建 jar + 重启
2. `GET /api/dishware/stock` 五桶合计应 ≈ `[585,1701,2520,2451,2901]`（与旧站 action=stock 一致）
3. 抽查 item 249 → J1 70 / J2 46 / J3 50 / total 166

## 回滚

不涉及数据；`git revert` 或还原 `_jar_backup_20260930/` 里的 jar。

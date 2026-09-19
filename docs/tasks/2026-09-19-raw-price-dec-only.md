# 任务 2026-09-19-raw-price-dec-only

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：总库存的原始单价悬浮卡片**只显示有多位小数的那几档原始价**，不再带上"转换后"的显示价
  （例：`RM 1.45 ~ 1.45416` → `RM 1.4541 ~ 1.45416`；只有一档就只显示那一档）
- 白名单（只允许改这些文件）：
  - backend/src/main/resources/mapper/StockSummaryMapper.xml
  - backend/src/main/java/com/kunzz/inventory/service/StockSummaryService.java
  - inventory-system/frontend/src/pages/StockRecords.tsx
  - docs/tasks/2026-09-19-raw-price-dec-only.md
  - docs/tasks/README.md
- 明确不碰：数据库（不改列、不用补丁）、进出货页、货品种类页、CHANGELOG.md、构建产物

## 背景

上一个任务（2026-09-19-stockrecords-raw-price-tip）把提示修回来了，但卡片显示的是
**整组的原始价范围**，其中包含等于显示价的那一档：

```
1.45 这一组：原始价有 1.45000 / 1.45410 / 1.45416  →  卡片 `RM 1.45 ~ 1.45416`
```

用户（截图）："只展示小数点的单价就行了 转换后的单价 不需要展示啦哈哈"
→ 1.45000 就是"转换后"的显示价，不该出现在卡片里。

## 做法

1. **SQL**（`StockSummaryMapper.xml`）：在原有 `price_raw / price_raw_max` 旁边再加两列，
   只统计**带小数位**的原始价：

   ```sql
   MIN(CASE WHEN price <> ROUND(price, 2) THEN price END) AS price_raw_dec,
   MAX(CASE WHEN price <> ROUND(price, 2) THEN price END) AS price_raw_dec_max
   ```

2. **后端**：把这两列带进每个价格变体和 item（同价合并时取最小/最大）。

3. **前端**：
   - 提示的**触发条件**改成"这一组里存在带小数位的原始价"（没这一档就不提示，避免无意义卡片）
   - 卡片内容只显示带小数的档：一档 → `1.4541`；多档 → `1.4541 ~ 1.45416`（去尾零）
   - 原来那对"含显示价"的 `price_raw / price_raw_max` 前端不再使用

预期结果（用 9/18 生产数据实测）：

| 显示价 | 组内原始价 | 卡片 |
|---|---|---|
| 1.45 | 1.45 / 1.4541 / 1.45416 | `RM 1.4541 ~ 1.45416` |
| 1.14 | 1.14 / 1.1428 | `RM 1.1428` |
| 1.51 | 1.50972 / 1.51 | `RM 1.50972` |
| 55.00 | 55.00 | 不提示 |

## 本地验证（真后端 + 真实浏览器，9/18 生产数据）

接口层（`/api/stock/summary?system=j1`）：

| 货品 | 显示价 | 卡片内容（dec） |
|---|---|---|
| 100 PLUS | 1.45 | `1.4541 ~ 1.45416` ✓（改前是 `1.45 ~ 1.45416`） |
| 100 PLUS | 1.14 | `1.1428` ✓ |
| A&W | 1.51 | `1.50972` ✓ |
| APPLE SODA | 3.17 | `3.1666 ~ 3.16667` ✓ |
| BLACK STRAW | 2.38 | `2.375` ✓ |
| F&N SWEET CREAMER | 3.65 | `3.64583` ✓ |

页面层：鼠标移到 100 PLUS 的 RM1.45 上，卡片实测 **`RM 1.4541 ~ 1.45416`** ✓（截图确认）；
页面上共 34 个带悬浮标记的单价，全部只显示带小数位的原始价，没有"转换后"的价 ✓。

`tsc -b` + 后端 `mvn package` 均通过。

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. 重建后端 jar 并重启（后端 SQL/服务有改动）+ 前端 `npm run build` 并 rsync
3. 无数据库改动

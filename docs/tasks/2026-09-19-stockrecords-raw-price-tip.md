# 任务 2026-09-19-stockrecords-raw-price-tip

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：修回总库存页的**原始单价悬浮提示**（单价显示 2 位小数，鼠标悬浮显示数据库里的原始单价）
- 白名单（只允许改这些文件）：
  - backend/src/main/java/com/kunzz/inventory/service/StockSummaryService.java
  - inventory-system/frontend/src/pages/StockRecords.tsx
  - docs/tasks/2026-09-19-stockrecords-raw-price-tip.md
  - docs/tasks/README.md
- 明确不碰：进出货页 StockInout.tsx（那边的悬浮提示是好的，别动）、数据库（不用补丁）、CHANGELOG.md、构建产物

## 问题（用户报）

"之前总库存的有一些货品有小数点的悬浮提示 可是我现在查看 已经不存在了？"
（单价显示 RM1.45，但数据库里其实是 1.45410/1.45416 —— 悬浮应该能看到原始值）

## 根因：断了两截，所以这个提示现在永远不出现

**① 后端把原始单价丢了**（`StockSummaryService`）：
`StockSummaryMapper.xml` 查了 `MIN(price) AS price_raw, MAX(price) AS price_raw_max`
（注释写着"用于前端悬浮提示差异"），但 Java 里合并成 item / price_variants 时**没有把这两列带出去**，
接口返回里根本没有原始单价 → 前端拿不到值。

**② 前端的显示条件被"多个单价"覆盖了**（`StockRecords.tsx`）：

```tsx
base.has_price_diff = variants.length > 1      // ← 用"有几个价格变体"当条件，而不是"原始价 != 显示价"
...
if (!item || !item.has_price_diff) return item.formatted_price   // 悬浮提示的唯一入口
```

于是：单价唯一的货品（如 24K GOLD FLAKE 2.6666）`has_price_diff=false` → 不显示悬浮；
单价多于一组的货品，单价格子被"多个单价 (2)"按钮占掉（根本不渲染价格）→ 也不显示。
两条路都堵死，所以这个提示在总库存页**从来不出现**。
（对照：进出货页 `StockInout.tsx` 的 `renderPriceRawTip(rawVal)` 是直接拿原始价比对，所以那边是好的 ✓）

## 做法

1. **后端**：把 `price_raw` / `price_raw_max` 带进每个价格变体（同价合并时取最小/最大），item 上也放一份
   （单价格子要用）
2. **前端**：判断条件改成按**原始价 vs 显示价**（显示价用 2 位四舍五入）：
   - 原始价与显示价一致 → 不提示（保持原样显示）
   - 原始价有更多小数位 → 单价格子加虚线下划线 + 悬浮卡片
3. 悬浮卡片内容（提示框固定显示 `RM <内容>`）：只有一个原始价 → `1.4541`；
   同一显示价下有多档原始价 → `1.45 ~ 1.45416`（范围）
4. 展开的"多个单价"子行（用户截图里 100 PLUS 的 1.14 / 1.45 那两行）也加同样的悬浮提示

## 本地验证（真后端 + 真实浏览器，本地库用的是 9/18 生产备份）

| 检查 | 结果 |
|---|---|
| 接口 `/api/stock/summary?system=j1` 是否带回原始单价 | ✓ `100 PLUS`：变体 `1.14 (raw 1.14~1.1428)`、`1.45 (raw 1.45~1.45416)` |
| 页面上带悬浮标记（虚线下划线）的单价数量 | J1 共 **28 个**（改前是 **0 个**）✓ |
| 鼠标移到 `A&W` 的 RM1.51 上 | 弹出卡片 **`RM 1.50972 ~ 1.51`** ✓ |
| 展开 `100 PLUS` 的「多个单价」子行 | 两行都有标记：`1.14 → 1.14 ~ 1.1428`、`1.45 → 1.45 ~ 1.45416` ✓ |
| 显示价与原始价一致的货品（如 J1 的 24K GOLD FLAKE 55.00） | **不加**下划线、不弹卡片（避免无意义的提示）✓ |

`tsc -b` + 后端 `mvn package` 均通过。

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. 重建后端 jar 并重启（后端有改动）+ 前端 `npm run build` 并 rsync
3. 无数据库改动

## 说明

- 悬浮卡片里给的是**原始单价范围**：同一显示价下只有一档就显示一个值（`1.4541`），
  有多档就显示范围（`1.45 ~ 1.45416`），和「总库存」按显示价合并的口径一致。
- 货品种类页单价上的悬浮提示是另一套（显示"最近改价 + 改价人"，见 task
  2026-09-19-products-price-log-tip），两者不冲突。

# 任务 2026-09-19-products-column-sort

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：货品种类页——「货品编号」「货品名字」表头可点击排序；默认顺序改成有意义的（货品编号自然升序）
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - inventory-system/frontend/src/styles/stockproducts.css
  - docs/tasks/2026-09-19-products-column-sort.md
  - docs/tasks/README.md
- 明确不碰：后端、数据库、其它页面、CHANGELOG.md、构建产物

## 用户报

"货品编号和货品名字现在目前排序有点混乱，能不能给这两个展示有 sort；
然后现在当前的 sort 也有问题，没有确切的顺序"

## 现状（代码）

`StockProducts.tsx:487-498`：

```tsx
const pending = rawItems.filter(i => !i.approver)
const approved = rawItems.filter(i => i.approver)
pending.sort(sortByName)                 // 待批准：按货品名
approved.sort(sortByApprovedTime)        // 已批准：按 updated_at 升序 ← 这列"看起来就是乱的"
setRows([...pending, ...approved])
```

已批准的货品按「最后更新时间」排 —— 对用户来说等于**随机顺序**（截图里 BR 0003 / SK 0006 / BR 0002 / FI 0002 …）。
而且两个表头都不能点，想按编号或名字找货品只能靠搜索。

## 做法

1. **表头可点排序**：「货品编号」「货品名字」两列点击切换 升序/降序（图标 fa-sort / fa-sort-up / fa-sort-down 指示）
2. **默认排序改成「货品编号」自然升序**（自然 = 前缀字母 + 数字按数值：BR 0002 < BR 0003 < BR 12）
3. **保留「待批准在前」**这个既有工作流（待批准是待办事项，应该一直浮在上面），排序只在**组内**生效；
   组内并列时按 id 兜底（稳定）
4. 排序改成**渲染时计算**（`useMemo`）而不是取数时算：点表头立刻重排，不用重新请求
5. CSS：可排序表头加手型光标 + 悬浮变色提示

## 本地验证（真实浏览器，本地把一条货品改成"待批准"以便验证置顶规则）

| 动作 | 结果 |
|---|---|
| 打开页面（默认） | 表头「货品编号」带 ▲（升序）；顺序 = 待批准 FI 0001 → BR 0001、BR 0002、BR 0003、BR 0004、DI 0001… ✓（改前是"按更新时间"，看起来是乱的） |
| 点「货品编号」 | 反转为降序：US 0035、US 0034、US 0033… ✓（数字按数值比，不是字符串） |
| 点「货品名字」 | 名字升序：1/7 CUT NORI、3A HOT BROAD BEAN、24K GOLD FLARE、100 PLUS、A&W、ABURAGE、AGEBALL ✓（数字按数值：24K < 100 PLUS ✓） |
| 再点「货品名字」 | 降序：ZUWAI KANI FLAKE、ZARU SOBA、YUZU… ✓ |
| 待批准行 | 四种排序下都在第一行（待办事项置顶）✓ |
| 序号列 | 跟着显示顺序重新编号 1..N ✓ |
| 排序实现 | 渲染时计算（useMemo）→ 点表头立刻重排，不重新请求 ✓ |

`tsc -b` 通过；测试改动（临时置为待批准）只在本地库，跑完已重新导入还原。截图已发用户确认。

## 待用户在生产环境执行

纯前端：`npm run build` + rsync 到 `/var/www/admin/`（无后端/数据库改动）

## 说明

- 排序是**会话内**的（刷新页面回到默认「货品编号升序」），没有持久化到浏览器。
- 「待批准在前」是保留的既有工作流：待批准是待办事项，任何排序下都浮在最上面；排序只在两组内部生效。
  如果你更想要"整表一起排、不分区"，说一声我改。

# 任务 2026-09-18-remark-total-no-round

- 状态：已完成（2026-09-18）
- 开始时间：2026-09-18
- 分支：main
- 目标：货品备注（备注分析页）卡片顶部的「总重量」不再进位到 2 位，按数据库精度显示原始值
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/RemarkAnalysis.tsx
  - docs/tasks/2026-09-18-remark-total-no-round.md
  - docs/tasks/README.md
- 明确不碰：
  - backend/**（后端已经是对的，见下）
  - 其它任何页面
  - CHANGELOG.md、README.md、AGENTS.md
  - 构建产物（按 AGENTS.md 第 4 节，VPS 自己构建）

## 问题

货品备注卡片顶部显示「总重量: **0.34** Kilo」，但同一个卡片下面明细行写的是 **0.338 Kilo** —— 同一个数，
上面被进位了，用户要的是原始值 0.338。

## 根因

`RemarkAnalysis.tsx:122`（这一页**唯一**一处 `toFixed`）：

```tsx
总重量: {Number(p.total_quantity).toFixed(2)} Kilo
```

而明细行用的是后端发来的 `formatted_quantity`（`StockRemarkService` 里
`strip(stock).toPlainString()`，即 `stripTrailingZeros` 后的原始值 → "0.338"）✓。
也就是顶部那个数是前端自己算的、还按 2 位进位了 ✗。

## 改动（1 个 helper + 1 行）

```ts
/** 数量/重量显示：按数据库精度（decimal(10,3)）去尾零、不进位（0.338 → 0.338，不是 0.34） */
const fmtQty = (v: any) => {
  const n = Number(v)
  return isFinite(n) ? String(Number(n.toFixed(3))) : '0'
}
```

顶部改成 `{fmtQty(p.total_quantity)} Kilo`。

- 数量列在库里是 `decimal(10,3)`，所以固定 3 位再 `Number()` 去尾零**不会**截掉真实数据 ✓
- 顺带把浮点求和产生的尾巴（0.30000000000000004 → 0.3）也清掉 ✓
- 明细行不动：它们本来就用后端格式化好的字符串，两边显示会一致 ✓

## 本地验证（2026-09-18，真实浏览器）

接口值 → 旧算法 → 修复后（页面实测）：

| 货品 | 接口 total_quantity | 旧 `toFixed(2)` | 现在页面显示 |
|---|---|---|---|
| **A5 AWAGYU**（用户截图那条）| 0.338 | 0.34 ✗ | **0.338 Kilo** ✓ |
| OTORO | 1.293 | 1.29 ✗ | 1.293 ✓ |
| NAMA AKAMI | 7.533 | 7.53 ✗ | 7.533 ✓ |
| 整数总量 | 6 | 6.00 | 6 ✓（与明细行写法一致）|

明细行（后端 `formatted_quantity`）本来就是 0.338，现在上下两处终于一致 ✓。
本页只读，没有改动任何数据。

## 待用户在生产环境执行

`npm run build` → rsync 到 `/var/www/admin/`。纯前端改动，不用重建后端、不用动数据库。

# 任务 2026-09-18-inout-price-selectall

- 状态：已完成（2026-09-18）
- 开始时间：2026-09-18
- 分支：main
- 目标：金额（单价）输入框点一次就全选，直接打新金额；不要非得双击才能整段替换
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/StockInout.tsx
  - docs/tasks/2026-09-18-inout-price-selectall.md
  - docs/tasks/README.md
- 明确不碰：
  - backend/**
  - CHANGELOG.md
  - README.md
  - AGENTS.md
  - 其它任何页面
  - 构建产物（按 AGENTS.md 第 4 节，VPS 自己构建）

## 问题

单价框里已经有值（出货自动带出的最高价、或进货抓到的默认价）时，点一次进去光标是插在数字中间，
要整段换成新金额得先双击全选，否则会打成 `16.4432` 这种拼接结果。

## 做法

沿用仓库里已有的实现（`StockProducts.tsx:747`，注释写的是"对齐旧系统 handleInputFocus"）：

```ts
const selectAllOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  setTimeout(() => e.target.select(), 0)
}
```

`setTimeout(0)` 是必须的：onFocus 早于浏览器的光标落位，直接 select() 会被随后的落位取消。

挂到进出货页两个**金额**输入框上（都是 `step="0.00001"` 的那个）：

| 位置 | 场景 |
|---|---|
| `StockInout.tsx` 编辑行的单价输入 | 编辑已有记录时改单价 |
| `StockInout.tsx` 新增行的单价输入 | 进货手动单价 / 出货「手动输入价格」|

**数量输入框（进货/出货/行数）本次不动**：数量更常见的是在已有值后面补一位（1 → 12），
全选会把这种输入变成替换，属于另一套取舍，等用户确认再加。

## 本地验证（2026-09-18，真实浏览器操作）

单价的"点一次能不能整段替换"没法从 DOM 快照看出来，所以在页面里做了**对照实验**：
真实坐标点击输入框 → 立刻 `execCommand('insertText', …)` 模拟打字 → 看值是"替换"还是"追加"。

| 输入框 | 点击前的值 | 点一次后直接输入 | 结果 |
|---|---|---|---|
| **单价**（加了 selectAllOnFocus）| `12.34` | 输入 `99` | **`99`** —— 整段替换 ✓ |
| 进货数量（未加，对照组）| `7` | 输入 `9` | `97` —— 追加在末尾 |

对照组证明该方法确实能分辨两种行为，也顺带复现了原来的"必须双击"现象。

> ⚠️ 测试环境坑（供以后参考）：**自动化面板里 `document.hasFocus()` 默认是 false**，
> 这种情况下 `select()` 选中的内容会被浏览器折叠掉，会误判成"代码没生效"。
> 必须先用**真实坐标点击**（`tab.cua.click`）让页面拿到焦点，测出来的结果才可信。
> 另外 `input type=number` 的 `selectionStart` 恒为 `null`、`setSelectionRange` 抛
> `InvalidStateError`，所以不能用读选区的方式验证，只能看"输入后值变没变"。

验证用的行**没有保存**（直接取消），库里没有留下任何记录。

## 待用户在生产环境执行

`npm run build` → rsync 到 `/var/www/admin/`（VPS_DEPLOY 第 1.5 节）。不用重建后端、不用动数据库。

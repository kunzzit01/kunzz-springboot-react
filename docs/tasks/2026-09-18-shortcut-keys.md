# 任务 2026-09-18-shortcut-keys

- 状态：已完成（2026-09-18）
- 开始时间：2026-09-18
- 分支：main
- 目标：把两个页面的保存快捷键改对 —— Ctrl+S 存当前行，Ctrl+Shift+S 批量存，去掉 Ctrl+Enter
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/StockInout.tsx
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - docs/tasks/2026-09-18-shortcut-keys.md
  - docs/tasks/README.md
- 明确不碰：
  - backend/**
  - CHANGELOG.md
  - README.md
  - AGENTS.md
  - 其它任何页面（进出货的其它快捷键 Ctrl+A/Ctrl+D/Ctrl+Shift+A/Ctrl+Shift+Z 全部保持原样）
  - 构建产物（按 AGENTS.md 第 4 节，VPS 自己构建）

## 用户要求的映射

| 快捷键 | 进出货（StockInout）| 货品种类（StockProducts）|
|---|---|---|
| **Ctrl+S** | 保存**当前行**（原来是保存全部 ✗）| 保存**当前行**（原来是保存全部 ✗）|
| **Ctrl+Shift+S** | 批量保存（原来没有这个键 ✗）| 批量保存（原来没有这个键 ✗）|
| **Ctrl+Enter** | —（本来就没绑）| **去掉**（原来绑的是"保存当前行"）|

## 改之前的实际代码

**进出货** `StockInout.tsx`：

```ts
// B. 保存 (Ctrl+S)：有编辑中行→逐行保存全部；有待保存新增行→批量保存
if (e.code === 'KeyS' || ...) { if (editingIds.size > 0) { saveAllEdits(); return } if (newRows.length > 0) saveNewRows() }
```

- 没判断 `e.shiftKey`，所以 Ctrl+Shift+S 也走这里 → 不是"缺一个键"，是**两个键一个行为**
- 新增行的「保存」按钮本身就是 `saveNewRows()`（批量），页面里**没有**"只存这一行"的能力 → 本次要新做

**货品种类** `StockProducts.tsx`：

```ts
// A. 保存全部 (Ctrl+S)
if (e.code === 'KeyS' || ...) { saveAll(); return }
// C. 保存光标所在行 (Ctrl+Enter)
if (e.key === 'Enter') { ...saveNewRow(row) / saveEdit(rowId) }
```

## 改动点

### 进出货

1. `saveNewRows(onlyKeys?: string[])`：加一个可选参数（要保存的行 key）。不传 = 全部（现有行为不变，
   行内按钮和批量快捷键都走这条路）；传了 = 只保存这些行，保存后只从列表里移除这些行。
2. `<tr>` 上加 `data-row-id={r.id}`（新增行已有 `data-key`），用于"光标在哪一行"的定位
   —— 与货品种类的 `data-new-key` / `data-row-id` 同一套做法。
3. 键盘分支：
   - `Ctrl+Shift+S` → 批量（沿用原来的行为：有编辑中行先存编辑，否则存新增行）
   - `Ctrl+S` → 找光标所在 `<tr>`：新增行 → `saveNewRows([key])`；编辑中的行 → `saveEdit(id)`；
     光标不在任何行上 → 不做事（与货品种类 Ctrl+Enter 原行为一致）

### 货品种类

- `Ctrl+Shift+S` → `saveAll()`
- `Ctrl+S` → 原来 Ctrl+Enter 的那段逻辑（`saveNewRow(row)` / `saveEdit(id)`）
- 删掉 Ctrl+Enter 分支

## 本地验证（2026-09-18，真实浏览器操作）

键盘事件用「真实坐标点击让页面拿到焦点 → 派发 keydown」来模拟按键
（⚠️ 面板默认 `document.hasFocus()=false`，不先真实点击的话按键事件不生效，会误判成代码没写对）。

**进出货**：建两行，第 1 行填完整（进货 1 / 单价 12）、第 2 行故意只选货品不填数量（不合法）：

| 操作 | 结果 |
|---|---|
| 光标在第 1 行 → **Ctrl+S** | 「成功保存 1 条记录」；第 2 行**既没被保存也没被清掉**，仍在待存列表（库里只多 1 条 id=29290）|
| 带着不合法的第 2 行按 **Ctrl+Shift+S** | 被校验拦下，**没有写库** |
| 把第 2 行补完整再按 **Ctrl+Shift+S** | 「成功保存 1 条记录」，待存行清空（库里第 2 条 id=29291）|

> 关键对比：改之前 Ctrl+S 会先校验**所有**行 → 第 2 行不合法就会整批失败、什么也存不进去；
> 现在只校验并保存光标所在那一行。

**货品种类**：让前两行同时进入编辑态：

| 操作 | 结果 |
|---|---|
| 光标在第 1 行 → **Ctrl+S** | 「记录已保存」，第 1 行退出编辑态，**第 2 行仍在编辑** |
| 光标在第 2 行 → **Ctrl+Enter** | **完全无反应**（仍在编辑、无任何提示）—— 已按用户要求去掉 |
| **Ctrl+Shift+S** | 「已保存 1 条记录」，两行都退出编辑态 |

验证过程只把原值原样存回，事后核对 `stock_data` id=2/3 数据未变；进出货的 2 条测试记录已删除。

## 待用户在生产环境执行

`npm run build` → rsync 到 `/var/www/admin/`（VPS_DEPLOY 第 1.5 节）。不用重建后端、不用动数据库。

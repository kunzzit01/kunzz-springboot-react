# 任务 2026-09-19-inout-newrow-single-save

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：进出货页「新增记录」里，**单行保存按钮只保存这一行**，其余待存新行保留（现在会被一起清掉）
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/StockInout.tsx
  - docs/tasks/2026-09-19-inout-newrow-single-save.md
  - docs/tasks/README.md
- 明确不碰：后端、数据库、其它页面、CHANGELOG.md、构建产物

## 问题（用户报）

"进出货 使用创建新增记录的 创建10个后 单个保存后 其他9个会自动不见"

根因（一行）：

```tsx
// 新增行的行内保存按钮（StockInout.tsx 约 2019 行）
<button className="action-btn save-btn" onClick={() => saveNewRows()} ...>
```

`saveNewRows()` **不带参数 = 保存全部**：
① 校验时把"完全空行"跳过、只把填完整的行存下来（这是对的），
② 但存完后这一句 `setNewRows(prev => (onlyKeys ? prev.filter(...) : []))` 因为没传 onlyKeys，
   把**整个待存列表清空** → 其他 9 行（哪怕是还没填完的）跟着消失 ✗

工具条上的「保存所有数据」和 Ctrl+Shift+S 才是"全存"，行内这个按钮应该是"只存这一行"——
编辑已有记录的那一行也是这么做的（`saveEdit(id)` 只存那一条），而且 Ctrl+S 早就是
`saveNewRows([newRows[0].key])`（只摘掉存掉的那条），说明"只摘一条"的机制本来就有，只是这个按钮没接上。

## 改法

行内保存按钮传上自己的 key：

```tsx
onClick={() => saveNewRows([nr.key])}
```

## 本地验证（真实浏览器，本地 5174 + 真后端）

1. 点「新增记录」→ 行数填 **3** → 回车创建 → 表格底部出现 **3 条新行** ✓
2. 把第 1 条填完整：货品下拉选 `1/7 CUT NORI`（自动带出编号 DI 0001 / 规格 Packet / 收货人 SANSUI / 单价 1111）、进货数量 1
3. 点第 1 条自己的 💾 保存
4. 结果：**新行剩 2 条**（另外两条原样还在）✓，被保存的那条进了上面的记录列表 ✓

改前的行为（读代码即可确认，也是用户看到的）：这个按钮调的是不带参数的 `saveNewRows()`，
校验会把"完全空行"跳过、只存填完整的那条 —— 但收尾那句
`setNewRows(prev => (onlyKeys ? prev.filter(...) : []))` 因为没有 onlyKeys 就把**整个列表清空**，
所以其余的（哪怕是还没填完的）一起消失。

`tsc -b` 通过。

## 待用户在生产环境执行

纯前端：`npm run build` + rsync 到 `/var/www/admin/`（无数据库改动、后端不用重建）

## 说明（哪个按钮管哪一片）

| 入口 | 行为 |
|---|---|
| 新增行里那一行的 💾（本次修的） | 只保存这一行，其余待存行保留 |
| 工具条「保存所有数据」/ Ctrl+Shift+S | 保存全部待存行（原样不变） |
| Ctrl+S | 从上往下保存第一条待存行（原样不变） |

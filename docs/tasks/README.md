# 任务登记（并行防撞）

多个 task 同时在这个仓库里干活时，**每个 task 开工前必须先在这里登记自己的写入白名单**。
规则见仓库根目录的 [`AGENTS.md`](../../AGENTS.md)。

## 怎么用

1. 复制下面模板，存成 `docs/tasks/<任务ID>.md`。任务 ID 用 `<日期>-<短名>`，例如 `2026-09-17-hifo-split`。
2. 在下方「活跃任务」表里加一行，让其它 task 一眼看到谁在改什么。
3. 任务收工（推送完成）后，把状态改成 `已完成`，或直接从表里删掉并把文件保留作记录。

## 模板

```markdown
# 任务 <任务ID>

- 状态：进行中
- 开始时间：YYYY-MM-DD HH:mm
- 分支：main / task/<任务ID>
- 白名单（只允许改这些文件）：
  - 路径1
  - 路径2
- 明确不碰：
  - backend/**
  - CHANGELOG.md
- 备注：与其它 task 有交集的地方
```

## 活跃任务

| 任务 ID | 状态 | 白名单要点 | 分支 |
|---|---|---|---|
| 2026-09-17-anti-collision-rules | 已完成 | AGENTS.md、.githooks/、.gitattributes | main |
| 2026-09-17-updater-guard | 已完成 | git-update.ps1、AGENTS.md、docs/tasks/ | main |
| 2026-09-17-pin-freezer | 已完成 | 冰箱分类功能 15 个文件（固化并发会话未提交的改动） | main |
| 2026-09-17-push-all | 已完成 | 固化全部剩余改动（代码 / 构建产物 / 文档），分 4 个提交 | main |
| 2026-09-17-verify-script-cleanup | 已完成 | 提交被取代的旧验证脚本删除 | main |
| 2026-09-18-forgot-password | 已完成 | 忘记密码：后端 8 文件（新增 5 改 3）+ 前端 5 文件；不碰构建产物与数据库结构 | main |
| 2026-09-18-inout-price-required | 已完成 | 进出货单价不再自动填 0.00；只改 StockInout.tsx 一个文件 | main |
| 2026-09-18-inout-hifo-autoprice | 已完成 | 出货单价自动带出 HIFO 最高价那层；只改 StockInout.tsx 一个文件 | main |
| 2026-09-18-inout-price-selectall | 已完成 | 金额框点一次即全选，可直接打新金额；只改 StockInout.tsx 一个文件 | main |
| 2026-09-18-shortcut-keys | 已完成 | Ctrl+S 存当前行 / Ctrl+Shift+S 批量存 / 去掉 Ctrl+Enter；改进出货 + 货品种类两个页面 | main |
| 2026-09-18-stockdata-price-scale | 已完成 | stock_data.price 精度 3→5 位（SQL 补丁），货品种类单价框 step 0.00001 | main |
| 2026-09-18-stockrecords-silent-refresh | 已完成 | 总库存：别人保存后静默更新，不跳顶部/不清筛选；只改 StockRecords.tsx | main |
| 2026-09-18-products-assign-preserve | 已完成 | 单系统页保存不再覆盖「系统分配」；总览外不展示该列 | main |
| 2026-09-18-products-assign-column-restore | 已完成 | 纠正上一任务：中央/分店恢复「系统分配」列并改显真实值；数据修复保留 | main |
| 2026-09-18-remark-total-no-round | 已完成 | 货品备注「总重量」不再进位到 2 位（0.338 不再显示成 0.34）；只改 RemarkAnalysis.tsx | main |
| 2026-09-18-per-system-fields | 已完成 | 冰箱分类/位次/默认单价改为按系统各存一份（新表 stock_data_system）；总览只读展示 4 套 | main |
| 2026-09-18-per-system-delete-cleanup | 已完成 | 删货品时级联清掉 stock_data_system 的行（不留孤儿行） | main |
| 2026-09-18-branch-remark-codes | 已完成 | 备注编号支持分店：分店台账加两列，取数/校验/生成按系统 | main |
| 2026-09-18-remark-page-system-reload | 已完成 | 备注页切系统后自动重新取数（此前要手动刷新）；只改 RemarkAnalysis.tsx | main |
| 2026-09-18-price-log-daily | 已完成 | 改价记录同一天同一货品同一系统只留一条（当天只更新新价，old 保持当天起点价）；补丁第 10 节清历史重复 | main |

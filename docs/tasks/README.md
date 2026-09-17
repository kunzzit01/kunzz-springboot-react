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
| 2026-09-17-push-all | 进行中 | 固化全部剩余改动（代码 / 构建产物 / 文档），分 4 个提交 | main |

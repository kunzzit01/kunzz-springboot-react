# 任务 2026-11-25-gitignore-cleanup

- 状态：进行中
- 白名单（只允许改这些）：
  - .gitignore
  - docs/tasks/2026-11-25-gitignore-cleanup.md
- 明确不碰：其它一切文件（docs/DAILY_REPORT_*.md、kunzz-backups/ 内容、backend/**、前端源码、其它 tasks 登记文件）
- 计划推送分支：main

## 背景

`.gitignore` 追加 3 条忽略规则，消除 `git status` 噪声并防止误提交本地大文件：

| 规则 | 体积 | 说明 |
|---|---|---|
| `.tmp-pdfcheck/` | 40M / 68 文件 | PDF 调试用截图与 e2e 脚本 |
| `kunzz-backups/` | 225M（单文件最大 43M） | DB/文件备份，从未入库 |
| `本地改动备份_*.patch` | 2.9M | 本地改动备份 |

## 风险

仅新增忽略规则，磁盘文件原样保留，可回滚。代价：这些本地备份不再受 git 保护。

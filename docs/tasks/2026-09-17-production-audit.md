# 任务 2026-09-17-production-audit

- 状态：已完成（审计 + 本地清理已执行；本轮提交并推送）
- 开始时间：2026-09-17
- 分支：main
- 目标：把 Windows 本地开发环境整理成可部署到 Hostinger VPS / Ubuntu 的 Production System
- 白名单（本任务**只碰这些文件**）：
  - docs/tasks/2026-09-17-production-audit.md（本登记文件）
  - docs/PRODUCTION_AUDIT_2026-09-17-production-audit.md（审计报告）
  - inventory-system/frontend/src/styles/add.css.bak（**删除**：源码树里已被取代的备份文件；
    内容永久保留在 git 历史 `534b9a3`，可随时 `git show 534b9a3:<path>` 取回）
- 明确不碰：
  - backend/**（含 backend/static/**、backend/target/*.jar、backend/data/**、backend/uploads/**）
  - website/**、inventory-system/**（add.css.bak 除外）
  - database/**
  - CHANGELOG.md、README.md、AGENTS.md、.gitignore、.gitattributes、.githooks/**
  - 所有 *.ps1 / *.bat / *.sh 脚本
- 已执行的本地清理（**全部为 git 未跟踪 / 已忽略的文件，不产生任何 git 变更**）：
  - runtime/mariadb.zip（71 MB）
  - runtime/ollama/lib/（1818 MB，逐文件句柄探测确认未被任何进程加载）
  - runtime/ollama/ollama.exe、runtime/jre21/、runtime/mariadb/ → **保留**：被运行中的
    mysqld / java / ollama 进程占用，需先在「一键启动」窗口按回车停服后删除（约 403 MB）
  - 更新前差异清单_*.txt（git-update.ps1 的输出产物）
  - docs/docs/（与 docs/ 逐字节相同的未跟踪副本）、_update_help.txt
- 保留未删：本地改动备份_20260917_204832.patch（那次本地改动的唯一备份）
- 备注：审计发现的高危项（Gmail 应用密码、公开仓库中的员工 PII、demo/demo123 账号、nginx 缺 /ws 反代）
  全部记录在报告里，**修复动作等待用户确认**——本次只做审计与本地清理，未改任何业务代码。

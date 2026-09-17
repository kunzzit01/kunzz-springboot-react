# 任务 2026-09-17-verify-script-cleanup

- 状态：已完成（2026-09-17）
- 分支：main
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/verify-pick-remark.cjs
  - docs/tasks/README.md
  - docs/tasks/2026-09-17-verify-script-cleanup.md
- 明确不碰：
  - inventory-system/frontend/src/**
  - backend/**
  - CHANGELOG.md
- 备注：
  - 提交旧验证脚本 `verify-pick-remark.cjs` 的删除：并发会话在 `1cd28b4` 里已新增
    `verify-remark-picker.cjs`（22 行）替代它，磁盘上的旧文件已被删，只剩这个删除未提交。
  - 该文件是仓库内已跟踪的临时验证脚本，删除属清理，无内容丢失。

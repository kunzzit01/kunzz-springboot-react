# 任务 2026-09-17-updater-guard

- 状态：进行中
- 分支：main
- 白名单（只允许改这些文件）：
  - git-update.ps1
  - AGENTS.md
  - docs/tasks/
- 明确不碰：
  - CHANGELOG.md          # 另一个会话有 5 行未提交改动，不去动它
  - backend/**
  - inventory-system/**   # 另一会话在 StockProducts.tsx 上有 515 行未提交改动
- 备注：
  - 本次给 `git-update.ps1` 加「本地有未推送提交就中止」的闸门，并把本地改动备份的
    `.sql` 排除规则收窄为 `database/*.sql`。
  - 三态实测：本地领先→中止；本地 == origin→放行；本地落后（部署机正常更新）→放行。
  - `CHANGELOG.md` 因被并发会话占用，本次不改，待对方提交后再补记。

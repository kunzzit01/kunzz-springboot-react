# 任务 2026-10-23-static-sync

- 状态：进行中
- 目标：重新构建后台前端 → 同步到 `backend/static/`（仓库内的构建产物）→ 提交并推送到 VPS
- 白名单（只允许改这些）：
  - backend/static/index.html
  - backend/static/assets/**（换 hash 的新旧文件）
  - docs/tasks/2026-10-23-static-sync.md
  - CHANGELOG.md（只追加）
- 明确不碰：backend/static/home/**（官网产物）、backend/static/{fonts,form,images,invoice,vendor,static}/**、
  backend/target/*.jar（VPS 上重建）、任何源码（本轮只同步产物）
- 计划推送分支：main

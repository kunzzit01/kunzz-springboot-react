# 任务 2026-10-23-image-prep-shared

- 状态：进行中
- 目标：把「HEIC 转换 + 大图等比缩小 + 重编码压缩」从 `JoinComphoto.tsx` 抽成共用函数，
  接到其它所有图片上传入口（发展历史、碗碟照片、页面背景、媒体文件）
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/utils/imagePrep.ts（新增，共用实现）
  - inventory-system/frontend/src/pages/JoinComphoto.tsx
  - inventory-system/frontend/src/pages/Timeline.tsx
  - inventory-system/frontend/src/pages/Dishware.tsx
  - inventory-system/frontend/src/pages/PageUpload.tsx
  - inventory-system/frontend/src/pages/Media.tsx
  - docs/tasks/2026-10-23-image-prep-shared.md
  - CHANGELOG.md（只追加）
  - backend/static/**（仅本次构建产物，最后一步，需用户确认）
- 明确不碰：后端代码、数据库、BgMusic.tsx（音频不压缩）、inventory-system/frontend/package.json
- 计划推送分支：main

# 任务 2026-10-23-comphoto-upload-fix

- 状态：进行中
- 目标：
  1. 修复 /media/join2「我们的足迹」照片上传报「服务器内部错误」（根因：Spring multipart 默认单文件 1MB，>1MB 直接抛 MaxUploadSizeExceededException → 兜底 500）
  2. 让「HEIC 自动转换」名副其实（当前后端/前端都没有任何转换代码，HEIC 存下来浏览器显示不出来）
  3. 补一个用户能看见、能点的「删除照片」按钮（原来只有一个被 .image-info 遮挡的 ✕）
- 白名单（只允许改这些）：
  - backend/src/main/resources/application.yml
  - backend/src/main/java/com/kunzz/inventory/common/GlobalExceptionHandler.java
  - inventory-system/frontend/src/pages/JoinComphoto.tsx
  - inventory-system/frontend/src/styles/timeline.css
  - inventory-system/frontend/package.json
  - inventory-system/frontend/package-lock.json（npm install 新增 heic2any）
  - docs/tasks/2026-10-23-comphoto-upload-fix.md
  - CHANGELOG.md（只追加）
  - backend/static/**（仅本次构建产物，最后一步，需用户确认）
- 明确不碰：数据库、其它页面（Timeline.tsx / PageUpload.tsx / Dishware.tsx 的同类文案另开任务）、backend/target/*.jar
- 计划推送分支：main

# 任务 2026-10-23-remove-build-tag

- 需求：把左下角「build xxxxxxxx」去掉（用户不需要这个标记）。
- 改动：
  - `components/AppLayout.tsx`：删除 buildTag 计算 + 底部那行 div
  - `styles/sidebar.css`：删除 `.build-tag` 样式
- 保留：`utils/versionWatcher.ts` 的「系统已更新 → 立即刷新」提示条（排查旧标签页仍靠它）。
- 白名单：上述两个文件 + docs/tasks/2026-10-23-remove-build-tag.md + CHANGELOG.md
- 明确不碰：后端、nginx、数据库、data/uploads、backend/static

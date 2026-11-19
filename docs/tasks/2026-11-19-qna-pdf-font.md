# 任务 2026-11-19-qna-pdf-font

- 状态：进行中
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/pages/Qna.tsx
  - docs/tasks/2026-11-19-qna-pdf-font.md
- 明确不碰：backend/static/**、CHANGELOG.md、其它页面
- 原因：问卷 PDF 中文全部乱码/缺字。NotoSansSC-Regular.ttf 实为 CFF 的 OpenType（文件头 OTTO），pdf-lib+fontkit 无法正确内嵌；改用真 TrueType 的 simhei.ttf。

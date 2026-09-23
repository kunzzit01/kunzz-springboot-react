# 任务 2026-09-23-hire-contact-links

- 状态：已完成（前端源码 + 产物已构建同步；真实浏览器 11 项断言全通过）
- 需求：招聘列表（/hire）表格「联系方式」列，点击邮箱 → 打开 Gmail 写信页，点击电话号码 → 打开 WhatsApp 会话
- 现状：该列只是纯文本，没有链接；详情弹窗里邮箱用的是 `mailto:`（会拉起系统默认邮件客户端），电话是纯文本
- 白名单（本 task 只允许改这些）：
  - docs/tasks/2026-09-23-hire-contact-links.md
  - inventory-system/frontend/src/pages/Jobs.tsx
  - inventory-system/frontend/src/styles/hire.css
  - CHANGELOG.md  # 仅追加
  - backend/static/index.html                # 构建产物，最后一步
  - backend/static/assets/                   # 构建产物，最后一步（目录前缀：新 hash 资源、删旧 hash 资源）
- 明确不碰：backend/src/**、backend/target/*.jar（jar 内不含 static/**，纯前端改动无需重新打包）、其它页面/组件、database/**、website/**
- 计划推送分支：main

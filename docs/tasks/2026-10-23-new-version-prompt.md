# 任务 2026-10-23-new-version-prompt

- 症状：部署新版本后，用户「登出再登录」进入 `/media/join2` 看到的还是旧界面（旧文案、没有删除按钮），
  **手动 F5 刷新后才是新的**。
- 根因三层：
  1. 登录走的是前端路由（`navigate`），不会重新拉 `index.html` → 标签页里仍是旧 bundle；
  2. nginx 对 `/index.html` **没发任何 Cache-Control**（只有 ETag/Last-Modified）→ 浏览器按启发式缓存；
     而 `/assets/*.js` 是 `max-age=2592000, immutable` → 旧 bundle 能直接从磁盘缓存跑起来；
  3. 没有任何「有新版本」的提示，用户不知道要刷新。
- 改动：
  - `src/utils/versionWatcher.ts`（新增）：定时 + 窗口获得焦点时拉 `/index.html`，比较入口 bundle hash；
  - `components/AppLayout.tsx` + `styles/sidebar.css`：发现新版本时弹底部提示条「系统已更新，立即刷新」；
  - `pages/Login.tsx`：登录成功后改为整页跳转（`window.location.replace`），顺带拿到最新 bundle；
  - `nginx-ec2.sh`：两个 server 块加 `location = /index.html { add_header Cache-Control "no-cache, must-revalidate"; expires -1; }`。
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/utils/versionWatcher.ts（新增）
  - inventory-system/frontend/src/components/AppLayout.tsx
  - inventory-system/frontend/src/pages/Login.tsx
  - inventory-system/frontend/src/styles/sidebar.css
  - nginx-ec2.sh
  - docs/tasks/2026-10-23-new-version-prompt.md
  - CHANGELOG.md（只追加）
- 明确不碰：后端 Java、数据库、data/uploads、backend/static
- 计划推送分支：main

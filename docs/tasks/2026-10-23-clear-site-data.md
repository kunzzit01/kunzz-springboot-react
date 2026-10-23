# 任务 2026-10-23-clear-site-data

- 目标：进登录页时让浏览器清一次本站 HTTP 缓存（Clear-Site-Data: "cache"），
  进一步减少「部署后旧标签页/旧缓存还在跑旧 bundle」的窗口。
- 只清 cache，不动 cookies / localStorage（登录 token 保留）。
- 白名单：
  - nginx-ec2.sh（admin conf 生成 map + location = /index.html 里加头）
  - docs/CLEAR_SITE_DATA_LOGIN_2026-10-23.md（新增手册）
  - docs/tasks/2026-10-23-clear-site-data.md
  - CHANGELOG.md（只追加）
- 明确不碰：后端 Java、前端源码、数据库、data/uploads、backend/static

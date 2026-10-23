# 任务 2026-10-23-nginx-media-location

- 症状：`/media/join2`（以及 `/media/join3`、`/media/music`、`/media/about4`、`/media/homepage1`…）
  刷新/直链打开返回 JSON `{"code":404,"message":"资源不存在: media/join2"}`；从菜单点进去正常。
- 根因：VPS nginx 后台 server 块写了 `location /media/ { proxy_pass 后端 }`，
  把所有 `/media/*` 都代理给后端，而前端页面路由恰好也在 `/media/` 下 →
  `try_files → index.html` 永远轮不到。
- 修复：改成只匹配 4 个官网背景 key 的正则 location（正则优先于前缀 location），
  其余 `/media/**` 回到 `try_files`。仓库 `nginx-ec2.sh` 两个 server 块已同步。
- 白名单（只允许改这些）：
  - nginx-ec2.sh
  - backend/src/main/java/com/kunzz/inventory/config/WebConfig.java（方案 B：static-dir 支持绝对路径）
  - deploy-ec2.sh（环境文件写入 APP_STATIC_DIR）
  - docs/NGINX_MEDIA_LOCATION_FIX_2026-10-23.md（新增）
  - docs/tasks/2026-10-23-nginx-media-location.md
  - CHANGELOG.md（只追加）
- 明确不碰：前端源码、数据库、data/uploads
- 线上生效方式：改 `/etc/nginx/sites-available/<配置>` 后 `nginx -t && systemctl reload nginx`
- 计划推送分支：main

# 任务 2026-11-18-nginx-gzip

- 状态：已完成（2026-11-18）
- 目标：VPS nginx 对 JS/CSS 开启 gzip（原 `gzip_types` 被注释，只压 HTML），并把配置记入运维文档（VPS 配置不在仓库里）。
- 白名单：
  - docs/OPS.md  # 仅在第 6 节末尾插入一个小节
  - docs/tasks/2026-11-18-nginx-gzip.md
- 明确不碰：代码、CHANGELOG.md、其它 docs
- 计划推送分支：main
- VPS 改动：新增 `/etc/nginx/conf.d/kunzz-gzip.conf`（nginx -t 通过后 reload），未改 nginx.conf。
- 验证（外网经 Traefik）：主 JS 2,088,424 → 619,327 字节；CSS 574,362 → 92,488；解压后与原文件同为 2,088,424 字节。

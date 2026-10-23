# 任务 2026-10-23-media-route-fix

- 状态：进行中
- 症状：浏览器直接访问/刷新 `https://kunzzgroup.com/media/join2`（还有 join1/join3）时，
  返回 `{"code":404,"message":"类型不支持","data":null}` 的 JSON，而不是后台页面。
- 根因：`MediaServeController` 没有类级前缀，方法级 `@GetMapping("/media/{type}")` 会匹配
  **所有** `/media/xxx`，把前端的 `/media/join1|join2|join3` 路由也吃掉了（官网消费的
  4 个 key 之外一律 404）。
- 修复：把映射收窄成 4 个官网 key 的正则路径变量，其它 `/media/**` 交给 SPA 回退。
- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/controller/MediaServeController.java
  - docs/tasks/2026-10-23-media-route-fix.md
  - CHANGELOG.md（只追加）
  - backend/static/**（若本次重新构建产物）
- 明确不碰：数据库、`data/**`、`uploads/**`
- 计划推送分支：main

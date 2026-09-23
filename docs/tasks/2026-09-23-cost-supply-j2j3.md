# 任务 2026-09-23-cost-supply-j2j3

- 状态：进行中
- 现象：J1 成本报表（/cost）的「供应→J2 (RM)」「供应→J3 (RM)」恒为 0.00
- 根因：`/kpi/supply` 从 `j1_supply` 表读数，而该表在线上/本地库均为空表，且本仓库没有任何写入方
  （全仓搜索只有 `KpiMapper.xml` 一处 SELECT + 两份 dump 的建表语句）
- 正确口径（旧站 `xampp/htdocs/kunzzgroup/backend/costapi.php` 的 `get_supply`）：
  从**中央** `stockinout_data` 取 `target_system='j2'/'j3'` 的**出库**记录，
  按记录 `ROUND(out_quantity*price, 2)` 累加（与旧站发票导出口径一致）
- 白名单（本 task 只允许改这些）：
  - docs/tasks/2026-09-23-cost-supply-j2j3.md
  - backend/src/main/resources/mapper/KpiMapper.xml
  - backend/src/main/java/com/kunzz/inventory/mapper/KpiMapper.java  # 仅注释
  - backend/src/main/java/com/kunzz/inventory/service/KpiService.java  # 仅注释
  - CHANGELOG.md  # 仅追加
  - backend/target/inventory-backend-1.0.0.jar  # 构建产物，最后一步（本机无 Maven，替换 jar 内 mapper XML）
- 明确不碰：inventory-system/frontend/**（前端已正确调用 /kpi/supply，无需改动）、其它 mapper/service、database/**、j1_supply 表结构（不删表）
- 计划推送分支：main

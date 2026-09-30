# 任务 2026-09-30-branch-remark-from-one

- 状态：已完成（2026-09-30）
- 开始时间：2026-09-30
- 分支：main
- 目标：分店（J1/J2/J3）自己进货自动生成备注编号时，从 1 起取「本店表里从未出现过」的最小号；中央取号逻辑不变
- 白名单（只允许改这些）：
  - docs/tasks/2026-09-30-branch-remark-from-one.md
  - docs/tasks/README.md
  - CHANGELOG.md
  - backend/src/main/java/com/kunzz/inventory/service/StockService.java
  - backend/src/main/resources/mapper/StockInoutMapper.xml
  - backend/src/main/java/com/kunzz/inventory/mapper/StockInoutMapper.java
- 明确不碰：其它 backend/**、inventory-system/**、website/**、database/**、历史数据、构建产物（backend/static/**、backend/target/*.jar 由发布 task 统一构建）
- 计划推送分支：main

## 背景（承接 2026-09-30-branch-remark-own-sequence）

上一版只把「中央调拨继承来的号」排除出分店取号，但分店表里还有**分店自己名下的旧号**
（修复前用「全表 MAX」生成的，接着中央序列，如 J1 的 `SB-428/430/431`）→ 取号仍接着 431 往后
（实测 J1 → `SB-433`），不是用户要的「从新号码开始」。

## 做法（用户确认）

- 分店表：`nums` = 该前缀在本店表中**已出现**的全部编号（含中央继承来的、本店旧号）；
  从 `1` 起找第一个不在 `nums` 里的号 → J1 对 SALMON BELLY 应生成 `SB-001`
- 中央表（stockinout_data）：保持原逻辑（同前缀 MAX + 1 循环递增、避让在库），不变
- 取「已出现」用 `remarkCodePool`（`deleted_at IS NULL`，与其它在库/备注口径一致）
- 上一版加的 `remarkCodePoolOwn` 不再需要 → 移除

## 验证

1. 重建 jar + 重启
2. J1 对 SALMON BELLY 10PCS 自动生码 → 期望 `SB-001`（不再 433）
3. 中央对同前缀自动生码 → 行为不变
4. 已存在 `SB-001` 时 → 跳到 `SB-002`（不重号）

## 回滚

不涉及数据；`git revert` 或还原 `_jar_backup_20260930/` 里的 jar。

# 2026-11-03 J3 货品备注历史补标（数据修复记录）

任务：`2026-11-03-inout-remark-required`（配套代码修复见 `2026-11-03-mobile-remark-sync`）

## 背景

- 「货品备注」只统计**带备注编号**的流水；手机出货（2026-03 起）从不写编号，
  导致 6 个 J3 货品的备注页数量虚高（合计 ≈180），并让「进货必须勾选」对这些货品永远生效。
- 本次把历史上**确实出掉但没写编号**的出货行补上编号（只改 `remark_number` / `product_remark_checked`；
  数量不足整行的拆成两行，`out_quantity` 拆分后相加不变）。**没有改任何库存总量**。

## 结果（修复前 → 修复后）

| 货品 | 修复前备注净额 | 修复后 | 实际库存 | 保留（真实）编号 |
|---|---|---|---|---|
| SALMON | 154.850 | 21.520 | 21.520 | `SA-242` 21.520 |
| HIKARI SHIRO MISO P | 59.000 | 34.000 | 34.000 | `HS-001` 34.000 |
| SALMON HEAD 10PCS | 14.000 | 2.000 | 2.000 | `SH-554`、`SH-557` 各 1 |
| SALMON BELLY 10PCS | 10.000 | 1.000 | 1.000 | `SB-473` 1 |
| KAWAHAGI P | 20.000 | **0** | 18.000（无编号） | —（进货不再被要求勾选） |
| A5 AWAGYU | 0.557 | 0.219 | 0.219 | `AA-001` 0.110、`AA-002` 0.109 |

## 改动规模

- UPDATE 原行 **42** 条、INSERT 拆行 **3** 条（`20609`、`21403`、`22019`）
- 涉及编号：SALMON 6 个、HIKARI 1 个、HEAD 12 个、BELLY 9 个、KAWAHAGI 1 个、A5 1 个
- 全部改动带标记 `updated_by = history-remark-fix-20261103`，方便事后检索

## 验证（执行后实测）

```sql
-- 1) 6 个货品的 in/out/net 与修复前逐项相同（库存未变）
-- 2) 逐编号净额：无负数，且只留下与库存相等的编号
--   A5: AA-001 0.110 + AA-002 0.109 = 0.219
--   HIKARI: HS-001 34.000
--   SALMON: SA-242 21.520
--   BELLY: SB-473 1.000
--   HEAD: SH-554 1.000 + SH-557 1.000
--   KAWAHAGI: 无（在库编号 = 0 → 进货不勾也能保存）
```

## 执行与回滚

- 执行脚本：`docs/sql/2026-11-03-remark-backfill.sql`（含 `START TRANSACTION` / `COMMIT`）
- 回滚脚本：`docs/sql/2026-11-03-remark-backfill-rollback.sql`（恢复 42 行原值 + 删除 3 条拆行）
- 执行前整表备份：`/opt/inventory/backup/j3stockedit_data_20261103_before_remarkfix.sql`（4.1MB）

```bash
# 回滚
ssh root@187.127.125.136 "mysql -uroot u690174784_kunzz" < docs/sql/2026-11-03-remark-backfill-rollback.sql
```

## 注意

- 本次只修历史数据。**手机端仍未接备注编号**（代码已提交 `140cb3e`，待执行 DDL + 部署），
  在部署前，手机出货仍会产生新的缺口。
- 以后出货走桌面/手机时都会带编号，缺口不会再出现。

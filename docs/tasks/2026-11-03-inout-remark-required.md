# 任务 2026-11-03-inout-remark-required

- 状态：已完成（待部署验证）
- 目标：
  1. 进出货「进货」时，如果该货品在「货品备注」里还有备注编号在库（净库存 > 0），未勾选「货品备注」不允许保存，并弹出通知让用户勾选。
  2. 该货品的备注编号全部出完（在库编号 = 0）后，进货不勾选也能直接保存。
- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/service/StockService.java
  - inventory-system/frontend/src/pages/StockInout.tsx
  - docs/tasks/2026-11-03-inout-remark-required.md
  - CHANGELOG.md
  - docs/DATA_FIX_2026-11-03-remark-backfill.md
  - docs/sql/2026-11-03-remark-backfill.sql
  - docs/sql/2026-11-03-remark-backfill-rollback.sql
- 明确不碰：其它页面、backend/static/**（构建产物由发布 task 统一处理）、package-lock.json
- CHANGELOG.md 只在顶部追加本任务小节（不改老行）
- 计划推送分支：main

## 改动清单

1. `backend/.../service/StockService.java` → `createInout`：进货（in_quantity>0）且未勾选「货品备注」时，
   若该货品在货品备注里还有编号在库（`countInStockRemarkNumber` > 0，净库存>0 口径）→ 抛 BusinessException 拒绝保存。
   编号全部出完（=0）时不拦。
2. `inventory-system/frontend/src/pages/StockInout.tsx`：
   - `saveNewRows` 保存前整批预检（`getRemarkCodes` 缓存，同一货品只查一次），命中则弹红色通知（9 秒）+ 不保存；
   - 命中的行「货品备注」单元格标红框（勾选后 `patchNew` 立即撤掉高亮）；
   - 出货校验改为复用同一个 `codesOf()` 缓存，行为不变。

## 口径核对

- 「货品备注」页（`StockRemarkMapper.analysisRows`）只显示 `current_stock > 0` 的编号，
  与 `remarkCodes` / `countInStockRemarkNumber` 同口径 → 页面里该货品没有任何编号时，进货不勾选即可保存。

## 验证

- `inventory-system/frontend`: `npx tsc -b` 通过（exit 0）。
- `backend`: `javac`（target/classes + ~/.m2 依赖）单文件编译 `StockService.java` 通过（exit 0）。
- 本机无 MySQL（3306 未开），未做端到端联调；部署后需人工验证两条规则。

## 数据修复（2026-11-03 已执行）

- 范围：J3 六个货品（SALMON / HIKARI SHIRO MISO P / SALMON HEAD 10PCS / SALMON BELLY 10PCS / KAWAHAGI P / A5 AWAGYU）
- 方式：给以前没写编号的出货行补 `remark_number` + `product_remark_checked=1`；数量不足整行的拆行（3 条）
- 规模：UPDATE 42 行 + INSERT 3 行，全部带标记 `updated_by=history-remark-fix-20261103`
- 验证：6 个货品 in/out/net 与修复前完全一致；逐编号净额无负数；KAWAHAGI P 在库编号 = 0
- 备份：服务器 `/opt/inventory/backup/j3stockedit_data_20261103_before_remarkfix.sql`（4.1MB）
- 细节与回滚：`docs/DATA_FIX_2026-11-03-remark-backfill.md`

# 任务 2026-11-03-mobile-remark-sync

- 状态：已完成（待执行 DDL + 部署）
- 背景：J3 有 6 个货品「货品备注」虚高（合计 ≈180），排查结论：**手机出货（`/api/stock/mobile/*`）完全不写备注编号** ——
  `MobileStockService` 没有 remark 字段、手机台账表 `jXstockeditmobile_data` 也没有这两列，
  桌面镜像 `jXstockedit_data` 插入时同样不带 → 货品备注永远扣不到。2026-03-21 之后的未勾选出货几乎都是 `receiver='Mobile'`。
- 目标：手机出货必须带备注编号（有编号在库时），并同步写进手机台账 + 桌面镜像，让货品备注与进出货同步。
- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/dto/MobileStockRequest.java
  - backend/src/main/java/com/kunzz/inventory/dto/MobileBatchSaveRequest.java
  - backend/src/main/java/com/kunzz/inventory/service/MobileStockService.java
  - backend/src/main/resources/mapper/MobileStockMapper.xml
  - inventory-system/frontend/src/api/mobile.ts
  - inventory-system/frontend/src/pages/MobileOut.tsx
  - add_remark_mobile_20261103.sql
  - docs/tasks/2026-11-03-mobile-remark-sync.md
  - CHANGELOG.md
- CHANGELOG.md 只在顶部追加本任务小节（不改老行）
- 明确不碰：其它页面、backend/static/**（前端产物由发布流程重建）、database/*.dump
- 计划推送分支：main

## 改动

1. `add_remark_mobile_20261103.sql`：`j1/j2/j3stockeditmobile_data` 各加 `remark_number VARCHAR(32) NULL`、
   `product_remark_checked TINYINT(1) NOT NULL DEFAULT 0`（只加列，不动数据）。
2. `MobileStockRequest` / `MobileBatchSaveRequest.Row`：加 `remarkNumber`、`productRemarkChecked`。
3. `MobileStockMapper.xml`：`insertRecord` / `updateRecord` / `insertRecordWithRef` / `insertDesktopRow` 四个语句带备注两列。
4. `MobileStockService`：
   - 注入 `StockInoutMapper`，复用桌面同一套「在库备注编号」判定；
   - `batchSave` 写入前整批校验：货品有编号在库 → 必须给 `remarkNumber` 且编号必须在库，否则拒绝；
   - 编号写进手机台账 + 桌面镜像（HIFO 拆多行时每行都带同一编号）；
   - `create` / `update` / `restoreByDesktopRef` 同样带上编号；
   - 工具：`normalizeRemark()`（去空白+大写）、`isChecked()`。
5. `api/mobile.ts`：`MobileBatchRow` / `MobileRecordPayload` / `MobileRecord` 加字段。
6. `MobileOut.tsx`：编辑某行时先拉 `getRemarkCodeOptions(product, system)`，
   有编号则显示下拉（只剩一个自动选中）；加载中/未选 → 不允许保存；提交时每一行都带 `remarkNumber`。

## 部署顺序（必须按这个顺序，否则手机保存会 500）

1. `mysql -uroot u690174784_kunzz < add_remark_mobile_20261103.sql`
2. 重新打包后端并重启：`cd backend && mvn -B -DskipTests package` → 替换 `/opt/inventory/app.jar` → `systemctl restart inventory-backend`
3. 前端 `npm run build` → `dist/` 覆盖 `/var/www/admin`（本次产物 `index-R2KEts5m.js`）

## 验证

- `javac`（target/classes + ~/.m2）编译 3 个改动类通过；`npx tsc -b` 通过；`npm run build` 通过。
- 部署后验：手机版编辑一个有备注编号的货品（如 KAWAHAGI P）→ 出现「备注编号」下拉；
  不选保存 → 提示且拦下；选了保存 → `j3stockedit_data` 新镜像行 `remark_number=KP-001`、`product_remark_checked=1`，
  「货品备注」对应数量同步减少。

## 注意

- 历史 532 条手机出货仍无编号（本次只保证以后不再产生新的缺口）→ 需要另做数据修复（见 2026-11-03-inout-remark-required 的排查结论）。

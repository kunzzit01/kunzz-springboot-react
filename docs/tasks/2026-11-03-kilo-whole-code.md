# 任务 2026-11-03-kilo-whole-code

- 状态：已完成（待发布）
- 需求（测试人员）：Kilo 类货品常常整批出 → 在手机上点选备注编号后可以「整批出完」，不必手算剩余量；
  **Packet 不允许整批出**（例：34 pkt 只出 2 pkt，仍须输入剩余 32），按钮对 Packet 隐藏，避免误点。
- 范围：仅 `specification = Kilo` 的货品行显示「整批出完」；部分出货流程、桌面进出货完全不变。
- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/mapper/StockEditMapper.java
  - backend/src/main/resources/mapper/StockEditMapper.xml
  - backend/src/main/java/com/kunzz/inventory/service/StockEditService.java
  - backend/src/main/java/com/kunzz/inventory/controller/StockEnhanceController.java
  - backend/src/main/java/com/kunzz/inventory/dto/MobileBatchSaveRequest.java
  - backend/src/main/java/com/kunzz/inventory/mapper/MobileStockMapper.java
  - backend/src/main/resources/mapper/MobileStockMapper.xml
  - backend/src/main/java/com/kunzz/inventory/service/MobileStockService.java
  - inventory-system/frontend/src/api/index.ts
  - inventory-system/frontend/src/api/mobile.ts
  - inventory-system/frontend/src/pages/MobileOut.tsx
  - docs/tasks/2026-11-03-kilo-whole-code.md
  - CHANGELOG.md
- 计划推送分支：main

## 实现

1. **后端**
   - 新接口 `GET /api/stock/remark-code-price-options?productName=&system=`：返回「编号 + 价格层 + 剩余量 + 规格」
     （`StockEditMapper.remarkCodePriceOptions`，按 `remark_number + ROUND(price,2)` 分组、`HAVING net > 0`）。
     现有 `remark-code-options` 完全不动（桌面下拉继续用）。
   - `MobileBatchSaveRequest.Row` 增加 `wholeCode`；`MobileStockService.batchSave` 增加防超卖校验：
     同一 `货品|编号` 的 `wholeCode` 出货合计 ≤ `remarkNumberStock()`（净库存口径），超出直接拒绝。
2. **手机前端**
   - `MobileOut.tsx`：只有 `specification = Kilo` 且该货品有在库编号时，备注编号下拉旁显示「整批出完」按钮。
   - 点击 → 拉 `/remark-code-price-options` → 按编号自己的价格层拆行 → `window.confirm` 二次确认 → 批量提交。
   - Packet（非 Kilo）**不显示**该按钮，仍走原「剩余量」流程（34 pkt 出 2 pkt = 输 32）。
3. **不受影响**：桌面进出货、`remark-code-options`、历史数据、货品备注同步逻辑、数据库结构（无 DDL）。

## 验证

- `javac`（target/classes + ~/.m2）编译 7 个改动类通过；`npx tsc -b` 通过；`npm run build` 通过（产物 `index-BUVGGTT4.js`）。
- 发布后需实测：
  1. Kilo 行（如 SALMON `SA-242`）→ 出现「整批出完」→ 确认 → 该编号从货品备注消失、库存减 21.52；
  2. 跨价编号（如 `SA-230` 51.70+54.00）→ 拆两行、两行同一编号、金额正确；
  3. Packet 行（如 SALMON BELLY 10PCS）→ **看不到**「整批出完」，34 出 2 仍须输剩余 32；
  4. 两个手机同时整批同一编号 → 第二个提示「超过剩余量」。

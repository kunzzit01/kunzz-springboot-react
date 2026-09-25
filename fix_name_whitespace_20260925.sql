-- ============================================================
-- 修复「货品名里夹着不可见空白 → 总库存有货、出货却永远提示库存不足」
-- 任务：2026-09-25-name-whitespace-cleanup      执行日期：____________
--
-- 【现象】J3 出货 SK 0045 / OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML 被拒：
--         「库存不足！可用库存: 0，请求出库: 1」，而总库存页该货品显示 1.000。
--
-- 【原因】这个名字里 JIKOMI 与 700ML 之间是两个空格（HEX ...4D49 2020 3730304D4C）。
--   货品名在本系统里同时是「货品身份」：2026-09-24 起写入端会把连续空白折叠成单个空格
--   （backend/.../common/ProductName.java，挂在 StockInoutRequest 等构造器上），
--   而出货库存校验 availableStockBranch/availableStockCentral 按 product_name 逐字节比对
--   → 规范化后的名字匹配不到历史行 → 可用库存算成 0。
--   总库存页与价格下拉用的是「原样名字」，所以出现「看得到有货、出不了货」。
--   同一类隐患还会让新入库与历史行在总库存里裂成两行（9/19 SURUME IKA 那次）。
--
-- 【处理】把下面 4 个名字的所有历史行统一成「单个空格」版（= 写入端规范化后的结果）：
--   · OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML → OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML   （编码 SK 0045）
--   · EGG  ( FREE ) → EGG ( FREE )   （编码 DI 0100）
--   · HALF CUT  NORI → HALF CUT NORI   （编码 DI 0024）
--   · HALF CUT  NORI FUDO → HALF CUT NORI FUDO   （编码 DI 0024）
--   注：HALF CUT NORI 另有 DI 0025 / DI 0102 两行是另外的货品，靠货品编号区分，不受影响。
--
-- 【说明】
--   * 用 BINARY 精确匹配，不依赖库/连接的字符集（避免 collation 冲突）。
--   * 可重复执行：无匹配行时为 0 rows。
--   * 不改 updated_at / last_updated（这批行没有编辑人，避免制造假的「更新时间」）。
--   * 只改名字，不动任何数量与金额：库存、总价、各系统总额分文不变（自检③④会对账）。
--   * 执行前先备份：
--       sudo mysqldump --single-transaction u690174784_kunzz | gzip > /opt/backups/before_name_fix_$(date +%F_%H%M).sql.gz
-- ============================================================

-- ------------------------------------------------------------
-- 0) 执行前快照（只读）：哪些行带「不可见空白」，以及各系统净库存/总额
--    执行后用第 5 节的同一段再看一次，除名字外数字应当完全一致
-- ------------------------------------------------------------
SELECT 'stockinout_data'        AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM stockinout_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j1stockinout_data'      AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j1stockinout_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j2stockinout_data'      AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j2stockinout_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j3stockinout_data'      AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j3stockinout_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j1stockedit_data'       AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j1stockedit_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j2stockedit_data'       AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j2stockedit_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j3stockedit_data'       AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j3stockedit_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j1stockeditmobile_data' AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j1stockeditmobile_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j2stockeditmobile_data' AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j2stockeditmobile_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j3stockeditmobile_data' AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j3stockeditmobile_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'stock_data'             AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM stock_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'price_change_log'       AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM price_change_log WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j1stocklist_total'      AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j1stocklist_total WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j2stocklist_total'      AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j2stocklist_total WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j3stocklist_total'      AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM j3stocklist_total WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'stock_minimum_settings' AS tbl, COUNT(*) AS bad_rows, MIN(HEX(product_name)) AS sample_hex FROM stock_minimum_settings WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));

SELECT 'central'  AS sys, COALESCE(SUM(in_quantity),0)-COALESCE(SUM(out_quantity),0) AS net_qty,
       ROUND(SUM((COALESCE(in_quantity,0)-COALESCE(out_quantity,0))*ROUND(price,2)),2) AS total_value
  FROM stockinout_data WHERE deleted_at IS NULL;
SELECT 'J1'       AS sys, COALESCE(SUM(in_quantity),0)-COALESCE(SUM(out_quantity),0) AS net_qty,
       ROUND(SUM((COALESCE(in_quantity,0)-COALESCE(out_quantity,0))*ROUND(price,2)),2) AS total_value
  FROM j1stockedit_data WHERE deleted_at IS NULL;
SELECT 'J2'       AS sys, COALESCE(SUM(in_quantity),0)-COALESCE(SUM(out_quantity),0) AS net_qty,
       ROUND(SUM((COALESCE(in_quantity,0)-COALESCE(out_quantity,0))*ROUND(price,2)),2) AS total_value
  FROM j2stockedit_data WHERE deleted_at IS NULL;
SELECT 'J3'       AS sys, COALESCE(SUM(in_quantity),0)-COALESCE(SUM(out_quantity),0) AS net_qty,
       ROUND(SUM((COALESCE(in_quantity,0)-COALESCE(out_quantity,0))*ROUND(price,2)),2) AS total_value
  FROM j3stockedit_data WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- 1) 流水 / 台账类表：无唯一键，直接改名
-- ------------------------------------------------------------

-- OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML（SK 0045）
UPDATE stockinout_data          SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j1stockinout_data        SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j2stockinout_data        SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j3stockinout_data        SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j1stockedit_data         SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j2stockedit_data         SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j3stockedit_data         SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j1stockeditmobile_data   SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j2stockeditmobile_data   SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j3stockeditmobile_data   SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE stock_data               SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE price_change_log         SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML' WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';

-- EGG ( FREE )（DI 0100）
UPDATE stockinout_data          SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j1stockinout_data        SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j2stockinout_data        SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j3stockinout_data        SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j1stockedit_data         SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j2stockedit_data         SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j3stockedit_data         SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j1stockeditmobile_data   SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j2stockeditmobile_data   SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j3stockeditmobile_data   SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE stock_data               SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE price_change_log         SET product_name = 'EGG ( FREE )' WHERE product_name = BINARY 'EGG  ( FREE )';

-- HALF CUT NORI（DI 0024）
UPDATE stockinout_data          SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j1stockinout_data        SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j2stockinout_data        SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j3stockinout_data        SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j1stockedit_data         SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j2stockedit_data         SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j3stockedit_data         SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j1stockeditmobile_data   SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j2stockeditmobile_data   SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j3stockeditmobile_data   SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE stock_data               SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE price_change_log         SET product_name = 'HALF CUT NORI' WHERE product_name = BINARY 'HALF CUT  NORI';

-- HALF CUT NORI FUDO（DI 0024）
UPDATE stockinout_data          SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j1stockinout_data        SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j2stockinout_data        SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j3stockinout_data        SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j1stockedit_data         SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j2stockedit_data         SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j3stockedit_data         SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j1stockeditmobile_data   SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j2stockeditmobile_data   SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j3stockeditmobile_data   SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE stock_data               SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE price_change_log         SET product_name = 'HALF CUT NORI FUDO' WHERE product_name = BINARY 'HALF CUT  NORI FUDO';

-- ------------------------------------------------------------
-- 2) jXstocklist_total（手机版总库存缓存）
--    唯一键 = (product_name, code_number, specification)
--    顺序：合并数量到已存在的空格行 → 删掉旧名行 → 剩余旧名行改名
--    （线上这几个名字当前都没有「空格行 + 旧名行同时存在」的情况，前两步应为 0 行；
--      保留是为了防线上状态已漂移 —— 撞唯一键直接报错比多跑两条语句危险得多）
-- ------------------------------------------------------------

-- OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML
UPDATE j1stocklist_total t1 JOIN j1stocklist_total t2
   ON t1.product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML'
  AND t2.product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j1stocklist_total t2 JOIN j1stocklist_total t1
   ON t1.product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML'
  AND t2.product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j1stocklist_total SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', last_updated = last_updated WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j2stocklist_total t1 JOIN j2stocklist_total t2
   ON t1.product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML'
  AND t2.product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j2stocklist_total t2 JOIN j2stocklist_total t1
   ON t1.product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML'
  AND t2.product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j2stocklist_total SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', last_updated = last_updated WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';
UPDATE j3stocklist_total t1 JOIN j3stocklist_total t2
   ON t1.product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML'
  AND t2.product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j3stocklist_total t2 JOIN j3stocklist_total t1
   ON t1.product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML'
  AND t2.product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j3stocklist_total SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', last_updated = last_updated WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';

-- EGG ( FREE )
UPDATE j1stocklist_total t1 JOIN j1stocklist_total t2
   ON t1.product_name = 'EGG ( FREE )'
  AND t2.product_name = BINARY 'EGG  ( FREE )'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j1stocklist_total t2 JOIN j1stocklist_total t1
   ON t1.product_name = 'EGG ( FREE )'
  AND t2.product_name = BINARY 'EGG  ( FREE )'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j1stocklist_total SET product_name = 'EGG ( FREE )', last_updated = last_updated WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j2stocklist_total t1 JOIN j2stocklist_total t2
   ON t1.product_name = 'EGG ( FREE )'
  AND t2.product_name = BINARY 'EGG  ( FREE )'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j2stocklist_total t2 JOIN j2stocklist_total t1
   ON t1.product_name = 'EGG ( FREE )'
  AND t2.product_name = BINARY 'EGG  ( FREE )'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j2stocklist_total SET product_name = 'EGG ( FREE )', last_updated = last_updated WHERE product_name = BINARY 'EGG  ( FREE )';
UPDATE j3stocklist_total t1 JOIN j3stocklist_total t2
   ON t1.product_name = 'EGG ( FREE )'
  AND t2.product_name = BINARY 'EGG  ( FREE )'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j3stocklist_total t2 JOIN j3stocklist_total t1
   ON t1.product_name = 'EGG ( FREE )'
  AND t2.product_name = BINARY 'EGG  ( FREE )'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j3stocklist_total SET product_name = 'EGG ( FREE )', last_updated = last_updated WHERE product_name = BINARY 'EGG  ( FREE )';

-- HALF CUT NORI
UPDATE j1stocklist_total t1 JOIN j1stocklist_total t2
   ON t1.product_name = 'HALF CUT NORI'
  AND t2.product_name = BINARY 'HALF CUT  NORI'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j1stocklist_total t2 JOIN j1stocklist_total t1
   ON t1.product_name = 'HALF CUT NORI'
  AND t2.product_name = BINARY 'HALF CUT  NORI'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j1stocklist_total SET product_name = 'HALF CUT NORI', last_updated = last_updated WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j2stocklist_total t1 JOIN j2stocklist_total t2
   ON t1.product_name = 'HALF CUT NORI'
  AND t2.product_name = BINARY 'HALF CUT  NORI'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j2stocklist_total t2 JOIN j2stocklist_total t1
   ON t1.product_name = 'HALF CUT NORI'
  AND t2.product_name = BINARY 'HALF CUT  NORI'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j2stocklist_total SET product_name = 'HALF CUT NORI', last_updated = last_updated WHERE product_name = BINARY 'HALF CUT  NORI';
UPDATE j3stocklist_total t1 JOIN j3stocklist_total t2
   ON t1.product_name = 'HALF CUT NORI'
  AND t2.product_name = BINARY 'HALF CUT  NORI'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j3stocklist_total t2 JOIN j3stocklist_total t1
   ON t1.product_name = 'HALF CUT NORI'
  AND t2.product_name = BINARY 'HALF CUT  NORI'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j3stocklist_total SET product_name = 'HALF CUT NORI', last_updated = last_updated WHERE product_name = BINARY 'HALF CUT  NORI';

-- HALF CUT NORI FUDO
UPDATE j1stocklist_total t1 JOIN j1stocklist_total t2
   ON t1.product_name = 'HALF CUT NORI FUDO'
  AND t2.product_name = BINARY 'HALF CUT  NORI FUDO'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j1stocklist_total t2 JOIN j1stocklist_total t1
   ON t1.product_name = 'HALF CUT NORI FUDO'
  AND t2.product_name = BINARY 'HALF CUT  NORI FUDO'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j1stocklist_total SET product_name = 'HALF CUT NORI FUDO', last_updated = last_updated WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j2stocklist_total t1 JOIN j2stocklist_total t2
   ON t1.product_name = 'HALF CUT NORI FUDO'
  AND t2.product_name = BINARY 'HALF CUT  NORI FUDO'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j2stocklist_total t2 JOIN j2stocklist_total t1
   ON t1.product_name = 'HALF CUT NORI FUDO'
  AND t2.product_name = BINARY 'HALF CUT  NORI FUDO'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j2stocklist_total SET product_name = 'HALF CUT NORI FUDO', last_updated = last_updated WHERE product_name = BINARY 'HALF CUT  NORI FUDO';
UPDATE j3stocklist_total t1 JOIN j3stocklist_total t2
   ON t1.product_name = 'HALF CUT NORI FUDO'
  AND t2.product_name = BINARY 'HALF CUT  NORI FUDO'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification
SET t1.total_qty = t1.total_qty + t2.total_qty;
DELETE t2 FROM j3stocklist_total t2 JOIN j3stocklist_total t1
   ON t1.product_name = 'HALF CUT NORI FUDO'
  AND t2.product_name = BINARY 'HALF CUT  NORI FUDO'
  AND t1.code_number <=> t2.code_number AND t1.specification <=> t2.specification;
UPDATE j3stocklist_total SET product_name = 'HALF CUT NORI FUDO', last_updated = last_updated WHERE product_name = BINARY 'HALF CUT  NORI FUDO';

-- ------------------------------------------------------------
-- 3) stock_minimum_settings（最低库存）
--    唯一键 = (stock_system, product_name)：撞车取两者较大值
-- ------------------------------------------------------------

-- OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML
UPDATE stock_minimum_settings t1 JOIN stock_minimum_settings t2
   ON t1.product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML'
  AND t2.product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
  AND t1.stock_system = t2.stock_system
SET t1.minimum_quantity = GREATEST(t1.minimum_quantity, t2.minimum_quantity), t1.updated_at = t1.updated_at;
DELETE t2 FROM stock_minimum_settings t2 JOIN stock_minimum_settings t1
   ON t1.product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML'
  AND t2.product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
  AND t1.stock_system = t2.stock_system;
UPDATE stock_minimum_settings SET product_name = 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', updated_at = updated_at WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML';

-- EGG ( FREE )
UPDATE stock_minimum_settings t1 JOIN stock_minimum_settings t2
   ON t1.product_name = 'EGG ( FREE )'
  AND t2.product_name = BINARY 'EGG  ( FREE )'
  AND t1.stock_system = t2.stock_system
SET t1.minimum_quantity = GREATEST(t1.minimum_quantity, t2.minimum_quantity), t1.updated_at = t1.updated_at;
DELETE t2 FROM stock_minimum_settings t2 JOIN stock_minimum_settings t1
   ON t1.product_name = 'EGG ( FREE )'
  AND t2.product_name = BINARY 'EGG  ( FREE )'
  AND t1.stock_system = t2.stock_system;
UPDATE stock_minimum_settings SET product_name = 'EGG ( FREE )', updated_at = updated_at WHERE product_name = BINARY 'EGG  ( FREE )';

-- HALF CUT NORI
UPDATE stock_minimum_settings t1 JOIN stock_minimum_settings t2
   ON t1.product_name = 'HALF CUT NORI'
  AND t2.product_name = BINARY 'HALF CUT  NORI'
  AND t1.stock_system = t2.stock_system
SET t1.minimum_quantity = GREATEST(t1.minimum_quantity, t2.minimum_quantity), t1.updated_at = t1.updated_at;
DELETE t2 FROM stock_minimum_settings t2 JOIN stock_minimum_settings t1
   ON t1.product_name = 'HALF CUT NORI'
  AND t2.product_name = BINARY 'HALF CUT  NORI'
  AND t1.stock_system = t2.stock_system;
UPDATE stock_minimum_settings SET product_name = 'HALF CUT NORI', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI';

-- HALF CUT NORI FUDO
UPDATE stock_minimum_settings t1 JOIN stock_minimum_settings t2
   ON t1.product_name = 'HALF CUT NORI FUDO'
  AND t2.product_name = BINARY 'HALF CUT  NORI FUDO'
  AND t1.stock_system = t2.stock_system
SET t1.minimum_quantity = GREATEST(t1.minimum_quantity, t2.minimum_quantity), t1.updated_at = t1.updated_at;
DELETE t2 FROM stock_minimum_settings t2 JOIN stock_minimum_settings t1
   ON t1.product_name = 'HALF CUT NORI FUDO'
  AND t2.product_name = BINARY 'HALF CUT  NORI FUDO'
  AND t1.stock_system = t2.stock_system;
UPDATE stock_minimum_settings SET product_name = 'HALF CUT NORI FUDO', updated_at = updated_at WHERE product_name = BINARY 'HALF CUT  NORI FUDO';

-- ------------------------------------------------------------
-- 4) 提交
-- ------------------------------------------------------------
COMMIT;

-- ------------------------------------------------------------
-- 5) 自检（执行后运行；每一条都应是 0 / 期望值）
-- ------------------------------------------------------------
-- ① 还有「不可见空白」的行：全部应为 0
SELECT 'stockinout_data'        AS tbl, COUNT(*) AS bad_rows FROM stockinout_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j1stockinout_data'      AS tbl, COUNT(*) AS bad_rows FROM j1stockinout_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j2stockinout_data'      AS tbl, COUNT(*) AS bad_rows FROM j2stockinout_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j3stockinout_data'      AS tbl, COUNT(*) AS bad_rows FROM j3stockinout_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j1stockedit_data'       AS tbl, COUNT(*) AS bad_rows FROM j1stockedit_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j2stockedit_data'       AS tbl, COUNT(*) AS bad_rows FROM j2stockedit_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j3stockedit_data'       AS tbl, COUNT(*) AS bad_rows FROM j3stockedit_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j1stockeditmobile_data' AS tbl, COUNT(*) AS bad_rows FROM j1stockeditmobile_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j2stockeditmobile_data' AS tbl, COUNT(*) AS bad_rows FROM j2stockeditmobile_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j3stockeditmobile_data' AS tbl, COUNT(*) AS bad_rows FROM j3stockeditmobile_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'stock_data'             AS tbl, COUNT(*) AS bad_rows FROM stock_data WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'price_change_log'       AS tbl, COUNT(*) AS bad_rows FROM price_change_log WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j1stocklist_total'      AS tbl, COUNT(*) AS bad_rows FROM j1stocklist_total WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j2stocklist_total'      AS tbl, COUNT(*) AS bad_rows FROM j2stocklist_total WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'j3stocklist_total'      AS tbl, COUNT(*) AS bad_rows FROM j3stocklist_total WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));
SELECT 'stock_minimum_settings' AS tbl, COUNT(*) AS bad_rows FROM stock_minimum_settings WHERE product_name <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));

-- ①b 更狠的字符类别扫描（NBSP / 全角空格 / 零宽空格 / BOM / 连续空格；HEX 大写）：应为 0 行
SELECT 'stockinout_data' AS tbl, COUNT(*) AS hex_suspect FROM stockinout_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j1stockinout_data'     , COUNT(*) FROM j1stockinout_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j2stockinout_data'     , COUNT(*) FROM j2stockinout_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j3stockinout_data'     , COUNT(*) FROM j3stockinout_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j1stockedit_data'      , COUNT(*) FROM j1stockedit_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j2stockedit_data'      , COUNT(*) FROM j2stockedit_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j3stockedit_data'      , COUNT(*) FROM j3stockedit_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j1stockeditmobile_data', COUNT(*) FROM j1stockeditmobile_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j2stockeditmobile_data', COUNT(*) FROM j2stockeditmobile_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j3stockeditmobile_data', COUNT(*) FROM j3stockeditmobile_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'stock_data'            , COUNT(*) FROM stock_data WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'price_change_log'      , COUNT(*) FROM price_change_log WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j1stocklist_total'     , COUNT(*) FROM j1stocklist_total WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j2stocklist_total'     , COUNT(*) FROM j2stocklist_total WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'j3stocklist_total'     , COUNT(*) FROM j3stocklist_total WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
UNION ALL SELECT 'stock_minimum_settings', COUNT(*) FROM stock_minimum_settings WHERE HEX(product_name) LIKE '%2020%' OR HEX(product_name) LIKE '%C2A0%' OR HEX(product_name) LIKE '%E38080%'
    OR HEX(product_name) LIKE '%E2808B%' OR HEX(product_name) LIKE '%EFBBBF%' OR HEX(product_name) LIKE '%E280AF%' OR HEX(product_name) LIKE '%E28087%'
;

-- ② 这 4 条货品在各表应只剩 1 种写法（BINARY 匹配旧名 → 应为 0）
-- OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML
SELECT 'stockinout_data' AS tbl, COUNT(*) AS left_rows FROM stockinout_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j1stockinout_data'     , COUNT(*) FROM j1stockinout_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j2stockinout_data'     , COUNT(*) FROM j2stockinout_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j3stockinout_data'     , COUNT(*) FROM j3stockinout_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j1stockedit_data'      , COUNT(*) FROM j1stockedit_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j2stockedit_data'      , COUNT(*) FROM j2stockedit_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j3stockedit_data'      , COUNT(*) FROM j3stockedit_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j1stockeditmobile_data', COUNT(*) FROM j1stockeditmobile_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j2stockeditmobile_data', COUNT(*) FROM j2stockeditmobile_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j3stockeditmobile_data', COUNT(*) FROM j3stockeditmobile_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'stock_data'            , COUNT(*) FROM stock_data WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'price_change_log'      , COUNT(*) FROM price_change_log WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j1stocklist_total'     , COUNT(*) FROM j1stocklist_total WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j2stocklist_total'     , COUNT(*) FROM j2stocklist_total WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'j3stocklist_total'     , COUNT(*) FROM j3stocklist_total WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
UNION ALL SELECT 'stock_minimum_settings', COUNT(*) FROM stock_minimum_settings WHERE product_name = BINARY 'OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI  700ML'
;

-- EGG ( FREE )
SELECT 'stockinout_data' AS tbl, COUNT(*) AS left_rows FROM stockinout_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j1stockinout_data'     , COUNT(*) FROM j1stockinout_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j2stockinout_data'     , COUNT(*) FROM j2stockinout_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j3stockinout_data'     , COUNT(*) FROM j3stockinout_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j1stockedit_data'      , COUNT(*) FROM j1stockedit_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j2stockedit_data'      , COUNT(*) FROM j2stockedit_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j3stockedit_data'      , COUNT(*) FROM j3stockedit_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j1stockeditmobile_data', COUNT(*) FROM j1stockeditmobile_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j2stockeditmobile_data', COUNT(*) FROM j2stockeditmobile_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j3stockeditmobile_data', COUNT(*) FROM j3stockeditmobile_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'stock_data'            , COUNT(*) FROM stock_data WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'price_change_log'      , COUNT(*) FROM price_change_log WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j1stocklist_total'     , COUNT(*) FROM j1stocklist_total WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j2stocklist_total'     , COUNT(*) FROM j2stocklist_total WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'j3stocklist_total'     , COUNT(*) FROM j3stocklist_total WHERE product_name = BINARY 'EGG  ( FREE )'
UNION ALL SELECT 'stock_minimum_settings', COUNT(*) FROM stock_minimum_settings WHERE product_name = BINARY 'EGG  ( FREE )'
;

-- HALF CUT NORI
SELECT 'stockinout_data' AS tbl, COUNT(*) AS left_rows FROM stockinout_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j1stockinout_data'     , COUNT(*) FROM j1stockinout_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j2stockinout_data'     , COUNT(*) FROM j2stockinout_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j3stockinout_data'     , COUNT(*) FROM j3stockinout_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j1stockedit_data'      , COUNT(*) FROM j1stockedit_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j2stockedit_data'      , COUNT(*) FROM j2stockedit_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j3stockedit_data'      , COUNT(*) FROM j3stockedit_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j1stockeditmobile_data', COUNT(*) FROM j1stockeditmobile_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j2stockeditmobile_data', COUNT(*) FROM j2stockeditmobile_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j3stockeditmobile_data', COUNT(*) FROM j3stockeditmobile_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'stock_data'            , COUNT(*) FROM stock_data WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'price_change_log'      , COUNT(*) FROM price_change_log WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j1stocklist_total'     , COUNT(*) FROM j1stocklist_total WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j2stocklist_total'     , COUNT(*) FROM j2stocklist_total WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'j3stocklist_total'     , COUNT(*) FROM j3stocklist_total WHERE product_name = BINARY 'HALF CUT  NORI'
UNION ALL SELECT 'stock_minimum_settings', COUNT(*) FROM stock_minimum_settings WHERE product_name = BINARY 'HALF CUT  NORI'
;

-- HALF CUT NORI FUDO
SELECT 'stockinout_data' AS tbl, COUNT(*) AS left_rows FROM stockinout_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j1stockinout_data'     , COUNT(*) FROM j1stockinout_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j2stockinout_data'     , COUNT(*) FROM j2stockinout_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j3stockinout_data'     , COUNT(*) FROM j3stockinout_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j1stockedit_data'      , COUNT(*) FROM j1stockedit_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j2stockedit_data'      , COUNT(*) FROM j2stockedit_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j3stockedit_data'      , COUNT(*) FROM j3stockedit_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j1stockeditmobile_data', COUNT(*) FROM j1stockeditmobile_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j2stockeditmobile_data', COUNT(*) FROM j2stockeditmobile_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j3stockeditmobile_data', COUNT(*) FROM j3stockeditmobile_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'stock_data'            , COUNT(*) FROM stock_data WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'price_change_log'      , COUNT(*) FROM price_change_log WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j1stocklist_total'     , COUNT(*) FROM j1stocklist_total WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j2stocklist_total'     , COUNT(*) FROM j2stocklist_total WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'j3stocklist_total'     , COUNT(*) FROM j3stocklist_total WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
UNION ALL SELECT 'stock_minimum_settings', COUNT(*) FROM stock_minimum_settings WHERE product_name = BINARY 'HALF CUT  NORI FUDO'
;

-- ③ 出货库存校验（用户被卡的那一步）：规范化后的名字 + 价格 324 → 应为 1.000
SELECT COALESCE(SUM(CASE WHEN in_quantity > 0 THEN in_quantity ELSE 0 END),0)
     - COALESCE(SUM(CASE WHEN out_quantity > 0 THEN out_quantity ELSE 0 END),0) AS available_j3_sk0045
  FROM j3stockedit_data
 WHERE REPLACE(product_name, '&amp;', '&') = REPLACE('OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML', '&amp;', '&')
   AND ROUND(price, 2) = ROUND(324, 2) AND deleted_at IS NULL;

-- ④ 各系统净库存与总额（应与执行前完全一致）
SELECT 'central'  AS sys, COALESCE(SUM(in_quantity),0)-COALESCE(SUM(out_quantity),0) AS net_qty,
       ROUND(SUM((COALESCE(in_quantity,0)-COALESCE(out_quantity,0))*ROUND(price,2)),2) AS total_value
  FROM stockinout_data WHERE deleted_at IS NULL;
SELECT 'J1'       AS sys, COALESCE(SUM(in_quantity),0)-COALESCE(SUM(out_quantity),0) AS net_qty,
       ROUND(SUM((COALESCE(in_quantity,0)-COALESCE(out_quantity,0))*ROUND(price,2)),2) AS total_value
  FROM j1stockedit_data WHERE deleted_at IS NULL;
SELECT 'J2'       AS sys, COALESCE(SUM(in_quantity),0)-COALESCE(SUM(out_quantity),0) AS net_qty,
       ROUND(SUM((COALESCE(in_quantity,0)-COALESCE(out_quantity,0))*ROUND(price,2)),2) AS total_value
  FROM j2stockedit_data WHERE deleted_at IS NULL;
SELECT 'J3'       AS sys, COALESCE(SUM(in_quantity),0)-COALESCE(SUM(out_quantity),0) AS net_qty,
       ROUND(SUM((COALESCE(in_quantity,0)-COALESCE(out_quantity,0))*ROUND(price,2)),2) AS total_value
  FROM j3stockedit_data WHERE deleted_at IS NULL;


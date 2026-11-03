-- =======================================================================
-- 2026-11-03  task 2026-11-03-mobile-remark-sync
-- 手机台账表加备注编号两列：手机出货必须挂「备注编号」，
-- 否则这批货不会从「货品备注」扣减（2026-03 起的历史缺口就是这么产生的）。
-- 只加列，不改任何既有数据；库里没有默认值时按 0 / NULL 处理。
-- 执行：mysql -uroot u690174784_kunzz < add_remark_mobile_20261103.sql
-- =======================================================================

ALTER TABLE j1stockeditmobile_data
  ADD COLUMN remark_number VARCHAR(32) NULL AFTER receiver,
  ADD COLUMN product_remark_checked TINYINT(1) NOT NULL DEFAULT 0 AFTER remark_number;

ALTER TABLE j2stockeditmobile_data
  ADD COLUMN remark_number VARCHAR(32) NULL AFTER receiver,
  ADD COLUMN product_remark_checked TINYINT(1) NOT NULL DEFAULT 0 AFTER remark_number;

ALTER TABLE j3stockeditmobile_data
  ADD COLUMN remark_number VARCHAR(32) NULL AFTER receiver,
  ADD COLUMN product_remark_checked TINYINT(1) NOT NULL DEFAULT 0 AFTER remark_number;

-- 校验（应返回 6 行：3 张表 × 2 列）
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('j1stockeditmobile_data', 'j2stockeditmobile_data', 'j3stockeditmobile_data')
  AND COLUMN_NAME IN ('remark_number', 'product_remark_checked')
ORDER BY TABLE_NAME, COLUMN_NAME;

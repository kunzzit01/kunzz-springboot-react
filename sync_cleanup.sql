-- ============================================================
-- 同步线上数据后的清洗脚本（sync-live-data.bat 自动调用）
-- 处理：HTML 实体产品名 / 最低库存重复 / users.gender 空串
-- 所有 UPDATE 无匹配行时不影响（0 rows），可重复执行
-- ============================================================

-- 1) HTML 实体解码：&amp; → &，&#039; → '（按表逐个执行）
UPDATE stockinout_data SET product_name = REPLACE(REPLACE(product_name, '&amp;', '&'), '&#039;', CHAR(39)) WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';
UPDATE j1stockedit_data SET product_name = REPLACE(REPLACE(product_name, '&amp;', '&'), '&#039;', CHAR(39)) WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';
UPDATE j2stockedit_data SET product_name = REPLACE(REPLACE(product_name, '&amp;', '&'), '&#039;', CHAR(39)) WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';
UPDATE j3stockedit_data SET product_name = REPLACE(REPLACE(product_name, '&amp;', '&'), '&#039;', CHAR(39)) WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';
UPDATE j1stockinout_data SET product_name = REPLACE(REPLACE(product_name, '&amp;', '&'), '&#039;', CHAR(39)) WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';
UPDATE j2stockinout_data SET product_name = REPLACE(REPLACE(product_name, '&amp;', '&'), '&#039;', CHAR(39)) WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';
UPDATE j3stockinout_data SET product_name = REPLACE(REPLACE(product_name, '&amp;', '&'), '&#039;', CHAR(39)) WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';
UPDATE stock_data SET product_name = REPLACE(REPLACE(product_name, '&amp;', '&'), '&#039;', CHAR(39)) WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';

-- 2) 最低库存设置：先合并非零值到正常行，再删编码行（product_name 唯一键）
UPDATE stock_minimum_settings t1 JOIN stock_minimum_settings t2
  ON t1.product_name = REPLACE(t2.product_name, '&amp;', '&')
SET t1.minimum_quantity = t2.minimum_quantity
WHERE t2.product_name LIKE '%&amp;%' AND t2.minimum_quantity > 0 AND t1.minimum_quantity = 0;
DELETE FROM stock_minimum_settings WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';

-- 3) users / users_member 性别：空串/非法值 → NULL（enum('male','female','other') 不接受 ''）
UPDATE users SET gender = NULL WHERE gender = '' OR (gender IS NOT NULL AND gender NOT IN ('male','female','other'));
UPDATE users_member SET gender = NULL WHERE gender = '' OR (gender IS NOT NULL AND gender NOT IN ('male','female','other'));

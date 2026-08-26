-- =============================================================================
-- 补建新系统结构（导入最新数据库后执行一次）
-- 说明：最新库 dump 是 67 张原表，不含以下新系统依赖：
--   1) 2 张功能表（操作日志 operation_logs + 电话版手机记录 phone_records）
--   2) stock_data 表新增 price 列（货品种类默认单价，进货自动抓取用）
-- 在 DBeaver 中连接到目标库后，直接运行本文件即可（幂等：已存在/已加会跳过）
-- =============================================================================

USE u690174784_kunzz;

-- 1) 操作日志表（新系统 operation_logs）
CREATE TABLE IF NOT EXISTS `operation_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `operator` varchar(100) DEFAULT NULL,
  `action` varchar(200) DEFAULT NULL,
  `target` varchar(200) DEFAULT NULL,
  `detail` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) 手机记录表（电话版功能 phone_records）
CREATE TABLE IF NOT EXISTS `phone_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) DEFAULT NULL,
  `record_date` date DEFAULT NULL,
  `get_checked` tinyint(1) DEFAULT 0,
  `start_time` varchar(10) DEFAULT NULL,
  `end_time` varchar(10) DEFAULT NULL,
  `return_checked` tinyint(1) DEFAULT 0,
  `restaurant` varchar(10) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) 货品种类默认单价列（stock_data.price，进货自动抓取单价的来源）
--    注意：MariaDB 不支持 ADD COLUMN IF NOT EXISTS，用 information_schema 判断是否已存在
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = 'u690174784_kunzz' AND table_name = 'stock_data' AND column_name = 'price'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE stock_data ADD COLUMN price DECIMAL(10,3) NULL DEFAULT NULL AFTER specification',
  'SELECT ''stock_data.price 已存在，跳过''');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- 验证：
--   1) 表：SELECT table_name FROM information_schema.tables
--        WHERE table_schema='u690174784_kunzz' AND table_name IN ('operation_logs','phone_records');
--      应返回 2 行
--   2) 列：SELECT column_name, column_type FROM information_schema.COLUMNS
--        WHERE table_schema='u690174784_kunzz' AND table_name='stock_data' AND column_name='price';
--      应返回 1 行（decimal(10,3)）
-- =============================================================================

-- =============================================================================
-- 补建新系统功能表（导入最新数据库后执行一次）
-- 说明：最新库 u690174784_kunzz (2).sql 是 67 张原表，
--       新系统额外依赖以下 2 张表（操作日志 + 电话版手机记录）
-- 在 DBeaver 中连接到目标库后，直接运行本文件即可（幂等：已存在会跳过）
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

-- =============================================================================
-- 验证：执行下面这条 SELECT 应返回 2 行
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'u690174784_kunzz' AND table_name IN ('operation_logs','phone_records');
-- =============================================================================

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

-- 4) 最低库存设置分系统独立（stock_minimum_settings.stock_system）
--    中央/分店(J1/J2/J3) 各自维护最低库存：中央设置不影响分店低库存通知，分店之间也互不影响。
--    旧结构是 product_name 全局唯一（无 stock_system 列），迁移后现有设置默认归入 central。
SET @min_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = 'u690174784_kunzz' AND table_name = 'stock_minimum_settings' AND column_name = 'stock_system'
);
SET @ddl := IF(@min_col = 0,
  'ALTER TABLE stock_minimum_settings ADD COLUMN stock_system VARCHAR(20) NOT NULL DEFAULT ''central'' COMMENT ''系统：central/j1/j2/j3'' AFTER id',
  'SELECT ''stock_minimum_settings.stock_system 已存在，跳过''');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 唯一键从 product_name 换成 (stock_system, product_name)（旧索引存在才删，新索引存在则跳过）
SET @min_uk := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = 'u690174784_kunzz' AND table_name = 'stock_minimum_settings' AND index_name = 'unique_system_product'
);
SET @ddl := IF(@min_uk = 0,
  'ALTER TABLE stock_minimum_settings DROP INDEX IF EXISTS unique_product, ADD UNIQUE KEY unique_system_product (stock_system, product_name)',
  'SELECT ''unique_system_product 已存在，跳过''');
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
--   3) 列：SELECT column_name, column_type FROM information_schema.COLUMNS
--        WHERE table_schema='u690174784_kunzz' AND table_name='stock_minimum_settings' AND column_name='stock_system';
--      应返回 1 行（varchar(20)）；索引：SHOW INDEX FROM stock_minimum_settings → 应有 unique_system_product (stock_system, product_name)
-- =============================================================================

-- 3) 改价日志表（总库存「改价记录」列 + 货品名点击弹窗展示改价历史）
--    货品种类每次更改单价记录一条（old→new，change_date=当天）；总库存从旧到最新展示
CREATE TABLE IF NOT EXISTS `price_change_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_name` varchar(255) NOT NULL COMMENT '货品名称(decoded 纯文本,与流水/总库存一致)',
  `code_number` varchar(50) DEFAULT NULL COMMENT '货品编号',
  `old_price` decimal(10,3) DEFAULT NULL COMMENT '改价前单价(首次维护为NULL)',
  `new_price` decimal(10,3) NOT NULL COMMENT '改价后单价',
  `change_date` date NOT NULL COMMENT '改价日期',
  `changed_by` varchar(100) DEFAULT NULL COMMENT '操作人',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pcl_name` (`product_name`),
  KEY `idx_pcl_date` (`change_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) 货品位次列（总库存「冰箱分类+位次」排序，2026-09-03）
--    freezer_category 已存在；freezer_position = 同冰箱分类内的货品位次（INT，NULL=未设置排该冰箱最后）
--    幂等：已存在会跳过（information_schema 检查）
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE table_schema='u690174784_kunzz' AND table_name='stock_data' AND column_name='freezer_position');
SET @ddl := IF(@col_exists = 0,
               'ALTER TABLE stock_data ADD COLUMN freezer_position INT NULL COMMENT ''位次：同冰箱分类内排序'' AFTER freezer_category',
               'SELECT ''freezer_position 已存在，跳过''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =============================================================================
-- 5) 冰箱分类字典表（2026-09-17：支持改名 / 调顺序 / 停用）
--    背景：冰箱分类原本只是 stock_data.freezer_category 里的纯文本（逗号分隔多选），
--    名字本身就是数据，没有字典。导致两件事做不了：
--      (a) 名字一改，总库存排序就认不出它（顺序靠前端硬编码数组的下标）→ 掉到列表最后，打乱拣货顺序
--      (b) 无法新增 / 停用冰箱
--    本表只存【名字 + 顺序】，stock_data 的表结构、字段类型、数据格式完全不变；
--    改名时由后端级联改写 stock_data.freezer_category 里对应的那个 token。
-- =============================================================================
CREATE TABLE IF NOT EXISTS `freezer_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT '冰箱分类名称（须与 stock_data.freezer_category 逗号串里的 token 完全一致）',
  `sort_order` int(11) NOT NULL DEFAULT 0 COMMENT '业务顺序：总库存排序用，对应冰箱物理顺序',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '停用后不再出现在下拉选项，历史数据保持原样',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_freezer_name` (`name`),
  KEY `idx_freezer_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 种子：现有 20 个分类，顺序与原前端 FREEZER_OPTIONS 完全一致（上线当天界面零变化）
-- 只在表为空（本次新建）时灌入：否则有人在系统里改过名之后再跑本文件，会把旧名字又插回来。
INSERT INTO `freezer_categories` (`name`, `sort_order`)
SELECT * FROM (
            SELECT 'K1-1'   AS name,  1 AS sort_order
  UNION ALL SELECT 'K1-2',   2
  UNION ALL SELECT 'K1-3',   3
  UNION ALL SELECT 'K1-4',   4
  UNION ALL SELECT 'K1-5',   5
  UNION ALL SELECT 'K1-6',   6
  UNION ALL SELECT 'K1-7',   7
  UNION ALL SELECT 'C-1',    8
  UNION ALL SELECT 'KDI-1',  9
  UNION ALL SELECT 'KDI-2', 10
  UNION ALL SELECT 'KDI-3', 11
  UNION ALL SELECT 'KDI-4', 12
  UNION ALL SELECT 'S1-1',  13
  UNION ALL SELECT 'S1-2',  14
  UNION ALL SELECT 'S1-3',  15
  UNION ALL SELECT 'S1-4',  16
  UNION ALL SELECT 'SBS-1', 17
  UNION ALL SELECT 'SBS-2', 18
  UNION ALL SELECT 'SBDI-1',19
  UNION ALL SELECT 'SBDI-2',20
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `freezer_categories`);

-- 6) 货品种类单价列精度提升 decimal(10,3) → decimal(15,5)（2026-09-18）
--    业务上确实在用 4~5 位小数单价（台账里已有 4.16666 / 1.93333 / 33.33330 / 0.89999 这类值），
--    但货品种类这列只存得下 3 位：输入 2.16666 会被数据库四舍五入成 2.167，
--    进货自动抓取的默认单价也跟着变成 2.167，总价随之偏差。
--    改成与进出货台账 stockinout_data.price decimal(15,5) 一致的精度。
--    （本列由上面第 3) 节创建；若已跑到 5 位则跳过，重复执行安全）
SET @price_scale := (
  SELECT NUMERIC_SCALE FROM information_schema.COLUMNS
  WHERE table_schema = 'u690174784_kunzz' AND table_name = 'stock_data' AND column_name = 'price'
);
SET @ddl := IF(IFNULL(@price_scale, 5) < 5,
  'ALTER TABLE stock_data MODIFY COLUMN price DECIMAL(15,5) NULL DEFAULT NULL',
  'SELECT ''stock_data.price 已是 5 位小数，跳过''');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 7) 冰箱分类 / 位次 / 默认单价 改为「每个系统各存一份」（2026-09-18）
--    原来这三列都在 stock_data 上、一行货品一个值：在中央页改完，J1/J2/J3 跟着一起变
--    （用户实测反馈）。新建 stock_data_system（照 stock_minimum_settings 的先例：按系统一行 +
--    联合唯一键），并把现有值按每个货品**已分配的系统**复制进去。
--    ⚠ 跑完补丁后各系统看到的仍是原来那一套（位次原本全为 NULL，复制过去也是 NULL），
--      直到你到中央/分店页分别设置 —— 这是刻意的，方便灰度。
--    stock_data 里旧的三列保留、代码不再读写（留回滚余地，**不做删除**）。
CREATE TABLE IF NOT EXISTS `stock_data_system` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `stock_data_id` int(11) NOT NULL COMMENT '指向 stock_data.id',
  `stock_system` varchar(20) NOT NULL COMMENT '系统：central/j1/j2/j3',
  `freezer_category` varchar(50) DEFAULT NULL COMMENT '该系统的冰箱分类（多选逗号分隔）',
  `freezer_position` int(11) DEFAULT NULL COMMENT '该系统的位次：同冰箱分类内排序（NULL/0=未设置，排最后）',
  `price` decimal(15,5) DEFAULT NULL COMMENT '该系统的货品种类默认单价（进货自动抓取；与台账同精度）',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_data_system` (`stock_data_id`,`stock_system`),
  KEY `idx_system` (`stock_system`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 初始化：按 system_assign 逐系统复制现值（幂等：已存在的行跳过，重复执行安全）
INSERT INTO stock_data_system (stock_data_id, stock_system, freezer_category, freezer_position, price)
SELECT d.id, 'central', d.freezer_category, d.freezer_position, d.price FROM stock_data d
WHERE FIND_IN_SET('CENTRAL', UPPER(d.system_assign)) > 0
  AND NOT EXISTS (SELECT 1 FROM stock_data_system s WHERE s.stock_data_id = d.id AND s.stock_system = 'central');

INSERT INTO stock_data_system (stock_data_id, stock_system, freezer_category, freezer_position, price)
SELECT d.id, 'j1', d.freezer_category, d.freezer_position, d.price FROM stock_data d
WHERE FIND_IN_SET('J1', UPPER(d.system_assign)) > 0
  AND NOT EXISTS (SELECT 1 FROM stock_data_system s WHERE s.stock_data_id = d.id AND s.stock_system = 'j1');

INSERT INTO stock_data_system (stock_data_id, stock_system, freezer_category, freezer_position, price)
SELECT d.id, 'j2', d.freezer_category, d.freezer_position, d.price FROM stock_data d
WHERE FIND_IN_SET('J2', UPPER(d.system_assign)) > 0
  AND NOT EXISTS (SELECT 1 FROM stock_data_system s WHERE s.stock_data_id = d.id AND s.stock_system = 'j2');

INSERT INTO stock_data_system (stock_data_id, stock_system, freezer_category, freezer_position, price)
SELECT d.id, 'j3', d.freezer_category, d.freezer_position, d.price FROM stock_data d
WHERE FIND_IN_SET('J3', UPPER(d.system_assign)) > 0
  AND NOT EXISTS (SELECT 1 FROM stock_data_system s WHERE s.stock_data_id = d.id AND s.stock_system = 'j3');

-- 8) 改价日志加「哪个系统改的价」（2026-09-18）
SET @pcl_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE table_schema='u690174784_kunzz' AND table_name='price_change_log' AND column_name='stock_system');
SET @ddl := IF(@pcl_col = 0,
  'ALTER TABLE price_change_log ADD COLUMN stock_system VARCHAR(20) NULL COMMENT ''改价所属系统：central/j1/j2/j3'' AFTER code_number',
  'SELECT ''price_change_log.stock_system 已存在，跳过''');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 8.1) 改价日志的两个价格列精度 3 位 → 5 位（与货品种类/台账一致，2026-09-18）
--      否则改价记录里 2.6666 会显示成 2.667
SET @pcl_scale := (SELECT NUMERIC_SCALE FROM information_schema.COLUMNS
                   WHERE table_schema='u690174784_kunzz' AND table_name='price_change_log' AND column_name='new_price');
SET @ddl := IF(IFNULL(@pcl_scale, 5) < 5,
  'ALTER TABLE price_change_log MODIFY COLUMN old_price DECIMAL(15,5) NULL, MODIFY COLUMN new_price DECIMAL(15,5) NULL',
  'SELECT ''price_change_log 价格列已是 5 位小数，跳过''');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 验证（应能看到 4 行，且各系统的货品数 = 该系统的已分配货品数）
SELECT stock_system, COUNT(*) AS rows_count,
       SUM(freezer_category IS NOT NULL AND freezer_category <> '') AS with_category,
       SUM(price IS NOT NULL) AS with_price
FROM stock_data_system GROUP BY stock_system ORDER BY stock_system;

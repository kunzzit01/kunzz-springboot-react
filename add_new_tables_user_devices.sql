-- =============================================================================
-- 「记住这台设备」表（2026-10-28 新增功能，任务 2026-10-28-remember-device）
--
-- 什么时候需要跑：升级到含 DeviceTokenService 的后端版本后，在目标库执行一次本文件。
--   不执行也不会崩：后端会降级成原来的「24 小时 JWT」，只是「重启电脑后免密进入」和
--   「登录设备」页面不生效（后端日志会打 warning）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS，重复执行无副作用。
--
-- 设计说明：
--   * token_hash 只存 SHA-256 十六进制摘要，明文令牌只在签发那次返回给浏览器，库里不留。
--   * 时间列全部是 epoch 毫秒（BIGINT），不用 DATETIME —— 生产 JVM 与数据库时区
--     不一定一致（DB 存马来西亚时间 +8，VPS 的 systemd 没设 -Duser.timezone），
--     用绝对时间戳彻底避开「差 8 小时」导致令牌提前/延后失效。
--   * expires_at_ms 滚动续期（每次静默续登推到 now + 90 天），见 DeviceTokenService。
-- =============================================================================

CREATE TABLE IF NOT EXISTS `user_devices` (
  `id`            int(11)      NOT NULL AUTO_INCREMENT,
  `user_id`       int(11)      NOT NULL COMMENT 'users.id',
  `token_hash`    char(64)     NOT NULL COMMENT '设备令牌的 SHA-256 十六进制摘要（不存明文）',
  `name`          varchar(100) DEFAULT NULL COMMENT '展示名，如「Chrome · Windows」',
  `user_agent`    varchar(255) DEFAULT NULL,
  `ip`            varchar(45)  DEFAULT NULL,
  `created_at_ms` bigint(20)   NOT NULL COMMENT '签发时间（epoch 毫秒）',
  `last_seen_ms`  bigint(20)   NOT NULL COMMENT '最后活跃时间（epoch 毫秒）',
  `expires_at_ms` bigint(20)   NOT NULL COMMENT '到期时间（epoch 毫秒，滚动续期）',
  `revoked_at_ms` bigint(20)   DEFAULT NULL COMMENT '非空 = 已撤销/已登出',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_devices_token` (`token_hash`),
  KEY `idx_user_devices_user` (`user_id`, `revoked_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='记住我：已登录设备（可单独撤销）';

-- 清理历史：半年前就被撤销的设备行没有保留价值（保留近期用于排查「谁在哪台设备登过」）
-- DELETE FROM `user_devices` WHERE `revoked_at_ms` IS NOT NULL AND `revoked_at_ms` < (UNIX_TIMESTAMP() - 180*86400) * 1000;

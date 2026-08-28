# 📥 本地导入最新 dump 标准流程（DB_IMPORT）

> **场景**：从 Hostinger phpMyAdmin 导出最新 dump（如 `2.10pm_28-aug-2026.sql`），导入本地 XAMPP MariaDB 10.4 的 `u690174784_kunzz` 库。
> **给谁看**：人或 AI 助手照着执行即可，无需现场排障。
> 首次整理于 2026-08-28，源于当天实际踩坑记录（见文末「历史踩坑」）。

---

## 〇、总原则

1. **先备份，后动手** —— 任何写操作（DROP/重建/导入）之前必须有全量备份落盘。
2. **先检查，后导入** —— dump 文件先过完下面的检查清单再开始导入。
3. **导完必验证** —— 对照「验证清单」逐项打勾，不能只看"导入没报错"。

---

## 一、dump 导入前检查清单（只读操作，改文件前先做）

假设 dump 文件为 `$DUMP`（如 `C:/Users/kunzz/Downloads/2.10pm_28-aug-2026.sql`）：

```bash
# 1. 排序规则兼容性 —— 必须为 0！
#    Hostinger 用 MariaDB 11.x，dump 里可能带 utf8mb4_uca1400_ai_ci，
#    本地 10.4 不认识，直接导入会报错。
grep -c "uca1400" "$DUMP"
# > 0 则生成修复副本（不要改原文件）：
sed 's/utf8mb4_uca1400_ai_ci/utf8mb4_unicode_ci/g' "$DUMP" > /tmp/dump_fixed.sql

# 2. 是否含 DROP TABLE —— phpMyAdmin 导出通常只 DROP 视图、不 DROP 普通表，
#    所以**不能直接导进现有库**（会撞主键 / 表已存在），必须走「重建库」流程。
grep -c "DROP TABLE IF EXISTS" "$DUMP"
grep -c "CREATE TABLE" "$DUMP"        # 记下表数量，导入后核对

# 3. 导出时点核对 —— 防 OPS.md 8/25 那次"缺 11 条"事故：
#    dump 导出时间必须晚于 live 当天最后一条录入。
#    文件名如 "2.10pm_28-aug-2026.sql" 即导出时刻（马来西亚时间）。
head -10 "$DUMP"                       # 看 Generation Time / Server version
```

**注意**：`SET time_zone = "+00:00"` 出现在 dump 头部是 phpMyAdmin 的**会话级**格式化设置，正常，不影响数据，不用改。

---

## 二、备份本地现有库（必做）

```bash
cd C:/Users/kunzz/OneDrive/Desktop/inventory-system
TS=$(date +%Y%m%d_%H%M%S)
C:/xampp/mysql/bin/mysqldump.exe -u root --databases u690174784_kunzz \
  --default-character-set=utf8mb4 > "database/backup_before_import_${TS}.sql"

# 验证备份可用：CREATE TABLE 数量应 ≈ 本地表数量
grep -c "CREATE TABLE" "database/backup_before_import_${TS}.sql"
ls -la "database/backup_before_import_${TS}.sql"   # 大小应与 dump 同一量级（~21MB）
```

命名规范：`backup_before_import_YYYYMMDD_HHMMSS.sql`，统一放 `database/` 根目录。

---

## 三、重建库并导入

> 直接 `DROP DATABASE` 可能报错，见「历史踩坑 #2」，按下面顺序走：

```bash
# 1. 删旧库（若报 errno 13 Permission denied → 见踩坑 #2 的处理）
C:/xampp/mysql/bin/mysql.exe -u root -e "DROP DATABASE u690174784_kunzz;"

# 2. 建新库（若提示 database exists，用 IF NOT EXISTS 补建目录，再 ALTER 修正字符集）
C:/xampp/mysql/bin/mysql.exe -u root -e "CREATE DATABASE u690174784_kunzz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# 若上面报 already exists：
C:/xampp/mysql/bin/mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS u690174784_kunzz; ALTER DATABASE u690174784_kunzz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. 导入（不加 --force，让它有任何错就停下来）
C:/xampp/mysql/bin/mysql.exe -u root --default-character-set=utf8mb4 u690174784_kunzz < /tmp/dump_fixed.sql
# 退出码必须为 0
```

---

## 四、导入后验证清单（逐项执行）

```sql
-- 1. 表数量 = dump 里的 CREATE TABLE 数（含视图）
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='u690174784_kunzz';

-- 2. 4 个视图必须存在（报表查询依赖）
SELECT table_name, table_type FROM information_schema.tables
WHERE table_schema='u690174784_kunzz' AND table_type='VIEW';
-- 应有：j1data_view / j2data_view / j3data_view / stock_data_view

-- 3. 关键表行数（与上次记录对比，只增不减）
SELECT (SELECT COUNT(*) FROM j1stockedit_data) AS j1,
       (SELECT COUNT(*) FROM j2stockedit_data) AS j2,
       (SELECT COUNT(*) FROM j3stockedit_data) AS j3,
       (SELECT COUNT(*) FROM stock_data)       AS 台账,
       (SELECT COUNT(*) FROM dishware_info)    AS 餐具,
       (SELECT COUNT(*) FROM users)            AS 用户;

-- 4. 数据新鲜度 —— 按 OPS.md 规范看业务日期（date），不是 created_at
SELECT (SELECT MAX(date) FROM j1stockedit_data)      AS j1最大业务日期,
       (SELECT MAX(created_at) FROM j1stockedit_data) AS j1最新录入;
-- 最新 created_at 必须 早于 dump 导出时刻，否则缺记录，重新导一次 dump

-- 5. 表完整性抽查（此前 j3stockedit_data 损坏过，重点看它）
CHECK TABLE j3stockedit_data, j1stockedit_data, j2stockedit_data, stock_data, dishware_info;
-- 全部应显示 status OK

-- 6. 时区（应显示 +08:00）
SHOW VARIABLES LIKE 'time_zone';
```

全部通过后重启后端（`一键启动.bat`），打开库存汇总页抽查一条数据即可。

---

## 五、历史踩坑记录（2026-08-28 实战）

| # | 现象 | 根因 | 处理 |
|---|---|---|---|
| 1 | 查询报 `Got error 1877 "Unknown error" from storage engine InnoDB`，后变 `Error 1932 Table doesn't exist in engine` | dump 导入中断导致 `j3stockedit_data` 数据文件损坏（PRIMARY index marked as corrupted） | 删表 → 从备份恢复表结构与数据 |
| 2 | `DROP DATABASE` 报 `errno: 13 "Permission denied"`，删不掉 | 库目录里有触发器文件（`.TRG` / `.TRN`）等残留，rmdir 失败；且失败时字典条目已清空、文件还留在磁盘 | 确认 `information_schema.tables` 为 0 后，手动 `rm -rf` 残留目录 → `CREATE DATABASE IF NOT EXISTS` → `ALTER DATABASE` 修正字符集 |
| 3 | 导入报 `Data truncated for column 'target_system'` | live 库有枚举列存空字符串 `''`（Hostinger 宽松 sql_mode），本地严格模式拒绝 | 属 live 真实数据，勿改数据；导入时统一宽松模式即可（phpMyAdmin dump 头部自带 `SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO"` 覆盖，通常不会再遇到） |
| 4 | `uca1400` 排序规则导入报错 | Hostinger MariaDB 11.x 的 collation，本地 10.4 不支持 | 见导入前检查 #1，sed 替换后导入 |
| 5 | dump 无普通表的 DROP 语句，直接导入报"表已存在"/主键冲突 | phpMyAdmin 导出默认不 DROP 普通表 | 不要往现有库导，必须走重建库流程 |

---

## 六、相关文件约定

```
database/
├── backup_before_import_YYYYMMDD_HHMMSS.sql   ← 导入前自动备份（本流程产生，可按月归档进 backup/）
├── backup/                                     ← 历史备份归档目录
└── u690174784_kunzz.sql                        ← 最近一次使用的全量备份快照
```

- 临时文件（`/tmp/dump_fixed.sql`）用完即弃，不进仓库。
- 备份文件**不要提交到 GitHub**（含业务数据），确认 `.gitignore` 已排除 `database/*.sql`。

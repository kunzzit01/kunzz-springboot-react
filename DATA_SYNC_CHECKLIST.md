# 数据同步检查清单（拉取线上数据到本地后必做）

> **快捷方式：直接运行 `sync-live-data.bat`**（把线上 dump 文件拖进去即可）——
> 自动完成：备份 → 修复排序规则 → 重建库导入 → 清洗（本清单全部内容）→ 验证 → 重启后端。
> 下方步骤保留作为手动执行/排错参考。

> 目的：每次从线上（live / 生产）同步数据库到本地后，快速检查并修复已知的数据问题。
> 这些问题的共同根源：**线上旧系统 / 手机端写入的数据不干净**（HTML 实体编码、空串写枚举列等），
> 新后端（Spring Boot）保存路径是干净的，但同步过来的历史数据需要清洗。

---

## 第 0 步：先备份

```bash
mysqldump -u root u690174784_kunzz > backup_before_sync_$(date +%Y%m%d).sql
```

任何清洗前必须留底，出问题可回滚。

## 第 0.5 步：导入最新 dump（phpMyAdmin 导出文件）

> 线上导出的 dump 常带本地不支持的排序规则，需先修复再导入：

```bash
# 1) 检查 dump 用的排序规则（线上 MariaDB 11.8 的 utf8mb4_uca1400_ai_ci 本地 10.4 不支持）
grep -oE 'COLLATE=[a-z0-9_]+' dump.sql | sort | uniq -c

# 2) 替换不支持的排序规则（本地只认 utf8mb4_unicode_ci / utf8mb4_general_ci）
sed 's/utf8mb4_uca1400_ai_ci/utf8mb4_unicode_ci/g' dump.sql > fixed_dump.sql

# 3) 重建数据库并导入（dump 无 DROP TABLE，必须先删库重建，否则撞「表已存在」）
mysql -u root -e "DROP DATABASE IF EXISTS u690174784_kunzz; CREATE DATABASE u690174784_kunzz CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
mysql -u root --default-character-set=utf8mb4 u690174784_kunzz < fixed_dump.sql

# 4) 验证表数量（应为 67）
mysql -u root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='u690174784_kunzz'"
```

> ⚠️ 导入后后端要**重启**，且注意表结构变更：
> - `stock_minimum_settings` 已无 `stock_system` 列（最低库存从「分店独立」改为**全局**，product_name 唯一）
>   ——后端代码需同步适配（见 2026-08-24 提交：实体/Mapper/DashboardService 移除 stock_system）。
> - 导入后 `users` 里的 demo 账号若不存在，后端启动时 DataInitializer 会自动重建（demo@kunzz.local / demo123）。

## 第 0.6 步：补建新系统结构（每次导入后必做）

> 最新 dump（67 张原表）**不含**新系统依赖的结构，导入后必须执行补丁脚本：

```bash
mysql -u root < add_new_tables.sql
```

补丁内容（幂等，可重复执行）：
1. **操作日志表** `operation_logs`（新系统操作日志）
2. **手机记录表** `phone_records`（电话版功能）
3. **货品种类默认单价列** `stock_data.price DECIMAL(10,3)`（2026-08-26 新增：货品种类页面维护的单价，
   进出货「进货」输入数量时自动抓取该单价；无单价显示 0.00。**不补该列会导致后端启动失败/保存报错**）

验证：
```sql
-- 表（应返回 2 行）
SELECT table_name FROM information_schema.tables
WHERE table_schema='u690174784_kunzz' AND table_name IN ('operation_logs','phone_records');
-- 列（应返回 1 行）
SELECT column_name, column_type FROM information_schema.COLUMNS
WHERE table_schema='u690174784_kunzz' AND table_name='stock_data' AND column_name='price';
```

---

## 第 1 步：HTML 编码产品名（最常见！会导致负数库存 / 幽灵产品）

**症状**：库存页出现负数、同一产品显示两行（一行名字里带 `&amp;` 等字符）、汇总对不上。
**原因**：旧系统/手机端把 `&` 存成了 `&amp;`，汇总按产品名分组时被当成不同产品；
这些编码行多为出库，形成只有出库没有入库的「幽灵负数组」。

### 1.1 检查

> ⚠️ 经验：**逐个表单独查**更可靠。UNION ALL 的输出在某些数据库工具里会被截断/只显示一行，容易漏查。

```sql
-- 逐个表执行（把表名换成下面的列表）：
SELECT COUNT(*) FROM j1stockedit_data WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#%';
```

需要检查的表：
- 分店进出货：`j1stockedit_data`、`j2stockedit_data`、`j3stockedit_data`
- 分店流水：`j1stockinout_data`、`j2stockinout_data`、`j3stockinout_data`
- 中央流水：`stockinout_data`
- 台账主表：`stock_data`
- **最低库存设置：`stock_minimum_settings`（Dashboard 低库存预警数据源，编码名会导致「当前库存显示 0.000 + 误报低库存」）**

> 实际观察到的实体：`&amp;`（A&amp;W、S&amp;B SHICIMI TOGARASHI、F&amp;N SWEET CREAMER、HOT &amp; SPICY DRESSING）
> 和 `&#039;`（SUNTORY THE PREMIUM MALT&#039;S GOLD 10L）。
> 曾经受影响的行数：j1=52+1、j2=24、j3=9+38、中央=10、台账=5+2。

### 1.2 查看明细（确认清洗对象）

```sql
SELECT product_name, COUNT(*) AS rows_cnt FROM j1stockedit_data
WHERE product_name LIKE '%&amp;%' GROUP BY product_name ORDER BY rows_cnt DESC;
```

### 1.3 修复（解码 HTML 实体）

替换顺序很重要：**先 `&amp;` 后其他**，能同时处理单层/双层编码。

```sql
-- 每个有问题的表都执行（把 表名 换成检查出的表）
-- ⚠️ 撇号实体 &#039; 用 CHAR(39) 表示，避免 SQL 字符串里出现字面引号把语句打断
UPDATE 表名
SET product_name = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(product_name,
      '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#039;', CHAR(39)), '&nbsp;', ' ')
WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#%' OR product_name LIKE '%&lt;%'
   OR product_name LIKE '%&gt;%' OR product_name LIKE '%&quot;%' OR product_name LIKE '%&nbsp;%';
```

> ⚠️ `stock_minimum_settings` 清洗前**先处理重复**：product_name 唯一约束，编码行和正常行可能同时存在。
> 先合并最低库存值再删编码行：
> ```sql
> -- 1) 把编码行的非零最低库存合并到正常行
> UPDATE stock_minimum_settings t1 JOIN stock_minimum_settings t2
>   ON t1.product_name = REPLACE(t2.product_name, '&amp;', '&')
> SET t1.minimum_quantity = t2.minimum_quantity
> WHERE t2.product_name LIKE '%&amp;%' AND t2.minimum_quantity > 0 AND t1.minimum_quantity = 0;
> -- 2) 再删编码行
> DELETE FROM stock_minimum_settings WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#039;%';
> ```
> 实际案例：`HOT &amp; SPICY DRESSING`（最低 1.00）与 `HOT & SPICY DRESSING`（最低 0.00）并存，
> 需先把 1.00 合并到正常行再删除编码行，否则预警会显示「当前库存 0.000」的假低库存。
>
> ⚠️ **只清洗 `product_name`**。不要对 `account_type` 等字段做同样处理——
> `users.account_type` 枚举里有一个**合法的** `r&d`，动它会破坏数据。

### 1.4 验证

```sql
-- 逐个表确认没有残留
SELECT COUNT(*) FROM j1stockedit_data WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#%';
SELECT COUNT(*) FROM stockinout_data WHERE product_name LIKE '%&amp;%' OR product_name LIKE '%&#%';
```

页面验证：`http://localhost:5174/records?system=j1` 应不再有负数。

---

## 第 2 步：ENUM 空串 / 非法值（保存报 `Data truncated`）

**症状**：编辑职员保存时报错 `Data truncated for column 'gender'` / 保存失败。
**原因**：`users.gender` 是 `enum('male','female','other')`，MySQL 严格模式（STRICT_TRANS_TABLES）
**不接受空字符串 `''`**。性别为空的成员编辑保存时会把 `''` 写进枚举列 → 报错。

### 2.1 相关枚举列一览

| 表 | 列 | 枚举值 | 风险 |
|---|---|---|---|
| users | gender | male, female, other | ⚠️ 空串报错 |
| users_member | gender | male, female, other | ⚠️ 同上 |
| users | account_type | special, hr, account, media, marketing, support, production, **r&d**, technical, design, operation, service, sushi, kitchen | 注意 `r&d` 合法 |
| application_codes | account_type | 同上 | 同上 |
| j1/j2/j3stockedit_data | target_system | j1/Central、j2/Central、j3/Central | 低 |
| dishware_transfer_records | record_type | out, in | 低 |
| menus | menu_type / status | grand/sushi、published/draft | 低 |
| schedule_* | 多个 | 见上表 | 低 |

### 2.2 检查空串 / 非法值

```sql
-- users 表
SELECT id, username, gender FROM users WHERE gender = '' OR (gender IS NOT NULL AND gender NOT IN ('male','female','other'));
-- users_member 表（如存在同名结构）
SELECT id, username, gender FROM users_member WHERE gender = '' OR (gender IS NOT NULL AND gender NOT IN ('male','female','other'));
```

### 2.3 修复

```sql
-- 空串/非法 → NULL（与库里大多数成员的存储方式一致）
UPDATE users SET gender = NULL
WHERE gender = '' OR (gender IS NOT NULL AND gender NOT IN ('male','female','other'));
-- users_member 同样处理
UPDATE users_member SET gender = NULL
WHERE gender = '' OR (gender IS NOT NULL AND gender NOT IN ('male','female','other'));
```

> 新后端已内置性别规范化（`StaffService.normalizeGender`：空串/非法值→NULL，大小写统一），
> 所以**经新系统保存的数据不会再产生此问题**，此步只清历史脏数据。

---

## 第 3 步：负数库存（区分真假）

```sql
-- 找出净库存为负的产品（可能是数据问题，也可能是真实超卖）
SELECT product_name, code_number, SUM(in_quantity) - SUM(out_quantity) AS net
FROM j1stockedit_data
GROUP BY product_name, code_number, specification
HAVING net < 0
ORDER BY net;
```

- 若该产品同时存在 `A&W` 和 `A&amp;W` 两组 → 先做第 1 步清洗，负数通常随之消失。
- 清洗后仍为负 → 真实超卖（出库 > 入库），属于业务数据，不是 bug，不处理。

---

## 第 4 步：最终验证

```bash
# 后端健康
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:8081/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo@kunzz.local","password":"demo123"}'
```

页面抽查：
1. `http://localhost:5174/records`（中央总库存）与 `?system=j1/j2/j3`
2. 职员管理 → 编辑任意性别为空的成员 → 保存（不应报错）
3. 新建成员（应能正常保存并发送欢迎邮件）

---

## 常见问题速查表

| 症状 | 原因 | 处理 |
|---|---|---|
| 库存页负数、产品名带 `&amp;` | HTML 实体编码的幽灵组 | 第 1 步清洗 |
| 保存职员报 `Data truncated for column 'gender'` | `''` 写 enum 列 | 第 2 步置 NULL |
| 同一产品显示两行 | 编码名/正常名两个分组 | 第 1 步清洗后合并 |
| Dashboard 低库存预警出现假数据、当前库存显示 0.000 | `stock_minimum_settings` 里的编码名匹配不上库存表 | 第 1 步含该表 + 重复行合并 |
| 清洗后仍负数 | 真实超卖 | 不处理（业务数据） |

---

## 根治建议（防止再犯）

1. **定位编码源头**：脏数据的 `&amp;` 来自**线上旧系统/手机端**（新后端不编码，已查证）。
   如果旧系统还在往同一个库写数据，本地每次同步都会带进新的脏数据。
2. 若旧系统已停用、只由新系统写入，则此清单会逐渐变成「每次都是 0 问题」，只需跑检查即可。
3. 可选防线：汇总接口对产品名做显示层解码（但幽灵组仍会是独立行，不能替代清洗）。

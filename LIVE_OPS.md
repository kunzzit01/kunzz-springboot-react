# 🛠️ live 运维与数据同步手册（防坑指南）

> 记录 2026-08-25 两次线上问题（进出货数据缺失 + 时间显示混乱）的根因与预防措施。
> **上线 / 同步数据 / 排查问题前必读。**

---

## 一、2026-08-25 事故回顾（两个问题）

### 问题 1：J1 昨天（8/24）的进出货记录不完整

**现象**：用户设备导入"最新 dump"后，J1 8/24 只有 78 条进出货记录，live 有 89 条，缺 11 条（全是收货人 APPLE 的 Service Line 出货：100 PLUS、A&W、COCA COLA、SAPPORO 等饮料）。

**根因**：
```
live 时间线（马来西亚 UTC+8）：
  8/25 03:34  导出 dump（拿到手的 (4).sql）
  8/25 11:51  有人在 live 上补录 8/24 的出货（11 条，created_by=APPLE）
  → dump 导出时间早于记录创建时间 → dump 里根本没有这 11 条
```

**本质**：**静态 dump 分发机制有天然缺陷**——dump 导出后 live 的任何新增/修改都会漏掉。这不是某次操作失误，而是机制问题。

### 问题 2：live 页面显示的"操作时间"对不上

**现象**：live 页面显示 100 PLUS 的操作时间 `25-08-2026 19:51`、`02:09` 等，与当天实际时间完全对不上。

**根因**：**live 老系统 `stockeditall.js` 的 `formatCreatedAt` 有时区 bug**：

```js
// ❌ 错误：它假设数据库存 UTC，把已经是 +8（马来西亚）的时间又加 8 小时
const utcStr = createdAt.replace(' ', 'T') + 'Z';
const local = new Date(date.getTime() + offset * 60 * 1000);   // 重复 +8
```

- 数据库 `created_at` 存的**本来就是马来西亚时间**（+8）——证据：created_at 时间分布集中在 8:00-19:00（11-12 点中午进货、17-19 点收档盘点）
- live 页面显示 = 数据库时间 + 8 小时 → 全部显示成"未来时间"（19:51 实际是 11:51）
- **数据库里的时间是对的，新系统显示也是对的，只有 live 老页面显示错了**

---

## 二、时区规范（统一 UTC+8 马来西亚时间）

> 数据库存的是**马来西亚本地时间（+8）**，所有系统必须统一，任何一层漂移都会导致时间混乱。

### 已部署的三道防线（start.ps1）

| 层 | 配置 | 位置 |
|---|---|---|
| JVM | `-Duser.timezone=GMT+8` | start.ps1 启动后端参数 |
| 内置 MariaDB | `--default-time-zone=+08:00` | start.ps1 启动 mysqld 参数 |
| 复用 XAMPP | `SET GLOBAL time_zone = '+08:00'` | start.ps1 检测到已有数据库时自动执行 |

### 关键认知（排查时先想清楚）

1. **新系统的 `created_at` 是数据库默认值 `CURRENT_TIMESTAMP` 生成的**（INSERT 不显式写 created_at）——所以**真正决定时区的是 MySQL 服务器，不是 Java**！用户设备时区如果不是 +8，必须靠上面三道防线兜底。
2. **不要用 `Asia/Shanghai` 做 JDBC 强制会话时区**——MariaDB 没有 IANA 时区表，`SET time_zone='Asia/Shanghai'` 会报 `Unknown or incorrect time zone` 导致后端启动失败。要用数字偏移 `+08:00`。
3. live 老系统的 `formatCreatedAt`（`live_stockeditall.js`）有重复 +8 的 bug——**live 页面显示的时间不可信，以数据库为准**。如需修复 live，改它的 JS 去掉多余偏移。

---

## 三、预防措施（上 live 必做）

### 1. 用同步脚本，别用静态 dump 分发（治本）

**`inventory-system/frontend/sync-live-stock.cjs`** 直接从 live API 拉数据、对比本地、以 live 为准补齐：

```bash
cd inventory-system/frontend

node sync-live-stock.cjs                  # 最近30天，仅报告差异
node sync-live-stock.cjs --days=7         # 最近7天
node sync-live-stock.cjs --full           # 全量（2025年起）
node sync-live-stock.cjs --days=2 --apply # 报告 + 自动写库（带自动备份）
```

- 依赖：`live-credentials.json`（**已被 .gitignore 排除，禁止推送到 GitHub 公开仓库**）
- `--apply` 写库前自动 mysqldump 备份
- **建议每天收档后跑一次**：`node sync-live-stock.cjs --days=2 --apply`

### 2. 如果仍用 dump 分发，注意时点

- dump 导出时间必须**晚于当天的所有录入**（建议当天收档后或次日凌晨）
- 导出后立即核对：`SELECT MAX(date), MAX(created_at) FROM j1stockedit_data` 覆盖到业务日期
- **补录旧日期的记录会以 `created_at`（今天）为准**——判断数据是否完整要看 `date`（业务日期）而不是 `created_at`

### 3. 同步/上线后的检查清单

```bash
# 1) 三店昨日记录数与 live 一致（用同步脚本报告最省事）
# 2) 数据库时区
mysql -u root -e "SHOW VARIABLES LIKE 'time_zone'"   # 应显示 +08:00 或系统为马来西亚时区
# 3) 新建一条测试记录，确认 created_at 是 +8（不早不晚于当前时间 8 小时内）
# 4) 数据包导出后核对
grep -c "uca1400" database/u690174784_kunzz.sql      # 应为 0（排序规则兼容）
```

### 4. 常见误判（排查时避免浪费时间）

| 现象 | 真实原因 | 不要 |
|---|---|---|
| 本地库存与 live"不一样" | live 按**价格分组**（幽灵组），本地按产品合并——总数一致 | 不要当数据缺失去"补" |
| 本地 8/24 比 live 少 11 条 | dump 导出早于补录时间 | 不要重导 dump，用同步脚本补 |
| live 显示时间"在未来" | live `formatCreatedAt` 重复 +8 的 bug | 不要改数据库，数据库是对的 |
| 本地新记录 created_at 漂移 | 用户设备时区 ≠ +8 | 检查 start.ps1 三道时区防线是否生效 |

---

## 四、数据包生成流程（当前推荐）

```
1. 用户设备/本机跑完当天业务
2. node sync-live-stock.cjs --days=2 --apply   ← 从 live 补齐最新
3. 备份数据.bat / mysqldump 导出 → database/u690174784_kunzz.sql
4. 校验：表数 69（67 原表 + operation_logs + phone_records）、MAX(date)=当天、无 uca1400
5. 推送 git → 用户设备重新下载 zip
```

> 说明：数据库 `phone_records` / `operation_logs` 是新系统功能表，老库备份不含，
> 一键启动（start.ps1 `Ensure-NewTables`）会自动补建，无需手动处理。

---

## 五、相关文件索引

| 文件 | 作用 |
|---|---|
| `sync-live-stock.cjs` | live 进出货同步工具（报告 + 自动补齐） |
| `live-credentials.json` | live 登录凭证（**勿推 git**） |
| `start.ps1` | 一键启动（含时区三道防线 + 自动补新系统表） |
| `DATA_SYNC_CHECKLIST.md` | 数据清洗检查清单（HTML 编码 / gender / 负数） |
| `add_new_tables.sql` | 新系统功能表建表语句（operation_logs / phone_records） |

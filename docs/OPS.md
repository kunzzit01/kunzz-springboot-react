# 🛠️ 运维手册（OPS）

> 合并自原 DEPLOY.md（部署）、LIVE_OPS.md（live 运维）、DATA_SYNC_CHECKLIST.md（数据同步清单），2026-08-28 整理。
> 目录：① EC2 部署 ② live 运维与数据同步 ③ 数据同步检查清单
> 相关：本地导入最新 dump 标准流程见 [DB_IMPORT.md](DB_IMPORT.md)

---
## 一、EC2 部署（DEPLOY）
> 库存系统（后台） + 官网，两套独立应用。上线前务必完成本清单。

---

## 1. 架构总览

```
浏览器
  ├─ 后台（React SPA）      → /api → Spring Boot (8081) → MariaDB
  │                          └─ /uploads、/media → 静态文件（本地磁盘 backend/data/）
  └─ 官网（React SPA）      → /media、/api → Spring Boot（或 Nginx 反代）
```

| 组件 | 技术 | 端口（生产） |
|---|---|---|
| 后端 | Spring Boot 3.5 / Java 21 | 8081（内部，Nginx 反代） |
| 数据库 | MariaDB / MySQL（生产独立实例） | 3306 |
| 后台前端 | React + Vite（build 产物） | 80/443 |
| 官网 | React + Vite（build 产物） | 80/443 |
| 媒体存储 | 本地磁盘 `backend/data/` | 需持久化 + 备份 |

---

## 2. ⚠️ 上线前必改（安全）

### 2.1 环境变量（生产必须注入，替换默认值）

```bash
# 数据库（生产库专用账号，禁止 root + 空密码）
export DB_URL='jdbc:mysql://你的库地址:3306/u690174784_kunzz?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=true&allowPublicKeyRetrieval=true'
export DB_USERNAME='库存系统专用账号'
export DB_PASSWORD='强密码'

# JWT 密钥（务必用强随机值，>= 64 字符）
export JWT_SECRET='openssl rand -hex 32 生成的值，上线前更换'

# CORS 允许域名（逗号分隔，支持通配符）
export CORS_ALLOWED_ORIGINS='https://admin.你的域名.com,https://www.你的域名.com'
```

### 2.2 数据库迁移

1. 从本机 XAMPP 导出库：`mysqldump -u root u690174784_kunzz > backup.sql`
2. 生产库导入：`mysql -u 账号 -p u690174784_kunzz < backup.sql`
3. **创建专用账号**（不要用 root）：
```sql
CREATE USER 'inventory_app'@'%' IDENTIFIED BY '强密码';
GRANT SELECT, INSERT, UPDATE, DELETE ON u690174784_kunzz.* TO 'inventory_app'@'%';
FLUSH PRIVILEGES;
```
4. 生产库建议开启 `useSSL` 并配置 SSL 证书

### 2.3 HTTPS

- 登录、上传、后台管理必须走 HTTPS
- 建议用 Let's Encrypt 或云厂商证书

---

## 3. 后端部署

### 3.1 打包

```bash
cd backend
mvn -DskipTests package
# 产物：target/inventory-backend-1.0.0.jar
```

### 3.2 启动（含环境变量）

```bash
java -jar inventory-backend-1.0.0.jar \
  -DDB_URL='jdbc:mysql://...' \
  -DDB_USERNAME='inventory_app' \
  -DDB_PASSWORD='强密码' \
  -DJWT_SECRET='强随机密钥' \
  -DCORS_ALLOWED_ORIGINS='https://admin.你的域名.com,https://www.你的域名.com'
```

> 环境变量也可以放系统级（/etc/environment 或 systemd EnvironmentFile）。

### 3.3 用 systemd 守护（推荐）

```ini
# /etc/systemd/system/inventory-backend.service
[Unit]
Description=Kunzz Inventory Backend
After=network.target mariadb.service

[Service]
User=deploy
WorkingDirectory=/opt/inventory/backend
EnvironmentFile=/etc/inventory-backend.env
ExecStart=/usr/bin/java -jar /opt/inventory/backend/inventory-backend-1.0.0.jar
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now inventory-backend
```

---

## 4. 前端部署（后台）

```bash
cd inventory-system/frontend
npm install
npm run build
# 产物：dist/
```

将 `dist/` 复制到 Web 服务器目录（如 `/var/www/admin`）。

---

## 5. 官网部署

```bash
cd website
npm install
npm run build
# 产物：dist/
```

官网依赖后端接口（`/api`、`/media`），需 Nginx 反代到后端。

---

## 6. Nginx 配置示例

### 后台（admin.你的域名.com）

```nginx
server {
    listen 443 ssl;
    server_name admin.你的域名.com;
    ssl_certificate     /etc/ssl/你的域名/fullchain.pem;
    ssl_certificate_key /etc/ssl/你的域名/privkey.pem;

    root /var/www/admin;
    index index.html;

    # SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API → 后端
    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 30m;   # 上传视频/图片
    }

    # 媒体文件（图片/视频/背景音乐）
    location /media/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:8081;
    }
}
```

### 官网（www.你的域名.com）

```nginx
server {
    listen 443 ssl;
    server_name www.你的域名.com;
    # ... 证书配置同上 ...

    root /var/www/website;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    # 官网媒体与 API → 后端
    location /media/ { proxy_pass http://127.0.0.1:8081; proxy_set_header Host $host; }
    location /api/   { proxy_pass http://127.0.0.1:8081; proxy_set_header Host $host; }
}
```

> 开发环境的 vite proxy 在生产已不需要（Nginx 反代替代）。如需开发环境直连生产后端，把 `vite.config.ts` 的 target 改成生产域名即可。

---

## 7. 数据与备份

- 媒体/上传文件在 `backend/data/`（背景音乐、页面图片、comphoto、timeline、uploads）
- 建议：`backend/data/` 用独立磁盘挂载，并做每日快照/备份
- 数据库每日 mysqldump：
```bash
mysqldump -u inventory_app -p u690174784_kunzz | gzip > /backup/db_$(date +%F).sql.gz
```

---

## 8. 上线 checklist

- [ ] `DB_URL / DB_USERNAME / DB_PASSWORD` 环境变量已注入（非 root、强密码、非空）
- [ ] `JWT_SECRET` 已替换为强随机值（`openssl rand -hex 32`）
- [ ] `CORS_ALLOWED_ORIGINS` 已配置生产域名
- [ ] 数据库已迁移 + 专用账号创建
- [ ] HTTPS 证书配置完成
- [ ] 前端/官网已 build 并部署
- [ ] Nginx 反代 + `client_max_body_size`（上传大视频）
- [ ] `backend/data/` 持久化 + 备份策略
- [ ] systemd 服务开机自启
- [ ] 上传测试（背景音乐/视频/图片/简历附件）
- [ ] 登录、权限（各角色菜单）验证
- [ ] 中央 invoice PDF / 分店 PDF 导出验证

---

## 9. 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 后台登录后跨域报错 | CORS 未配置生产域名 | 检查 `CORS_ALLOWED_ORIGINS` |
| 上传大视频失败 | Nginx `client_max_body_size` 太小 | 设为 30m+ |
| 白屏 | SPA 路由未 fallback | Nginx `try_files ... /index.html` |
| 官网媒体 404 | `/media` 未反代或后端 `data/` 无文件 | 确认反代；后端首次访问会从旧站拉取缓存 |
| 媒体显示旧数据 | 后端 `fetchRemoteMedia` 从 kunzzgroup.com 拉取 | 如需禁用，在 `MediaServeController` 关闭线上兜底 |

---

## 二、live 运维与数据同步（LIVE_OPS）
> 记录 2026-08-25 两次线上问题（进出货数据缺失 + 时间显示混乱）的根因与预防措施。
> **上线 / 同步数据 / 排查问题前必读。**

> ⚠️ **本机环境状态（2026-09-01 起）**：XAMPP 的 MariaDB 数据目录已损坏弃用，
> 本机系统改跑**内置绿色库** `runtime/mariadb`（数据目录 `runtime/mariadb-data`，端口 3306，
> 由 `一键启动.bat` / start.ps1 管理）。
> 凡是文档里写 `C:/xampp/mysql/bin/mysql.exe` 的地方，本机一律改用
> `C:/Users/kunzz/OneDrive/Desktop/inventory-system/runtime/mariadb/bin/mysql.exe`
> （跑 `sync-live-stock.cjs` 前记得设 `MYSQL_CMD` / `MYSQLDUMP_CMD` 环境变量指向 runtime，
> 脚本默认值还指向 XAMPP）。

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
| 本地库存与 live"不一样" | live 按**价格分组**（幽灵组），新系统按产品**合并成一行**——总数一致（详见第 5 节标准排查流程） | 不要当数据缺失去"补" |
| 本地 8/24 比 live 少 11 条 | dump 导出早于补录时间 | 不要重导 dump，用同步脚本补 |
| live 显示时间"在未来" | live `formatCreatedAt` 重复 +8 的 bug | 不要改数据库，数据库是对的 |
| 本地新记录 created_at 漂移 | 用户设备时区 ≠ +8 | 检查 start.ps1 三道时区防线是否生效 |

### 5. 总库存与 live「对不上」标准排查流程（2026-09-01 实战沉淀）

> **一句话结论：数据从来是准的。** 同一货品有多个进价时，live 拆成多行（幽灵组）、
> 新系统合并成一行，**行数不同、总数相同**。先跑下面三步再下结论，别急着重导数据。

**根因（两边代码位置）**

| 系统 | 分组方式 | 代码位置 |
|---|---|---|
| live 旧系统 | `产品+编号+规格+价格` 拆行（同货品不同价 = 多行，JSON 带 `has_price_diff: true`） | `backend/stocklistapi.php?action=summary` |
| 新系统 | 同口径聚合后**再合并**：同产品+编号+规格 → 一行（库存相加，价格变体存 `price_variants`） | 后端 `StockSummaryService.summary`（merge 段）；前端 `StockRecords.tsx` 的 `mergeSummaryItems` |

例：100 PLUS 在 live = 两行（51@1.14 + 31@1.45），新系统 = 一行（82）。**两边实际库存都是 82。**

**排查三步（照做即可，约 5 分钟）**

```bash
# 第 1 步：流水全量对账（2025 年至今，报告模式不写库）
#   ⚠️ 本机先设环境变量指向内置库（见本文档「本机环境状态」）
cd inventory-system/frontend
export MYSQL_CMD="<runtime>/mariadb/bin/mysql.exe"
export MYSQLDUMP_CMD="<runtime>/mariadb/bin/mysqldump.exe"
node sync-live-stock.cjs --full
# → 三店「待新增 0 / 待更新 0 / 本地独有 0」= 流水 100% 对齐，数据没问题
#   （本地独有里有 deleted_at 的行是已删记录，live 列表 API 不返回，正常）
```

```javascript
// 第 2 步：总库存对账 —— 用 puppeteer 登录 live 后拉汇总 JSON（凭证在 live-credentials.json）
// fetch(`${CFG.baseUrl}/backend/stocklistapi.php?action=summary&system=j1`) → 存成 live_summary_j1.json
```

```sql
-- 第 3 步：本地按 live 同口径聚合，逐行对比 JSON 里的 summary
-- 口径：产品+编号+规格+ROUND(price,2)；只看未删、净库存≠0 的行
SELECT CONCAT(product_name,'|',IFNULL(code_number,''),'|',IFNULL(specification,''),'|',ROUND(price,2)) AS k,
       SUM(in_quantity)-SUM(out_quantity) AS net
FROM u690174784_kunzz.j1stockedit_data
WHERE deleted_at IS NULL
GROUP BY product_name, code_number, specification, ROUND(price,2)
HAVING SUM(in_quantity)-SUM(out_quantity) <> 0;
-- 判定：行数可以不同（幽灵组）；**每行数量、库存合计、库存总值必须相等**。
--      相等 = 对齐完毕，剩下的都是显示口径问题；不相等才是真数据问题，再回头查流水。
```

**两个「看着不同但不是错误」的点（2026-09-01 对账实测）**

| 差异 | 实际情况 |
|---|---|
| `SUNTORY THE PREMIUM MALT'S` 两边名字不同 | live 还带 HTML 实体 `&#039;`，本地已按第 1 步清洗成正常撇号——**本地更干净**，是文档规定的处理 |
| `SURUME IKA P` 名字里的空格怪怪的 | live 脏数据：名字里混了一个制表符（TAB），两边同款同数量，不影响库存 |

### 6. 类型统计（类型卡）与 live 对不上 —— type 归属必须用 MAX(type)（2026-09-03 实战）

**现象**：总库存-J1 总额一致（分差 0.01 的舍入），但四个类型卡金额差异大：
Kitchen 新多 754.30 / Sushi Bar 新少 701.80 / Service Line 新少 52.50（和恰为 754.30）。

**根因**：合并 key（名字+规格+单价+编号）内同货品既有 Kitchen 又有 Sushi Bar 的流水时，type 归属规则不同：
- 旧 live（stocklistapi.php）：`MAX(type)`（字典序最大：Sushi Bar > Service Line > Sake > Kitchen）
- 新系统当时：`GROUP_CONCAT(type ORDER BY price ASC)` 取 price 最小一条的 type ——当时注释声称“对齐旧系统”，**实为误判**（未与 live 真实页面对账就改了）

**修复**：`StockSummaryMapper.xml` summaryRows 的 type 改回 `MAX(COALESCE(type,''))` 对齐旧 live；
实测 J1 四类型与 live 完全一致（6,117.89 / 1,827.30 / 15,526.11 / 10,200.40）。

**规范（防再犯）**：任何对账口径/聚合规则的修改，**必须先用 live 真实页面数字逐项对账验证后才允许合入**；
对账时类型统计与流水总额要分开看——总额一致 ≠ 分类归属一致。

---

## 四、数据包生成流程（当前推荐）

```
1. 用户设备/本机跑完当天业务
2. node sync-live-stock.cjs --days=2 --apply   ← 从 live 补齐最新
3. 备份数据.bat / mysqldump 导出 → database/u690174784_kunzz.sql
4. 校验：表数 69（67 原表 + operation_logs + phone_records）、MAX(date)=当天、无 uca1400
5. 推送 git → 用户设备重新下载 zip
```

> 说明：数据库 `phone_records` / `operation_logs` 是新系统功能表，`stock_data.price` 是 2026-08-26 新增的
> 货品种类默认单价列（进货自动抓取），老库备份均不含；一键启动（start.ps1 `Ensure-NewTables`）或手动执行
> `add_new_tables.sql` 会自动补建/补列，无需手动处理。

---

## 五、相关文件索引

| 文件 | 作用 |
|---|---|
| `sync-live-stock.cjs` | live 进出货同步工具（报告 + 自动补齐） |
| `live-credentials.json` | live 登录凭证（**勿推 git**） |
| `start.ps1` | 一键启动（含时区三道防线 + 自动补新系统表） |
| 本文件 · 第三节 | 数据清洗检查清单（HTML 编码 / gender / 负数） |
| `add_new_tables.sql` | 新系统结构补丁（幂等）：operation_logs / phone_records 两张功能表 + stock_data.price 默认单价列 |

---

## 三、数据同步检查清单（DATA_SYNC_CHECKLIST）
> **快捷方式：直接运行 `sync-live-data.bat`**（把线上 dump 文件拖进去即可）——
> 自动完成：备份 → 修复排序规则 → 重建库导入 → **补建新系统结构**（operation_logs/phone_records/stock_data.price/**stock_system**，
> 见第 0.6 步）→ 清洗（本清单全部内容）→ 验证 → 重启后端。
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
> - `stock_minimum_settings` 自 2026-08-27 起恢复 `stock_system` 列（最低库存**分系统独立**：中央设置不影响分店通知，唯一键 (stock_system, product_name)）。
>   老库导入后执行 `add_new_tables.sql`（第 4 步幂等补列+换键）或重启时由 `start.ps1` `Ensure-NewTables` 自动补齐。
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
4. **最低库存设置分系统独立** `stock_minimum_settings.stock_system`（2026-08-27 新增：中央/各分店各自维护最低库存，
   中央设置不影响分店低库存通知；唯一键从 `(product_name)` 改为 `(stock_system, product_name)`）
   - ⚠️ **线上库（kunzzgroup.com）还是旧结构**（无 stock_system），每次从线上导最新 dump 导入后都必须跑本脚本补第 4 步
   - 数据迁移：旧设置行自动归入 `central`；各分店如需最低库存预警需在「最低库存设置」页按系统 Tab 重新设置

验证：
```sql
-- 表（应返回 2 行）
SELECT table_name FROM information_schema.tables
WHERE table_schema='u690174784_kunzz' AND table_name IN ('operation_logs','phone_records');
-- 列（应各返回 1 行）
SELECT column_name, column_type FROM information_schema.COLUMNS
WHERE table_schema='u690174784_kunzz' AND table_name='stock_data' AND column_name='price';
SELECT column_name, column_type FROM information_schema.COLUMNS
WHERE table_schema='u690174784_kunzz' AND table_name='stock_minimum_settings' AND column_name='stock_system';
-- 索引（应含 unique_system_product，列为 stock_system,product_name）
SHOW INDEX FROM stock_minimum_settings;
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

---

## 四、2026-09-02 事故：j2/j3stockedit_data 表空间损坏（根因：OneDrive 同步 mariadb-data）

### 症状
- 电话版 `/mobile/inout?system=j2|j3` 报「服务器内部错误」：
  `Got error 1877 "Unknown error" from storage engine InnoDB`（SQL error 1030），查询 `jXstockedit_data` 即触发
- `CHECK TABLE` → `Index PRIMARY is marked as corrupted`；随后恶化到 `ERROR 1932 Table doesn't exist in engine`
- mysqld.err.log 关键行：`InnoDB: Failed to read file '.\u690174784_kunzz\j2stockedit_data.ibd' at offset 255: Page read from tablespace is corrupted.`
- 波及范围仅 **j2stockedit_data / j3stockedit_data** 两张表（j1、mobile 三表、stock_data 等 CHECK 全 OK）

### 根因
`runtime/mariadb-data/` 位于 **OneDrive 同步范围**（OneDrive 备份桌面 → 整个 inventory-system 在同步内）。
OneDrive 在 mysqld 运行/关机期间上传/回滚 .ibd → 页面撕裂 → InnoDB 表空间损坏。
**实测复现**：删除损坏 .ibd 后数秒内被 OneDrive 从云端同步回（带回的是坏版本）。
这是该数据目录第二次损坏（2026-09-01 曾有孤儿表空间 + Aria 系统表损坏，见 CHANGELOG 09-01）。

### 修复过程（2026-09-02，已验证）
**后续进展（同日）**：j1stockedit_data 也发现同类损坏（二级索引 idx_product_name_price_deleted_at 恶化到 1932）——
OneDrive 在事故处理期间仍在后台把旧页回写。已用同流程修复（CHECK OK，22,300 行，与 dump 差 1 行 = 昨晚已清理的测试残残留）。
**根治已完成**：数据目录已迁出 OneDrive → `C:\kunzz-mariadb-data`，start.ps1 已改（`$MDB_DATA`）且新装机会自动从旧目录迁移；
README 方式 A 已注明换机时数据不跟文件夹走。本节其余流程保留作为同类事故参考。
关键点：MariaDB 10.4 InnoDB 元数据在 **InnoDB 自己的字典**里（innodb_sys_tables），`.frm` 只是服务层入口。
只删文件 → 服务层看不到表 → `DROP IF EXISTS` 不会传达到 InnoDB → 字典条目永远清不掉 → CREATE 报 1813/1050。

1. `taskkill //IM OneDrive.exe //F`（暂停 OneDrive，防止文件被同步回滚/恢复）
2. `mysqladmin -u root shutdown` 优雅停库
3. 坏文件移入 `runtime/quarantine_corrupt_20260902/`（.ibd + .frm 都隔离）
4. **把 .frm 放回 datadir（不放 .ibd）** → 重启 mysqld → 服务层重新认得表
5. `DROP TABLE j2stockedit_data; DROP TABLE j3stockedit_data;` —— 真正贯穿两层，InnoDB 字典条目被清
   （验证：`SELECT name FROM information_schema.innodb_sys_tables WHERE name LIKE '%j2stockedit_data%'` 为空）
6. 从 `database/u690174784_kunzz.sql`（09-01 14:45 dump）awk 提取两表片段（`runtime/repair_j2j3.sql`），
   `mysql --init-command="SET SESSION sql_mode=''" 库名 < repair_j2j3.sql`
   —— **必须非严格模式**：j3 有 31 行 `target_system` 枚举外脏值（live 原有），严格模式报 `Data truncated` 中断导入
7. `CHECK TABLE` 两表 OK；行数 j2=14,976 / j3=17,928（与 dump AUTO_INCREMENT 对齐）；
   电话版查询（stocklist_total 同款 SQL）实测通过；后端无需重启（连接池自动重连）
8. 重启 OneDrive（云端拿到的是健康文件）

### 数据损失评估
dump 之后只有 09-01 晚的会话测试写入（且已清理），j2 表 .ibd 自导入后未变过——**零数据损失**。

### 预防（重要）
- ~~根治待办~~ → **已根治（同日）**：datadir 已迁出 OneDrive 至 `C:\kunzz-mariadb-data`；start.ps1 已改（`$MDB_DATA`），
  旧目录存在时首次运行自动迁移；README 方式 A 已注明换新电脑时数据不跟文件夹走
- 日常跑库（导入/同步/备份/更新）前暂停 OneDrive（`taskkill //IM OneDrive.exe //F`，做完再启动）仍建议保留，双保险
- mysqlcheck 全库体检确认无其他隐患后，才继续使用

### 09-02 补充：live 侧手机镜像缺失补录（j3）
- 发现：live 旧手机页 09-01 的 100 PLUS 出货（HONG MING SOON，48+21=69，mobile_ref 12947/12948）在 **live 桌面表 j3stockedit_data 无镜像行**（旧版自身镜像漂移，同 fix_mobile_sync.php 存在的动机）；缓存表 j3stocklist_total 却已扣 -69
- 本地已补录两条桌面镜像行（id 18984/18985，receiver='Mobile'，单价 1.14=出货时点最近非 Mobile 进货价，mobile_ref_id 关联），桌面进出货与实时库存恢复正常
- live 端同样缺这两行（桌面口径 100 PLUS 多算 69），如需对齐 live 可在 live 执行同款补录

### 09-02 补充 2：电话版负价格层导致多扣货（已修，有意偏离旧版）
- 现象：100 PLUS（J3）显示 74，手机版输 73（想出 1）→ 实扣 5
- 根因：该货品有 **-4 的负价格层**（1.14 价位历史超发）。保存时 totalStock = 各价格层之和但**负层截 0**（对齐旧 live 的 Math.max(0,...)）→ 计算口径 78 ≠ 列表显示 74 → 多扣 4
- 修复：totalStock 改为含负层的真实净值（与列表口径一致）；HIFO 扣货仍只从正数层扣（avail ≤ 0 跳过），不会把负层扣成更深
- 旧 live 系统同样存在此缺陷（同口径同扣法）；新系统有意修正

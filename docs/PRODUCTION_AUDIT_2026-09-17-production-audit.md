# PRODUCTION AUDIT REPORT

> 目标平台：**Hostinger VPS / Ubuntu 24.04**（Nginx + Spring Boot 3.5 + MariaDB）
> 审计对象：`kunzz-springboot-react` @ `534b9a3`（main）
> 审计日期：2026-09-17 ｜ 任务 ID：`2026-09-17-production-audit`
> **本阶段只扫描、只分析、只报告。未修改、未删除、未提交、未推送任何文件。**
> 本报告本身是新建文件（`docs/PRODUCTION_AUDIT_2026-09-17-production-audit.md`），未触碰任何既有文件。

---

## 0. 执行摘要（TL;DR）

| # | 结论 | 影响 |
|---|---|---|
| 1 | **架构已经基本适配**：后台 React 的 axios `baseURL = '/api'`，生产 WebSocket 走同源 `/ws/realtime`。**不需要**大改 React 的 API URL。 | ✅ 好消息 |
| 2 | **数据库 dump 可以导入全新 MariaDB**：`database/u690174784_kunzz.sql` 的结论是 **YES-WITH-CAVEATS**（低风险）。含 70 个 `DROP TABLE IF EXISTS`，只能导入空库。 | ✅ 可执行 |
| 3 | **导入后必须再跑 `add_new_tables.sql`**：`freezer_categories` 表不在 dump 里，缺了冰箱分类功能会在运行时报错。 | ⚠️ 必做 |
| 4 | **AI 不需要部署**：只有进出货页的聊天球需要 Ollama。其余全部功能不依赖 AI；连"整单粘贴出货"都是确定性正则解析（不调模型）。 | ✅ 可暂时关闭 |
| 5 | **`deploy-ec2.sh` 有两处会漏文件**：不传 `backend/uploads/`（368 张碗碟照片）和 `backend/static/`（发票模板/字体），照它部署会 404 / 发票生成失败。 | 🔴 需修脚本 |
| 6 | **`nginx-ec2.sh` 缺 `/ws` 反代**：不补的话，生产环境右上角实时状态永远是"实时离线"。 | 🔴 需修配置 |
| 7 | **`DataInitializer` 会在首次启动时自动创建 `demo` / `demo123` 账号**，而且 dump 里已经有这个账号。生产必须禁用。 | 🔴 高危 |
| 8 | **公开仓库里已有真实凭据与员工隐私**：CHANGELOG 里的 Gmail 应用密码、web3forms key、22 个密码哈希 + 员工 IC/银行账号。 | 🔴 最高危 |
| 9 | **`.gitignore` 的 `!backend/target/*.jar` 是失效规则**（已实测），74MB 的 jar 之所以还在版本库里，只是因为它早就被跟踪了。 | ⚠️ 陷阱 |
| 10 | **必须先做一个决定**：VPS 用**本地新建的 MariaDB**，还是继续**连 Hostinger 的在线库**？这决定数据是不是会分叉。 | ❗决策点 |

**建议的第一阶段目标**：VPS 上用 Nginx 单源 + 本地 MariaDB（导入 dump），`http://VPS_IP` 跑通全流程；AI 关闭；不改 DNS。

---

## 1. Repository Structure

仓库根：`C:\Users\donho\OneDrive\Desktop\kunzz-springboot-react-main`（OneDrive 目录内）
git 跟踪：**996 个文件**，工作区干净（仅 21 个未跟踪的本地文件）。

```
kunzz-springboot-react/
├── backend/                      148 MB   后端（Spring Boot 3.5 / Java 21）
│   ├── pom.xml                   5.1 KB
│   ├── src/main/java/            197 个 .java（11 包：controller/service/entity/…）
│   ├── src/main/resources/
│   │   ├── application.yml       2.0 KB   ← 唯一配置文件，全部可用环境变量覆盖
│   │   └── mapper/*.xml          14 个 MyBatis XML
│   ├── data/                      22 MB   运行期数据（多媒体配置/图片/时间线/简历）
│   ├── uploads/dishware/          26 MB   368 张碗碟照片（运行期数据）
│   ├── static/                    28 MB   前端构建产物 + 发票模板 + 字体（**可再生**）
│   └── target/                    72 MB   inventory-backend-1.0.0.jar（74 MB，**已跟踪**）
├── website/                        3 MB   官网 React 19 + Vite 8（端口 5175，base=/home/）
├── inventory-system/frontend/     24 MB   后台 React 18 + TS + AntD 5（端口 5174）
│   └── public/fonts/              18 MB   字体（PDF 用，必需）
├── database/                      43 MB
│   ├── u690174784_kunzz.sql       22 MB   生产数据包（**已跟踪，必须保留**）
│   └── backup_before_import_*.sql 21 MB   本地回滚快照（未跟踪）
├── docs/                           1 MB   OPS/GO_LIVE/DB_IMPORT/AI_ASSISTANT + tasks/
├── runtime/                     2292 MB   **本地专用**：jre21 146MB + mariadb 223MB + ollama 1853MB
├── deploy-ec2.sh / nginx-ec2.sh           EC2 部署脚本（可改写为 VPS 版）
├── start.ps1 (31KB) / update.ps1 / git-update.ps1 / backup-data.ps1 / *.bat
├── add_new_tables.sql / sync_cleanup.sql
└── AGENTS.md / README.md / CHANGELOG.md (105KB) / .gitignore / .gitattributes / .githooks/
```

**关键目录事实**（决定了部署方式）：

- 后端所有运行期文件都用**相对路径**读取，基准是进程工作目录 `System.getProperty("user.dir")`：
  - `uploads/dishware/`（DishwareController:37）
  - `data/` → comphotos / uploads(简历) / page-images / timeline / bgmusic / page_config.json / corporate_strategy.json
  - `static/`（WebConfig:43-62）
  → **jar 必须在一个同时含有 `static/`、`uploads/`、`data/` 的目录下启动**。
- jar **不内嵌** static/uploads/data（已用 `unzip -l` 验证为 0），必须外部提供。
- 前端产物位于 `backend/static/`，**可以从源码重新构建**（不是不可再生的资产）。

---

## 2. Production Architecture

### 2.1 与现有文档的冲突（必须先决定）

| 方案 | 数据来源 | 现状文档 | 风险 |
|---|---|---|---|
| **A. VPS 本地 MariaDB** | 导入 `u690174784_kunzz.sql` 快照 | 用户本次目标 | 旧 PHP 站仍在 kunzzgroup.com 写 Hostinger 库 → **两边数据分叉** |
| **B. 远程 Hostinger 库** | 直连 Hostinger MySQL | `docs/GO_LIVE.md` 原计划 | 数据唯一、不分叉；但需白名单 VPS IP、有网络延迟、VPS 本地库形同虚设 |

> **建议**：第一阶段（`http://VPS_IP` 测试）用 **方案 A**，因为完全不碰生产库、可随便试错。
> 但在**切换域名之前**，必须明确"谁是唯一真相来源"。若旧 PHP 系统还要继续接单/进出货，
> 方案 A 的数据会立刻过期——那时应切回方案 B，或安排正式的数据迁移+旧系统下线。

### 2.2 推荐的目标架构（Nginx 单源，免 CORS）

```
                    INTERNET
                       │
                       ↓
              HOSTINGER VPS (Ubuntu 24.04)
                       │
                     NGINX :80 / :443
                       │
   ┌───────────────────┼────────────────────┬──────────────┐
   ↓                   ↓                    ↓              ↓
  /                /home/            /api/ /media/     /uploads/
后台 React SPA    官网 React SPA     /invoice/         碗碟照片
(dist/)           (dist/)           /ws/ (WS 升级)
                       │
                       ↓
              Spring Boot 127.0.0.1:8081   ← 只监听回环
                       │
                       ↓
              MariaDB 127.0.0.1:3306       ← 只监听回环
```

**为什么单源**：后台与官网同域 → 不需要 CORS、不需要改 axios baseURL、WebSocket 天然同源。
`cors.allowed-origins` 在生产可以留默认（同源请求根本不触发 CORS）。

**路径分工**（由构建产物 `backend/static/index.html` 实际引用决定，非猜测）：

| 路径 | 归属 | 依据 |
|---|---|---|
| `/` | 后台 dist | `inventory-system/frontend` 产物，`base: '/'` |
| `/home/` | 官网 dist | `website/vite.config.js` 的 `base: '/home/'` |
| `/api/` | Spring Boot | 前端 axios `baseURL='/api'` |
| `/ws/` | Spring Boot（**必须带 Upgrade 头**） | `useRealtime.ts` / `RealtimeStatus.tsx` |
| `/media/` | Spring Boot | `MediaServeController` |
| `/uploads/` | Spring Boot | 碗碟照片 |
| `/vendor/`、`/pdf-lib.min.js`、`/fontkit.umd.min.js`、`/static/images/`、`/invoice/`、`/fonts/`、`/form/` | 后台 dist 的 `public/`（构建后落在 dist 根） | 见 §10 |

---

## 3. Files MUST KEEP（不可替代的源码与资产）

### 3.1 后端源码（唯一真相）
- `backend/pom.xml`
- `backend/src/main/java/**`（197 个 .java）
- `backend/src/main/resources/application.yml`
- `backend/src/main/resources/mapper/*.xml`（14 个）

### 3.2 前端源码
- `inventory-system/frontend/{src/**, package.json, package-lock.json, vite.config.ts, tsconfig*.json, index.html, public/**}`
- `website/{src/**, package.json, package-lock.json, vite.config.js, index.html, public/**, .env.production, .env.example}`

### 3.3 生产运行期数据（**不能由构建再生**）
- `database/u690174784_kunzz.sql` ← 数据库唯一数据来源 + 灾难恢复资产
- `add_new_tables.sql` ← 导入后必跑（含 `freezer_categories`）
- `backend/data/page-images/`（homepage1.webm 19MB、about1.jpg、join1.jpg、tokyo1.jpg）
- `backend/data/timeline/`（11 个 webp/jpeg/png）
- `backend/data/{timeline_config.json, timeline_config_en.json, page_config.json, corporate_strategy.json, media_config.json}`
- `backend/uploads/dishware/**`（368 张照片，数据库里按 `/dishware/xxx.jpg` 引用）
- `backend/static/{invoice/*.pdf, fonts/*.ttf, form/*.pdf}` ← 发票模板与字体，**代码显式引用**：
  - `src/utils/invoicePdf.ts:117,119` → `/invoice/${system}invoice.pdf`
  - `src/pages/Qna.tsx:91` → `/fonts/NotoSansSC-Regular.ttf`

### 3.4 部署与文档
- `deploy-ec2.sh`、`nginx-ec2.sh`（可改造成 VPS 脚本，别丢）
- `docs/**`（OPS.md 已有 systemd/nginx 模板；DB_IMPORT.md 有导入校验清单）
- `README.md`、`AGENTS.md`、`CHANGELOG.md`、`.githooks/**`、`.gitattributes`、`.gitignore`
- Windows 侧工具（本机开发仍需要，VPS 不需要）：`start.ps1`、`update.ps1`、`git-update.ps1`、`backup-data.ps1`、`*.bat`
- `sync_cleanup.sql`（数据清洗，可选）

---

## 4. Files MUST UPLOAD（→ VPS）

| 来源 | 目标 | 大小 | 说明 |
|---|---|---|---|
| `backend/target/inventory-backend-1.0.0.jar` | `/opt/inventory/app.jar` | 74 MB | 已核对与 HEAD 源码一致（见 §11.4） |
| `backend/static/**` | 后台 dist 一起发布（见下） | 28 MB | 若用 Nginx 直发 dist，则只需 `invoice/ fonts/ form/` 由 dist 覆盖 |
| `backend/uploads/**` | `/opt/inventory/uploads/` | 26 MB | **`deploy-ec2.sh` 当前漏了这一步** |
| `backend/data/**` | `/opt/inventory/data/` | 22 MB | 脚本有传，保留 |
| 后台 dist（`npm run build`） | `/var/www/admin/` | ~25 MB | 含 `public/` 里的 fonts/invoice/vendor |
| 官网 dist（`npm run build`） | `/var/www/website/` | ~5 MB | `base=/home/` |
| `database/u690174784_kunzz.sql` | 仅用于 `mysql <` 导入 | 22 MB | 导入后可留在服务器做备份 |
| `add_new_tables.sql` | 导入后立即执行 | 9 KB | 必做 |

---

## 5. Files DO NOT UPLOAD

| 项 | 原因 |
|---|---|
| `runtime/**`（2292 MB） | Windows 专用二进制：`jre21`(Win)、`mariadb`(Win exe)、`ollama`(Win exe + CUDA dll)、`mariadb.zip` |
| `start.ps1` / `update.ps1` / `git-update.ps1` / `backup-data.ps1` / `*.bat` | PowerShell + cmd，Linux 无意义 |
| `.m2/`、`node_modules/`、`dist/`（构建中间物） | 在 VPS 上重新构建 |
| `*.log`（`backend_run.log` 58KB、`mysqld.err.log`） | 本地调试日志 |
| `database/backup_before_import_20260917_104241.sql`（21 MB） | 本地回滚快照，不上服务器 |
| `docs/docs/**`、`更新前差异清单_*.txt`、`本地改动备份_*.patch`、`_update_help.txt` | 本地过程文件 |
| `.git/**`(198 MB) | VPS 上直接 `git clone` 或用 rsync 源码即可 |

---

## 6. Files SAFE TO DELETE LOCALLY（**等你确认，我一条都没删**）

| # | 路径 | 大小 | 删除后影响 | 风险 |
|---|---|---|---|---|
| 1 | `runtime/ollama/` | 1853 MB | 本地 AI 助手不可用（`start.ps1` 会重新下载 1.4GB+2.4GB） | 低 |
| 2 | `runtime/mariadb.zip` | 72 MB | 无（已解压到 `runtime/mariadb/`） | 极低 |
| 3 | `runtime/mariadb/` | 223 MB | 本地内置库不可用（会自动重下）；**注意**：数据不在这里 | 低 |
| 4 | `runtime/jre21/` | 146 MB | 本地启动器会重新下载 JRE 21 | 低 |
| 5 | `runtime/*.log`、`backend_run*.log` | ~1 MB | 无 | 极低 |
| 6 | `backend/target/inventory-backend-1.0.0.jar` | 74 MB | **不要删**：它是 Windows 一键更新的分发物 | **保留** |
| 7 | `backend/static/**` | 28 MB | 可再生（重新 build 前端）；但会让 `更新系统.bat` 的分发失效 | 中 |
| 8 | `docs/docs/`（与 `docs/` 逐字节相同的副本，9 个文件 + 2 PNG） | ~260 KB | 无（未跟踪、无引用） | 极低 |
| 9 | `更新前差异清单_*.txt`（2 个） | 3 KB | 无 | 极低 |
| 10 | `本地改动备份_20260917_204832.patch` | 2.9 MB | 失去一次历史改动的回滚备份 | **建议保留** |
| 11 | `database/backup_before_import_*.sql` | 21 MB | 失去导入前快照 | **建议保留**（或异地备份后再删） |

**⛔ 绝对不能删（不在仓库内，但清理时最容易误伤）**
- `C:\kunzz-mariadb-data`（**268 MB，本地实时数据库数据目录**，删了本地数据全没）
- `database/u690174784_kunzz.sql`
- `backend/data/**`、`backend/uploads/**`
- `backend/target/*.jar`（分发物）

> 汇总：**可安全释放约 2.1–2.3 GB**，其中 `runtime/ollama` 占 1.85 GB。
> 删除 `runtime/` 后，双击 `一键启动.bat` 会重新联网下载（JRE 146MB + MariaDB 223MB + 可选 AI 3.9GB）。

---

## 7. Files NEED MANUAL CONFIRMATION

| 路径 | 问题 | 建议 |
|---|---|---|
| `backend/static/form/{j1,j2,j3,kh}.pdf` | 全仓库**搜不到任何引用**（前端 src、后端 java 都没有） | 先保留；确认是旧系统遗留后再定 |
| `backend/static/invoice/*.pdf`（9 个） | **被引用**（`invoicePdf.ts`），但也有 `j1invoiceMulti(1).pdf`/`(2).pdf` 这种多页模板 | 保留全部 |
| `backend/data/uploads/t.txt`（3 字节） | 测试残留 | 可删，但先确认无引用 |
| `backend/data/media_config.json`（内容 `{ }`） | 空对象 | 保留（代码会读写） |
| `docs/_header_uniform.png`、`_j3_header.png`（149 KB） | 无引用的截图 | 可删，建议先保留 |
| `backend/data/timeline_config_en.json` | 英文站时间线 | 保留 |
| `runtime/`（整目录） | 删了就要重下 | 看是否还要在**这台机器**上做本地开发 |
| `CHANGELOG.md:1005` 的 Gmail 应用密码 | **必须处理**（见 §13/§14） | 先去 Google 撤销，再改文件 |
| `database/u690174784_kunzz.sql` 里的员工 PII | **必须处理**（见 §13） | 见 §14 处置建议 |

---

## 8. Database Requirements

### 8.1 能否直接 Import？→ **YES-WITH-CAVEATS（低风险）**

`database/u690174784_kunzz.sql` 实测：22,646,412 字节 / 2,687 行 / **CRLF** / UTF-8 无 BOM。
生成者是 **mariadb-dump 10.19（Distrib 10.4.32-MariaDB, for Win64）**，`Host: 127.0.0.1` ——
**不是** Hostinger phpMyAdmin 导出的，所以 **0 处 `uca1400` 排序规则**（文档里最怕的那个坑不存在）。

| 项 | 实测值 |
|---|---|
| 表 | **66 张** 全部 `ENGINE=InnoDB` |
| 视图 | 4（j1data_view / j2data_view / j3data_view / stock_data_view） |
| 触发器 | **8**（dishware_stock ×2、j1data ×2、j2data ×2、j3data ×2） |
| 存储过程 / 函数 / 事件 | 0 / 0 / 0 |
| 外键 | 20（**交错**在 CREATE TABLE 内；已含 `FOREIGN_KEY_CHECKS=0`，安全） |
| 数据量 | 138,709 行 / 50 张表有数据（16 张空） |
| 最大表 | `stockinout_data` 28,739 行 |
| 字符集 | 66/66 `utf8mb4`；65 张 `utf8mb4_unicode_ci`，1 张 `users_member` 用 `utf8mb4_general_ci` |
| 生成列 | **7 个 `GENERATED ALWAYS STORED`**（dishware_set_stock.total_quantity、j{1,2,3}cost.c_total、j{1,2,3}stockinout_data.total_value） |
| `CREATE DATABASE` / `USE` | **都没有** ← 必须先建库并在命令行指定库名 |
| `DROP TABLE IF EXISTS` | **70 处** ← 破坏性全量替换脚本 |

### 8.2 关键警告（按严重度）

1. **必须导入空库**。70 个 `DROP TABLE IF EXISTS` 会先删掉同名对象，**绝不会**"合并"。
   → 严禁对任何已有数据的库执行（尤其 Hostinger 线上库！）。
2. **必须用 root 导入**。8 个触发器带 `DEFINER=\`root\`@\`localhost\``、4 个视图带
   `DEFINER=\`u690174784_kunzz\`@\`127.0.0.1\``（Hostinger 专属账号，新机器不存在）。
   非 root 导入会报 `ERROR 1227`。用 `sudo mariadb` 导入最省事。
3. **不要开严格模式**。dump 第 15 行自己设 `SQL_MODE='NO_AUTO_VALUE_ON_ZERO'`（非严格），
   这是**必须的**：老库有脏数据（enum 空串、31 行 `target_system` 枚举外值），
   且 7 个生成列的 INSERT 里带了字面值 → 严格模式下会 `ERROR 1906` 直接中断。
4. **导入后必跑 `add_new_tables.sql`**：`freezer_categories` 表**不在** dump 里，
   而 `FreezerCategoryController/Service/Repository` 都在代码里，`ddl-auto: none` 不会自动建表
   → 不跑就报错。该脚本幂等，其余 6 项都是 no-op。
5. `users_member` 用 `utf8mb4_general_ci`，与其它表 `utf8mb4_unicode_ci` 不同 → 联表可能
   `Illegal mix of collations`（运行期风险，非导入风险）。
6. CRLF：现代 mariadb 客户端会自行去掉行尾 `\r`；若报 `ERROR 1064 ... near '\r'`，
   对**副本**执行 `sed -i 's/\r$//'`（不要改仓库里那份）。
7. 建议 **MariaDB 而不是 MySQL 8**：源库是 MariaDB 10.4，排序规则语义一致。

### 8.3 导入步骤（Phase 18 里有完整命令）

```bash
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS u690174784_kunzz
                 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mariadb u690174784_kunzz < database/u690174784_kunzz.sql   # 退出码必须 0
sudo mariadb < add_new_tables.sql                               # 补 freezer_categories
```

导入耗时约 **30 秒 – 3 分钟**；库本体占用约 **100 MB**，整个 datadir 约 200–400 MB。
资源需求低，不需要额外调优（默认 `max_allowed_packet=16M` 已足够，最大单语句 1.04 MB）。

### 8.4 校验清单（导入后立刻跑）

```sql
SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='u690174784_kunzz';              -- 期望 70
SELECT COUNT(*) FROM information_schema.triggers
  WHERE trigger_schema='u690174784_kunzz';            -- 期望 8
SELECT COUNT(*) FROM j1stockedit_data;                -- 期望 23704
SELECT COUNT(*) FROM j2stockedit_data;                -- 期望 15889
SELECT COUNT(*) FROM j3stockedit_data;                -- 期望 18683
SELECT COUNT(*) FROM stock_data;                      -- 期望 610
SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='u690174784_kunzz' AND table_name='freezer_categories';  -- 跑完脚本后期望 1
CHECK TABLE j1stockedit_data, stock_data, dishware_info;
```

### 8.5 严禁事项（与你 Phase 3 的要求一致）
- ❌ `DROP DATABASE`、❌ 空库覆盖旧库、❌ 对 live 库执行这个 dump
- ❌ 现在**不要**在 Hostinger 线上库跑 `add_new_tables.sql`（那是 GO_LIVE 的步骤，等确认后再做）
- ✅ 本阶段只在 VPS 的新库上操作

---

## 9. AI / Ollama Requirements

### 9.1 代码链路（实测）

```
StockInout 页面 🤖 聊天球 (components/AiAssistant.tsx)
        ↓
  api/ai.ts  ── askAi()      → POST /api/ai/chat        → AiService.chat()      → Ollama :11434 /api/chat
             └─ parseOrder() → POST /api/ai/parse-order → AiService.parseOrderText() → 纯正则，无模型
```

配置：`application.yml` → `ollama.base-url: ${OLLAMA_BASE_URL:http://localhost:11434}`、`ollama.model: ${OLLAMA_MODEL:kunzz-ai}`。
本地模型由 `start.ps1` 用 `runtime/ollama/Modelfile` 从 **Qwen3-4B-Q4_K_M.gguf**（2.4GB）`ollama create kunzz-ai` 导入。
Ollama 不可用时返回友好提示：`"无法连接本地 AI 服务，请确认 Ollama 已启动"`（AiService:74）——**不阻断其它功能**。

### 9.2 三分类结论

| 分类 | 内容 | 依据 |
|---|---|---|
| **AI 必须部署** | —— **无** | 没有任何核心业务依赖模型 |
| **AI 可以暂时关闭** | ① 库存自然语言问答（"apple sauce 还有多少"）<br>② 自然语言单条进货/出货草稿（"帮我进货 xx 2 件"）<br>③ 聊天球入口本身 | 全部走 `/api/ai/chat`；关掉只是聊天球答不出，返回一句提示 |
| **AI 完全不需要** | ① **"整单粘贴秒级出货"**（`/api/ai/parse-order`）<br>② 库存/台账/出入库/分店/餐具/职员/排班/考核/菜单/KPI/价格/蓝图/媒体<br>③ PDF 导出、Excel、发票、WebSocket 实时<br>④ 登录/JWT/权限/邮件 | parseOrderText 是确定性正则（已逐行确认无 `restClient`/`chatRequest` 调用）；其余代码里没有任何模型调用 |

> **注意**：③"整单粘贴"虽然挂在 AI 聊天球里，但它是**离线可用**的——这是本次审计里
> 最值得知道的一点：**关掉 Ollama，进出货主力功能不受影响。**

### 9.3 VPS 上的 AI 代价（如果以后要开）

- 无 GPU → 纯 CPU 推理。Qwen3-4B Q4_K_M 约 2.5 GB 常驻内存；
  4 vCPU 上大约 **2–6 tokens/s**（前端超时设了 5 分钟，能用但慢）。
- 磁盘：Ollama 二进制 ~1.4 GB + 模型 ~2.5 GB ≈ **+4 GB**；内存 **+4 GB**。
- **结论：第一阶段不要装 Ollama。** 需要时作为独立 systemd 服务单独上，`OLLAMA_BASE_URL` 指向它即可
  （后端已支持环境变量覆盖，无需改代码）。

---

## 10. React Production Requirements

### 10.1 后台 `inventory-system/frontend/`

| 项 | 状态 |
|---|---|
| 构建 | `npm run build` = `tsc -b && vite build`；React 18 / TS 5.6 / Vite 5 |
| API 地址 | ✅ **`axios.create({ baseURL: '/api' })`**（`src/api/http.ts:5`）→ 零硬编码域名 |
| WebSocket | ✅ 生产用同源 `ws(s)://${window.location.host}/ws/realtime`；仅当端口是 5174/5175 才直连 `:8081` |
| 开发端口 | 5174，`server.host: true` |
| 上传 | `/uploads/**`（vite dev 代理到 8081） |
| 文件路径 | `/api/**` 相对路径，无 `http://localhost:8081` |
| 遗留硬编码 | `verify-remark-picker.cjs:4` = `http://localhost:8081`（**开发验证脚本，不影响生产**） |
| 唯一"硬编码"真实点 | `DishwareBreak.tsx:11`、`DishwareTransfer.tsx:15` 只是注释里的 `localhost:5174` |
| 外部 CDN 依赖 | ⚠️ `index.html` 从 CDN 加载 jQuery / html2canvas / jspdf / jspdf-autotable / Chart.js / font-awesome / Google Fonts |
| CDN 依赖的实际影响 | `src/pages/Phone.tsx:105` 用 `window.html2canvas`/`window.jspdf` → **CDN 挂了这张页面的 PDF 导出就废了**（Evaluation.tsx 走 npm 包，不受影响） |
| 本地 vendor 已有 | `/vendor/orgchart.min.js|css`、`/pdf-lib.min.js`、`/fontkit.umd.min.js` —— 由 `public/` 目录随 dist 发布，**不依赖 CDN** |

**结论：后台前端不需要为了换域名改任何 API URL。** 它本来就是为了同源反代设计的。

### 10.2 官网 `website/`

| 项 | 状态 |
|---|---|
| 构建 | `vite build`；React 19 / Vite 8 / react-router-dom 7 / Swiper 12 |
| `base` | **`/home/`**（特意为"后端托管在 /home 子路径"设计） |
| API | `/api`（vite dev 代理）→ 生产同源 |
| 媒体 | `/media` → 后端 |
| 环境变量 | `.env.production`：`VITE_LOGIN_URL=/login`、`VITE_PHP_BASE=https://kunzzgroup.com/frontend`、`VITE_EN_SITE_URL=/home/Home_en`（**都不含密钥**） |
| 未迁移的 PHP 页 | 仍指向线上 `https://kunzzgroup.com/frontend`（**这是有意的**，不是 bug） |
| 硬编码外部 | `JoinContactFeedback.jsx` 的 web3forms `action` + Google Maps 嵌入（第三方，非本地后端） |

**注意**：官网的登录按钮指向 `/login`，而 `/login` 属于**后台** SPA。所以两个前端必须部署在
**同一域名**下（`/` 后台 + `/home/` 官网），否则官网的"员工登录"会 404。

### 10.3 构建验证状态（**未执行，需你确认**）

> 本次审计**没有**运行 `npm install` / `npm run build`。
> 原因：`AGENTS.md` 明确把 `package-lock.json` 列为撞车热点，`npm install` 常常会重写它；
> 你本阶段的规则是"只扫描、不修改"。仓库里当前**没有** `node_modules/`。
>
> 建议的验证方式（安全，不会改 lock 文件）：
> ```bash
> cd inventory-system/frontend && npm ci && npm run build    # npm ci 不写 package-lock.json
> cd website && npm ci && npm run build
> ```
> 本机环境：Node **v24.16.0** / npm **11.13.0**（满足要求）。
> `backend/static/` 里**已有**一份构建产物（`index-w69HDdhK.js` + `index-BEkeY9LN.css`，
> 官网 `index-EWXODRMC.js` + `index-6eWUx_4D.css`），且 `index.html` 的引用与实际文件**一一对应**，
> 说明上一次构建是完整成功的。

---

## 11. Spring Boot Production Requirements

### 11.1 依赖确认（`backend/pom.xml`）

Java **21** ✅ ／ Spring Boot **3.5.3** ✅ ／ spring-boot-starter-web、websocket、data-jpa、
security、validation、mail ✅ ／ MyBatis 3.0.4 ✅ ／ `mysql-connector-j`（runtime，可连 MariaDB）✅
／ jjwt 0.12.6 ✅ ／ **OpenPDF 1.3.30** ✅ ／ **BouncyCastle 1.78.1**（兼容老库 argon2 哈希）✅ ／ Lombok ✅

⚠️ Lombok 注解处理显式配置了 `<proc>full</proc>` + `annotationProcessorPaths`（注释说明是为了 JDK 23+）。
**如果 VPS 上用 JDK 24 编译，这段是必需的**；用 JDK 21 也兼容。建议 VPS 装 **JDK 21**。

### 11.2 `application.yml` 生产必改项

| 键 | 当前默认 | 生产必须 |
|---|---|---|
| `server.port` | 8081 | 保留 8081 |
| **`server.address`** | **未设置 → 监听 0.0.0.0（全网可达）** | **必须加 `127.0.0.1`**（你的硬要求：8081 不对外） |
| `DB_URL` | `localhost:3306/u690174784_kunzz`（默认值合理） | 环境变量注入 |
| `DB_USERNAME` | `root` | **改专用账号 `inventory_app`** |
| `DB_PASSWORD` | **空** | 强密码 |
| `JWT_SECRET` | `kunzz-inventory-system-jwt-secret-2026-change-in-production-0123456789` | **必须换**（否则任何人可伪造 token） |
| `SMTP_USER/SMTP_PASS` | `kunzzsup@gmail.com` / 空 | 换新应用密码（旧的已泄露） |
| `APP_BASE_URL` | `http://localhost:5174` | `http://VPS_IP`（欢迎邮件里的登录链接） |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:*,http://127.0.0.1:*` | 同源部署时留默认即可；跨域名才需填 |
| `jpa.hibernate.ddl-auto` | **`none`** ✅ | **保持不变**（禁止 Hibernate 改老库结构） |
| `ollama.*` | localhost:11434 | 不装则留默认（调用失败会友好提示） |

安全层实测（无需改动，记录备查）：
- `SecurityConfig`：`/api/**` 需认证；`/api/auth/login`、`/media/**`、`/uploads/**`、`/ws/realtime` 放行；
  CSRF 关闭 + STATELESS + JWT 过滤器 ✅
- `SecurityHeadersFilter`：nosniff / X-Frame-Options DENY / HSTS / CSP ✅
  （CSP 已允许 cdnjs、code.jquery.com、Google Fonts —— 与前端 CDN 引用一致）
- `RealtimeWebSocketConfig`：`setAllowedOrigins("*")` ⚠️ 建议生产收紧为自身域名
- `PagePermissionInterceptor`：写操作二级权限校验 ✅

### 11.3 🔴 生产前必须处理：自动创建 demo 账号

`config/DataInitializer.java` 在**每次启动**时检查：若 `users` 表无 `demo` 账号，则
**自动创建 `demo / demo123`**（`accountType=special`、`branch=j1,j2,j3`）。
而数据库 dump 里**已经存在** `demo`（`demo@kunzz.local`）——即生产环境会有一个人尽皆知的账号。

**处置（三选一，需你确认）**：① 删除该类；② 加开关（如 `@ConditionalOnProperty(app.init-demo=true)`）；
③ 保留但立刻改密码并在 UI 里禁用。**建议 ①**。

### 11.4 构建产物一致性（已核对）

- 已跟踪的 jar：`backend/target/inventory-backend-1.0.0.jar`，74,646,832 字节，内含 class 时间戳 **2026-09-17 17:57**，
  含 `FreezerCategoryController/Service/Repository`、`HtmlText`、`StockRemarkService`（即当天最新特性都在里面）。
- jar 内 `BOOT-INF/classes/mapper/*.xml`（14 个）与工作区源码 **逐字节内容一致**。
  （初次比对 3 个文件"全部行不同"，经核查是 **CRLF vs LF** 差异，`diff --strip-trailing-cr` 后完全相同 —— 不是陈旧产物。）
- jar **不包含** `static/`、`uploads/`、`data/`（已确认 0 个条目）→ 外部目录必须单独提供。

### 11.5 构建方式建议（Phase 8 的 A/B 选择）

| 方案 | 优点 | 缺点 | 建议 |
|---|---|---|---|
| **A. VPS 上 `mvn package`** | 源码即真相、可审计、无需传 74MB | VPS 需装 JDK 21 + Maven，构建占 ~1GB 内存、首次拉依赖约 300–500MB | ✅ **推荐**（VPS 有源码就有可重复的构建） |
| **B. 本地 build → scp jar** | VPS 无需 Maven、部署快 | 依赖本地工具链；本机 **未装 mvn**（`~/tools/apache-maven-3.9.9` 也不存在）；构建来源不可审计 | 备选 |

> 本机现状：`java 24.0.1`（无 21）、**无 mvn**、`node v24.16.0`、`npm 11.13.0`。
> 所以**现在**只能走方案 A（在 VPS 上装 JDK21+Maven 构建），或先在本机装 JDK21+Maven。
> **不要把 `target/` 当源码**：它已被 git 跟踪但属于构建产物（见 §13 的 .gitignore 陷阱）。

---

## 12. Nginx Requirements

### 12.1 完整 server 块（单源，覆盖两个 SPA + API + WS）

```nginx
# /etc/nginx/sites-available/kunzz
server {
    listen 80 default_server;
    server_name _;                       # 先用 IP 访问；以后换成 kunzz.com

    client_max_body_size 30m;            # 上传视频/背景音乐
    root /var/www/admin;                 # ← 后台 dist
    index index.html;

    # 后台 SPA（含 /vendor、/pdf-lib.min.js、/fontkit.umd.min.js、/static、/fonts、/invoice、/form）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 官网 SPA（website 构建的 base=/home/）
    location /home/ {
        alias /var/www/website/;
        try_files $uri $uri/ /home/index.html;
    }

    # REST API
    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 🔴 实时推送（当前 nginx-ec2.sh 缺这段 → 生产会一直显示"实时离线"）
    location /ws/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # 媒体 / 上传 / 发票（后端生成）
    location /media/   { proxy_pass http://127.0.0.1:8081; proxy_set_header Host $host; }
    location /uploads/ { proxy_pass http://127.0.0.1:8081; proxy_set_header Host $host; }

    # 可选：静态资源长缓存（注意 index.html 不要缓存）
    location /assets/ { expires 30d; add_header Cache-Control "public, immutable"; }
}
```

### 12.2 与现有 `nginx-ec2.sh` 的差异（需修）
1. **缺 `/ws/`** —— 必修。
2. 它是"两个独立 server（admin 域名 + 官网域名）"，需要两套 DNS；**用 IP 测试时更推荐上面的单 server 方案**。
3. 它有 `location /invoice/` 反代到后端，但发票模板实际在前端 dist 里 → 单源方案下无需反代。
4. 未配 HTTPS —— 先用 IP 跑 http，切域名时用 `certbot --nginx`。

### 12.3 端口暴露（你的硬要求）
- `8081` 不对外：加 `server.address: 127.0.0.1`（应用层）+ `ufw deny 8081`（网络层，双保险）
- `3306` 不对外：MariaDB 默认只监听 `127.0.0.1`（Ubuntu 默认 `bind-address = 127.0.0.1`），再用 ufw 兜底
- 只放行 `22 / 80 / 443`

---

## 13. Security Risks

按严重度排序。

| # | 风险 | 证据 | 影响 |
|---|---|---|---|
| **S1** | **Gmail 应用密码明文写在公开仓库** | `CHANGELOG.md:1005`（`pob***yk`）；git 历史 `244692b` 里 `deploy-ec2.sh` 也有过 | 任何人可登录 `kunzzsup@gmail.com` 发信/收信/接管账号。仓库是 **public** |
| **S2** | **公开仓库含 22 个密码哈希 + 员工 PII** | `database/u690174784_kunzz.sql:2561`（`users` INSERT）：13 个 bcrypt + 10 个 argon2id 哈希、24 行员工的姓名/邮箱/**马来西亚 IC 号**/银行名+**账号**/电话/住址；还有 1 个 Laravel `remember_token` | 撞库 + 个人隐私泄露（合规风险） |
| **S3** | **生产会自动创建 `demo/demo123`** | `DataInitializer.java` + dump 里已有 `demo` 账号 | 默认弱口令后门账号 |
| **S4** | **JWT 默认密钥可直接签发 token** | `application.yml:38` | 若 VPS 忘了注入 `JWT_SECRET`，任何人可伪造管理员 token |
| **S5** | web3forms `access_key` 打进前端产物 + 源码（`a18***50`） | 2 个 `JoinContactFeedback.jsx:12` + `backend/static/home/assets/index-EWXODRMC.js` | 第三方可刷爆联系表单（设计上就是公开 key，属可接受但需知晓） |
| **S6** | 后端 `spring.datasource` 默认 `root` + 空密码 | `application.yml:10-11` | 只影响本地；生产必须用 `inventory_app` + 强密码 |
| **S7** | WebSocket `setAllowedOrigins("*")` | `RealtimeWebSocketConfig` | 任意站点可连（只广播"有变更"信号，危害有限）→ 建议收紧 |
| **S8** | 8081 默认监听 0.0.0.0 | `application.yml` 无 `server.address` | 若 ufw 未开，API 会直接暴露在公网 |
| **S9** | AI 提示词/工具可能泄露业务数据到本地模型 | `AiService`（工具执行只读查询，本地 Ollama） | 数据不出机器，风险低；但 `OLLAMA_BASE_URL` 若被改成外部地址就会外流 |
| **S10** | 本地 `database/backup_before_import_*.sql` 含同样 PII（未跟踪但在磁盘） | 21 MB | 清理时需一并考虑（先备份再删） |
| **S11** | `.gitignore` 的 `!backend/target/*.jar` 失效 | 见 §13.1 | 一旦误删 jar，无法再 `git add` 回去（需 `-f`） |

### 13.1 `.gitignore` 审计结论（Phase 13 的问题）

```gitignore
backend/target/          ← 第 7 行：整个目录被排除
*.jar
!backend/target/*.jar    ← 第 9 行：**这条是死的**
```

**实测证据**：
```
$ git check-ignore -v backend/target/NEWBUILD.jar
.gitignore:7:backend/target/    backend/target/NEWBUILD.jar     # ← 新 jar 仍然被忽略
```
Git 的规则是"父目录被排除后，无法再重新包含其中的文件"。所以 `!backend/target/*.jar`
**从设计上就不会生效**；今天那份 74MB jar 还在版本库里，只是因为它**早就被跟踪了**
（tracked 文件不受 .gitignore 影响）。

**你要的明确答案：GitHub 该不该存生产 JAR？**

| 用途 | 结论 |
|---|---|
| **VPS 部署** | ❌ **不需要**。VPS 上 `mvn package` 自己构建（源码完整、可审计、可复现），或本地 build 后 scp。不要从 git 里拿 jar。 |
| **Windows 一键更新器** | ✅ **需要**。`update.ps1` 第 30/238 行明确要从 GitHub 拉 `backend/target/inventory-backend-1.0.0.jar`。删了就破坏这个既有分发链。 |
| **仓库体积** | ⚠️ `.git` 已 **198 MB**，主要是这个 jar 的历史版本（每版 74MB）。长期建议迁到 GitHub Release 或 LFS。 |

**建议（等你确认后再改，本阶段未改）**：
把第 7 行 `backend/target/` 改成 `backend/target/*`，让第 9 行的放行真正生效：
```gitignore
backend/target/*
!backend/target/inventory-backend-1.0.0.jar
```
这样"只跟踪 jar、忽略其它构建物"才和注释写的一致。

---

## 14. Secrets Found

> 值已打码，**完整值不写进本报告**。

| 文件:行 | 类型 | 真实性 | 打码值 |
|---|---|---|---|
| `CHANGELOG.md:1005` | **Gmail 应用密码（明文）** | 🔴 **真实、已泄露** | `pob***yk` |
| git 历史 `244692b` | 同一 Gmail 应用密码（`deploy-ec2.sh` 早期版本） | 🔴 真实（历史里） | 同上 |
| `website/src/components/{cn,en}/join/JoinContactFeedback.jsx:12` | web3forms access_key | 🟠 真实、仍在用 | `a18***50` |
| `backend/static/home/assets/index-EWXODRMC.js` | 同上（已打进公开产物） | 🟠 真实 | `a18***50` |
| `backend/src/main/resources/application.yml:38` | JWT 默认签名密钥 | 🟠 可用默认值 | `kun***89` |
| `database/u690174784_kunzz.sql:2561` | 13 bcrypt + 10 argon2id 密码哈希、`remember_token`、24 行员工 PII（IC/银行账号） | 🔴 真实 | `$2y***Ny`（×13） |
| `deploy-ec2.sh:26,34` | `DB_PASSWORD`/`SMTP_PASS` | ✅ 占位符（中文提示"换成强密码"） | — |
| `application.yml:24` | SMTP 用户名 `kunzzsup@gmail.com` | 非密钥（但应知晓） | 明文 |
| `inventory-system/frontend/sync-live-stock.cjs:39` | 读取 `live-credentials.json`（线上登录凭据） | ✅ **文件不存在于磁盘，也已 gitignore** | — |
| `website/.env.production`、`.env.example`、`.env.development.local.example` | 仅 URL，**无密钥** ✅ | — | — |

**已检查但不存在**：`live-credentials.json`、真实 `.env`、`id_rsa*`、`*.pem`、`*.key`、`*.p12`、`keystore`、`.my.cnf`。

**非密钥但需要知道的地址/账号**：
- SMTP：`smtp.gmail.com:587`，用户 `kunzzsup@gmail.com`
- 数据库：生产建议账号 `inventory_app`；schema `u690174784_kunzz`；本地开发用 `root` 空密码
- 主机名：`kunzzgroup.com` / `www.kunzzgroup.com`（旧 PHP 站，仍在线）；环回端口 3306/8081/5174/5175/11434
- 没有提交任何真实 EC2 IP 或 VPS IP（`deploy-ec2.sh` 里是 `你的EC2公网IP` 占位符）✅

**处置建议（按顺序）**
1. **立刻**去 Google 账号撤销该应用密码并重新生成（S1）——注意：撤销前先在 VPS 上配好新的，避免邮件功能中断。
2. `CHANGELOG.md:1005` 改成 `SMTP_PASS=<已撤销，新密码仅存服务器环境变量>`（只改这一行，遵守 AGENTS.md"只追加/最小 diff"的例外——这是安全修复）。
3. 仓库里那份 dump 含 PII：建议**长期**改成"公开仓库只放脱敏种子（schema + 无 PII 结构）"，真实数据走私有备份/服务器直传。**这一步改动大，需你单独决策。**
4. `JWT_SECRET` 在 VPS 上用 `openssl rand -hex 32` 生成并写入 `EnvironmentFile`（`deploy-ec2.sh` 已经这么做 ✅）。
5. 移出 `DataInitializer` 的 demo 账号自动创建（S3）。

---

## 15. VPS RAM / CPU Requirements

| 场景 | vCPU | RAM | 说明 |
|---|---|---|---|
| **仅运行（不装 AI，不在 VPS 构建）** | 2 | **4 GB** | OS 300MB + MariaDB 400MB–1GB + JVM 堆 512MB–1GB + Nginx 30MB |
| **运行 + 在 VPS 构建**（推荐起点） | 2 | **8 GB** | Maven 构建峰值 ~1GB，`vite build` 峰值 1–2GB（两个前端）；避免 OOM |
| **运行 + AI（Ollama 本地模型）** | 4 | **16 GB** | Qwen3-4B Q4 常驻 ~2.5GB + Ollama 开销；CPU 推理 2–6 tok/s |

**JVM 建议**：`-Xms256m -Xmx1024m`（这个库才 138k 行、库本体 ~100MB，1GB 堆绰绰有余）。
**Hostinger 选型**：`KVM 2`（2 vCPU / 8 GB）是性价比甜点；只有要跑 AI 才需要 `KVM 4`。
**CPU 型号**：AI 场景优先高频；非 AI 场景随意（瓶颈在磁盘 fsync 和网络）。

---

## 16. VPS Disk Requirements

| 组成 | 大小 |
|---|---|
| Ubuntu 24.04 系统 + 基础包 | 3–5 GB |
| JDK 21（若要构建，含 Maven + `~/.m2` 依赖缓存） | 0.3 GB + 0.5 GB |
| MariaDB 软件 + datadir（含 redo/binlog） | 0.5 GB + **0.2–0.4 GB** |
| 应用 jar | 74 MB |
| `uploads/`（368 张碗碟照片） | 26 MB |
| `data/`（含 19MB homepage1.webm） | 22 MB |
| 两个前端 dist | ~30 MB |
| Node.js + npm 缓存（若要构建前端） | 0.3 GB + 0.5 GB |
| 数据库导入用 dump 副本 | 22 MB |
| 日志、临时构建物、未来增长预留 | 2–3 GB |
| **小计（不含 AI）** | **约 8–12 GB** |
| **AI（Ollama 二进制 1.4GB + 模型 2.5GB）** | **+4 GB** |

> **建议：≥ 50 GB**（Hostinger 常规套餐即满足）。
> 14 天日常备份（`mysqldump | gzip` 每天约 5–10 MB 压缩后）只需再 0.2 GB。

---

## 17. Required Ubuntu Packages

```bash
# 基础
sudo apt update && sudo apt install -y \
  curl wget git unzip ca-certificates gnupg ufw

# 运行时（必须）
sudo apt install -y openjdk-21-jre-headless      # ~200 MB；要构建则装 openjdk-21-jdk
sudo apt install -y mariadb-server mariadb-client
sudo apt install -y nginx

# 构建用（若选择方案 A：VPS 上构建）
sudo apt install -y maven                        # 配合 openjdk-21-jdk
# Node.js：两个前端要 Node >= 20.19（website 用 Vite 8）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# HTTPS（切域名时再用，现在不需要）
sudo apt install -y certbot python3-certbot-nginx

# 可选：AI（第一阶段不装）
# curl -fsSL https://ollama.com/install.sh | sh
```

---

## 18. VPS Deployment Commands

> 前提：DNS **不动**，先只用 IP。以下命令在 VPS 上执行（`$IP` 换成公网 IP）。

```bash
# ---------- 0. 安全组/防火墙：只放行 22 / 80 / 443 ----------
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
sudo ufw status verbose          # 确认 8081 / 3306 未放行

# ---------- 1. 建目录与专用用户 ----------
sudo useradd -r -m -d /opt/inventory -s /usr/sbin/nologin deploy || true
sudo mkdir -p /opt/inventory /var/www/admin /var/www/website /var/lib/kunzz-backup
sudo chown -R deploy:deploy /opt/inventory
sudo chown -R www-data:www-data /var/www

# ---------- 2. 数据库：建库(utf8mb4) 并导入 ----------
sudo systemctl enable --now mariadb
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS u690174784_kunzz
                 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 把 dump 传上来（本地执行）：scp database/u690174784_kunzz.sql root@$IP:/tmp/
sudo mariadb u690174784_kunzz < /tmp/u690174784_kunzz.sql ; echo "import exit=$?"   # 必须 0

# 导入后校验（对齐 docs/DB_IMPORT.md）
sudo mariadb u690174784_kunzz -e "
 SELECT COUNT(*) tables_cnt FROM information_schema.tables
   WHERE table_schema='u690174784_kunzz';            -- 期望 70
 SELECT COUNT(*) trig_cnt FROM information_schema.triggers
   WHERE trigger_schema='u690174784_kunzz';          -- 期望 8
 SELECT COUNT(*) FROM j1stockedit_data;               -- 23704
 SELECT COUNT(*) FROM stock_data;                     -- 610"

# 补建新表（freezer_categories 等）
# scp add_new_tables.sql root@$IP:/tmp/
sudo mariadb < /tmp/add_new_tables.sql

# 专用账号 + 最小权限（不要用 root）
sudo mariadb -e "
 CREATE USER 'inventory_app'@'localhost' IDENTIFIED BY '改成强密码';
 GRANT SELECT,INSERT,UPDATE,DELETE,EXECUTE,SHOW VIEW
   ON u690174784_kunzz.* TO 'inventory_app'@'localhost';
 FLUSH PRIVILEGES;"

# ---------- 3. 发布运行期数据（本地执行）----------
# scp -r backend/data    root@$IP:/opt/inventory/data
# scp -r backend/uploads root@$IP:/opt/inventory/uploads
sudo chown -R deploy:deploy /opt/inventory

# ---------- 4. 构建后端（方案 A：VPS 上构建）----------
# scp -r backend 源码或 git clone 到 /opt/src
cd /opt/src/backend && mvn -DskipTests clean package
sudo cp target/inventory-backend-1.0.0.jar /opt/inventory/app.jar

# ---------- 5. 环境变量（600 权限，绝不进 git）----------
sudo tee /etc/inventory-backend.env >/dev/null <<'ENV'
DB_URL=jdbc:mysql://127.0.0.1:3306/u690174784_kunzz?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
DB_USERNAME=inventory_app
DB_PASSWORD=<强密码>
JWT_SECRET=<openssl rand -hex 32 的输出>
CORS_ALLOWED_ORIGINS=http://<VPS_IP>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=kunzzsup@gmail.com
SMTP_PASS=<新的 Gmail 应用密码>
APP_BASE_URL=http://<VPS_IP>
ENV
sudo chmod 600 /etc/inventory-backend.env
sudo chown root:root /etc/inventory-backend.env

# ---------- 6. systemd（含 127.0.0.1 绑定）----------
sudo tee /etc/systemd/system/inventory-backend.service >/dev/null <<'UNIT'
[Unit]
Description=Kunzz Inventory Backend
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/inventory
EnvironmentFile=/etc/inventory-backend.env
# 关键：只监听回环，8081 不对外
ExecStart=/usr/bin/java -Xms256m -Xmx1024m \
  -Dserver.address=127.0.0.1 -Dserver.port=8081 \
  -jar /opt/inventory/app.jar
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now inventory-backend
systemctl status inventory-backend --no-pager
sudo ss -lntp | grep 8081        # 应显示 127.0.0.1:8081，不是 0.0.0.0:8081

# ---------- 7. 前端构建并发布 ----------
cd /opt/src/inventory-system/frontend && npm ci && npm run build
sudo rsync -a --delete dist/ /var/www/admin/
cd /opt/src/website && npm ci && npm run build
sudo rsync -a --delete dist/ /var/www/website/
sudo chown -R www-data:www-data /var/www

# ---------- 8. Nginx（用 §12.1 的配置）----------
sudo tee /etc/nginx/sites-available/kunzz >/dev/null   # 粘贴 §12.1 内容
sudo ln -sf /etc/nginx/sites-available/kunzz /etc/nginx/sites-enabled/kunzz
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ---------- 9. 数据库每日备份 ----------
sudo tee /etc/cron.daily/kunzz-db-backup >/dev/null <<'SH'
#!/bin/sh
mysqldump --single-transaction --routines --triggers u690174784_kunzz \
  | gzip > /var/lib/kunzz-backup/db_$(date +%F).sql.gz
find /var/lib/kunzz-backup -name 'db_*.sql.gz' -mtime +14 -delete
SH
sudo chmod +x /etc/cron.daily/kunzz-db-backup
```

---

## 19. VPS IP Testing Plan

**阶段一（不改 DNS，不碰线上）**

| # | 步骤 | 期望结果 |
|---|---|---|
| 1 | `curl -I http://$IP/` | `200`，返回后台 HTML（含 `index-*.js`） |
| 2 | `curl -I http://$IP/home/` | `200`，返回官网 HTML |
| 3 | `curl -o /dev/null -w '%{http_code}' http://$IP/api/auth/me` | **401**（说明后端活着且鉴权生效） |
| 4 | 浏览器打开 `http://$IP/` → 登录页 | 页面正常、无 CDN 报错 |
| 5 | 用**真实老库账号**登录（不要用 demo） | 登录成功，进入看板 |
| 6 | 看板 / 总库存数字 | 与本地库 SQL 查询一致（对齐 `docs/OPS.md` §5 对账流程） |
| 7 | 右上角实时状态 | **"实时已连接"（绿）** ← 验证 `/ws` 反代 |
| 8 | 开两个浏览器窗口，一个改库存 | 另一个约 1 秒自动刷新（WebSocket 生效） |
| 9 | 总库存 → 选中 Kitchen | 冰箱分类列出现、按冰箱+位次排序 |
| 10 | 导出 PDF（中央发票 / 分店） | 发票 PDF 正常（验证 `invoice/` 模板 + `fonts/` 到位） |
| 11 | 碗碟页照片 | 368 张照片能显示（验证 `uploads/` 已上传） |
| 12 | 官网 `http://$IP/home/` | 首页视频/图片正常（验证 `data/page-images/`） |
| 13 | 官网 → 员工登录按钮 | 跳到 `http://$IP/login`（后台 SPA） |
| 14 | `sudo ss -lntp \| grep -E '8081\|3306'` | 都只绑 `127.0.0.1` |
| 15 | `sudo mariadb ...` 行数校验（§8.4） | 全部匹配 |
| 16 | AI 聊天球（如果没装 Ollama） | 显示"无法连接本地 AI 服务…"，**其它功能不受影响** |
| 17 | **旧站 `https://kunzzgroup.com` 同时打开** | 完全正常（证明本次部署零影响） |

**通过标准**：1–15 全绿，16 允许"友好报错"，17 必须正常。

**阶段二（你确认后才做）**：把 `kunzz.com`/相关域名的 A 记录指向 VPS → 用 `certbot` 签 HTTPS →
把 `CORS_ALLOWED_ORIGINS`/`APP_BASE_URL` 改成域名 → 重启后端 → 重跑上面 1–17。
（**本次审计没有做、也不建议现在做任何 DNS 改动。**）

---

## 20. Rollback Plan

| 层级 | 回滚动作 | 触发条件 | 关键点 |
|---|---|---|---|
| **DNS/Domain** | 本阶段**不动 DNS** → 无需回滚 | — | 旧站继续在 Hostinger 服务，用户无感 |
| **Nginx** | `sudo cp /etc/nginx/sites-available/kunzz{.bak,} && sudo nginx -t && sudo systemctl reload nginx` | 配置错误导致 502/白屏 | 改配置前先 `cp` 备份，且 `nginx -t` 通过才 reload |
| **后端** | `sudo systemctl stop inventory-backend`（或 `systemctl disable`）；换回上一版 jar 后 `start` | 启动失败/接口全 500 | 部署前把旧 jar 存成 `/opt/inventory/app.jar.bak`（现有 `deploy-ec2.sh` 已有 `.bak` 意识） |
| **前端** | `sudo rsync -a /var/www/admin.bak/ /var/www/admin/` | 页面白屏/构建产物损坏 | 发布前保留上一版 dist 目录 |
| **数据库结构** | 只有 `add_new_tables.sql` 是**新增**（3 表 + 2 列 + freezer_categories）→ 旧系统不读不写，**无需回滚**；真有问题 `DROP TABLE operation_logs, phone_records, price_change_log, freezer_categories;` 即可 | 影响旧 PHP 系统 | 该脚本幂等，重跑安全 |
| **数据库数据** | VPS 是**独立副本**：`sudo systemctl stop inventory-backend` → 重新 `CREATE DATABASE` + 导入 dump + 跑 `add_new_tables.sql` → `start` | 测试写坏数据 | ⚠️ 该 dump **含 70 个 DROP TABLE**，重建即"回到快照时刻"，期间的写入会丢 |
| **整机** | 删除 VPS（Hostinger 控制台重建） | 一切不可救 | 因为 DNS 未切，**任何时刻删掉 VPS 都不影响线上业务** ← 这是第一阶段最大的安全垫 |
| **本地** | 本阶段未删任何文件 → 无需回滚 | — | 报告只是新增 2 个 md 文件 |

**回滚前提（部署前必做）**
```bash
# 在 VPS 上先存一份"当前状态"快照
sudo tar czf /var/lib/kunzz-backup/predeploy_$(date +%F_%H%M).tar.gz \
     /etc/nginx/sites-available /opt/inventory/app.jar /etc/inventory-backend.env
mysqldump --single-transaction u690174784_kunzz | gzip > /var/lib/kunzz-backup/predep.sql.gz
```

---

## 附录 A — 本阶段实际做过的只读操作清单

- `git status / ls-files / check-ignore / log / remote`（未 add、未 commit、未 push）
- `ls -la`、`du -sm`、`find`、`wc`、`file`、`rg`（ripgrep）全仓库检索
- 读取 `pom.xml`、`application.yml`、`SecurityConfig`、`SecurityHeadersFilter`、`WebConfig`、
  `DataInitializer`、`RealtimeWebSocketConfig`、`MediaServeController`、`AiController`、
  `AiService`、`deploy-ec2.sh`、`nginx-ec2.sh`、`start.ps1`/`update.ps1`/`*.bat` 关键段、
  `README.md`、`docs/OPS.md`、`docs/GO_LIVE.md`、`docs/tasks/README.md`
- `unzip -l/-p` 读取 jar 内清单与 mapper XML（解压到系统临时目录，**未写入仓库**）
- 数据库 dump：`head/sed/grep/awk/tr` 静态分析（**未执行任何 SQL**）

**未执行**：任何 `npm install`/`npm run build`、`mvn`、任何数据库连接或 SQL、任何文件删除或修改。

## 附录 B — 需要你拍板的 7 个决策

1. **数据真相来源**：VPS 本地库（快照，会与旧站分叉）还是继续连 Hostinger 线上库？（§2.1）
2. **是否现在处理 Gmail 应用密码 + 仓库里的员工 PII**？（§13/§14，最高优先）
3. **是否移除 `DataInitializer` 的 demo/demo123 自动创建**？（§11.3）
4. **是否修 `.gitignore` 的 `backend/target/` → `backend/target/*`**？（§13.1）
5. **部署方式**：VPS 上 `mvn package`（推荐）还是本地 build 传 jar？（§11.5）
6. **本地清理是否执行**：≈2.1–2.3 GB（`runtime/` 为主）？（§6，等你说"删"我才动）
7. **是否现在补 `/ws` 反代 + `server.address=127.0.0.1`**？（§11.2/§12.2，属代码/配置修改，需你同意）

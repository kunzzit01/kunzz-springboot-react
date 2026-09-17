# KUNZZ → Hostinger VPS 部署手册（Interactive Step-by-Step）

> **目标**：React 后台 + React 官网 + Spring Boot + MariaDB 部署到 Hostinger VPS，
> 只通过 `http://VPS_PUBLIC_IP` 测试。
> **铁律**：不动 kunzz.com / DNS / 旧 Live 系统；VPS 只连自己的本机库。
> **本手册已按 2026-09-17 生产审计的实际代码事实修正**，每节的 ⚠️ 是**必须照做**的差异点。

---

## 🟢 部署目标已确认（OPTION B — 与现有 17 个容器共存）

**本节覆盖下文所有旧写法。** 2026-09-17 用户决策：
旧 Live 站 = **`kunzzgroup.com`**（正在运行），所以本机 80/443 **必须保持 Traefik 不动**。

| 项 | 下文旧写法 | **实际执行（Option B）** |
|---|---|---|
| Nginx | `listen 80` | **`listen 8080`** |
| Spring Boot | `8081` | **`127.0.0.1:8082`**（8081 被 `telegram-bot-api` 容器占用） |
| MariaDB | 3306 | 3306 不变（空闲 ✓） |
| ufw | `--force enable` | **完全不启用**（机器上 17 个容器在跑，开 ufw 会掐断容器流量） |
| Traefik | — | **绝不触碰**（它持有 80/443，是现有业务入口） |
| 测试地址 | `http://VPS_IP/` | **`http://187.127.125.136:8080/`** |
| 旧站验证 | kunzzgroup.com | ✅ 确认就是 `kunzzgroup.com` |

已确认空闲：**8080 / 8082 / 3306**。
**无需改动任何 React / Spring Boot 源码**（axios `baseURL='/api'`、WebSocket 用 `window.location.host`，都是相对的）。

> 额外发现：本机已有一个 **Ollama 容器在跑**（`ollama-dqkw-ollama-1` → `0.0.0.0:11434`）。
> 本阶段不启用 AI；将来只需导入 `kunzz-ai` 模型并设 `OLLAMA_BASE_URL=http://127.0.0.1:11434`。

---

## 0. 审计修正清单（部署前先看这 9 条）

| # | 修正 | 不改会怎样 |
|---|---|---|
| 1 | **MariaDB 时区必须设 `+08:00`** | 老库时间戳与新写入错位 8 小时，日期对账全线错乱（见 `docs/OPS.md` §二 时区规范） |
| 2 | **DB dump 只能导入全新空库**（含 **70 处 `DROP TABLE IF EXISTS`**） | 导进有数据的库会**直接删表** |
| 3 | **必须用 root 导入**（8 个触发器 `DEFINER=root@localhost`、4 个视图 `DEFINER=u690174784_kunzz@127.0.0.1`） | 非 root 报 `ERROR 1227`，导入中断 |
| 4 | **不能开严格模式**（7 个生成列的 INSERT 带字面值；老库有 enum 脏值） | 严格模式下 `ERROR 1906` 中断 |
| 5 | **导入后必须跑 `add_new_tables.sql`**（`freezer_categories` 表不在 dump 里） | 冰箱分类功能运行时报错（PHASE 19 必挂） |
| 6 | **`server.address=127.0.0.1` 要靠环境变量注入**（`application.yml` 里没有这一项） | Spring Boot 监听 `0.0.0.0:8081`，API 直接暴露公网 |
| 7 | **Nginx 必须有 `/ws/` 反代**（现有 `nginx-ec2.sh` 缺这段） | 页面永远显示"实时离线"，双浏览器同步失败（PHASE 20 必挂） |
| 8 | **`data/` 和 `uploads/` 从 git clone 里拷**，不用另外上传 | 碗碟照片 404、官网图片/视频 404 |
| 9 | **`SMTP_PASS` 先留空**（旧 Gmail 应用密码已泄露进公开仓库） | 留空只是发信失败；填旧密码等于继续用已泄露凭据 |

### 另外两个必须知道的事实

- **`demo` / `demo123` 账号**：`DataInitializer.java` 会在启动时自动创建；dump 里已有这个账号。
  本阶段**不修**（改代码需你批准），但 PHASE 17 登录测试**不要用它**，用真实老库账号。
- **旧站域名**：代码里硬编码的是 **`kunzzgroup.com`**，不是你写的 `kunzz.com`。
  影响 PHASE 23 的验证目标，也影响后端 media/timeline 的线上兜底地址 → **需要你确认**。

---

## 阶段总览

```
PHASE 0  环境检查（只读，不改系统）
PHASE 1  安装组件（Git/Java21/Maven/Node22/Nginx/MariaDB）
PHASE 2  建目录
PHASE 3  建独立数据库（本机，绝不连旧 Live）
PHASE 4  上传 SQL dump
PHASE 5  导入 + 校验（含 add_new_tables.sql）
PHASE 6  git clone
PHASE 7  构建后端 → app.jar
PHASE 8  环境变量文件（chmod 600）
PHASE 9  systemd 服务（127.0.0.1:8081）
PHASE 10 后端本机 curl 测试
PHASE 11 后台前端构建 → /var/www/admin
PHASE 12 官网构建 → /var/www/website
PHASE 13 API URL 检查（审计已确认无需改动）
PHASE 14 Nginx（/、/home/、/api/、/uploads/、/media/）
PHASE 15 WebSocket /ws/
PHASE 16 防火墙（8081/3306 只绑 localhost）
PHASE 17 公网 IP 测试
PHASE 18 功能测试
PHASE 19 库存专项（Kitchen / 冰箱分类 / 位次）
PHASE 20 双浏览器实时同步
PHASE 21 静态资源（照片/发票/字体/官网媒体）
PHASE 22 AI（不装 Ollama，只验证降级正常）
PHASE 23 旧站验证（不动它）
PHASE 24 Domain 隔离确认
```

---

# PHASE 0 — VPS 环境检查（只读）

**这一阶段不许安装、不许修改任何东西。** 在 Hostinger VPS Web Terminal 里执行：

```bash
uname -a
cat /etc/os-release
nproc
free -h
df -h /
ip addr show
ss -lntp
```

### 期望看到

| 项 | 期望 |
|---|---|
| OS | Ubuntu 24.04 LTS（或 22.04）|
| CPU | ≥ 2 vCPU |
| RAM | ≥ 4 GB（要跑 Maven 构建则建议 8 GB）|
| Disk | ≥ 25 GB 可用 |
| 监听端口 | 只有 22（可能还有 Hostinger 自己的服务）；**不应有 8081/3306 对外** |

### 停止条件

出现以下任一 → **STOP，先报告**：
- RAM < 4 GB
- Disk 可用 < 15 GB
- 已有 MySQL/MariaDB 在运行（说明这台机器上已有别人的库）
- 已有进程占用 80 端口

产出报告格式：

```
PHASE 0 RESULT
Status: PASS / FAILED / NEEDS CONFIRMATION
OS:
CPU:
RAM:
Disk:
Public IP:
Existing listening ports:
Changed: 无（只读检查）
```

---

# PHASE 1 — 安装 Production 必需组件

> ⚠️ **Option B 差异**：**不装 ufw、不启用 ufw**（机器上跑着 17 个容器）。
> ⚠️ **不执行 `apt upgrade`** —— 这台机器在跑现有业务，升级可能重启服务或换内核。
> ⚠️ 装完 nginx 后**必须立刻摘掉它的 default 站点**，否则 nginx 会去抢 80 端口（被 Traefik 占着）。

```bash
sudo apt update

sudo apt install -y git curl unzip ca-certificates
sudo apt install -y openjdk-21-jdk maven
sudo apt install -y mariadb-server mariadb-client

# Node.js 22（官网用 Vite 8，必须 Node >= 20.19）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Nginx：装完立刻让它别碰 80 端口
sudo apt install -y nginx
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl stop nginx || true      # 等 PHASE 14 配好 8080 再启动
```

**关键验证：确认 Traefik 毫发无损**

```bash
ss -lntp | grep -E ':(80|443)\b'      # 期望仍是 traefik
ss -lntp | grep -E ':(8080|8082)\b'   # 期望无输出（两个端口都空闲）
```

> ⚠️ 用 **MariaDB 而不是 MySQL 8**：dump 来自 MariaDB 10.4，排序规则语义一致。

### 验证（全 PASS 才继续）

```bash
java -version        # 期望 21.x
mvn -version         # 期望 Apache Maven 3.8+，Java 21
node -v              # 期望 v22.x
npm -v
mysql --version      # 期望 10.11.x-MariaDB（或 11.x）
nginx -v             # 期望 nginx/1.24+
git --version
```

---

# PHASE 2 — 建 Production 目录

```bash
sudo mkdir -p /opt/inventory /var/www/admin /var/www/website /opt/backups
sudo chown -R $USER:$USER /opt/inventory /opt/backups
sudo chown -R www-data:www-data /var/www
```

最终结构：

```
/opt/inventory/          app.jar + data/ + uploads/
/opt/kunzz-springboot-react/   git clone（源码）
/var/www/admin/          后台 dist
/var/www/website/        官网 dist
/opt/backups/            数据库备份
```

> ⚠️ 修正：**不需要** `/opt/inventory/static/`。Nginx 直接发后台 dist，
> 而 `invoice/`、`fonts/`、`form/`、`vendor/`、`pdf-lib*.js` 都在 dist 里（来自 `public/`）。

---

# PHASE 3 — 建立独立 VPS 数据库

### ⛔ 铁律

```
旧 Live DB (Hostinger 共享主机)
        ↓  只导出 SQL（PHASE 4）
VPS 本机 MariaDB  ←── 应用只连这里
```

**绝不**让 VPS 连旧 Live Database。

### 3.1 时区（修正 #1，必做）

```bash
sudo timedatectl set-timezone Asia/Kuala_Lumpur
sudo tee /etc/mysql/mariadb.conf.d/99-kunzz.cnf >/dev/null <<'CNF'
[mysqld]
default_time_zone = '+08:00'
max_allowed_packet = 64M
CNF
sudo systemctl restart mariadb
```

验证：

```bash
timedatectl | grep "Time zone"          # 期望 Asia/Kuala_Lumpur (+08)
sudo mariadb -e "SHOW VARIABLES LIKE 'time_zone';"   # 期望 +08:00
```

### 3.2 建库（字符集必须一致）

```bash
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS u690174784_kunzz
                 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

验证：

```bash
sudo mariadb -e "SHOW CREATE DATABASE u690174784_kunzz\G"
```

### 3.3 建应用账号

```bash
sudo mariadb -e "
 CREATE USER IF NOT EXISTS 'kunzz_app'@'localhost' IDENTIFIED BY '换成强密码';
 GRANT SELECT,INSERT,UPDATE,DELETE,EXECUTE,SHOW VIEW
   ON u690174784_kunzz.* TO 'kunzz_app'@'localhost';
 FLUSH PRIVILEGES;"
```

### 停止条件

如果 `SHOW DATABASES` 里出现**不是你刚建的其他库**（尤其是名字像旧站点的） →
**STOP，报告**，可能连到了错误的实例。

---

# PHASE 4 — 上传数据库快照

在你**本地 Windows** 执行（WinSCP 或 scp 都行）：

```
本地： C:\Users\donho\OneDrive\Desktop\kunzz-springboot-react-main\database\u690174784_kunzz.sql
远端： /opt/inventory/u690174784_kunzz.sql
```

**推荐方式：直接在 VPS 上从 GitHub 拉**（这个 dump 就在公开仓库里，本地文件与 GitHub blob 已校验为同一份字节，
`git hash-object` == `git rev-parse HEAD:<path>`，且本地领先 origin/main 的提交数为 0）。

```bash
curl -fL -o /opt/inventory/u690174784_kunzz.sql https://raw.githubusercontent.com/kunzzit01/kunzz-springboot-react/main/database/u690174784_kunzz.sql
curl -fL -o /opt/inventory/add_new_tables.sql https://raw.githubusercontent.com/kunzzit01/kunzz-springboot-react/main/add_new_tables.sql
```

> `-f` 必须带：否则 404 会把 HTML 错误页当成文件写进去。

备选方式：WinSCP / scp。**注意 scp 要在你本地 Windows 上执行，不是在 VPS 终端里**
（`cd /c/Users/...` 是 Git Bash 的路径写法，在 Linux 上会报 No such file or directory）：

```bash
scp database/u690174784_kunzz.sql root@187.127.125.136:/opt/inventory/
```

### 上传后核对（关键，防传输截断）

在 VPS 上：

```bash
ls -l /opt/inventory/u690174784_kunzz.sql
# 期望：22,643,725 字节
# ⚠️ 注意：不是本地 Windows 上的 22,646,412 字节 —— 本地 core.autocrlf=true，
#    git 仓库里存的是 LF，raw.githubusercontent 下载得到的是 LF 版，
#    差值 2687 字节 = 正好 2687 行 × 1 个 \r。内容逐字节等价，且 LF 更适合 Linux 导入。
#    已验证：本地文件 `sed 's/\r$//'` 之后 md5 = 005faaabbf224423156c51aa5af55cac，与下载值一致。

md5sum /opt/inventory/u690174784_kunzz.sql
```

> ⚠️ **字节数对不上 → STOP 重新上传**。半个文件导入会得到一半的表。

---

# PHASE 5 — 导入 + 校验

### 5.1 导入前最后一道确认（防误连旧库）

```bash
sudo mariadb -e "SELECT @@hostname, @@port, DATABASE();"
```

必须看到**本机 hostname** 和 **3306**。如果看到任何远程主机名 → **STOP**。

### 5.2 导入（修正 #2/#3/#4）

```bash
# 必须：① 用 sudo（root，满足 DEFINER）② 在命令行指定库名（dump 里没有 USE）
# 不要：加 --force，不要设置 sql_mode
sudo mariadb u690174784_kunzz < /opt/inventory/u690174784_kunzz.sql
echo "import exit=$?"      # 必须是 0
```

> ✅ 已使用 GitHub 下载的 **LF 版** dump，因此**不会**出现 `ERROR 1064 ... near '\r'`（CRLF 问题已消除）。

预期的 **warning**（不是错误，属正常）：
- `Warning 1906 ... generated column`（7 个生成列，值会被重算）
- `Warning 1265 Data truncated`（老库 enum 脏值）

预期的 **error**（出现就 STOP）：
- `ERROR 1046 No database selected` → 忘了写库名
- `ERROR 1227 Access denied ... SUPER` → 没用 root
- `ERROR 1064 ... near '\r'` → CRLF 问题，见下

<details>
<summary>如果撞上 ERROR 1064（CRLF）怎么处理</summary>

不要在仓库里那份上改。上传一份副本并转行尾：

```bash
cp /opt/inventory/u690174784_kunzz.sql /opt/inventory/dump_lf.sql
sed -i 's/\r$//' /opt/inventory/dump_lf.sql
sudo mariadb u690174784_kunzz < /opt/inventory/dump_lf.sql
```
</details>

### 5.3 校验（对照审计基线）

```bash
sudo mariadb u690174784_kunzz -e "
 SELECT COUNT(*) AS objects FROM information_schema.tables
   WHERE table_schema='u690174784_kunzz';                 -- 期望 70（66 表 + 4 视图）
 SELECT COUNT(*) AS views_ FROM information_schema.views
   WHERE table_schema='u690174784_kunzz';                 -- 期望 4
 SELECT COUNT(*) AS triggers_ FROM information_schema.triggers
   WHERE trigger_schema='u690174784_kunzz';               -- 期望 8
 SELECT COUNT(*) AS fks FROM information_schema.table_constraints
   WHERE constraint_schema='u690174784_kunzz'
     AND constraint_type='FOREIGN KEY';                    -- 期望 20
 SELECT COUNT(*) FROM j1stockedit_data;                    -- 期望 23704
 SELECT COUNT(*) FROM j2stockedit_data;                    -- 期望 15889
 SELECT COUNT(*) FROM j3stockedit_data;                    -- 期望 18683
 SELECT COUNT(*) FROM stock_data;                          -- 期望 610
 SELECT COUNT(*) FROM users;                               -- 期望 24
 CHECK TABLE j1stockedit_data, stock_data, dishware_info;  -- 期望全是 OK
"
```

### 5.4 补建新表（修正 #5，**必做**）

```bash
# 把本地 add_new_tables.sql 上传到 /opt/inventory/ 后再执行
sudo mariadb < /opt/inventory/add_new_tables.sql
```

验证 `freezer_categories` 出现了：

```bash
sudo mariadb u690174784_kunzz -e "
 SHOW TABLES LIKE 'freezer_categories';                  -- 必须有 1 行
 SELECT COUNT(*) FROM freezer_categories;                -- 期望 20（脚本自带种子数据）
 SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema='u690174784_kunzz' AND table_name='stock_data'
     AND column_name IN ('price','freezer_position');     -- 期望 2
"
```

### 停止条件

出现任一 → **STOP，不要自己改 SQL**：
- 对象数 ≠ 70、触发器 ≠ 8、外键 ≠ 20
- 四张表的行数与基线不符
- `freezer_categories` 建不出来
- 任何 `ERROR`（warning 不算）

> `sync_cleanup.sql` **本阶段不执行** —— 它含 `DELETE FROM stock_minimum_settings`，
> 属于数据清洗，等系统跑通、对账确认后再单独决定。

---

# PHASE 6 — Clone Git 仓库

```bash
cd /opt
sudo git clone https://github.com/kunzzit01/kunzz-springboot-react.git
sudo chown -R $USER:$USER /opt/kunzz-springboot-react
cd /opt/kunzz-springboot-react
git status
git log --oneline -3      # 期望看到 626de67（含审计报告的那次推送）
```

> 仓库是 **public**，不需要凭据。
> 想省时间可以用 `git clone --depth 1`（少下 ~190 MB 历史），但之后不能直接 `git pull` 更新。

---

# PHASE 7 — 构建后端

```bash
cd /opt/kunzz-springboot-react/backend
mvn -DskipTests clean package
```

> 首次构建会下载整个依赖树（~300–500 MB），**3–10 分钟**，属正常。
> 不改任何 Java/XML 源码。

```bash
ls -lh target/*.jar
cp target/inventory-backend-1.0.0.jar /opt/inventory/app.jar
ls -lh /opt/inventory/app.jar      # 期望 ~74 MB
```

### 停止条件

Maven 失败 → **STOP**，按此格式报告，**不要自己重构代码**：

```
Command:
Error:
File:
Likely cause:
Recommended action:
```

---

# PHASE 8 — 后端环境变量

```bash
sudo tee /etc/inventory-backend.env >/dev/null <<'ENV'
DB_URL=jdbc:mysql://127.0.0.1:3306/u690174784_kunzz?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
DB_USERNAME=kunzz_app
DB_PASSWORD=换成 PHASE 3.3 设的强密码
JWT_SECRET=换成 openssl rand -hex 32 的输出
CORS_ALLOWED_ORIGINS=http://187.127.125.136:8080
SERVER_ADDRESS=127.0.0.1
SERVER_PORT=8082
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=kunzzsup@gmail.com
SMTP_PASS=
APP_BASE_URL=http://187.127.125.136:8080
ENV

sudo chmod 600 /etc/inventory-backend.env
sudo chown root:root /etc/inventory-backend.env
```

生成 JWT 密钥：

```bash
openssl rand -hex 32
```

> ⚠️ **`SMTP_PASS` 故意留空**（修正 #9）。旧的 Gmail 应用密码已泄露进公开仓库，
> 在你**去 Google 撤销并重新生成**之前，不要填任何东西。留空只影响欢迎邮件，不影响其他功能。

> 🔴 **`DB_PASSWORD` 不要手打 —— 让 shell 生成并注入**（2026-09-17 实战教训）
>
> 第一次部署就栽在这里：后端启动失败，日志报
> `SQL Error: 1045 ... Access denied for user 'kunzz_app'@'localhost' (using password: YES)`。
> 根因是**手输密码打错了**——那个 base64 密码含 `l`/`1`、`O`/`0` 这类易混字符，
> 且输入时不回显，错误只在部署后半段才暴露，排查成本很高。
>
> **正确做法（一条命令同时完成「设新密码 + 写入环境文件 + 保证两边一致」）：**
> ```bash
> PW=$(openssl rand -hex 24); sudo mariadb -e "ALTER USER 'kunzz_app'@'localhost' IDENTIFIED BY '$PW';" && sudo sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$PW|" /etc/inventory-backend.env && echo "已重置并写入环境文件"
> ```
> 用 **hex** 而不是 base64：只有 `0-9a-f`，没有歧义字符。`$PW` 是 shell 变量，
> **不会出现在终端回显里**，也不需要你看到或记住它。这一行本身不要转给别人。
>
> 事后校验两边一致（不显示密码，应返回 `ok=1` 而不是 1045）：
> ```bash
> sudo bash -c 'PW=$(grep "^DB_PASSWORD=" /etc/inventory-backend.env | cut -d= -f2-); MYSQL_PWD="$PW" mariadb -u kunzz_app -h 127.0.0.1 -P 3306 u690174784_kunzz -e "SELECT 1 AS ok, CURRENT_USER() AS who;"; echo "exit=$?"'
> ```
> 注意这条测试**用 `grep`+`cut` 取值，而不是 `source` 环境文件** —— 因为 `DB_URL` 里的
> 未加引号的 `&` 会被 bash 当成后台控制符，`source` 会解析错乱。

---

# PHASE 9 — Spring Boot systemd 服务

```bash
sudo tee /etc/systemd/system/inventory-backend.service >/dev/null <<'UNIT'
[Unit]
Description=Kunzz Inventory Backend
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/inventory
EnvironmentFile=/etc/inventory-backend.env
ExecStart=/usr/bin/java -Xms256m -Xmx1024m -jar /opt/inventory/app.jar
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now inventory-backend
sudo systemctl status inventory-backend --no-pager
```

> ⚠️ `WorkingDirectory=/opt/inventory` **不能省** —— 后端用相对路径读 `data/`、`uploads/`
> （`System.getProperty("user.dir")`）。目录不对 → 照片和媒体全 404。
> ⚠️ `User=ubuntu` 按你 VPS 的实际登录用户改（Hostinger 通常是 `root` 或你在面板建的用户）。

### 关键验证（修正 #6）

```bash
ss -lntp | grep -E ':(8081|8082)\b'
```

**必须是 `127.0.0.1:8082`。**
- 如果是 `0.0.0.0:8082` → **STOP**，`SERVER_ADDRESS` 没生效，API 已暴露公网
- 如果看到 `8081` → 那是 `telegram-bot-api` 容器（正常，不是我们的）
- 如果我们的进程没起来 → 先 `sudo journalctl -u inventory-backend -n 50 --no-pager`

---

# PHASE 10 — 后端本机测试

```bash
curl -i http://127.0.0.1:8081/api/auth/me
```

期望：**HTTP 401**（未登录，鉴权正常）。

| 结果 | 含义 |
|---|---|
| `401` | ✅ 正常 |
| `500` | ❌ 后端内部错误 → 看 `sudo journalctl -u inventory-backend -n 80 --no-pager` |
| 连接被拒 | ❌ 服务没起来 → 看 `systemctl status` |
| `200` | ⚠️ 异常，鉴权可能被绕过 → STOP 报告 |

同时确认数据库连上了（日志里不应有 `Access denied` / `Communications link failure`）。

---

# PHASE 11 — 后台前端构建

```bash
cd /opt/kunzz-springboot-react/inventory-system/frontend
npm ci          # ⚠️ 用 npm ci，它会严格按 package-lock.json 安装且不改写 lock 文件
npm run build
ls -lh dist/
sudo rsync -a --delete dist/ /var/www/admin/
sudo chown -R www-data:www-data /var/www/admin
```

> 不改任何 React 源码。构建脚本是 `tsc -b && vite build`，若 TS 报错 → STOP 报告。

---

# PHASE 12 — 官网构建

```bash
cd /opt/kunzz-springboot-react/website
npm ci
npm run build
ls -lh dist/
sudo rsync -a --delete dist/ /var/www/website/
sudo chown -R www-data:www-data /var/www/website
```

> 官网 `vite.config.js` 里 `base: '/home/'` —— 这就是 PHASE 14 必须把官网挂在 `/home/` 的原因。

---

# PHASE 13 — API URL 检查

**审计已确认，本阶段应该是纯 PASS，无需改任何代码：**

| 检查点 | 审计结论 |
|---|---|
| 后台 axios `baseURL` | `'/api'`（`src/api/http.ts:5`）✅ 相对路径 |
| 生产 WebSocket | 同源 `ws(s)://<当前域名>/ws/realtime` ✅ |
| 是否有 `http://localhost:8081` | 只有开发用 `verify-remark-picker.cjs`（不影响生产）✅ |
| 是否为域名写死 API | 没有 ✅ |

所以：**不改 React 源码**。若你在 Phase 17 发现请求打到了错误地址，
先按格式报告（File / Current value / Why it is a problem / Recommended change）等批准，不要自行动手。

---

# PHASE 14 — Nginx

```bash
sudo tee /etc/nginx/sites-available/kunzz >/dev/null <<'NGINX'
server {
    listen 8080 default_server;      # ⚠️ Option B：80/443 属于 Traefik，我们只用 8080
    server_name _;

    client_max_body_size 30m;      # 上传视频/背景音乐
    root /var/www/admin;
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

    # 碗碟照片（后端 uploads/）
    location /uploads/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
    }

    # 官网媒体（后端 data/page-images）
    location /media/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
    }

    # 静态资源长缓存（index.html 不缓存）
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/kunzz /etc/nginx/sites-enabled/kunzz
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                              # ⚠️ 不通过就 STOP，不要启动
sudo systemctl enable --now nginx          # PHASE 1 里停掉了，这里启用
sudo systemctl status nginx --no-pager
```

**启动后立刻确认 Traefik 没被影响**：

```bash
ss -lntp | grep -E ':(80|443)\b'      # 必须仍是 traefik
ss -lntp | grep 8080                   # 期望 0.0.0.0:8080 nginx
```

> ⚠️ `nginx -t` 不通过就 **STOP**，不要 `reload`。

---

# PHASE 15 — WebSocket（修正 #7）

上一步的配置里**故意没放 `/ws/`**，就是为了让这一步单独验证。现在加上：

```bash
sudo tee /etc/nginx/sites-available/kunzz.ws-snippet >/dev/null <<'SNIP'
# 粘进上面 server{} 块内（/api/ 旁边）：
    location /ws/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
SNIP
cat /etc/nginx/sites-available/kunzz.ws-snippet
```

手工把这段加进 `/etc/nginx/sites-available/kunzz`（`sudo nano` 或 `sudo vim`），然后：

```bash
sudo nginx -t && sudo systemctl reload nginx

# 命令行验证握手（期望 HTTP/1.1 101 Switching Protocols）
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     http://127.0.0.1/ws/realtime
```

> **没有 `/ws/` 反代 = 页面右上角永远"实时离线"**，PHASE 20 必定失败。
> 现有仓库里的 `nginx-ec2.sh` 正好漏了这段，别直接拿它用。

---

# PHASE 16 — 防火墙

> 🔴 **Option B：不要启用 ufw。** 这台机器 `ufw status` = `inactive`，而 Docker 自己管理
> iptables 并且有 17 个容器在跑。对这样一台机器开 ufw 默认拒绝策略，属于典型会**掐断现有容器
> 进出流量**的操作。我们**不需要**它 —— 隔离目标靠 `127.0.0.1` 绑定就已经达成。

**改为：验证绑定地址（只读）**

```bash
sudo ss -lntp | grep -E ':(8082|3306)\b'
```

期望两行都是 `127.0.0.1:`，**不能**是 `0.0.0.0:` / `:::`。

```bash
ufw status          # 期望 inactive —— 保持原样，不要动
```

> ⚠️ 公网可达性提醒：Hostinger 面板侧可能还有一层云防火墙。若 PHASE 17 从公网打不开
> `http://187.127.125.136:8080/`，但本机 `curl -I http://127.0.0.1:8080/` 正常 → 需要去
> Hostinger 面板放行 **8080**（本任务不改 ufw，只调面板）。

> MariaDB 在 Ubuntu 上默认 `bind-address=127.0.0.1`，正常就已是本机监听。
> 若发现是 `0.0.0.0:3306` → 在 `/etc/mysql/mariadb.conf.d/50-server.cnf` 里确认
> `bind-address = 127.0.0.1` 然后重启，**这是高危项，必须修**。

---

# PHASE 17 — 公网 IP 测试

现在才打开浏览器。

| URL | 期望 |
|---|---|
| `http://187.127.125.136:8080/` | 后台登录页（KUNZZ HOLDINGS 标题） |
| `http://187.127.125.136:8080/home/` | 官网首页（视频背景能播） |
| `/home/` 里点"员工登录" | 跳到 `http://187.127.125.136:8080/login`（后台） |
| 刷新 `http://187.127.125.136:8080/dashboard` | **不能 404**（SPA 回退生效） |

登录：**用真实老库账号，不要用 demo/demo123**。

CSV 检查（命令行也能先验）：

```bash
curl -s -o /dev/null -w "root=%{http_code}\n"  http://127.0.0.1:8080/
curl -s -o /dev/null -w "home=%{http_code}\n"  http://127.0.0.1:8080/home/
curl -s -o /dev/null -w "api=%{http_code}\n"   http://127.0.0.1:8080/api/auth/me
# 期望：200 / 200 / 401
```

---

# PHASE 18 — 功能测试

按页面逐项走：登录 → 看板 → 总库存 → 进出货（入/出）→ 分店 → 职员 → 餐具 → 成本/会计 → PDF 导出 → 官网。

每项记 PASS/FAIL。任何 FAIL 都要附浏览器 Console 或 `journalctl` 截图。

---

# PHASE 19 — 库存专项（依赖 PHASE 5.4）

```
总库存 → 选中 Kitchen
  ├─ 冰箱分类 列出现
  ├─ 按 冰箱分类 + 位次 排序
  └─ 不出现 Position 列（按项目要求）
```

若冰箱分类不显示 → 先回去确认 `freezer_categories` 有 20 行、`stock_data.freezer_position` 存在。
**不要改代码。**

---

# PHASE 20 — 双浏览器实时同步

1. 浏览器 A、浏览器 B 同时登录（可用一个普通 + 一个隐身窗口）
2. A：改一条库存
3. B：应在 **≈1 秒内**自动刷新

失败时的排查顺序（**先查环境，不要改业务代码**）：

```bash
ss -lntp | grep 8081                       # 后端在听 127.0.0.1:8081
sudo tail -f /var/log/nginx/error.log      # nginx 反代报错
sudo journalctl -u inventory-backend -n 50 --no-pager
```
浏览器 F12 → Network → WS → 看 `/ws/realtime` 是否为 **101 Switching Protocols**。

---

# PHASE 21 — 静态资源

| 资源 | 验证方式 | 期望 |
|---|---|---|
| 碗碟照片（368 张） | 餐具页 | 全部显示，无 404 |
| 发票模板 | 进出货 → 导出 PDF | 能生成且内容正确 |
| 字体 | 考核/问答页导出 | 中文不乱码 |
| 官网图片/视频 | `/home/` 首页 | 视频能播 |
| `data/page-images/` | 首页背景 | 正常 |

命令行抽查：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/uploads/dishware/$(ls /opt/inventory/uploads/dishware | head -1)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/invoice/j1invoice.pdf
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/fonts/NotoSansSC-Regular.ttf
```

### ⛔ 若 `uploads/` 是空的（修正 #8）

```bash
# 从 clone 里拷（仓库已跟踪这 368 张照片，不需要另外上传）
cp -r /opt/kunzz-springboot-react/backend/uploads/ /opt/inventory/uploads
cp -r /opt/kunzz-springboot-react/backend/data/    /opt/inventory/data
sudo chown -R ubuntu:ubuntu /opt/inventory
sudo systemctl restart inventory-backend
```

---

# PHASE 22 — AI（不装 Ollama）

本阶段**故意不装 Ollama**。

验证降级正确：

1. 进出货页右下角 🤖 聊天球 → 发一句话
2. 期望提示：**"无法连接本地 AI 服务，请确认 Ollama 已启动"**
3. 同时确认以下功能**不受影响**：库存/看板/会计/职员/PDF/WebSocket

若后端因此 500 或其它页面挂掉 → 那是 bug，**STOP 报告**（不要自己改代码）。

---

# PHASE 23 — 旧站验证（不动它）

打开旧站，确认它**完全正常**：

```
https://kunzzgroup.com        ← ✅ 2026-09-17 用户已确认：这就是旧 Live 站，且正在运行
```

> ⚠️ 本阶段**只做只读验证，绝不能对它做任何操作**。
> 后端 `MediaServeController` / `TimelineController` 里有指向 `www.kunzzgroup.com` 的
> 线上兜底拉取 —— 那是**只读 GET**，不会写入旧站，属正常行为。

| 检查 | 期望 |
|---|---|
| 首页能打开 | ✅ |
| 登录页能打开 | ✅ |
| 旧站数据与 VPS 上看到的一致（因为是同一份快照） | ✅ |

**旧站异常 → 立即停止全部 VPS 测试，不要动旧站，先报告。**

---

# PHASE 24 — Domain 隔离确认

```
DNS:       未修改
Domain:    未修改
A Record:  未修改
CNAME:     未修改
MX:        未修改
Nameserver:未修改

新系统:  http://VPS_PUBLIC_IP/      （独立）
旧系统:  https://kunzzgroup.com      （保持原状）
```

可选：两张页面截图并排对比，留档。

---

## 完成标准（逐项打勾）

```
[PASS] http://VPS_IP/ 后台登录页
[PASS] http://VPS_IP/home/ 官网
[PASS] 真实账号登录
[PASS] 数据库 70 对象 / 8 触发器 / 20 外键 / 行数符合基线
[PASS] freezer_categories 已补建
[PASS] 后端 401 鉴权正常
[PASS] 后台 dist 由 Nginx 发布
[PASS] 官网 dist 发布在 /home/
[PASS] API 走 /api 反代
[PASS] /ws/ 反代生效，实时已连接
[PASS] 双浏览器 ≈1 秒同步
[PASS] 总库存 / Kitchen / 冰箱分类 / 位次排序
[PASS] PDF 导出
[PASS] 碗碟照片 368 张
[PASS] 官网视频
[PASS] 8081 只绑 127.0.0.1
[PASS] 3306 只绑 127.0.0.1
[PASS] AI 可选，降级正常
[PASS] 旧站正常
[PASS] DNS / Domain 未动
```

---

## 本阶段明确不做（需要你单独批准）

| # | 事项 | 为什么 |
|---|---|---|
| 1 | 移除 `DataInitializer` 的 demo/demo123 自动创建 | 改后端源码，需批准 |
| 2 | 轮换 Gmail 应用密码 | 需你去 Google 账号操作 |
| 3 | 收紧 WebSocket `setAllowedOrigins("*")` | 改后端源码，需批准 |
| 4 | 执行 `sync_cleanup.sql` | 含 DELETE，需对账后单独决定 |
| 5 | 清理仓库里那份 22 MB 含 PII 的 dump | 需你决定脱敏策略 |
| 6 | 提交/推送任何本次部署产生的新文件 | 需你明确指示 |

---

## 回滚（任何阶段出错都能退）

因为**DNS 没动**，最大的一张安全垫是：

> **随时可以整台删除 VPS，线上业务毫发无损。**

| 层级 | 回滚动作 |
|---|---|
| 后端 | `sudo systemctl stop inventory-backend`；换回旧 `app.jar` 再 start |
| Nginx | `sudo cp sites-available/kunzz.bak sites-available/kunzz && sudo nginx -t && sudo systemctl reload nginx` |
| 前端 | `sudo rsync -a /var/www/admin.bak/ /var/www/admin/`（发布前先备份） |
| 数据库 | `sudo mariadb -e "DROP DATABASE u690174784_kunzz; CREATE DATABASE ..."` 后重新导入（数据回到快照时刻） |
| 整机 | Hostinger 面板删除 VPS |

每次改配置前先留一份：

```bash
sudo cp /etc/nginx/sites-available/kunzz /etc/nginx/sites-available/kunzz.bak
sudo cp /opt/inventory/app.jar /opt/inventory/app.jar.bak
```

---

# 📌 2026-09-17 实际部署记录（VERIFIED，全部 24 个 PHASE 通过）

## 目标环境

| 项 | 值 |
|---|---|
| VPS | Hostinger `srv1808383`，公网 **187.127.125.136**（IPv6 `2a02:4780:5e:74bf::1`）|
| OS | Ubuntu **24.04.4 LTS** / 8 vCPU / 31 GB RAM / 387 GB disk |
| 架构决策 | **Option B** —— 与机器上已有的 **18 个 Docker 容器共存**，80/443 保持归 Traefik |

> 该机器原有一整套 Docker 生产栈（traefik、ollama、pgvector/postgres、n8n、gotenberg、
> stirling-pdf、5×rag-mcp、多个 telegram bot、Hostinger hermes-agent）。
> 全程**未触碰**其中任何一个。

## 实际版本

| 组件 | 版本 |
|---|---|
| Java | openjdk **21.0.12** |
| Maven | **3.8.7** |
| Node / npm | **v22.23.2** / **10.9.8** |
| MariaDB | **10.11.14** |
| Nginx | **1.24.0** |
| Spring Boot | **3.5.3**（首次构建 **78 秒**，jar 72M）|

## 实际端口分布

| 端口 | 归属 | 说明 |
|---|---|---|
| **8080** | nginx | KUNZZ 唯一公网入口 |
| **8082** | Spring Boot | 绑 `127.0.0.1`；**不能用 8081**（被 `telegram-bot-api` 容器占用）|
| **3306** | MariaDB | 绑 `127.0.0.1` |
| 80 / 443 | traefik | **未触碰** |
| 11434 | ollama（既有容器）| 将来可复用于 KUNZZ AI |

## 数据库导入实测

- 导入耗时 **3.06 秒**，`exit=0`，**零 warning**（审计预告的 1906/1265 都没出现）
- **70 对象**（66 表 + 4 视图）/ **8 触发器** / **20 外键**
- `j1stockedit_data`=23704、`j2`=15889、`j3`=18683、`stock_data`=610、`users`=**23**
  （审计初稿写的 24 是错的，以库为准 23）
- 补建 `add_new_tables.sql` 后 → **71 对象**，`freezer_categories` 20 行种子数据
- 时区 `+08:00` 生效，`NOW()` 返回马来西亚时间

## 踩到的 5 个坑（按发生顺序，都值得记住）

1. **GitHub 上的 dump 是 LF，本地是 CRLF** —— 字节差恰好等于行数（2687 / 161）。
   ⚠️ **`git hash-object` 不能用来比对 raw 字节**：它会应用 `core.autocrlf` 的 clean 过滤器，
   两边都归一化后再比，永远看不出换行差异。正确做法是 `sed 's/\r$//'` 后算 md5。
   ✅ 副作用是好的：LF 版反而避免了 Linux 上 `ERROR 1064 ... near '\r'` 的风险。

2. **手输数据库密码打错** → 后端启动失败，日志 `SQL Error: 1045, Access denied for user 'kunzz_app'@'localhost'`。
   表现是 `Unable to determine Dialect without JDBC metadata`（**这是症状不是病因**，真正的错误在日志更早处）。
   ✅ 修复：用 `openssl rand -hex 24` 自动生成 + 同时写库和写文件，**全程不经人手**（见 PHASE 8.4）。

3. **端口被既有服务占用** —— 80 被 Traefik 占（`apt install nginx` 时 Debian 自动跳过启动，
   并打印 `Not attempting to start NGINX, port 80 is already in use.`，**Traefik 毫发无损**）；
   8081 被 `telegram-bot-api` 容器占。✅ 改用 **8080 + 8082**。

4. **官网用绝对路径 `/images/` 和 `/tokyo/`** —— 在 `/home/` 子路径部署下被解析到后台根目录 → 全部破图、
   东京页 CSS/JS 404。**本地 dev 看不出来**（Vite dev 把 `public/` 挂在根路径），
   而 `kunzzgroup.com` 至今是旧 PHP 站，React 官网**从未真正在 `/home/` 上跑过**，所以一直没暴露。
   ✅ 修复：nginx 加两个 alias（后台用的是 `/static/images/`，**不同命名空间、无冲突**）：
   ```nginx
   location /images/ { alias /var/www/website/images/; }
   location /tokyo/  { alias /var/www/website/tokyo/; }
   ```

5. **Hibernate 把 MariaDB 读成 `5.5.5`** —— 根因是 **MySQL Connector/J 只解析版本串开头的数字**
   （MariaDB 为兼容老客户端返回 `5.5.5-10.11.14-MariaDB-...`）。
   ❌ 改 `hibernate.dialect` **无效**（我把方言换成了 `MariaDBDialect`，警告依旧，只是文案变成
   "minimum supported version is 10.4.0"），而且会造成**本地(MySQLDialect)/生产(MariaDBDialect) 行为不一致**，故已回退。
   ✅ 根治办法：换成 **MariaDB JDBC driver**（`org.mariadb.jdbc:mariadb-java-client` + `jdbc:mariadb://`），
   属于 pom.xml + 配置 + 重新构建 + 全量回归的改动，**留作独立任务**。

## 已验证通过（对照用户验收清单）

```
公网 IP 后台 / 官网 ✅   真实账号登录 ✅   70 对象数据库 ✅   后端 401 鉴权 ✅
后台 dist 由 nginx 发布 ✅   官网挂 /home/ ✅   /api 反代 ✅   /ws 反代 101 ✅
双浏览器 ≈1 秒同步 ✅   总库存/Kitchen/冰箱分类/位次排序 ✅   发票 PDF ✅
碗碟照片 368 张 ✅   官网视频 ✅   8082 只绑 127.0.0.1 ✅   3306 只绑 127.0.0.1 ✅
AI 降级正常 ✅   旧站 kunzzgroup.com 200 ✅   DNS/Domain 全程未动 ✅
```

## 已知残留（均不阻塞，留待独立处理）

| # | 项 | 影响 | 需要的动作 |
|---|---|---|---|
| 1 | `HHH000511` 方言警告 | 仅提示，Hibernate 保守但可用 | 换 MariaDB driver（需批准 + 回归）|
| 2 | 官网 `index.css:861` 引用不存在的 `背景3.jpg`（实际是 `.webp`）| 一个背景图位置 | 改 1 个字符（**源码，需批准**）|
| 3 | `demo` / `demo123` 弱口令账号仍在库中 | 任何人可登入后台 | 改密码或移除 `DataInitializer`（**源码，需批准**）|
| 4 | npm audit 报 4（后台）/ 7（官网）个构建期依赖漏洞 | 不进运行时 | 单独评估，**不要现在跑 `npm audit fix`**（会改 lock 文件、破坏可复现构建）|
| 5 | `SPRING_AUTOCONFIGURE_EXCLUDE` 已加到环境文件 | 消除了 Spring 默认内存账号 | 保留 ✅ |

---

# 🔁 日常运维：更新代码 / 更新数据

> 部署布局决定「改了什么，就要重建什么」。**先记住这张表**：

| 产物 | 位置 | 由什么决定 | 重建代价 |
|---|---|---|---|
| 后端 jar | `/opt/inventory/app.jar` | `backend/**`（含 `pom.xml`、`application.yml`）| `mvn` 约 80 秒 |
| 后台前端 | `/var/www/admin/` | `inventory-system/frontend/**` | `npm run build` 约 15 秒 |
| 官网前端 | `/var/www/website/` | `website/**` | `npm run build` 约 1 秒 |
| 运行期数据 | `/opt/inventory/data/`、`/opt/inventory/uploads/` | 后台界面上传 + 仓库拷贝 | 增量拷贝 |
| 配置与密钥 | `/etc/inventory-backend.env` | 手工维护（**不在 git 里**）| — |
| 数据库 | MariaDB `u690174784_kunzz` | `database/*.sql` 或旧站导出 | 导入约 3 秒 |

**源码目录**：`/opt/kunzz-springboot-react`（git clone，分支 `main`）

---

## 一、更新代码

### 1.1 每次都先备份（30 秒，别省）

```bash
cp /opt/inventory/app.jar /opt/inventory/app.jar.bak
sudo cp /etc/inventory-backend.env /etc/inventory-backend.env.bak
sudo mysqldump --single-transaction u690174784_kunzz | gzip > /opt/backups/pre_update_$(date +%F_%H%M).sql.gz
```

### 1.2 拉取代码

```bash
cd /opt/kunzz-springboot-react
git status --short        # 应为空；有输出说明有人在这台机器上改过源码
git pull --ff-only
git log --oneline -3
```

> ⚠️ 仓库里**跟踪着一个 74 MB 的 `backend/target/*.jar`**。如果那次提交包含新的 jar，
> `git pull` 会顺带下载它（慢但无害）——**VPS 不用这个 jar，我们自己在 VPS 上构建**。

### 1.3 判断要重建什么

```bash
git diff --name-only HEAD@{1}..HEAD
```

| 改动命中的路径 | 要做的事 |
|---|---|
| `backend/**` | 重建后端（1.4）|
| `inventory-system/frontend/**` | 重建后台前端（1.5）|
| `website/**` | 重建官网（1.6）|
| `database/*.sql`、`add_new_tables.sql` | **另外**做数据更新（见第二节）|
| 只有 `docs/**`、`*.md` | 什么都不用重建 ✅ |
| `application.yml` 新增了 `${新变量:默认值}` | 在 `/etc/inventory-backend.env` 里补上该变量 |

> 懒人做法：不确定就**三个全重建**。总耗时约 2 分钟，反正只有 1~2 秒停机。

### 1.4 重建后端

```bash
cd /opt/kunzz-springboot-react/backend
mvn -DskipTests clean package          # 期望 BUILD SUCCESS
cp target/inventory-backend-1.0.0.jar /opt/inventory/app.jar
chown kunzz:kunzz /opt/inventory/app.jar
sudo systemctl restart inventory-backend
sleep 10
sudo systemctl is-active inventory-backend
```

### 1.5 重建后台前端

```bash
cd /opt/kunzz-springboot-react/inventory-system/frontend
npm ci                                  # 仅当 package-lock.json 变了才需要
npm run build
sudo rsync -a --delete dist/ /var/www/admin/
sudo chown -R www-data:www-data /var/www/admin
```

> **前端不需要重启任何服务** —— nginx 直接读磁盘，刷新浏览器即可。
> 若改了 `public/` 里的资源（字体、发票模板），`rsync --delete` 会自动同步 ✓

### 1.6 重建官网

```bash
cd /opt/kunzz-springboot-react/website
npm run build
sudo rsync -a --delete dist/ /var/www/website/
sudo chown -R www-data:www-data /var/www/website
```

### 1.7 同步运行期数据文件（**容易被忘，但很关键**）

`/opt/inventory/data/` 和 `/opt/inventory/uploads/` **不在 git 里**（一个是后台界面上传产生的，
一个是从仓库拷过去之后会被运行期写入）。仓库里这几项有更新时要手动同步：

```bash
cp -r /opt/kunzz-springboot-react/backend/uploads/. /opt/inventory/uploads/
cp -r /opt/kunzz-springboot-react/backend/data/.    /opt/inventory/data/
chown -R kunzz:kunzz /opt/inventory
sudo systemctl restart inventory-backend    # 让媒体缓存重建
```

### 1.8 更新后验证（1 分钟）

```bash
curl -s -o /dev/null -w "root=%{http_code}\n" http://127.0.0.1:8080/
curl -s -o /dev/null -w "home=%{http_code}\n" http://127.0.0.1:8080/home/
curl -s -o /dev/null -w "api=%{http_code}\n"  http://127.0.0.1:8080/api/auth/me
curl -s -o /dev/null -w "photo=%{http_code}\n" "http://127.0.0.1:8080/uploads/dishware/$(ls /opt/inventory/uploads/dishware | head -1)"
```

期望 `200 / 200 / 401 / 200`，然后浏览器登录点一下「总库存」和「进出货」。

### 1.9 回滚（任何一步异常）

```bash
cp /opt/inventory/app.jar.bak /opt/inventory/app.jar
sudo cp /etc/inventory-backend.env.bak /etc/inventory-backend.env
sudo systemctl restart inventory-backend
```

前端回滚：前端 dist 没有自动备份，**靠 git**：
```bash
cd /opt/kunzz-springboot-react
git checkout <上一个正常的提交> -- inventory-system/frontend   # 或 website
# 然后重新 build + rsync
```

---

## 二、更新数据（替换数据库）

### 2.1 ⚠️ 先想清楚一件事：谁是「唯一真相来源」

**当前状态**：VPS 库是 2026-09-17 10:06 的**快照**；旧 PHP 站仍在 `kunzzgroup.com` 上写 Hostinger 的库。
**两边会分叉** —— 旧站上任何新的进出货，VPS 这边都没有。

| 场景 | 做法 |
|---|---|
| **A. VPS 当测试沙盒**（现在）| 想同步就在旧站导新 dump，整库替换（2.2）。**VPS 上的写入会丢** |
| **B. 让 VPS 直连旧 Hostinger 库** | 数据只有一份、永不分叉；但需要 Hostinger 放行 VPS IP + `DB_URL` 改回外网地址 + 有网络延迟 |
| **C. 正式迁移**（切域名时）| 旧站下线，VPS 库成为唯一真相 —— **届时必须先做 C，再切 DNS** |

> **切域名之前必须先把 A/B/C 定下来。** 在 A 的状态下切域名 = 用户在新系统下的单，旧系统看不到，反之亦然。

### 2.2 整库替换（场景 A）

```bash
# ① 备份当前 VPS 库（可回滚，必做）
sudo mysqldump --single-transaction --routines --triggers u690174784_kunzz \
  | gzip > /opt/backups/before_refresh_$(date +%F_%H%M).sql.gz

# ② 拿到新的 dump（在 VPS 上从 GitHub 拉，或本地上传）
curl -fL -o /opt/inventory/new_dump.sql https://raw.githubusercontent.com/kunzzit01/kunzz-springboot-react/main/database/u690174784_kunzz.sql

# ③ 核对字节数/md5（对不上就停下重来）
ls -l /opt/inventory/new_dump.sql

# ④ 🔴 重建空库后导入 —— dump 里有 70 处 DROP TABLE IF EXISTS，
#    只能导入空库；导入前再确认一次连的是本机
sudo mariadb -e "SELECT @@hostname, @@port;"
sudo mariadb -e "DROP DATABASE u690174784_kunzz; CREATE DATABASE u690174784_kunzz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mariadb u690174784_kunzz < /opt/inventory/new_dump.sql
echo "import exit=$?"                       # 必须 0

# ⑤ 补建新表（每次替换后都要，freezer_categories 不在 dump 里）
sudo mariadb < /opt/inventory/add_new_tables.sql

# ⑥ 校验：应为 71 对象（67 表 + 4 视图）、8 触发器、20 外键
sudo mariadb u690174784_kunzz -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='u690174784_kunzz';"
sudo mariadb u690174784_kunzz -e "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='u690174784_kunzz';"
sudo mariadb u690174784_kunzz -e "SELECT COUNT(*) FROM freezer_categories;"

# ⑦ 重启后端（清连接池里的旧连接）
sudo systemctl restart inventory-backend
```

> `kunzz_app` 的授权在 `DROP DATABASE` 后会保留（授权记录按库名存在 mysql.db 里），无需重建账号。
> 但如果**重建了账号**，记得同步更新 `/etc/inventory-backend.env` 的 `DB_PASSWORD`。

### 2.3 ⚠️ 替换数据后有两类"不一致"要检查

1. **账号弱口令会跟着 dump 回来** —— dump 里有 `demo`/`demo123`，替换后要重新封堵：
   ```bash
   sudo mariadb u690174784_kunzz -e "UPDATE users SET username='demo_disabled', email='demo_disabled@kunzz.local', password='disabled' WHERE username='demo';"
   ```
2. **图片文件与数据库记录要对得上** —— dump 里存的是相对路径（如 `/dishware/xxx.jpg`），
   实际文件在 `/opt/inventory/uploads/dishware/`。若新 dump 引用了本地没有的照片 → 破图。
   同步方法见 1.7。

### 2.4 只做结构补丁（不替换数据）

仓库根目录的 `add_new_tables.sql` 是**幂等**的（已存在就跳过），可以随时跑：

```bash
cd /opt/kunzz-springboot-react && git pull --ff-only
sudo mariadb < add_new_tables.sql
```

`sync_cleanup.sql` **含 `DELETE`**，属于数据清洗 —— 跑之前必须先备份、先对账。

---

## 三、备份（当前状态与缺口）

| 项 | 状态 |
|---|---|
| 数据库每日备份 | ✅ 已配 `/etc/cron.daily/kunzz-db-backup`，保留 14 天，落在 `/opt/backups/` |
| **`/opt/inventory/data` + `uploads`** | 🔴 **尚无备份** —— 后台界面上传的图片/媒体**只存在于这台机器** |
| 源码 | ✅ 在 GitHub |
| 配置/密钥 | `/etc/inventory-backend.env`（600 root），**建议离线另存一份** |

建议补上运行期文件的每周备份：

```bash
sudo tee /etc/cron.weekly/kunzz-files-backup >/dev/null <<'SH'
#!/bin/sh
tar czf /opt/backups/kunzz-files_$(date +%F).tar.gz -C /opt/inventory data uploads
find /opt/backups -name 'kunzz-files_*.tar.gz' -mtime +28 -delete
SH
sudo chmod +x /etc/cron.weekly/kunzz-files-backup
```

**异地备份**：`/opt/backups/` 与数据库在同一台机器上，机器坏了两个一起没。
建议定期把 `/opt/backups/*.gz` 拉回本地（WinSCP 即可）。

---

## 四、常用排查命令

```bash
sudo systemctl status inventory-backend --no-pager     # 服务状态
sudo journalctl -u inventory-backend -n 100 --no-pager  # 后端日志
sudo tail -50 /var/log/nginx/access.log                # 谁在访问
sudo tail -50 /var/log/nginx/error.log                 # nginx 报错
sudo ss -lntp | grep -E ':(8080|8082|3306)\b'          # 端口绑定
sudo mariadb u690174784_kunzz -e "SHOW PROCESSLIST;"   # 数据库连接
docker ps --format '{{.Names}}' | wc -l                # 确认 18 个容器仍在
```

**改完 nginx 配置永远走这两步，不要 restart：**
```bash
sudo nginx -t && sudo systemctl reload nginx
```

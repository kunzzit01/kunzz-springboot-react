# 🚀 上 live 部署清单（GO_LIVE）

> **目标架构**：Amazon EC2（Nginx + JRE21 + Spring Boot jar + 前端 dist）＋ 数据库用**现有 live 库**
> `u690174784_kunzz`（Hostinger，DBeaver 管理）——新系统与旧 PHP 系统**共用同一库，数据实时共享**。
> 首次整理 2026-09-03。配套脚本：`deploy-ec2.sh`（一键部署）、`nginx-ec2.sh`（Nginx 反代）。
> 详细运维（HTTPS/日志/对账）见 `docs/OPS.md`。

---

## 〇、上 live 前必须想清楚的一件事

**新系统直接连 live 现有数据库**（不做数据迁移）：
- live 库 = 旧 PHP 系统在用的 `u690174784_kunzz`（Hostinger）
- 新系统只**加表加列**（3 张新表 + 2 列），**不改不删任何现有结构/数据** → 旧系统零影响
- 新旧系统并行运行，数据实时互通（本地开发一直是这么对账的，见 DB_IMPORT.md）

---

## 一、数据库准备（DBeaver，约 10 分钟）

1. DBeaver 连 Hostinger MySQL（现有连接即是）
2. **执行结构补丁**：运行 `add_new_tables.sql`（幂等，已存在会跳过）——
   新增 3 张表（operation_logs / phone_records / price_change_log）+
   `stock_data` 加列 `price`、`freezer_position`
   ⚠️ 对旧 PHP 系统零影响（纯新增；旧代码不认识新列也不受影响）
3. **建专用账号**（不要用 phpMyAdmin 的主账号给后端）：
   ```sql
   CREATE USER 'inventory_app'@'%' IDENTIFIED BY '换成强密码';
   GRANT ALL PRIVILEGES ON u690174784_kunzz.* TO 'inventory_app'@'%';
   FLUSH PRIVILEGES;
   ```
4. Hostinger 面板 → Remote MySQL：**允许 EC2 公网 IP 访问**（否则 EC2 连不上库）
5. 验证：DBeaver 用 `inventory_app` 新建连接测试通过

## 二、EC2 准备（约 20 分钟）

1. 启动 Ubuntu 22.04/24.04 实例（t3.small 起步够用），安全组放行 22(SSH)/80(HTTP)/443(HTTPS)
2. SSH 进 EC2 装 JRE 21 + Nginx：
   ```bash
   sudo apt update && sudo apt install -y openjdk-21-jre-headless nginx
   java -version   # 确认 21.x
   ```
3. 建部署目录：`sudo mkdir -p /opt/inventory /var/www/admin /var/www/website && sudo chown -R $USER /var/www`

## 三、部署（本地运行两个脚本）

1. **改 `deploy-ec2.sh` 配置区**：
   - `EC2_HOST` = EC2 公网 IP、`SSH_KEY` = 你的 pem 路径
   - `DB_URL` = `jdbc:mysql://<Hostinger数据库主机>:3306/u690174784_kunzz?...`（主机在 DBeaver 连接里能看到）
   - `DB_PASSWORD` = 上面建的 inventory_app 密码
   - `CORS_ALLOWED_ORIGINS` = `http://<EC2_IP>`（有域名加域名）
   - `APP_BASE_URL` = 用户访问的后台地址
2. `bash deploy-ec2.sh` —— 本地打包 jar + 构建前端 → 上传 → EC2 端写环境文件 → 起服务
3. **改 `nginx-ec2.sh`**（域名/IP）→ `bash nginx-ec2.sh` —— 反代 8081 + 静态站 + 上传体积

## 四、上线验证清单（逐项打勾）

- [ ] `http://<EC2_IP>` 打开官网、`/login` 打开后台登录页
- [ ] 登录（用现有 users 表账号）→ 总库存数字与 DBeaver 查询一致
- [ ] 总库存选中 Kitchen：冰箱分类列出现、按冰箱+位次排序、无 Position 列
- [ ] 导出数据：类型多选可用；货品种类搜索：全能/精准（🔍/= 图标切换）可用
- [ ] 货品种类改一个单价 → 总库存货品名旁出现 🕘、悬停/弹窗正确
- [ ] **旧 PHP 系统同时打开一遍**：登录/库存页正常（证明结构补丁零影响）
- [ ] 进出货加一条 → 手机版 + 总库存联动正常；后台日志无 ERROR
- [ ] HTTPS（有域名时）：certbot 签发后强制跳转，`docs/OPS.md` 2.3 节

## 五、安全备忘（重要）

1. ⚠️ **`deploy-ec2.sh` 里硬编码过 Gmail 应用密码（SMTP_PASS）且已进 git 历史**——
   上 live 前去 Google 账号**撤销并重新生成应用密码**，新密码只写 EC2 环境文件，不要再提交进 git
   （仓库里已改为占位符，2026-09-03）
2. `inventory_app` 用强密码；Hostinger Remote MySQL 白名单只放 EC2 IP
3. JWT_SECRET 每个环境独立随机生成（deploy-ec2.sh 已自动生成）
4. EC2 定期快照；数据库备份仍按 Hostinger 侧计划 + 本地 DB_IMPORT.md 流程

## 六、回滚方案

- 后端：EC2 上 `pkill -f inventory-backend` 后换回旧 jar 再启动（部署前 deploy-ec2.sh 会备份上一版 jar 为 `.bak`）
- 数据库结构回滚：新表直接 DROP 即可；加的两列 `price`/`freezer_position` 旧系统不读不写，**无需回滚**

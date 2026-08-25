# Kunzz Inventory System - 生产部署指南

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

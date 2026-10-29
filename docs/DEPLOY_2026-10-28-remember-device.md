# 部署：记住我 = 记住这台设备（2026-10-28）

> 任务：`docs/tasks/2026-10-28-remember-device.md` ｜ 提交：`d0b7de8`
> 内容：勾选「记住我」→ 90 天内重启电脑/关浏览器后直接进 `/dashboard`；新增「登录设备」撤销页。
> 本文件是**可照着敲**的远程执行步骤，含验证与回滚。

---

## 0. 前提检查（在 VPS 上）

```bash
ssh root@187.127.125.136

cd /opt/kunzz-springboot-react && git log --oneline -1      # 期望包含 d0b7de8
systemctl is-active inventory-backend                       # 期望 active
mariadb --version                                           # 期望 10.11.x / 11.x
```

> ⚠️ 生产机上**不要**跑仓库里的 `git-update.ps1` / `Git更新.bat`（它们是给 Windows 部署机双击用的，
> 内含 `git reset --hard`），一律用下面的 `git merge --ff-only`。

---

## 1. 建表（必须先做，幂等）

表 `user_devices` 是本次新增的，**不建表也能登录**（后端自动降级成原来的 24 小时 JWT），
但「重启后免密进入」和「登录设备」页不生效。三种方式选一种：

### 方式 A（推荐）：一条命令，本地执行

**PowerShell（Windows 默认）**：

```powershell
cd C:\Users\mings\OneDrive\Desktop\kunzz-springboot-react
powershell -ExecutionPolicy Bypass -File .\scripts\apply_ddl_user_devices_2026-10-28.ps1
# 先看会做什么：加 -DryRun；换服务器：-Remote root@1.2.3.4
```

**Git Bash / Linux / macOS**：

```bash
bash scripts/apply_ddl_user_devices_2026-10-28.sh --remote root@187.127.125.136
```

两者行为一致：`scp` SQL 与脚本到 `/tmp` → `ssh` 上去执行 → 校验 `user_devices` 存在 → 清理临时文件。

### 方式 B：已经 ssh 在服务器上，直接跑

```bash
cd /opt/kunzz-springboot-react
git merge --ff-only origin/main     # 先拿到 add_new_tables_user_devices.sql
sudo bash scripts/apply_ddl_user_devices_2026-10-28.sh --local
```

### 方式 C：手工两条命令（与仓库既有做法一致）

```bash
cd /opt/kunzz-springboot-react
git fetch origin main && git merge --ff-only origin/main
sudo mariadb u690174784_kunzz < add_new_tables_user_devices.sql

# 校验
sudo mariadb u690174784_kunzz -e "SHOW COLUMNS FROM user_devices;"
```

> 权限说明：后端应用账号 `kunzz_app` / `inventory_app` 只有 SELECT/INSERT/UPDATE/DELETE，
> **没有建表权限** —— 所以用 root（unix socket）执行，别用应用账号。

---

## 2. 后端上线（就地构建，按 `docs/OPS.md` 3.1.1）

```bash
cd /opt/kunzz-springboot-react
git fetch origin main && git merge --ff-only origin/main
cd backend && mvn -B -DskipTests package

# 验证新代码真的进了包（本功能的关键类必须在）
unzip -l target/inventory-backend-1.0.0.jar | grep -E "DeviceTokenService|UserDevice|DeviceVO"

# 备份 + 替换 + 重启
cp -p /opt/inventory/app.jar /opt/inventory/app.jar.bak.$(date +%Y%m%d_%H%M)
install -o kunzz -g kunzz -m 644 target/inventory-backend-1.0.0.jar /opt/inventory/app.jar
systemctl restart inventory-backend && sleep 10 && systemctl is-active inventory-backend
```

可选：把有效期从默认 90 天改成别的值（改完要重启）：

```bash
# /etc/inventory-backend.env 里加一行（例：30 天）
AUTH_DEVICE_TTL_DAYS=30
```

---

## 3. 前端上线（后台 dist → /var/www/admin）

本次前端必须有改动（登录页、启动门禁、`/devices` 新页、侧边栏入口）——
**旧前端 + 新后端**的表现是：「记住我」能签设备令牌，但重启后没人去换 JWT，
页面仍会跳到登录页，看起来就像没生效。

> 注意：生产 nginx 发的是 `/var/www/admin`（`dist/`），**不是仓库里的 `backend/static/**`**
> （见 `docs/VPS_DEPLOY_2026-09-17-vps-deploy.md` PHASE 11）。所以本次不需要提交 static 产物。

```bash
cd /opt/kunzz-springboot-react
git fetch origin main && git merge --ff-only origin/main

cd inventory-system/frontend
npm ci            # 严格按 lock 安装，不改写 lock 文件
npm run build     # tsc -b && vite build；TS 报错就 STOP 报告，不要硬发
ls -lh dist/

# 先备份再替换（回滚就靠这份备份）
sudo rsync -a /var/www/admin/ /var/www/admin.bak/
sudo rsync -a --delete dist/ /var/www/admin/
sudo chown -R www-data:www-data /var/www/admin
```

校验服务器确实发了新 bundle（两行 hash 应相同）：

```bash
grep -o 'assets/index-[^"]*\.js' dist/index.html | head -1
curl -s https://www.kunzzgroup.com/ | grep -o 'assets/index-[^"]*\.js' | head -1
```

> 员工端症状提醒：部署后旧标签页仍跑旧 JS，需要 F5。

---

## 4. 上线后验证（照抄）

### 4.1 接口层（在 VPS 或本机都行）

```bash
# ① 新接口存在：无效令牌应返回 body code=401（HTTP 200），不是 404 / 500
curl -s -X POST https://www.kunzzgroup.com/api/auth/refresh \
  -H 'Content-Type: application/json' -d '{"deviceToken":"x"}' | head -c 200
# 期望：{"code":401,"message":"免登录已失效，请重新登入","data":null}

# ② 设备列表需要登录：未带 JWT 应 401
curl -s -o /dev/null -w "%{http_code}\n" https://www.kunzzgroup.com/api/auth/devices
# 期望：401

# ③ 表结构
sudo mariadb u690174784_kunzz -e "SHOW COLUMNS FROM user_devices;"
# 期望 10 列：id/user_id/token_hash/name/user_agent/ip/created_at_ms/last_seen_ms/expires_at_ms/revoked_at_ms
```

### 4.2 浏览器端（Chrome）

| # | 操作 | 期望 |
|---|---|---|
| 1 | `/login` 勾「记住我」登录 | 进 `/dashboard`；DevTools → Application → Local Storage 出现 `inv_token`、`inv_device_token`、`inv_device_id`、`inv_device_exp` |
| 2 | **完全关掉浏览器**再打开 → 直接访问 `https://www.kunzzgroup.com/dashboard` | 直接进后台（不出现登录页；最多闪一下「正在恢复登录状态…」） |
| 3 | 点官网「员工登录」 | 同样直接进 `/dashboard`（不再让输密码） |
| 4 | 侧边栏底部 →「登录设备」 | 列出当前设备（标「当前设备」），显示 IP / 最后活跃 / 有效期至 |
| 5 | 用另一个浏览器（或手机）同账号登录 | 设备列表出现第二台；在 A 撤销 B → B 下次刷新页面回登录页 |
| 6 | 撤销「当前设备」 | 立即回 `/login`；再访问 `/dashboard` 仍需密码 |
| 7 | 点「登出」 | 回 `/login`（**不再跳官网首页**），可直接换账号登录 |
| 8 | 不勾「记住我」登录，24h 后（或手动清 JWT） | 回登录页要密码（设备令牌不存在，符合预期） |

### 4.3 数据库旁证

```bash
sudo mariadb u690174784_kunzz -e \
 "SELECT id,user_id,name,ip,FROM_UNIXTIME(created_at_ms/1000) t,
         FROM_UNIXTIME(last_seen_ms/1000) seen, revoked_at_ms IS NOT NULL revoked
  FROM user_devices ORDER BY id DESC LIMIT 10;"
```

---

## 5. 回滚

| 层级 | 动作 |
|---|---|
| 后端 | 换回上一个 `app.jar.bak.*` 再 `systemctl restart inventory-backend` |
| 前端 | `sudo rsync -a /var/www/admin.bak/ /var/www/admin/` |
| 数据库 | `DROP TABLE IF EXISTS user_devices`（不影响其它表） |

```bash
# 只回滚后端（保留表）：换回上一个 jar 再重启
ls -lt /opt/inventory/app.jar.bak.* | head -3
cp -p /opt/inventory/app.jar.bak.<时间戳> /opt/inventory/app.jar
systemctl restart inventory-backend

# 彻底清掉本次数据（表可随时重建；不影响其它表）
sudo mariadb u690174784_kunzz -e "DROP TABLE IF EXISTS user_devices;"
```

降级行为：表在但后端是旧包 → 旧代码根本不会访问它，无影响；
后端是新包但表被删 → 登录照常，日志出现
`[记住设备] 设备令牌签发失败` 的 warning，「重启免密」与「登录设备」页失效。

---

## 6. 已知边界（不是 bug）

- **JWT 仍只 24 小时**：设备令牌只用来换新 JWT，长期凭据始终可撤销（`/devices` 页）。
- **未勾「记住我」**：JWT 存 `sessionStorage`（按标签页隔离）→ 新开标签页仍需登录，与改造前一致。
- **同一浏览器重复登录**不会堆设备行：登录请求带 `previousDeviceToken`，服务端先撤销旧行再发新行。
- **改密码不会踢设备**（只有「忘记密码重设」会撤销该账号全部设备）；要踢请在 `/devices` 撤销。
- 设备时间列是 **epoch 毫秒**，不随 JVM/数据库时区漂移；页面上按访问者本地时区显示。

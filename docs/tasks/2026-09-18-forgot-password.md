# 任务 2026-09-18-forgot-password

- 状态：进行中
- 开始时间：2026-09-18
- 分支：main
- 目标：把「忘记密码」从死链做成真功能 —— 邮箱收 6 位验证码 → 输入验证码 → 设新密码
- 白名单（只允许改这些文件）：
  - backend/src/main/java/com/kunzz/inventory/controller/AuthController.java
  - backend/src/main/java/com/kunzz/inventory/security/SecurityConfig.java
  - backend/src/main/java/com/kunzz/inventory/service/MailService.java
  - backend/src/main/java/com/kunzz/inventory/service/PasswordResetService.java
  - backend/src/main/java/com/kunzz/inventory/entity/EmailVerification.java
  - backend/src/main/java/com/kunzz/inventory/repository/EmailVerificationRepository.java
  - backend/src/main/java/com/kunzz/inventory/dto/ForgotPasswordRequest.java
  - backend/src/main/java/com/kunzz/inventory/dto/ResetPasswordRequest.java
  - inventory-system/frontend/src/pages/ForgotPassword.tsx
  - inventory-system/frontend/src/pages/Login.tsx
  - inventory-system/frontend/src/pages/MobileLogin.tsx
  - inventory-system/frontend/src/api/index.ts
  - inventory-system/frontend/src/App.tsx
  - docs/tasks/2026-09-18-forgot-password.md
  - docs/tasks/README.md
- 明确不碰：
  - backend/static/**
  - backend/target/**
  - inventory-system/frontend/package-lock.json
  - database/**
  - add_new_tables.sql
  - CHANGELOG.md
  - README.md
  - AGENTS.md
  - .gitignore
  - .githooks/**
  - website/**
  - 其它任何页面、控制器、服务

## 各文件改了什么

后端（新增 5 个 / 改 3 个）：

| 文件 | 改动 |
|---|---|
| `entity/EmailVerification.java` | 新增：映射老库 `email_verification` 表（email 主键 / code / expires_at）|
| `repository/EmailVerificationRepository.java` | 新增：JPA 仓储 |
| `dto/ForgotPasswordRequest.java` | 新增：`{ email }` + 格式校验 |
| `dto/ResetPasswordRequest.java` | 新增：`{ email, code, newPassword }`，code 限 6 位数字 |
| `service/PasswordResetService.java` | 新增：验证码签发/校验 + 三项限制（有效期 / 发送频率 / 错误次数）|
| `service/MailService.java` | 只追加 `sendResetCodeEmail()`，**没动** `sendWelcomeEmail()` |
| `controller/AuthController.java` | 只追加 `POST /forgot-password`、`POST /reset-password` 两个方法 |
| `security/SecurityConfig.java` | permitAll 白名单加这两条路径（其余一字未动）|

前端（新增 1 个 / 改 4 个）：

| 文件 | 改动 |
|---|---|
| `pages/ForgotPassword.tsx` | 新增：两步表单（邮箱 → 验证码+新密码），带 60 秒重发倒计时 |
| `api/index.ts` | 只追加 `forgotPassword` / `resetPassword` 两个封装 |
| `App.tsx` | 只加 `/forgot-password` 公开路由（无需登录）|
| `pages/Login.tsx` | 第 74 行死链 → `navigate('/forgot-password')` |
| `pages/MobileLogin.tsx` | 第 137 行同样接线（电话版前台也会忘记密码）|

## 关键设计决定

### 1. 复用老库 `email_verification` 表，但**不改表结构**

老表三列正好够用（`email` 主键 / `code` / `expires_at`），三项限制都不需要加列：

| 要求 | 做法 |
|---|---|
| 验证码有效期 | `expires_at`（写入恒为 now + 10 分钟）|
| 同邮箱发送频率 | **从 `expires_at` 反推签发时刻**（签发时刻 ≡ `expires_at - 10分钟`，本表只有本服务在写），不足 60 秒 → 拒绝并提示还需等几秒 |
| 错误次数上限 | 内存计数，同邮箱连错 5 次 → **直接删行作废验证码**，必须重新申请 |

为什么错误次数放内存：本仓库已有同样先例（`AuthController.login` 的「15 分钟 5 次」就是内存 Map），
单容器部署下足够——攻击者控制不了服务端进程，重启不了计数。
**不加列 = 生产零迁移**：部署时不需要在 VPS 上跑任何 SQL，少一个出错环节。

### 2. 未注册邮箱返回明确错误（而不是静默成功）

标准做法是「无论邮箱是否存在都返回成功」以防账号枚举。这里**故意反着来**：这是内部员工系统，
知道「某邮箱存在」也偷不到账号（验证码发到邮箱里），但静默成功会让员工干等、然后来问老板。
要改成防枚举，只需把 `PasswordResetService.requestCode()` 里那一处 `BusinessException` 换成直接 `return`。

### 3. 重设成功后清 `is_first_login`

用户已经设了自己知道的密码，下次登录不应再被要求改密码。

### 4. 刻意不给 `PasswordResetService` 加 `@Transactional`（**踩过的坑**）

第一版给 `resetPassword()` 加了 `@Transactional`，本地实测发现：
「连错 5 次 → 删掉验证码 → 抛业务异常」这串操作里，**异常把删除一起回滚了**，
验证码在库里原地复活，作废提示形同虚设——攻击者连错 5 次后还能继续拿同一个验证码猜（次数上限失效）。
改成「不加事务、先删验证码再改密码」后实测确认：连错 5 次后即使输对验证码也会被拒。

## 本地验证（2026-09-18，全部通过）

环境：本机 MariaDB 10.4.32（`C:\kunzz-mariadb-data`）+ 新构建的 jar + 本地假 SMTP 收信 +
Vite 开发服务器 + 真实浏览器操作。

| 场景 | 结果 |
|---|---|
| 完整正常流程（申请 → 收信 → 改密码 → 新密码登入）| 通过；邮件里的验证码与库里一致 |
| 未注册邮箱 | 明确报错 |
| 60 秒内重发 | 429 + 剩余秒数；等过 60 秒后可发 |
| 验证码过期 | 提示过期、清掉该行、密码未变 |
| 连错 5 次 | 第 5 次作废验证码；之后**输对也被拒**（修 bug 后）|
| 参数校验（短密码 / 验证码格式）| 拦下且不消耗错误次数 |
| 同 IP 每小时 10 次 | 第 11 次被拦；被冷却挡下的重发不占配额 |
| 浏览器 UI | 页面渲染、倒计时、成功提示、跳回登录页、用新密码登入进 dashboard 全部正常 |

## 待用户在生产环境执行

1. `git pull --ff-only` → `mvn package` → 重启后端（VPS_DEPLOY 第 1.4 节）
2. `npm run build` → rsync 到 `/var/www/admin/`（第 1.5 节）
3. **不需要**动数据库、**不需要**动 `/etc/inventory-backend.env`（SMTP_* 已经在了）

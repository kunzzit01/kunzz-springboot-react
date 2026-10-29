# 任务 2026-10-28-remember-device

- 状态：已完成（后端+前端已改完，javac / tsc 均通过；**DDL 需在数据库执行一次**）
- 分支：main
- 目标：「记住我」改为 WhatsApp 式「记住这台设备」——
  1. 勾选后**重启电脑/关掉浏览器 90 天内**打开 `https://www.kunzzgroup.com/dashboard`
     （或点「员工登录」）直接进后台，不再输密码；每次使用自动续期。
  2. 新增「登录设备」页面（`/devices`）：列出已记住的设备，可**逐个撤销** / 一键撤销其它设备。
  3. 登出 = 撤销本机设备令牌 + 回登录页（方便换账号）。

## 白名单（只允许改这些）

### 后端
- `backend/src/main/java/com/kunzz/inventory/entity/UserDevice.java`（新）
- `backend/src/main/java/com/kunzz/inventory/repository/UserDeviceRepository.java`（新）
- `backend/src/main/java/com/kunzz/inventory/service/DeviceTokenService.java`（新）
- `backend/src/main/java/com/kunzz/inventory/dto/LoginRequest.java`
- `backend/src/main/java/com/kunzz/inventory/dto/LoginResponse.java`
- `backend/src/main/java/com/kunzz/inventory/dto/DeviceVO.java`（新）
- `backend/src/main/java/com/kunzz/inventory/dto/DeviceTokenRequest.java`（新）
- `backend/src/main/java/com/kunzz/inventory/service/AuthService.java`
- `backend/src/main/java/com/kunzz/inventory/service/PasswordResetService.java`（重设密码后撤销该账号全部设备）
- `backend/src/main/java/com/kunzz/inventory/controller/AuthController.java`
- `backend/src/main/java/com/kunzz/inventory/security/SecurityConfig.java`
- `backend/src/main/resources/application.yml`

### 前端
- `inventory-system/frontend/src/utils/authToken.ts`
- `inventory-system/frontend/src/utils/authSession.ts`（新）
- `inventory-system/frontend/src/api/http.ts`
- `inventory-system/frontend/src/api/index.ts`
- `inventory-system/frontend/src/types.ts`
- `inventory-system/frontend/src/App.tsx`
- `inventory-system/frontend/src/components/AppLayout.tsx`
- `inventory-system/frontend/src/pages/Login.tsx`
- `inventory-system/frontend/src/pages/MobileLogin.tsx`
- `inventory-system/frontend/src/pages/ChangePassword.tsx`
- `inventory-system/frontend/src/pages/Devices.tsx`（新）
- `inventory-system/frontend/src/utils/useMobileAccess.tsx`
- `inventory-system/frontend/src/styles/sidebar.css`

### 其它
- `add_new_tables_user_devices.sql`（新，DDL 需在数据库手工执行一次）
- `docs/tasks/2026-10-28-remember-device.md`（本文件）
- `CHANGELOG.md`（只追加）

## 明确不碰

- `database/**`（工作区里 `database/u690174784_kunzz.sql` 是别人的改动，全程不动）
- `CHANGELOG.md` 老行（只追加）
- `backend/static/**`、`backend/target/**`（另建产物，由发布步骤统一处理）

## 设计要点

- 设备令牌：32 字节 SecureRandom → base64url（明文只返回一次），库里只存 SHA-256 十六进制，泄库不可反推。
- 时间全部用 **epoch 毫秒**（BIGINT）存，避开「JVM 时区 vs 数据库 +8」漂移；前端按本地时区显示。
- 有效期 90 天滚动：每次 refresh 把 `expires_at_ms` 续到 now+90d。JWT 仍 24h（不变），
  过期时前端用设备令牌静默换新 JWT —— 用户无感。
- 登出只撤销**本机**设备令牌（其它设备不受影响）；撤销其它设备在 `/devices` 页。
- 设备令牌表缺失时后端降级：登录照常，只返回普通 JWT（日志 warning），不会把用户挡在门外。

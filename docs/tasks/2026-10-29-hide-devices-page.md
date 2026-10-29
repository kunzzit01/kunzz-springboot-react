# 任务 2026-10-29-hide-devices-page

- 状态：已完成
- 分支：main
- 起因：「记住我」上线后新增的 `/devices`「登录设备」页，老板要求**不要让员工看到**。
  选择方案：**彻底下线这个页**（入口 + 路由 + 页面 + 相关 CSS/API 一起删），不是权限隐藏。

## 白名单（只允许改这些）

- `inventory-system/frontend/src/App.tsx`（删 `/devices` 路由与 import）
- `inventory-system/frontend/src/components/AppLayout.tsx`（删侧边栏底部「登录设备」按钮）
- `inventory-system/frontend/src/styles/sidebar.css`（删 `.devices-btn` 两组样式）
- `inventory-system/frontend/src/api/index.ts`（删 getDevices/revokeDevice/revokeOtherDevices）
- `inventory-system/frontend/src/types.ts`（删 DeviceItem）
- `inventory-system/frontend/src/pages/Devices.tsx`（删除文件）
- `docs/DEPLOY_2026-10-28-remember-device.md`（验收步骤同步：页面已下线）
- `docs/tasks/2026-10-29-hide-devices-page.md`（本文件）
- `CHANGELOG.md`（只追加）

## 明确不碰

- 后端 `AuthController` / `DeviceTokenService` / `UserDevice`：**保留**。
  「记住我 → 90 天免密进入」的核心逻辑不变；`/api/auth/devices` 接口虽然前端不再调用，
  但仍需登录、只返回本人设备，保留是为了以后要恢复管理页时不用重写后端。
- `database/**`（工作区里 `database/u690174784_kunzz.sql` 是别人的改动，全程不动）

## 影响

- 员工侧边栏底部只剩「登出」→ 回登录页换账号。
- 要踢掉一台设备：在那台设备上点「登出」；或走「忘记密码重设」（会撤销该账号**全部**设备）。
- 恢复方式：从 git 历史还原 `pages/Devices.tsx` + App.tsx 路由 + AppLayout 入口 + CSS/API（本任务的反向提交）。

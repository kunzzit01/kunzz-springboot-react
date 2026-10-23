# 任务 2026-10-23-keep-login

- 需求：「记住我」变成真正的「保持登录」语义
  - 勾选   → token 存 localStorage（关掉浏览器再开仍登录）
  - 未勾选 → token 存 sessionStorage（关掉浏览器即退出，下次要重新登录）
- 改动：
  - 新增 `src/utils/authToken.ts`：`getToken / hasToken / setToken(token, remember) / clearToken`
  - 所有读写点统一走它（不再直接 `localStorage.getItem('inv_token')`）：
    `api/http.ts`（请求头 + 401 清理）、`App.tsx`（两处路由守卫 + 权限守卫）、
    `components/AppLayout.tsx`（登出）、`pages/ChangePassword.tsx`、
    `pages/Login.tsx`（写入）、`pages/MobileLogin.tsx`（写入 + 切换账号）、
    `utils/useMobileAccess.tsx`（手机登出）
- 已知取舍：sessionStorage 是**按标签页**隔离的 —— 未勾选登录后新开一个标签页仍需重新登录。
- 白名单：上述 8 个前端文件 + docs/tasks/2026-10-23-keep-login.md + CHANGELOG.md
- 明确不碰：后端、nginx、数据库、data/uploads、backend/static

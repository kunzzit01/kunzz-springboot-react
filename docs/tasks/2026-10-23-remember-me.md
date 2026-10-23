# 任务 2026-10-23-remember-me

- 症状：登录页勾选「记住我」没有任何效果（下次打开账号没有回填、复选框也没勾选）。
- 根因：`pages/Login.tsx` 只**写** `localStorage.inv_remember`，**从来没人读**：
  - 用户名初值写死 `''`
  - 复选框初值写死 `false`
  （手机版 `MobileLogin.tsx` 是读了 `inv_remember` 的，所以手机端表现正常，桌面端不正常。）
- 改动：`pages/Login.tsx` 两个初值改为从 `inv_remember` 读：
  - `useState(() => localStorage.getItem('inv_remember') || '')`
  - `useState(() => !!localStorage.getItem('inv_remember'))`
- 说明：JWT 有效期由后端 `jwt.expiration=86400`（24h）决定，所以「记住我」的实际含义是
  「记住账号 + 保持勾选」；token 本身一直存在 localStorage（未勾选也不会更早退出）。
  若希望「未勾选 = 关浏览器即退出」，需要把 token 改存 sessionStorage（另开任务，涉及 6 处读写）。
- 白名单：`inventory-system/frontend/src/pages/Login.tsx` + docs/tasks/2026-10-23-remember-me.md + CHANGELOG.md
- 明确不碰：后端、nginx、数据库、data/uploads、backend/static

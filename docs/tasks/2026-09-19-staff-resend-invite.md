# 任务 2026-09-19-staff-resend-invite

- 状态：已完成（2026-09-19 19:40）
- 开始时间：2026-09-19 19:40
- 分支：main
- 目标：加「重发登录邮件」——邮件没送到（SMTP 故障 / Gmail 配额超限）时，
  管理员在职员管理里点一下就把**新的临时密码**补发到该职员邮箱，不用再手工把申请码+临时密码念给新人
- 背景：用户明确「我不要注册」（不注册任何新的发信服务），且现有的「忘记密码」也要靠邮件，
  所以邮件不通的窗口里，新人丢了临时密码就彻底进不来 —— 这个按钮同时补上这个洞
- 白名单（只允许改这些文件）：
  - backend/src/main/java/com/kunzz/inventory/service/StaffService.java
  - backend/src/main/java/com/kunzz/inventory/controller/StaffController.java
  - inventory-system/frontend/src/pages/Staff.tsx
  - inventory-system/frontend/src/api/index.ts
  - docs/tasks/2026-09-19-staff-resend-invite.md
  - docs/tasks/README.md
- 明确不碰：数据库结构、MailService、application.yml、构建产物、其它页面

## 做法

- 后端 `StaffService.resendWelcome(id)`：生成新的 10 位强密码 → `passwordEncoder` 加密 →
  `is_first_login=1` → 复用 `staffMapper.updateUser`（动态 SQL 已支持 password / is_first_login）
  → `mailService.sendWelcomeEmail(...)`；返回 `{ user, defaultPassword, emailSent }`
  （邮件仍失败时把新临时密码返回给管理员手动转告，与创建流程一致）
- 后端 `POST /api/staff/{id}/resend-welcome`
- 前端：职员管理操作列加一个「重发登录邮件」按钮（纸飞机图标），
  带确认框说清「旧密码立刻作废」；成功提示「登录信息已重新发送到 …」，
  失败则照创建流程的样式把新临时密码打在提示里
- 没有邮箱的职员：前端先拦（提示），后端也拦（400）

## 实测结果（本地，假 SMTP + 9/18 生产数据副本）

| 场景 | 结果 |
|---|---|
| `POST /api/staff/23/resend-welcome`（用有 hr 权限的账号调） | HTTP 200，`emailSent=true` ✓ |
| 邮件内容 | `To: tangyeawkhoong@gmail.com`、主题「欢迎加入 Kunzz Group - 您的登录信息」、正文含新临时密码 ✓ |
| 新临时密码能否登录 | `POST /api/auth/login` 用新密码 → `code:0` 并返回 token ✓（证明密码确实被改写且 hash 正确） |
| 邮件发不出去时（直接停掉假 SMTP） | 接口仍 HTTP 200，`emailSent=false` 且返回 `defaultPassword`（管理员可手动转告）✓ |
| 权限 | 无 `hr` 页面权限的账号调用 → 403「无权限执行此操作（页面权限已关闭）」✓（现有 `PagePermissionInterceptor` 自动覆盖 `/api/staff/**`） |
| 前端 | `npm run build` 通过 ✓ |

## 顺带发现（本次未改，待用户决定）

`/api/staff`（列表/创建/更新）返回的 `user` 对象里**带着 password 的 bcrypt 哈希**（实体 `User.password` 没有 `@JsonIgnore`），
属于旧代码一直以来的行为 —— 建议后续给该字段加 `@JsonIgnore` 挡掉（需新增文件 `entity/User.java` 到白名单）。

## 当日撤除（2026-09-19 21:15）

用户要求「把那个发送临时密码的按键和功能全部去除」→ 本功能已**整体移除**
（前端按钮 + `api/index.ts` 封装 + 后端端点 + Service 方法），见任务 `2026-09-19-remove-resend-invite`。
git 历史里仍保留完整实现（提交 5347f18），需要时可以取回。

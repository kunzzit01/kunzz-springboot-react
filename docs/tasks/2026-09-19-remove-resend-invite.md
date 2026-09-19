# 任务 2026-09-19-remove-resend-invite

- 状态：已完成（2026-09-19 21:15）
- 开始时间：2026-09-19 21:10
- 分支：main
- 目标：按用户要求，把今天新增的「重发登录邮件」按钮与功能**全部移除**
  （用户原话：「你把那个发送临时密码的按键和功能全部去除」；截图为职员管理操作列的蓝色纸飞机按钮）
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/Staff.tsx
  - inventory-system/frontend/src/api/index.ts
  - backend/src/main/java/com/kunzz/inventory/controller/StaffController.java
  - backend/src/main/java/com/kunzz/inventory/service/StaffService.java
  - docs/tasks/2026-09-19-remove-resend-invite.md
  - docs/tasks/2026-09-19-staff-resend-invite.md（追加一行"当日已按用户要求移除"）
  - docs/tasks/README.md
- 明确不碰：数据库结构、`MailService`、`application.yml`、其它页面、构建产物
- 备注：只移除「重发」这一处；**添加职员时自动发欢迎邮件**的行为保持不变（那是另一处，用户未提出）

## 移除清单（= 5347f18 的反向操作）

| 位置 | 移除内容 |
|---|---|
| `inventory-system/frontend/src/pages/Staff.tsx` | 操作列的蓝色纸飞机按钮、`resendWelcome()` 处理函数、import 里的 `resendStaffWelcome` |
| `inventory-system/frontend/src/api/index.ts` | `ResendWelcomeResult` 接口与 `resendStaffWelcome()` |
| `backend/.../controller/StaffController.java` | `POST /api/staff/{id}/resend-welcome` |
| `backend/.../service/StaffService.java` | `resendWelcome(Integer id)` 方法 |

## 验证

1. 后端 `mvn -DskipTests package` 编译通过（且没有残留引用）✓
2. 前端 `npm run build` 通过（无未使用变量/类型错误）✓
3. `grep -rn "resendWelcome|resendStaffWelcome|resend-welcome|重发登录邮件"` 在 `backend/src` 与 `frontend/src` 无残留 ✓
4. 实机验证：起后端后
   - `POST /api/staff/23/resend-welcome` → **HTTP 404**（端点确实没了）✓
   - `GET /api/staff` → **HTTP 200**（原有接口不受影响）✓
   - 删掉该端点后服务正常启动、退出 ✓

## 影响说明（给用户）

- 「重发登录邮件」按钮消失，后端接口也一并删掉；**添加职员时自动发欢迎邮件的行为不变**
- 好处：Gmail 锁定期内少一个会触发发信的入口（避免误点导致锁定期重新计时）

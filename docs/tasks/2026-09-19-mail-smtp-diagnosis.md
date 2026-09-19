# 任务 2026-09-19-mail-smtp-diagnosis

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：把「添加职员后收不到临时密码邮件」的诊断做清楚（根因在 VPS 的 SMTP 配置，代码侧补足可诊断性）
- 白名单（只允许改这些文件）：
  - backend/src/main/java/com/kunzz/inventory/service/MailService.java
  - inventory-system/frontend/src/pages/Staff.tsx
  - inventory-system/frontend/src/pages/AddEmployee.tsx
  - docs/tasks/2026-09-19-mail-smtp-diagnosis.md
  - docs/tasks/README.md
- 明确不碰：数据库、其它页面、CHANGELOG.md、构建产物

## 用户报

"我添加职员 保存职员后 我该收到临时密码的 email 并没有收到"

## 根因（不是"没收到"，是**从来没发出去**）

`docs/VPS_DEPLOY_2026-09-17-vps-deploy.md` 第 45 行 + 第 481 行的"修正 #9"：

> **`SMTP_PASS` 先留空**（旧 Gmail 应用密码已泄露进公开仓库）—— 留空只是发信失败

`/etc/inventory-backend.env` 里 `SMTP_PASS=` 是**故意空着**的（等用户去 Google 撤销旧应用密码、重新生成）。
于是 `MailService.sendWelcomeEmail` 每次都抛 `Authentication failed`，被 catch 住 → `emailSent=false`
→ 前端弹的是**回退提示**（直接把申请码 + 临时密码打在 toast 里，让管理员手动转告）。

**本地复现（两种都跑过）**：

| 环境 | 结果 |
|---|---|
| `SMTP_PASS` 为空（= VPS 现状） | `emailSent=False`；日志 `[MailService] 欢迎邮件发送失败 email=…: Authentication failed` ✓ |
| 指向本地假 SMTP + 随便一个密码 | `emailSent=True`，邮件（含临时密码）完整收到 ✓ |

→ **代码链路是好的**，问题 100% 在 VPS 的 SMTP 凭据；而且**忘记密码功能的验证码邮件同样发不出去**
（同一个 `SMTP_PASS`）—— 这解释了为什么登录页那个链接现在写的是"联系管理员"。

## 本次代码侧改什么（只提升可诊断性）

1. `MailService`：失败日志带上异常类型 + **根因**（JavaMail 常把真正原因包在 cause 里），
   并直接点出"检查 SMTP_PASS"，省得下次又靠猜
2. 前端（`Staff.tsx` / `AddEmployee.tsx`）：邮件没发出去时，提示里**明说"邮件发送失败"**，
   而不是只给申请码/临时密码（原来的文案让人以为是正常的）

## 实测（改完之后）

用**真实 Gmail + 空密码**（= VPS 现状）再添加一个测试职员，新日志一眼就能看出问题：

```
[MailService] 欢迎邮件发送失败 email=zztest3@example.com —— 请确认服务器环境变量 SMTP_PASS（Gmail 应用密码）已配置且未失效；
MailAuthenticationException: Authentication failed（根因 AuthenticationFailedException: 535-5.7.8 Username and Password not accepted…）
```

（旧代码只打 `Authentication failed` 一句，看不出是"没配"还是"密码失效"；现在直接把 SMTP_PASS 点名 + 带上 Gmail 的原始拒绝原因。）

前端提示也改成：`⚠ 邮件发送失败（服务器 SMTP_PASS 未配置或已失效）——请手动告知：申请码 XXX，临时密码 YYY`

## 待用户在生产环境执行（真正修邮件）

1. Google 账号 `kunzzsup@gmail.com` → 安全性 → 两步验证（必须开）→ **应用密码**：
   先把旧的**撤销**（已泄露），再生成一个新的（名字随便，如 Kunzz System）
2. VPS 上填进环境文件并重启：
   ```bash
   sudo nano /etc/inventory-backend.env      # SMTP_PASS=  后面粘贴新密码（16 位，Google 显示带空格，去掉空格）
   sudo systemctl restart inventory-backend
   ```
3. 验证：再添加一个测试职员 → 提示应该是「登录信息已发送到 …」；
   或看日志 `sudo journalctl -u inventory-backend -n 50 | grep MailService`（修好后不再有 Authentication failed）

# 任务 2026-09-19-mail-provider-switch

- 状态：进行中
- 开始时间：2026-09-19 19:20
- 分支：main
- 目标：Gmail 账号 `kunzzsup@gmail.com` 报 `550-5.4.5 Daily user sending limit exceeded`（发信配额超限）
  → 把代码改成「换任何第三方发信服务商只需改环境变量」，并把失败提示按真实原因区分（不再一律甩锅 SMTP_PASS）
- 白名单（只允许改这些文件）：
  - backend/src/main/resources/application.yml
  - backend/src/main/java/com/kunzz/inventory/service/MailService.java
  - inventory-system/frontend/src/pages/Staff.tsx
  - inventory-system/frontend/src/pages/AddEmployee.tsx
  - docs/tasks/2026-09-19-mail-provider-switch.md
  - docs/tasks/README.md
  - CHANGELOG.md
- 明确不碰：数据库、其它页面、构建产物（backend/static/**、backend/target/*.jar）、docs/tasks/2026-09-18-per-system-delete-cleanup.md
- 已知并行脏文件（不动）：`docs/tasks/2026-09-18-per-system-delete-cleanup.md`、`backend/target/inventory-backend-1.0.0.jar`

## 用户报

「还是不行欸」（添加职员后仍然提示邮件发送失败）→ VPS 上 5 项自查输出：

| 自查项 | 结果 | 说明 |
|---|---|---|
| ① 服务启动时间 | `Sat 2026-09-19 18:54:16` | 重启已生效（18:43 那条是重启前的旧进程）✓ |
| ② `systemctl show -p Environment` 里的 SMTP_PASS | 空 | **正常**：EnvironmentFile 的内容本来就不会显示在这个命令里，不是没配上 |
| ③ env 文件里的值 | `SMTP_PASS=udop****` | 文件写对了 ✓ |
| ④ 发信报错 | `550-5.4.5 Daily user sending limit exceeded` | **真正的问题** |
| ⑤ VPS 直连 Gmail 登录 | ✓ 成功 | 网络通、密码有效 ✓ |

## 根因

**认证已经成功，是 Gmail 拒绝投递**：免费 Gmail 账号有每日发信上限（约 500 个收件人/天，SMTP 同算），
超了之后 Google 对**所有** SMTP 发信回 `550-5.4.5`，直到配额重置（通常 24 小时内）。
可能的两个来源（都不是本系统的代码问题——本系统一天只在这两处发信：
`StaffService` 添加职员时 1 封、`PasswordResetService` 忘记密码时 1 封，无任何定时任务）：

1. 这个 Gmail 账号还被别的东西用来发信（旧 PHP 系统 `kunzzgroup-main` 用的是同一个账号的应用密码），
   两边共享同一个每日配额；
2. 旧的 16 位应用密码曾泄露到公开 GitHub（GitGuardian 报警那次），Google 可能已给该账号
   加了"可疑活动"限制 —— 这种限制**等配额重置也不一定恢复**。

## 本次代码侧改什么（不改发信逻辑，只让它「换个服务商就能跑」+「报错说得准」）

1. `application.yml`：
   - 新增 `app.mail.from`（环境变量 `MAIL_FROM`，默认仍 = SMTP 登录名）——
     第三方服务商的 **SMTP 登录名 ≠ 发件地址**（例如 Brevo 登录名是 `xxx@smtp-brevo.com`，
     发件人得是已验证的 `noreply@kunzzgroup.com`），没有这个开关就只能改代码
   - TLS 改成可切换：`SMTP_STARTTLS`（默认 true，587 用）/ `SMTP_SSL`（默认 false，465 用）——
     有些服务商只给 465，不切换就会握手失败
2. `MailService`：
   - 发件人改读 `app.mail.from`
   - 启动日志的配置摘要里多打一项「发件人=」
   - 失败日志按**真实原因**给建议：`5.4.5 / sending limit` → 配额用完（等重置或换服务商）；
     `535 / Authentication` → 账号密码问题；其它 → 原样打异常
3. 前端 `Staff.tsx` / `AddEmployee.tsx`：兜底提示去掉「SMTP_PASS 未配置或已失效」这个**错误归因**
   （这次就是它把人带偏的），改成中性的「服务器发信异常」

## 验证

- 后端：本地起假 SMTP（`fake_smtp.py`）→ `SMTP_HOST=127.0.0.1 SMTP_PORT=2525 MAIL_FROM=noreply@kunzzgroup.com`
  → 添加职员返回 `emailSent=true`，`maildrop.txt` 里 `From:` 是 `noreply@kunzzgroup.com`（证明 MAIL_FROM 生效）
- 回归：不设 `MAIL_FROM` 时 `From:` 仍是 SMTP 登录名（默认行为未变）
- 编译：`mvn -DskipTests package` 通过

## 部署提示（给用户）

换服务商不需要改代码、不需要重新构建：只改 `/etc/inventory-backend.env` 里那几行 + 重启。

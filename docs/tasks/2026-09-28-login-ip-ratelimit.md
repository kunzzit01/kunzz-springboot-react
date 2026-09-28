# 任务 2026-09-28-login-ip-ratelimit

- 状态：进行中
- 背景（用户实测）：一台设备连续登录失败被拦后，**换一台设备同样被拦**。
- 根因（已实证，代码级）：
  1. 拦截来源是 `AuthController` 的登录限速（5 次失败/15 分钟 → 锁定 15 分钟，提示「登录尝试过多，请约 N
     分钟后再试」），**键 = 客户端 IP**，不是设备：同一 wifi / 同一 NAT / 同一运营商 CGNAT 下的所有设备
     共用一个计数桶和一个封锁标记；封锁检查在鉴权之前，锁定期内**正确密码也进不去**。
     新系统是 JWT 无状态（`SecurityConfig` STATELESS），全仓没有任何 session/device 维度的门槛。
  2. 键值取自 `X-Forwarded-For` 的第一个元素，而生产 nginx 用 `$proxy_add_x_forwarded_for`（追加语义，
     客户端自带的头留在最前面，`docs/OPS.md:167`、VPS_DEPLOY:646、PRODUCTION_AUDIT:490、nginx-ec2.sh:64），
     仓库无 real_ip/可信代理配置 → 该键**可被伪造**：轮换假头即可无限猜密码（限速形同虚设），
     填上别人的 IP 即可定向锁死对方。
  3. 两个计数容器是裸 `ConcurrentHashMap`，键由请求方决定、过期条目从不回收 → 轮换假头可无限新增键
     → 堆内存耗尽（整站不可用）。忘记密码的 `ipRequests` 是同一模式。
- 用户决策：**限速按 IP 为准**（保持"一个出口 IP 一个桶"，不改为按账号锁定）。因此本次不改封锁语义
  （仍是 5 次/15 分钟、锁 15 分钟、锁定期内不放行正确密码），只修上面 2、3 两个真缺陷。
- 修法：
  1. 客户端 IP 只信 nginx 覆写的 `X-Real-IP`（`$remote_addr`，客户端给不出假值），且仅在直连方是本机/内网
     代理时才采用；否则退回 `getRemoteAddr()`。**不再读 XFF 第一个元素** → IP 不可伪造。
  2. 新增 `security/BoundedExpiryMap`（条数封顶 + 到期回收，插入顺序淘汰），登录失败计数、封锁标记、
     忘记密码 IP 计数三处全部换用 → 内存有界。
  3. 封锁/拒绝时打 `log.warn`（谁被锁、锁多久），便于事后定位"全公司被锁"这类运维事件。
- 白名单（本 task 只允许改这些）：
  - docs/tasks/2026-09-28-login-ip-ratelimit.md
  - backend/src/main/java/com/kunzz/inventory/security/BoundedExpiryMap.java
  - backend/src/main/java/com/kunzz/inventory/controller/AuthController.java
  - backend/src/main/java/com/kunzz/inventory/service/PasswordResetService.java
  - CHANGELOG.md
  - backend/target/inventory-backend-1.0.0.jar
- 明确不碰：inventory-system/frontend/**、backend/static/**、其它 task 的登记文件与脏文件、database/**
- 计划推送分支：main

> 白名单每行必须是纯路径（pre-commit 钩子按精确路径匹配，带说明文字会匹配不上）。
> 前端零改动：错误契约不变（HTTP 200 + body `code:429`），前端拦截器已能展示该 message；
> 改成真 HTTP 429 反而会让登录页静默无提示（`api/http.ts` 的 4xx 分支不弹窗）。

## 验证记录

1. 本机 `mvn -DskipTests package` 编译打包通过（见收尾记录）。
2. 逻辑复核：`clientIp()` 现在只在 `remoteAddr` 为本机/内网时才采用 `X-Real-IP`，公网直连（若 8081 被误暴露）
   伪造该头无效 → 退回 socket 对端地址。
3. 待用户部署后实测：同一网络第 6 次登录 → 429；换网络登录 → 不受影响；带假 `X-Forwarded-For` 连发
   6 次不再能绕过（改造前能绕过）。

## 部署提示

- 只改后端：Windows 部署机（跑仓库里的 jar）走 `更新系统.bat` / `git pull` 后重启后端；
  VPS 是 `git pull` 后自行 `mvn package` 重建 jar（VPS_DEPLOY 第 1101 行）。
- 内存态计数在重启后清零——被锁 15 分钟时重启后端即可立即解锁（改造前后一致）。

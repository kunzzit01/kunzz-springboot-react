# 任务 2026-09-28-login-ip-ratelimit

- 状态：已完成（源码 + jar 已提交并推送；待用户部署后实测线上）
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
  1. 客户端 IP 分三段取（目标：拿到的必须是「代理自己算出来的地址」，客户端伪造不出来）：
     ① 直连（socket 对端是公网地址）→ 用对端，忽略全部请求头；
     ② 反代链且 `X-Real-IP` 已是公网地址 → 用它（nginx 用 `$remote_addr` 覆写，客户端给不出假值）；
     ③ 反代链但 `X-Real-IP` 仍是内网地址 → 取 `X-Forwarded-For` **从右往左第一个公网地址**。
     绝不取 XFF 第一个元素（那是客户端自己发的，可伪造）。
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

## 生产入口链路（推 VPS 前查证，这段决定了修法 ③ 的存在）

```
客户端 ──443(TLS)──> Traefik ──TCP──> kunzz-bridge(alpine/socat) ──> nginx:8080 ──/api/──> 后端:8081
```

- socat 是纯 TCP 转发、不改请求头 → nginx 的 `$remote_addr` 以及它写给后端的 `X-Real-IP` 都是
  **转发容器的私网 IP**（VPS_DEPLOY 修订版步骤里的 `172.18.0.x` 网段）；真实客户端 IP 由 Traefik
  追加在 `X-Forwarded-For` 的最右，左边的内容是客户端自己发的（可伪造）。
- 若只信 `X-Real-IP`：**域名入口会把所有用户算成同一个 IP**（= 全公司共用 5 次额度，比不改还糟），
  直连入口反而正常。所以必须有第 ③ 段回落。
- 另一条入口 `http://187.127.125.136:8080/`（nginx 直接对外）：对端就是真实客户端公网 IP，走第 ① 段。
- 可选加固（不必需，代码已能自适应两种拓扑）：给 nginx 加
  `set_real_ip_from <转发容器网段>; real_ip_header X-Forwarded-For;` 让 `$remote_addr` 直接等于真实客户端，
  之后本代码会走第 ② 段，行为不变。

## 验证记录

1. `mvn -o -DskipTests compile` 通过；`mvn -o -DskipTests package` 打成 jar 通过（本机 Maven 在
   `~/tools/apache-maven-3.9.9`，不在 PATH 上；JDK 24 编译 release 21 正常）。
2. `BoundedExpiryMap` 行为测试 **9 项全过**：TTL 到期读取视为不存在并回收、条数封顶后 size 不超过上限、
   最旧条目被淘汰、重新写入同一键要挪到队尾、灌入 20 万个不同键仍被压在上限内（对照组裸
   ConcurrentHashMap 键数 = 20 万）。
3. 端到端 **15 项全过**（不依赖数据库：`new AuthController(只抛 401 的 AuthService 替身, null)` +
   `java.lang.reflect.Proxy` 伪造 `HttpServletRequest`，直接调真实 `controller.login()`）：
   - 入口① 直连（对端=公网）：A 每次轮换伪造 `X-Forwarded-For` → 仍按对端分桶、第 6 次 code=429
     （**改造前每次都是新桶 = 无限猜密码**）；D 伪造 `X-Real-IP` 无效；B 同出口 IP 第 6 次 429
     （用户实测现象语义保持）；B2 换真实出口 IP 不受该桶影响
   - 入口② 域名链（对端与 `X-Real-IP` 都是转发容器私网 IP `172.18.0.5`）：G 同一真实客户端每次伪造
     不同前缀 → 不换桶、第 6 次 429；H 另一个真实客户端不受影响；I 把受害者 IP 写进伪造前缀 →
     锁的是攻击者自己，I2 受害者 IP 仍可正常尝试（**定向锁死被堵**）；J nginx 直连反代
     （`X-Real-IP` 已是公网）按 `X-Real-IP` 分桶；K 整条链都是内网时兜底取最右一跳且稳定；M 无请求头不崩
   - 边界：N/N2 IPv6 回环（`::1` 与 `0:0:0:0:0:0:0:1` 展开写法）走反代分支；N3 非 IP 字面量的对端
     不被当成公网直连（也不会触发 DNS）；N4 公网 v6 对端按对端分桶
   - 日志如期输出：`[登录限速] IP x 连续失败 5 次，锁定 15 分钟（期间该出口 IP 的所有设备都无法登录）`
4. 验证脚手架放在仓库外（`%TEMP%/kunzz-rl/`：`LimitHarness.java` + 从 fat jar 的 `BOOT-INF/lib` 取出的依赖），
   不污染仓库、不需要 whitelist。
5. 待用户部署后实测：同一网络第 6 次登录 → 429；换网络登录 → 不受影响；带假 `X-Forwarded-For` 连发
   6 次不再能绕过（改造前能绕过）。

## 部署提示

- 只改后端：Windows 部署机（跑仓库里的 jar）走 `更新系统.bat` / `git pull` 后重启后端；
  VPS 是 `git pull` 后自行 `mvn package` 重建 jar（VPS_DEPLOY 第 1101 行）。
- 内存态计数在重启后清零——被锁 15 分钟时重启后端即可立即解锁（改造前后一致）。

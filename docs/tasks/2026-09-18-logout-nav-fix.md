# 任务 2026-09-18-logout-nav-fix

- 状态：已完成
- 开始时间：2026-09-18 ｜ 完成时间：2026-09-18
- 分支：main
- 目标：修掉「登出后回到后台登录页而不是官网首页」的问题，并让登录页的返回箭头指向官网首页

## 根因

nginx 里三个路径是三个不同的东西：

```
location /home/  → 官网（alias /var/www/website/）
location /       → 后台（root /var/www/admin）
location = /home → 不匹配上面任何一条 → 落进 location / → 后台 SPA ✗
```

`AppLayout.tsx` 的登出用的是裸 `window.location.href = '/home'`（**没有 onClick 能拦截**），
少了结尾斜杠，于是落到后台去了。

## 白名单（本任务只改这几个文件）

- inventory-system/frontend/src/components/AppLayout.tsx ← 登出目标 `/home` → `/home/`
- inventory-system/frontend/src/pages/Login.tsx ← 返回箭头改为固定跳 `/home/`；登录后默认落点改为 `/dashboard`
- inventory-system/frontend/src/App.tsx ← 新增 `/dashboard` 路由；`/` 索引路由改为重定向到 `/dashboard`
- 修复缓存.bat ← 新增：给员工双击用的「清 DNS 缓存 + 关浏览器 + 重开官网」一键脚本

> **追加 `修复缓存.bat` 的原因（2026-09-18）**：切域名后，员工的设备仍缓存着旧站的
> 页面与旧 IP（操作系统 DNS 缓存 + 浏览器自己的 host cache）。
> 服务端已无问题（Google DNS 全球已是新 IP，TTL 300），纯粹是设备级缓存，
> 所以提供一个一键脚本给非技术员工使用。

> **追加 App.tsx 的原因（2026-09-18）**：为切域名做准备，根路径要让给公司官网
> （现在 `kunzzgroup.com/` 会显示后台登录页，顾客看到的是登录框）。
> 让 SPA 的 `/` 索引路由重定向到 `/dashboard` 后，代码里其余 5 处 `navigate('/')`
> （BgMusic / ChangePassword / CorporateEdit / JobPositions）**无需逐个修改**，
> 都会自动落到 `/dashboard`，地址栏正确、F5 不会丢。

## 明确不碰

- website/** —— ⚠️ **曾怀疑官网 Header/Footer 的原生 `<a href="/">` 也是同类 bug，核查后确认不是**：
  它们全部带 `onClick` 且内部 `e.preventDefault()`，由 react-router 的 `navigate()`
  接管（`navigate` 会正确套用 `basename="/home"`），`href` 只是无 JS 时的兜底。
  **没有改动，避免把正常代码改坏。**
- backend/**、database/**、CHANGELOG.md、README.md、AGENTS.md、.gitignore、.githooks/**

## 变更内容

1. `AppLayout.tsx` 登出：`'/home'` → `'/home/'`（附注释说明斜杠不能省的原因）
2. `Login.tsx` 返回箭头：原来是「已登录→后台主页；否则 history.back()；无历史则无反应」，
   改为**始终整页跳到 `/home/`**（确定性行为，不依赖浏览器历史；官网是独立 SPA 必须整页跳）

## 待用户在生产环境执行

- 重新构建后台前端并 rsync 到 `/var/www/admin/`
- nginx 加防御性兜底 `location = /home { return 301 /home/; }`（任何路径写成 `/home` 都会被纠正）

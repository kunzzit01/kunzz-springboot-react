# 任务 2026-09-17-vps-deploy

- 状态：**已完成** —— Hostinger VPS 部署全流程通过（24 个 PHASE 全绿）
- 开始时间：2026-09-17 ｜ 完成时间：2026-09-17 23:45
- 分支：main
- 目标：把 KUNZZ（React 后台 + React 官网 + Spring Boot + MariaDB）部署到 Hostinger VPS，
  仅通过 `http://VPS_PUBLIC_IP` 测试 —— **已达成**

## 结果摘要

| 项 | 值 |
|---|---|
| VPS | Hostinger `srv1808383`，公网 `187.127.125.136` |
| 架构 | **Option B** —— 与机器上既有 18 个 Docker 容器共存，80/443 保持归 Traefik |
| 入口 | nginx `:8080` → 后台 `/`、官网 `/home/`、`/api` `/uploads` `/media` `/ws` → `127.0.0.1:8082` |
| 运行态 | 后端 `systemd` 常驻（`active`），MariaDB 10.11 本机，数据 70 对象 |
| 全程未触碰 | Traefik、18 个容器、`ufw`（保持 inactive）、DNS/Domain、旧 Live 数据库 |

## 白名单（本任务只碰这些文件）

- docs/tasks/2026-09-17-vps-deploy.md（本登记文件）
- docs/VPS_DEPLOY_2026-09-17-vps-deploy.md（部署手册 + **§2026-09-17 实际部署记录**）

> ⚠️ 运行期改动**全部在 VPS 上**（nginx 配置、systemd unit、环境变量），
> **不属于本仓库**，因此没有对应提交。

## 明确不碰（已遵守）

- backend/**、website/**、inventory-system/**（未修改任何 source code）
- database/**（未修改任何 SQL）
- CHANGELOG.md、README.md、AGENTS.md、.gitignore、.gitattributes、.githooks/**
- 现有部署脚本 deploy-ec2.sh / nginx-ec2.sh（只读参考）

## 待用户批准的事项（未执行）

1. 官网 `website/src/styles/index.css:861` 的 `背景3.jpg` → `背景3.webp`（源码改动）
2. 移除 `DataInitializer` 的 demo/demo123 自动创建（源码改动）
3. 换成 MariaDB JDBC driver 以根治 `HHH000511` 版本误读（pom.xml + 配置 + 回归）
4. 是否把本任务的文档提交并推送到 GitHub

## 备注

部署过程中踩到 5 个坑，全部记录在手册的 §实际部署记录 里（CRLF/LF 校验陷阱、
手输密码失败、端口被既有服务占用、官网绝对路径、Hibernate 版本误读），供下次复用。

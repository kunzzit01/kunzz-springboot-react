# 任务 2026-09-17-postdeploy-fixes

- 状态：**已完成** —— 三项修复均已提交推送并部署上 VPS，回归通过
- 开始时间：2026-09-17 23:50 ｜ 完成时间：2026-09-18
- 分支：main
- 目标：VPS 部署完成后，处理三项需要用户批准的修复（用户已明确同意全部执行）

## 白名单（只允许改这些文件）

- docs/tasks/2026-09-17-postdeploy-fixes.md（本登记文件）
- docs/VPS_DEPLOY_2026-09-17-vps-deploy.md（上一任务产出，本任务提交）
- docs/tasks/2026-09-17-vps-deploy.md（上一任务产出，本任务提交）
- website/src/styles/index.css ← 修正 `背景3.jpg` → `背景3.webp`（改 1 个字符）
- backend/src/main/java/com/kunzz/inventory/config/DataInitializer.java ← 演示账号改为可开关
- backend/pom.xml ← 引入 MariaDB 原生驱动
- backend/src/main/resources/application.yml ← 移除写死的 driver-class-name

## 明确不碰

- database/**（不改任何 SQL）
- CHANGELOG.md、README.md、AGENTS.md、.gitignore、.gitattributes、.githooks/**
- 所有 *.ps1 / *.bat / *.sh
- backend/static/**、backend/target/*.jar（本次不重新构建产物；VPS 上自行构建）

## 三项修复与取舍说明

1. **官网背景图 `.jpg` → `.webp`** —— `website/src/styles/index.css:861` 引用的
   `背景3.jpg` 在 `website/public/images/` 里不存在（只有 `.webp`），是源码里既有的笔误。
   修法是改一个字符，无行为风险。

2. **演示账号改为可开关，生产关闭** ——
   ⚠️ **没有直接删除 DataInitializer**，因为 `README.md` 把 `demo`/`demo123` 写成了
   本地一键启动（`http://localhost:8081`）的登录方式，直接删会让新克隆的人无法登录。
   改为 `@ConditionalOnProperty(name="app.init-demo", matchIfMissing=true)`：
   不设该变量时行为**与改动前完全一致**（本地开发不受影响），
   生产通过环境文件加 `APP_INIT_DEMO=false` 关闭。
   ⚠️ 关闭自动创建**不会删除库里已存在的 demo 账号**，该行需在生产库另行处置（见部署记录）。

3. **引入 MariaDB 原生驱动** —— 保留 `mysql-connector-j` 的同时加入
   `org.mariadb.jdbc:mariadb-java-client`，并**移除 application.yml 里写死的
   `driver-class-name`**，改由 `DB_URL` 的 scheme 自动选择：
   `jdbc:mysql://` → MySQL Connector/J；`jdbc:mariadb://` → MariaDB 驱动。
   这样切换/回退都只是**改一个环境变量**，且本地开发（用 `jdbc:mysql://`）行为不变。

## 待用户在生产环境执行（不属于本仓库）

- 环境文件加 `APP_INIT_DEMO=false`
- `DB_URL` 的 scheme 改为 `jdbc:mariadb://`（并去掉 MySQL 专有参数）
- 处置库里已存在的 `demo` 账号
- 重新构建 jar 并重启服务（验证驱动切换后无 `HHH000511`）

## 实际结果（2026-09-18 已验证）

| 项 | 结果 |
|---|---|
| 提交 | `79316dc` docs ／ `df6e687` 官网背景图 ／ `2f6f00f` demo 开关 ／ `2d28ab6` MariaDB 驱动 ／ `d317f15` 运维文档 |
| 部署 | VPS `git pull` → `mvn package` → 换 jar → 官网重建 → 环境变量两处 → 重启 |
| `HHH000511` | ✅ **消失**，日志 `Database version` 正确显示 10.11 |
| 官网 `背景3` | ✅ 背景图正常 |
| `demo` 账号 | ✅ 库中已改名 `demo_disabled` 并置无效密码，`SELECT` 计数为 0 |
| 回归 | ✅ 登录／总库存＋冰箱分类位次／进出货 47 条／官网／实时已连接 全部正常 |

⚠️ **重要运维提醒（已写入部署文档 §2.3）**：重新导入 dump 后，
① `demo` 账号会被 dump 带回来，需要重做库内封堵；
② 运行期图片文件与数据库记录可能对不上，需要同步 `/opt/inventory/uploads` 与 `data`。

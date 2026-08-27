# 📦 Kunzz 管理系统（React + Spring Boot 重制版）

原系统为 PHP 单体（kunzzgroup），本仓库将其完整重写为前后端分离架构，并**直接连接原 MariaDB 数据库**（历史数据 100% 保留，不迁移、不丢数据）。

## 🌐 两个前端 + 后端（与线上 kunzzgroup.com 完全一致）

| 项目 | 目录 | 端口 | 说明 |
| --- | --- | --- | --- |
| **官网** | `website/` | 5175 | 与线上 https://kunzzgroup.com 首页**源码一致**（线上首页就是本目录的 React 项目），含中英双语首页/关于/加入我们 + **东京日料官网**（/tokyo，原版 tokyo.css/app.js/图片 100% 搬运） |
| **后台管理** | `inventory-system/frontend/` | 5174 | 库存/出入库/分店/餐具/职员/招聘/排班/考核/菜单/KPI/价格/蓝图/媒体 等全部模块 |
| 后端 API | `backend/` | 8081 | Spring Boot 3 + MariaDB（老库直连），官网构建产物内嵌于 `backend/static/` |

**官网与后台联动**：后台「招聘职位」管理 → 官网「加入我们」实时展示（/api/jobs/website 兼容老 get_jobs_api.php 格式，按公司分组、中英分离）。


## ✨ 与老系统对比

| 项目 | 老系统（PHP） | 新系统（本仓库） |
| --- | --- | --- |
| 后端 | PHP 无框架，页面混写 SQL | Spring Boot 3 + JPA + MyBatis + JWT |
| 前端 | 服务端输出 HTML，多份重复副本 | React（官网 19 / 后台 18）+ Vite + TS + Ant Design |
| 数据 | MariaDB `u690174784_kunzz` | **同一个库，直连** |
| 无关模块 | 招聘/排班/评估/菜单/落地页/游戏（67 张表） | ❌ 全部废弃，只保留库存+餐具相关表 |
| 历史数据 | 出入库流水 26,222 条、台账 602 条、餐具 342 件 | ✅ 原样可用 |

## 🏗️ 技术栈

**后端**（`backend/pom.xml`）：
- Java 21 · Spring Boot 3.5 · **Spring Data JPA + MyBatis 混用**（12 个 Mapper XML 处理复杂报表/多表联查）
- Spring Security + JWT (jjwt) · **Spring WebSocket**（实时数据推送）
- **OpenPDF**（PDF 表单/发票生成）· **BouncyCastle**（兼容老库 bcrypt/argon2 密码）· Lombok · Maven
- Spring Validation · Spring Mail（SMTP 邮件）· MySQL Connector（直连 MariaDB）

**前端**：
- 官网（`website/`）：**React 19** · Vite 8 · react-router-dom 7 · Swiper 12（中英双语路由）
- 后台（`inventory-system/frontend/`）：**React 18** · TypeScript 5.6 · Vite 5 · **Ant Design 5** · axios · react-router-dom 6 · dayjs · flatpickr · jspdf + html2canvas（导出）· puppeteer-core（截图）

**数据库**：MariaDB（XAMPP 自带或仓库内置绿色版，端口 3306）

## 🚀 一键启动（本地开发）

### 方式 A：整文件夹拷贝（推荐，零配置）

> 将整个项目文件夹（含 `runtime/`、`database/`、`backend/target/`）复制到新电脑，双击根目录 **`一键启动.bat`** 即可。
> 无需安装 Java / Node / Maven / XAMPP。
> 首次运行自动完成：初始化内置 MariaDB → 导入 `database/` 数据包 → 启动后端（官网已内嵌在后端中）。

- 访问：**http://localhost:8081** （演示账号 demo / demo123）
- 退出：按回车或关闭窗口，自动停止后端和数据库
- 若电脑已装有 MySQL/MariaDB（如 XAMPP）且库 `u690174784_kunzz` 存在，脚本会直接复用，不启动内置库
- 相关文件：`一键启动.bat`（入口）、`start.ps1`（逻辑）

### 方式 B：GitHub 克隆（需先构建）

> `runtime/`、`database/`、`backend/target/` 均为本地文件，**不在本仓库内**。
> 克隆后运行 `一键启动.bat`：JRE 与 MariaDB 缺失时会**自动下载**，但 jar 与数据包不会自动生成，需手动准备：

```bash
cd backend
mvn -DskipTests package        # 生成 target/inventory-backend-1.0.0.jar
# 准备数据库：将你本地 database/u690174784_kunzz.sql 放入 database/（或手动导入 MySQL）
# 然后再双击 一键启动.bat
```

### 💾 备份数据（让新电脑装到最新数据）

> 双击 **`备份数据.bat`**：把当前在用的数据库（XAMPP 或内置库）完整导出，覆盖更新 `database/u690174784_kunzz.sql`。
> 日常改完数据后跑一次，再把整个文件夹复制给新电脑，新电脑首次启动就会导入最新数据。
> 自动保留最近 5 份历史快照（`database/backup_*.sql`）。

## 📁 目录结构

```
├── backend/                       # Spring Boot 后端（端口 8081）
│   ├── src/main/java/com/kunzz/inventory/
│   │   ├── entity/                # 53 个实体，映射老库库存/餐具/用户表
│   │   ├── repository/            # 42 个 Repository（JPA 动态查询）
│   │   ├── mapper/                # 12 个 MyBatis Mapper 接口
│   │   ├── service/               # 21 个 Service：台账/出入库/三店/供应商/餐具/仪表盘…
│   │   ├── controller/            # 20 个 REST Controller
│   │   ├── realtime/              # WebSocket 实时数据推送（配置/Handler/服务）
│   │   ├── security/              # JWT 认证（兼容老库 bcrypt/argon2 密码）
│   │   └── dto/ (21) common/ (3) config/ (2)
│   └── src/main/resources/
│       ├── mapper/*.xml           # 12 个 MyBatis XML（复杂报表 SQL）
│       └── application.yml
├── website/                       # 官网前端（端口 5175，React 19）
│   └── src/                       # 中英双语组件/pages/hooks + tokyo 日料官网
└── inventory-system/frontend/     # 后台管理前端（端口 5174，React 18 + AntD）
    └── src/
        ├── api/                   # axios 封装 + 接口函数
        ├── pages/                 # 看板/台账/出入库/分店/供应商/预警/餐具…
        ├── components/ utils/     # 组件 + 实时状态/发票导出等工具
        └── styles/ templates/
```

## 🚀 快速启动（源码开发）

> 依赖：JDK 21+、Node 18+、XAMPP（MariaDB 已在运行，root 无密码）

**第 0 步（仅首次）：导入老库备份**

将下载的 `u690174784_kunzz (1).zip` 解压得到 SQL，然后：

```bash
# 注意：备份含 MariaDB 11.8 专属排序规则 utf8mb4_uca1400_ai_ci，
# XAMPP 的 MariaDB 10.4 不认识，需先替换（本机已处理过则跳过）
sed -i 's/utf8mb4_uca1400_ai_ci/utf8mb4_unicode_ci/g' "u690174784_kunzz (1).sql"

/c/xampp/mysql/bin/mysql -u root -e "CREATE DATABASE IF NOT EXISTS u690174784_kunzz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
/c/xampp/mysql/bin/mysql -u root u690174784_kunzz < "u690174784_kunzz (1).sql"
```

**启动后端**

```bash
cd backend
mvn spring-boot:run        # 或 mvn -DskipTests package && java -jar target/inventory-backend-1.0.0.jar
```

**启动后台管理**

```bash
cd inventory-system/frontend
npm install
npm run dev                # 打开 http://localhost:5174
```

**启动官网**

```bash
cd website
npm install
npm run dev                # 打开 http://localhost:5175
```

## 🔑 登录账号

| 账号 | 密码 | 说明 |
| --- | --- | --- |
| demo | demo123 | 演示账号（首次启动自动创建，见 DataInitializer） |
| TANG YEAW KHOONG 等 | 老库原密码 | 老用户可直接登录（兼容 bcrypt/argon2id，BouncyCastle） |

## 🧩 功能模块

| 页面 | 说明 |
| --- | --- |
| 经营看板 | 台账数、今日出入库、低库存预警清单、餐具数、分店品项 |
| 库存台账 | 602 条历史记录，关键词/分类/供应商/日期筛选 + 分页 CRUD |
| 出入库管理 | 26,222 条流水，入库/出库登记、软删除、按店/类型/日期筛选；**快捷键操作（Ctrl+S 保存 / Ctrl+D 批量删除 / Ctrl+A 快速加行）+ 删除后 10 秒撤销条**；下拉选单对齐 live（货品带供应商、显示全部价格含库存不足标注） |
| 分店库存 | J1/J2/J3 合并汇总、单店调整库存、每日经营数据、每日成本；**中央出货改目标单位自动同步分店入库** |
| 供应商 | 20 家供应商 + 266 种物料管理 |
| 预警与异常 | 最低库存设置（分系统独立：中央/各分店各自维护，互不影响）、低库存比对、异常扣除记录 |
| 餐具管理 | 342 件碗碟信息/五地库存调整/套装及明细/破损/调拨 |
| 实时推送 | WebSocket 实时状态条（后端 realtime/ + 前端 useRealtime） |
| 票据/表单 | jspdf 发票导出、OpenPDF 后端 PDF 表单（backend/static/form/*.pdf） |
| 邮件通知 | SMTP 邮件（后台招聘/申请通知等，配置见 application.yml） |

### 与老系统一致的新增模块（按侧边栏顺序）

| 侧边栏 | 页面 | 说明 |
| --- | --- | --- |
| 集团架构 | 企业蓝图 | corporate_strategy.json 读写（公司概览 + 时间线） |
| 集团架构 | J1/J2/J3 排班 + 手机记录 | 员工排班日历（月视图、班次/假期类型）、按店手机记录 |
| 数据分析 | KPI 报表 / 数据上传 | J1/J2/J3 每日经营数据 + 每日成本按月报表与录入 |
| 人事管理 | 职员管理 | users 全字段 CRUD、注册码生成（application_codes）、权限树设置 |
| 人事管理 | 招聘列表 | job_positions 职位管理、job_applications 申请处理（角标统计） |
| 人事管理 | 问卷回答 | qna_responses 10 题问卷，**员工可填写/修改（提交后可重新填写，覆盖更新）** |
| 人事管理 | 考核表单 | 标准配置/评分标准/表单 + 7 项评分明细（MyBatis 报表） |
| 资源总库 | 库存子项 | 回收站（软删除恢复）、产品名称重命名、备注维护、**货品单价设定（stock_data.price，进货自动抓取；无单价显示 0.00）** |
| 资源总库 | 价格对比 | restaurants + restaurant_foods 食品价格对比 |
| 视觉管理 | 背景音乐/页面图片 | 文件上传管理、首页/关于/品牌/加入我们 10 个页面上传 |
| 视觉管理 | 菜单管理 | menu_categories/menus 分类菜单 + 菜单成本（配料/成本数据） |
| 权限系统 | user_sidebar_permissions / user_page_permissions | JSON 权限驱动侧边栏渲染与页面访问 |

## 🔌 API 概览（前缀 /api，除登录外需 Bearer Token）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /auth/login · GET /auth/me | 登录 / 当前用户 |
| GET·POST·PUT·DELETE | /stock/records | 库存台账分页 CRUD |
| GET·POST·PUT·DELETE | /stock/inout | 出入库分页 CRUD（删除=软删除） |
| GET·POST·PUT·DELETE | /stock/minimum | 最低库存设置 |
| GET·POST·PUT·DELETE | /stock/sot | 异常扣除 |
| GET·POST·PUT·DELETE | /categories | 公司分类 |
| GET·POST·PUT·DELETE | /suppliers · /suppliers/{id}/materials | 供应商与物料 |
| GET | /branches/merged-stock · /branches/{j1|j2|j3}/stock·daily·cost | 分店数据 |
| GET·POST·PUT·DELETE | /staff · /application-codes · /permissions | 职员 / 注册码 / 权限 |
| GET·POST·PUT·DELETE | /jobs · /applications | 招聘职位 / 求职申请 |
| GET·POST·DELETE | /qna · /evaluation/* | 问卷 / 考核 |
| GET·POST·PUT·DELETE | /schedule/* · /phone | 排班 / 手机记录 |
| GET·POST·PUT·DELETE | /menu/* · /menucost/* · /restaurants/* | 菜单 / 成本 / 价格对比 |
| GET·POST | /kpi/report · /kpi/daily · /kpi/cost | KPI 报表与数据上传 |
| GET·PUT | /corporate | 企业蓝图 |
| GET·POST·DELETE | /media/* | 媒体与页面图片上传 |
| GET·PUT | /stock/recycle · /stock/product-names · /stock/remarks | 库存增强 |
| GET·POST·PUT·DELETE | /dishware/items · /stock · /sets · /breaks · /transfers | 餐具管理 |
| GET | /dashboard/summary | 仪表盘统计 |
| WS | /ws/realtime | WebSocket 实时数据推送 |

## 📚 运维文档（上 live / 同步数据 / 排查问题前必读）

- **`LIVE_OPS.md`** — live 运维与数据同步手册：时区规范（统一 UTC+8）、同步脚本用法、静态 dump 分发的坑（导出后新增会漏）、检查清单
- **`DATA_SYNC_CHECKLIST.md`** — 数据清洗检查清单：HTML 编码产品名、gender 空串、负数库存
- **`sync-live-stock.cjs`** — 从 live API 同步最新进出货到本地（`inventory-system/frontend/` 下运行，凭证在 `live-credentials.json`，勿推 git）

## ⚙️ 配置（backend/src/main/resources/application.yml）

- 数据库连接：`jdbc:mysql://localhost:3306/u690174784_kunzz`（root 无密码，可用 `DB_URL`/`DB_USERNAME`/`DB_PASSWORD` 环境变量覆盖）
- `ddl-auto: none`：**禁止 Hibernate 改动老库结构**，表结构由原备份管理
- JWT 密钥生产环境请通过环境变量覆盖
- 复杂报表走 MyBatis（resources/mapper/*.xml），其余走 JPA

## 📦 生产部署

```bash
cd backend && mvn -DskipTests package          # 产物 target/inventory-backend-1.0.0.jar（含内嵌官网）
cd website && npm run build                    # 官网产物 dist/，交给 Nginx 托管并反代 /api → 8081
cd inventory-system/frontend && npm run build  # 后台产物 dist/，同样托管
```

---
旧资料归档：`Downloads/kunzzgroup-main.zip`、`Downloads/u690174784_kunzz (1).zip` 保留不动，作为只读备份。

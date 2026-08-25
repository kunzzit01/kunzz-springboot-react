# 📦 Kunzz 管理系统（React + Spring Boot 重制版）

原系统为 PHP 单体（kunzzgroup），本仓库将其完整重写为前后端分离架构，并**直接连接原 MariaDB 数据库**（历史数据 100% 保留，不迁移、不丢数据）。

## 🌐 三个前端（与线上 kunzzgroup.com 完全一致）

| 前端 | 端口 | 说明 |
| --- | --- | --- |
| **官网**（website/） | 5175 | 与线上 https://kunzzgroup.com 首页**源码一致**（线上首页就是本目录的 React 项目），含中英双语首页/关于/加入我们 + **东京日料官网**（/tokyo，原版 tokyo.css/app.js/图片 100% 搬运） |
| **后台管理**（frontend/） | 5174 | 库存/出入库/分店/餐具/职员/招聘/排班/考核/菜单/KPI/价格/蓝图/媒体 等全部模块 |
| 后端 API | 8081 | Spring Boot 3 + MariaDB（老库直连） |

**官网与后台联动**：后台「招聘职位」管理 → 官网「加入我们」实时展示（/api/jobs/website 兼容老 get_jobs_api.php 格式，按公司分组、中英分离）。


## ✨ 与老系统对比

| 项目 | 老系统（PHP） | 新系统（本仓库） |
| --- | --- | --- |
| 后端 | PHP 无框架，页面混写 SQL | Spring Boot 3 + JPA + JWT |
| 前端 | 服务端输出 HTML，多份重复副本 | React 18 + Vite + TS + Ant Design |
| 数据 | MariaDB `u690174784_kunzz` | **同一个库，直连** |
| 无关模块 | 招聘/排班/评估/菜单/落地页/游戏（67 张表） | ❌ 全部废弃，只保留库存+餐具相关表 |
| 历史数据 | 出入库流水 26,222 条、台账 602 条、餐具 342 件 | ✅ 原样可用 |

## 🏗️ 技术栈

- **后端**：Java 21 · Spring Boot 3.5 · Spring Data JPA · Spring Security + JWT (jjwt) · MySQL Connector · Lombok · Maven
- **前端**：React 18 · TypeScript · Vite 5 · Ant Design 5 · axios · react-router-dom 6 · dayjs
- **数据库**：MariaDB（XAMPP 自带，端口 3306）

## 🚀 一键启动（免安装，新电脑零配置）

> 双击根目录 **`一键启动.bat`** 即可。无需安装 Java / Node / Maven / XAMPP。
> 首次运行自动完成：初始化内置 MariaDB → 导入 `database/` 数据包 → 启动后端（前端已内嵌在后端中）。

- 访问：**http://localhost:8081** （演示账号 demo / demo123）
- 退出：按回车或关闭窗口，自动停止后端和数据库
- 若电脑已装有 MySQL/MariaDB（如 XAMPP）且库 `u690174784_kunzz` 存在，脚本会直接复用，不启动内置库
- 相关文件：`一键启动.bat`（入口）、`start.ps1`（逻辑）、`runtime/`（绿色 JRE + MariaDB）、`database/u690174784_kunzz.sql`（数据包）

### 💾 备份数据（让新电脑装到最新数据）

> 双击 **`备份数据.bat`**：把当前在用的数据库（XAMPP 或内置库）完整导出，覆盖更新 `database/u690174784_kunzz.sql`。
> 日常改完数据后跑一次，再把整个文件夹复制给新电脑，新电脑首次启动就会导入最新数据。
> 自动保留最近 5 份历史快照（`database/backup_*.sql`）。

## 📁 目录结构

```
inventory-system/
├── backend/                       # Spring Boot 后端（端口 8081）
│   └── src/main/java/com/kunzz/inventory/
│       ├── entity/                # 29 个实体，映射老库库存/餐具/用户表
│       ├── repository/            # 26 个 Repository（JPA + 动态查询）
│       ├── service/               # 台账/出入库/三店/供应商/餐具/仪表盘
│       ├── controller/            # REST API
│       ├── security/              # JWT 认证（兼容老库 bcrypt/argon2 密码）
│       └── dto/ common/ config/
└── frontend/                      # React 前端（端口 5174）
    └── src/
        ├── api/                   # axios 封装 + 接口函数
        ├── pages/                 # 看板/台账/出入库/分店/供应商/预警/餐具
        └── components/ utils/
```

## 🚀 快速启动

> 依赖：JDK 17+、Node 18+、XAMPP（MariaDB 已在运行，root 无密码）

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

**启动前端**

```bash
cd frontend
npm install
npm run dev                # 打开 http://localhost:5174
```

或双击 `start-all.bat` 一键启动。

## 🔑 登录账号

| 账号 | 密码 | 说明 |
| --- | --- | --- |
| demo | demo123 | 演示账号（首次启动自动创建） |
| TANG YEAW KHOONG 等 | 老库原密码 | 老用户可直接登录（兼容 bcrypt/argon2id） |

## 🧩 功能模块

| 页面 | 说明 |
| --- | --- |
| 经营看板 | 台账数、今日出入库、低库存预警清单、餐具数、分店品项 |
| 库存台账 | 602 条历史记录，关键词/分类/供应商/日期筛选 + 分页 CRUD |
| 出入库管理 | 26,222 条流水，入库/出库登记、软删除、按店/类型/日期筛选 |
| 分店库存 | J1/J2/J3 合并汇总、单店调整库存、每日经营数据、每日成本 |
| 供应商 | 20 家供应商 + 266 种物料管理 |
| 预警与异常 | 最低库存设置（314 条）、低库存比对、异常扣除记录 |
| 餐具管理 | 342 件碗碟信息/五地库存调整/套装及明细/破损/调拨 |

### 与老系统一致的新增模块（按侧边栏顺序）

| 侧边栏 | 页面 | 说明 |
| --- | --- | --- |
| 集团架构 | 企业蓝图 | corporate_strategy.json 读写（公司概览 + 时间线） |
| 集团架构 | J1/J2/J3 排班 + 手机记录 | 员工排班日历（月视图、班次/假期类型）、按店手机记录 |
| 数据分析 | KPI 报表 / 数据上传 | J1/J2/J3 每日经营数据 + 每日成本按月报表与录入 |
| 人事管理 | 职员管理 | users 全字段 CRUD、注册码生成（application_codes）、权限树设置 |
| 人事管理 | 招聘列表 | job_positions 职位管理、job_applications 申请处理（角标统计） |
| 人事管理 | 问卷回答 | qna_responses 10 题问卷查看 |
| 人事管理 | 考核表单 | 标准配置/评分标准/表单 + 7 项评分明细 |
| 资源总库 | 库存子项 | 回收站（软删除恢复）、产品名称重命名、备注维护 |
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

## ⚙️ 配置（backend/src/main/resources/application.yml）

- 数据库连接：`jdbc:mysql://localhost:3306/u690174784_kunzz`（root 无密码）
- `ddl-auto: none`：**禁止 Hibernate 改动老库结构**，表结构由原备份管理
- JWT 密钥生产环境请通过环境变量覆盖

## 📦 生产部署

```bash
cd backend && mvn -DskipTests package     # 产物 target/inventory-backend-1.0.0.jar
cd frontend && npm run build              # 产物 dist/，交给 Nginx 托管并反代 /api → 8081
```

---
旧资料归档：`Downloads/kunzzgroup-main.zip`、`Downloads/u690174784_kunzz (1).zip` 保留不动，作为只读备份。

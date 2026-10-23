# 任务 2026-10-23-data-dir-outside-repo

- 状态：进行中
- 背景：`/media/join2` 上传的照片在部署后变「已上传 0」。根因两条：
  1. 所有运行期路径写死 `Paths.get("data")`，跟着进程 CWD 走，换 WorkingDirectory 就换了一份「空数据」；
  2. `backend/data/**` 与 `backend/uploads/**` 被纳入 git，部署一次 `reset/checkout/clean`
     就把 `media_config.json`（提交版是 `{ }`）和上传的照片回滚掉。
- 目标（用户批准的方案 B + 顺带 A）：
  - **B**：数据/上传目录改由 `APP_DATA_DIR` / `APP_UPLOADS_DIR` 决定（`common/AppDirs.java`），默认仍是 `./data`、`./uploads`
  - **A**：`backend/data/**`、`backend/uploads/**` 取消 git 跟踪 + 写入 `.gitignore`
- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/common/AppDirs.java（新增）
  - backend/src/main/java/com/kunzz/inventory/InventoryApplication.java
  - backend/src/main/java/com/kunzz/inventory/config/WebConfig.java
  - backend/src/main/java/com/kunzz/inventory/controller/{Comphoto,Media,MediaServe,Timeline,Dishware}Controller.java
  - backend/src/main/java/com/kunzz/inventory/service/{CorporateService,JobService}.java
  - .gitignore
  - backend/data/**（**仅取消 git 跟踪**，磁盘文件原样保留）
  - backend/uploads/**（**仅取消 git 跟踪**，磁盘文件原样保留）
  - deploy-ec2.sh
  - docs/DATA_DIR_OUTSIDE_REPO_2026-10-23.md（新增迁移手册）
  - docs/tasks/2026-10-23-data-dir-outside-repo.md
  - CHANGELOG.md（只追加）
- 明确不碰：`backend/data/**`、`backend/uploads/**` 的磁盘内容（只取消跟踪，文件原样留在磁盘）；
  数据库；`inventory-system/**`；`backend/target/*.jar`
- 计划推送分支：main

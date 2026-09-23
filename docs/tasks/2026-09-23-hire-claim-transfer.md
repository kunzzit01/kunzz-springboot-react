# 任务 2026-09-23-hire-claim-transfer

- 状态：已完成（后端已重新打包并本机实测；接口 16 项 + 并发 8 轮 + 浏览器 27 项 + 实时 10 项全通过）
- 遗留：转发/认领的实时消息类型新增了 `application_changed`；`useRealtime` 加了可选第 6 参 `events`，7 个既有调用方不受影响
- 上线注意：部署时 `add_new_tables.sql` 必须**在重启后端之前**执行
- 需求（用户）：HR 部门 3 个人共用一个应聘者池。谁点开某位应聘者的详情，这条就归谁处理，其他人**不能介入**（只读、联系方式点不了），
  防止两个 HR 重复联系同一位应聘者；接手的人可以把这条**转交**给另一位 HR；要能查「谁在什么时候转交给了谁」。
- 交互口径（用户已确认）：
  - **打开详情即自动认领**（不是点按钮）
  - 被别人认领后：能看全部信息，但**联系方式不可点 + 只读**
  - **转交对任何工作人员开放**（2026-09-23 试用后追加口径：不再要求「你必须是当前处理人」，
    否则处理人休假/转岗会把这条卡住）；「释放」仍只归本人
  - **老板（account_type=special）可强制接管**
  - 转交历史写进已有的 `operation_logs` 表，并在详情弹窗显示
  - 自动认领**不**自动改状态（认领是轻动作，改状态会让「沟通中」失真）
  - 保留的护栏：转交目标必须是 HR/老板、不能转给自己、不能转给当前处理人；
    **编辑权（改状态/备注）仍只归处理人** —— 这条是「防止两个人重复联系」的核心，未放开
  - 联系方式后面**不挂**「（由他人跟进，不可联系）」这类提示词（用户明确不要），靠淡化样式表达不可点
- 事实依据：
  - `users.account_type` 枚举本来就有 `'hr'`，库中正好 3 个（NG E CHING / WONG HUI HUI / SOH ZHI ZEEN）
    → 转交名单 = `account_type IN ('hr','special')`，无需手工维护
  - 全仓库无任何「认领/占用/锁定」先例；并发原语先例只有 `MobileStockMapper.java:54` 的 `SELECT ... FOR UPDATE`
  - `operation_logs` 表已建好但至今**零写入方**，本次首次启用
- 白名单（本 task 只允许改这些）：
  - docs/tasks/2026-09-23-hire-claim-transfer.md
  - add_new_tables.sql
  - backend/src/main/java/com/kunzz/inventory/entity/JobApplication.java
  - backend/src/main/java/com/kunzz/inventory/repository/JobApplicationRepository.java
  - backend/src/main/java/com/kunzz/inventory/repository/OperationLogRepository.java
  - backend/src/main/java/com/kunzz/inventory/service/JobService.java
  - backend/src/main/java/com/kunzz/inventory/controller/JobController.java
  - backend/src/main/java/com/kunzz/inventory/realtime/RealtimeService.java
  - backend/src/main/java/com/kunzz/inventory/realtime/RealtimeWebSocketHandler.java
  - backend/src/main/java/com/kunzz/inventory/config/PagePermissionInterceptor.java
  - inventory-system/frontend/src/types.ts
  - inventory-system/frontend/src/api/index.ts
  - inventory-system/frontend/src/utils/useRealtime.ts
  - inventory-system/frontend/src/pages/Jobs.tsx
  - inventory-system/frontend/src/styles/hire.css
  - CHANGELOG.md  # 仅追加
  - backend/target/inventory-backend-1.0.0.jar  # 构建产物，最后一步（本次真的改了 Java，必须重新打包）
  - backend/static/index.html  # 构建产物，最后一步
  - backend/static/assets/  # 构建产物，最后一步（目录前缀）
- 明确不碰：其它 controller/service/mapper、database/u690174784_kunzz.sql（老库 dump 不动）、website/**、
  backend/static 下的非 assets 资源、jobs 职位管理（JobPositions.tsx）
- 共享文件风险：`PagePermissionInterceptor` / `useRealtime.ts` / `RealtimeService` / `RealtimeWebSocketHandler`
  是别处也在用的文件，本次改动均为**纯增量**（加映射项 / 加可选参数 / 加方法），不动既有行为。
  开工前已 `git status --porcelain` 确认四个文件干净。
- 计划推送分支：main

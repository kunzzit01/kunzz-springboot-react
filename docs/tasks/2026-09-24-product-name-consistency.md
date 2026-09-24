# 任务 2026-09-24-product-name-consistency

- 状态：进行中（本地已提交，未推送）
- 背景：总库存-中央 出现两行同一个货品 `PI 0034 / SURUME IKA P`
  （5.00 + 24.00），根因是两处：
  1. 货品名里夹了**制表符**（`SURUME IKA<Tab>P`），与普通空格版被当成两个货品；
     名字一旦夹了不可见字符，SQL `GROUP BY product_name`、Java 合并键、前端合并键全都分得开，
     而 HTML 渲染后肉眼完全一样。
  2. **在「货品种类」页改名不会同步历史**：2026-09-19 09:45 MJ 把台账那条名字从 Tab 改成空格，
     流水里 184 行仍是 Tab，于是同一条货品裂成两份库存。
- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/common/ProductName.java            # 新增：名称规范化工具
  - backend/src/main/java/com/kunzz/inventory/dto/StockInoutRequest.java         # 进出货请求：构造时规范化货品名
  - backend/src/main/java/com/kunzz/inventory/dto/StockDataRequest.java          # 台账请求：同上
  - backend/src/main/java/com/kunzz/inventory/service/StockProductService.java   # 货品种类新建/编辑：规范化 + 改名级联
  - backend/src/main/java/com/kunzz/inventory/service/ProductRenameService.java  # 新增：改名级联，全系统统一一处
  - backend/src/main/java/com/kunzz/inventory/service/StockEnhanceService.java   # 维护页「重命名产品」改走级联
  - backend/src/main/java/com/kunzz/inventory/service/MobileStockService.java    # 手机版 normalizeName 共用规范化
  - backend/src/main/java/com/kunzz/inventory/mapper/StockInoutMapper.java       # 改名级联的 mapper 接口
  - backend/src/main/resources/mapper/StockInoutMapper.xml                       # 改名级联的动态表 SQL
  - backend/src/main/java/com/kunzz/inventory/mapper/StockProductMapper.java     # 白名单外补充：维护页改名要同步台账
  - backend/src/main/resources/mapper/StockProductMapper.xml                     # 白名单外补充：同上，改名 SQL
  - CHANGELOG.md                                                                 # 只追加一条本任务记录
  - docs/tasks/2026-09-24-product-name-consistency.md                            # 本登记文件
- 明确不碰：前端源码、backend/static/**、backend/target/*.jar（构建产物由发布任务统一处理）、
  其它 service/mapper、其它页面
- 数据处理：存量脏数据由 `fix_surume_ika_tab_20260924.sql`（已在生产数据完整副本上验证）在生产执行，
  本任务只做代码层防复发
- 计划推送分支：main
- 验证记录（2026-09-24 本机）：`mvn -o compile` 通过；把测试副本还原成事故前状态（台账名字 = Tab 版）后，
  用「货品种类」接口改名 → 116 行流水 + 8 张关联表全部同步、Tab 残留 0、总库存合并成一行 29.00；
  进出货接口传带 Tab 的名字 → 入库即规范化成空格；维护页改名 → 流水+台账+最低库存+改价日志一起改

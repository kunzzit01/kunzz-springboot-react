# 任务 2026-09-17-pin-freezer

- 状态：进行中
- 分支：main
- 白名单（只允许改这些文件）：
  - add_new_tables.sql
  - backend/src/main/java/com/kunzz/inventory/entity/FreezerCategory.java
  - backend/src/main/java/com/kunzz/inventory/repository/FreezerCategoryRepository.java
  - backend/src/main/java/com/kunzz/inventory/service/FreezerCategoryService.java
  - backend/src/main/java/com/kunzz/inventory/controller/FreezerCategoryController.java
  - backend/src/main/java/com/kunzz/inventory/mapper/StockProductMapper.java
  - backend/src/main/resources/mapper/StockProductMapper.xml
  - inventory-system/frontend/src/utils/useFreezerCategories.ts
  - inventory-system/frontend/src/api/index.ts
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - inventory-system/frontend/src/pages/StockRecords.tsx
  - inventory-system/frontend/src/pages/MobileOut.tsx
  - inventory-system/frontend/src/styles/stockproducts.css
  - docs/tasks/
- 明确不碰：
  - CHANGELOG.md                    # 另一会话正在持续追加（观察期内从 5 行涨到 27 行）
  - inventory-system/frontend/src/styles/stockinout.css   # 属进出货备注编号选择器，另一件事
  - backend/static/**               # 构建产物，可重新生成，由发布任务统一提交
  - backend/target/**
  - .zcode/**
- 备注：
  - **本任务的作者不是当前会话**。冰箱分类 + 批量保存这两组改动由并发会话写在
    工作区里、长期未提交，其中 `StockProducts.tsx` 已在 17:30 被整文件重写覆盖过一次。
    本次只做「固化」：逐字提交工作区现状，不修改任何内容。
  - 之所以范围比最初认定的 2 个文件大：只提交前端会得到一个「前端调用不存在接口」的
    提交，故按功能完整性补齐后端 4 个新文件 + 字典表 DDL + Mapper + 调用方。
  - 验证：`tsc -b` 通过；`backend/target/classes` 下 4 个 `FreezerCategory*.class` 存在；
    无冲突标记；`git diff --check` 干净。本机无 mvn / mvnw，后端未重新编译。

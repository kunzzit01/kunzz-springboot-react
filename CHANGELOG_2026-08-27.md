# 工作日志 2026-08-27（最低库存设置分系统独立 & 安装包修复）

> 只记录重要功能与对齐改动，供回溯；细节样式微调不在此列。

---

## 1. 最低库存设置：从「全局唯一」改为「分系统独立」

**背景**：旧实现 `stock_minimum_settings` 只按 `product_name` 全局唯一，中央设置的某个货品最低库存会同时作用于 J1/J2/J3 分店的低库存预警（同一货品在不同分店库存被当成一致处理）。

**改动**：
- **表结构**：`stock_minimum_settings` 新增 `stock_system` 列（central/j1/j2/j3，默认 central），唯一键从 `(product_name)` 改为 `(stock_system, product_name)`
- **实体/仓储**：`StockMinimumSetting` 增加 `stockSystem` 字段；仓储改为 `findByStockSystemOrderByProductNameAsc`
- **Mapper**：`productsWithMinimum` 的 LEFT JOIN 增加 `m.stock_system = #{system}` 条件；`upsert` 改为按 系统+产品名（INSERT ... ON DUPLICATE KEY UPDATE）
- **服务层**：`listMinimumProducts` / `saveMinimum` / `saveMinimumBatch` / `listMinimum` 全部按系统读写（保存时校验系统合法性）
- **Dashboard 低库存预警**：每个系统只读取**自己的**最低库存设置，中央设置不再影响分店、分店之间互不影响
- **前端**：无需改动（Settings 页本就按系统 Tab 保存/展示，Dashboard 本就按系统分组显示预警）

**数据迁移**：现有全局设置默认归入 central（原 309 条，仅 HOT & SPICY DRESSING=1.00 有值）。

**升级路径**：
- 新用户：`database/u690174784_kunzz.sql` 已带新结构（外科手术式更新该表 CREATE/INSERT）
- 老用户：`start.ps1` `Ensure-NewTables` 自动补 `stock_system` 列 + 换唯一键；`add_new_tables.sql` 第 4 步同款幂等 SQL 可手动执行

---

## 2. 安装包修复：v1.0.1 源码 zip 的 jar 下载地址回退问题

**问题**：v1.0.1 Release 发布（17:41:22）早于「start.ps1 下载地址改为 v1.0.1」的提交（17:41:55），导致新用户下载的源码 zip 里 start.ps1 仍指向 **v1.0.0** 旧 jar → 新前端 + 旧后端，模糊/精确搜索切换不生效。

**修复**：将 v1.0.1 tag 强制移到最新提交 `79a5a23`，GitHub 按新 commit 重新生成源码 zip（已验证 zip 内 start.ps1 已指向 v1.0.1、前端/数据库包/碗碟照片均在包内）。

---

## 验证

- 中央设 SALMON=500 → 仅中央预警；J1 设 SALMON=50 → 仅 J1 预警；J2/J3 无设置不受影响 ✓
- 单条/批量保存、listMinimum、Settings 页列表均按系统独立 ✓
- 修改后的 dump 导入全新库验证：69 表导入成功、309 行数据、联合唯一键正确 ✓

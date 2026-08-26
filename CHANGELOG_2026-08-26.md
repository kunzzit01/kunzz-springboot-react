# 工作日志 2026-08-26（数据库更新 & 进出货/货品种类/总库存对齐优化）

> 只记录重要功能与对齐改动，供回溯；细节样式微调不在此列。

---

## 1. 数据库更新至最新线上 dump

- 导入 `u690174784_kunzz (6).sql`（8/26 06:15 导出）：备份 → 修复排序规则（3 处 `utf8mb4_uca1400_ai_ci` → `utf8mb4_unicode_ci`）→ 重建导入 67 表 → 补 `operation_logs` + `phone_records` → 数据清洗（HTML 编码产品名、gender 空串、负数检查）→ 重启后端
- **结构补丁固化**：`add_new_tables.sql` 升级为「新系统结构补丁」（幂等），新增 `stock_data.price` 列（货品种类默认单价）；
  `DATA_SYNC_CHECKLIST.md` 新增「第 0.6 步：补建新系统结构（每次导入后必做）」；`start.ps1` `Ensure-NewTables` 自动补列

## 2. 进出货：新增记录弹窗对齐旧版 + Enter 创建

- 弹窗改回旧版设计：白底黑标题 `h3.modal-title`、2px 黑边 400px、灰色圆形关闭、`btn-modal` 绿色创建按钮
- 弹窗内按 **Enter 直接创建记录**（非 button 上，防双触发）；打开自动聚焦日期框、关闭清空备注、输入验证（对齐旧版 `saveNewRowRecord`）

## 3. 进出货：进/出数量互斥禁用（对齐旧版 enforceQuantityMutex）

- 填「进」→ 禁用「出」输入框；填「出」→ 禁用「进」输入框；两边为 0 都可输入（新增行 + 编辑行）

## 4. 进货单价自动抓取（货品种类单价优先）

- 货品种类新增 `stock_data.price` 列 + 「单价 (RM)」列维护（新行/编辑/只读）
- 进货输入数量 → 优先抓**货品种类单价**，无则显示 0.00；用户仍可手动改
- 后端接口 `GET /api/stock/products/default-price`（按货品名+编号取最新维护价）

## 5. 单价校验与 RM0 特殊出库

- **空单价拦截**：新增/编辑保存时单价为空或 < 0 拦截「单价不能为空且不能小于0」（前端 + 后端 `createInout`/`updateInout` 双重校验）；**0 合法**（RM0 需记录）
- **RM0 出货跳过库存校验**：`price <= 0` 不校验库存（赠品/损耗类特殊出库），正价照常校验
- 出货无库存：价格列显示「暂无库存价格」+「手动输入价格」选项（对齐旧版），手动输入时显示红色「无库存」提示

## 6. 进出货：搜索优化 + 精确搜索

- 搜索 300ms 防抖（对齐旧版 `setupRealTimeSearch`）+ 搜索后回第一页
- **模糊/精确切换**（隐蔽式：搜索框左侧图标，放大镜=模糊 / 等号=精确，点击图标切换+展开+聚焦）
- 后端 `exactMatch` 参数（中央 JPA + 分店 MyBatis 双链路，精确 = 产品名完全相等不区分大小写）

## 7. 货品下拉 Combobox 修复

- 点开下拉按**当前已选值过滤**（原来直接展示全部）；删除文字才展示所有；清空按钮显示全部

## 8. 小屏响应式全面修复

- 弹窗改 flex 纵向布局：`modal-content` 宽度 `min(460px, 100%)`、header/footer `flex-shrink:0` 常驻、`modal-body` 超高内部滚动（修复导出弹窗 footer 被遮挡）
- 日历弹窗 `max-width` + 定位防溢出；顶部按钮组 `flex-wrap` 换行

## 9. 货品种类：单价列 + 布局修正 + 权限

- 「规格」列右侧新增「单价 (RM)」列；表格列宽重排 12 列（原 nth-child 11 列错位）、状态列背景索引修正
- 新增行增加**保存按钮**（原只有删除）
- 权限新增「**总览**」系统选项；无总览权限用户首次进入自动落到第一个有权限的分店
- **系统分配仅总览可编辑**，其他分店锁死当前分店（保存时强制当前系统）
- 批准后**按批准时间排序**（最新批准的排最后，`updated_at` 升序）

## 10. 实时刷新（WebSocket）

- 后端：货品种类**新增/更新/删除/批准**后广播 `stock_changed(all)`（原只有进出货推送）
- 前端：货品种类页面接入 `useRealtime('*', ...)` 订阅所有系统变更自动刷新（编辑/保存/批准中不打断，结束后补刷）

## 11. 总库存：多单价合并展示

- 后端 `StockSummaryService`：按 产品+编号+规格 合并（SQL 仍按价格分组保留明细），输出 `price_count` + `price_variants`（各单价×库存×小计）
- 前端：单价列「多个单价 (N) ▾」→ 表格内嵌展开行显示各单价明细（单价×库存=小计）；合并总价 = Σ各单价×库存
- UI 多轮简化：按钮朴素文字居中、无边框装饰、展开行无提示无合计

---

## 附：Git 提交与当前状态

- 工作区改动涉及：`backend/`（Controller/Service/Mapper）+ `inventory-system/frontend/`（StockInout/StockProducts/StockRecords/Staff + api + styles）+ 数据库文档（add_new_tables.sql / DATA_SYNC_CHECKLIST.md / LIVE_OPS.md / README.md / start.ps1）
- 数据库：XAMPP MariaDB `u690174784_kunzz`（127.0.0.1:3306，root 无密码）；demo/demo123
- **注意**：`stock_data.price` 列是结构补丁（dump 不含），重新导库后必须执行 `add_new_tables.sql`（第 0.6 步）

## 附：部署速查

- **前端**：`cd inventory-system/frontend && npm run build` → `cp -rf dist/* backend/static/` → 清旧哈希文件
- **后端**：停 8081 进程 → `mvn -DskipTests package`（JAVA_HOME 用 Adoptium JDK 21）→ `java -Duser.timezone=GMT+8 -jar backend/target/inventory-backend-1.0.0.jar`（WorkingDirectory=backend/）
- **Maven**：`C:\Users\kunzz\.m2\wrapper\dists\apache-maven-3.9.16\<hash>\bin\mvn.cmd`

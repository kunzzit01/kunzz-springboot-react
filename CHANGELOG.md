# 📋 工作日志（CHANGELOG）

> 按日期倒序；只记录重要功能与对齐改动，细节样式微调不在此列。
> （原 CHANGELOG_2026-08-24/25/26/27.md 已合并至此，2026-08-28 整理）

---
## 🗓️ 2026-08-27

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

## 3. 全局 Toast 通知：1:1 对齐旧 live 系统

**背景**：新系统 18 个页面各自维护本地 toast 实现（右上角色块 / alert 样式 / 自绘进度条），视觉不统一，也与旧 live 系统不一致。

**改动**：
- **共享模块**：新增 `frontend/src/utils/toast.ts`（1:1 移植旧系统 `backend/js/toast.js`：`showToast(message, type, duration)` / `showAlert` / `closeToast`；MAX_TOASTS=5、默认 4000ms、右下角、白底彩色左边框 + 图标 + 关闭按钮 + 进度条 + 弹性滑入动画）和 `frontend/src/styles/toast.css`（逐字复制旧系统 `backend/css/toast.css`），在 `main.tsx` 全局引入
- **页面迁移**：18 个页面删除各自的 toast 状态/定时器/JSX，`showMsg` 统一改调全局 `showToast(msg, type)`（type: success/error/warning/info，语义对齐旧系统）
- **进出货补齐旧系统 toast 行为**：编辑保存「勾选货品备注但编号为空」→ error；新增记录弹窗创建 N 行 → `成功创建 N 行记录`；批量保存成功 → `成功保存 N 条记录`、编辑成功 → `记录更新成功`（对齐旧文案）

---

## 4. 进出货校验逻辑：对齐旧系统 batchSaveNewRows / saveRecord

**背景**：新系统保存只校验单价和备注码，旧系统一批校验缺失；且后端 createInout/updateInout 均不校验数量合法性，负数/双 0 数量可入库。

**批量保存新增行（saveNewRows）补齐**：
- 完全空行跳过；有内容的行校验：货品/规格/收货人必填（`请确保所有行都填写了货品名称、规格单位和收货人`）
- 数量非负（`行记录中存在负数数量`）、至少一项>0（`每行记录必须至少填入一项进货或出货数量`）
- 货品/编号存在性（`货品名称不存在，请从下拉列表中选择有效的货品` 等，防手输）
- 中央出货必须选目标单位（`当有出库数量时，请选择目标系统（J1、J2或J3）`）
- 无可存行 → info `没有需要保存的新记录`；成功 → `成功保存 N 条记录`

**编辑保存（saveEdit）补齐**：
- 负数数量、进货/出货不能同时为 0、货品/编号存在性、中央出货必须选目标单位
- **编辑出货库存校验**（旧系统 saveRecord 有、新系统完全缺失）：可用库存 = 现有库存 + 原出库数量（仅货品名和价格都未变时归还；RM0 跳过）；J 系统报 `库存显示不足`
- 货品备注勾选但备注编号为空 → error
- 成功文案对齐 `记录更新成功`

**说明**：后端 updateInout 仍无库存兜底校验（与旧 live 后端一致，校验在前端 saveRecord 层）；如需后端兜底可后续加。

---

## 5. 进出货表格：支持多行同时编辑

**背景**：原实现 `editingId` 单值，同一时间只能编辑一行；逐条修改效率低。

**改动**（`StockInout.tsx`）：
- 状态重构：`editingId: number | null` → `editingIds: Set<number>`；`editDraft` → `editDrafts: Record<id, draft>`（每行独立草稿）；新增 `editPriceOptions: Record<id, priceOptions[]>`（每行独立的出货价格批次下拉，替代原全局 `priceStock`——原状态已删除，新增行本就用每行独立的 `stockOptions`）
- 交互：点编辑按钮可连续打开多行，互不干扰；每行独立保存（✓）/取消（×）；Ctrl+S 保存全部编辑中行（逐行保存，某行校验失败只拦截该行）
- 自动回填/校验逻辑全部按行隔离：选货品/编号自动回填（编号/规格/类型/供应商/默认单价/价格批次）、数量互斥、改出货数量按行重载价格选项
- 实时刷新暂停条件：`editingId !== null` → `editingIds.size > 0`

---

## 6. 货品种类总览：全部展示 + 按员工系统权限过滤打码

**演进**（一天内三轮调整，最终形态如下；演进过程：≥2 间过滤 → 全部展示）：
1. 初版按用户建议做「≥2 间才显示」，发现 J2+J3 员工总览为空（库里没有纯 J2,J3 分配的货品）且 admin 无法管理系统分配，逐步修正
2. 最终按用户要求：**总览 = 完整货品总目录，全部展示**（607 条），不再按 ≥2 间过滤

**最终规则**：
- **无权限配置**（admin/demo）：显示全部货品、**真实**系统分配，可新增/编辑/删除/批准
- **有权限配置**（如只勾 J2,J3）：
  - 只显示「系统分配与自己权限**交集 ≥1 间**」的货品（`Central` 单间的看不到）
  - 系统分配列**只展示交集**（打码：`Central,J1,J2,J3` → 显示 `J2,J3`）
  - **打码行只读**（`_assignMasked` 标记，隐藏该行编辑/删除，保留批准）——防止用打码值保存覆盖真实分配
  - 分配完全在权限内的行：显示真实值，可正常编辑
  - 新增/编辑时「系统分配」多选框只能勾**自己有权限的系统**
- 各分店页面（中央/J1/J2/J3）过滤逻辑不变（FIND_IN_SET）
- 权限是异步加载的：`permsLoaded` state 触发重刷，避免首屏短暂显示未过滤列表

**总览入口权限**：对齐旧系统——总览**始终可见**，不受分店权限限制（旧系统权限面板本就无总览选项，且 `rebuildProductSystemDropdown` 强制保留总览）：
- `Staff.tsx`：库存权限面板系统选项移除「总览」；默认权限模板去掉 `'overview'`
- `StockProducts.tsx`：allowedKeys 自动切换逻辑 + 页面右上角系统选择下拉，两处都加 `s.key === 'overview' ||` 例外（初版漏了下拉，导致勾了权限的用户在下拉里看不到总览）
- 数据库无需迁移（无人勾过 overview）

**Mapper**：`StockProductMapper.xml` listRows 总览分支**不过滤**（曾短暂加过 ≥2 条件，随规则改回），返回全部；权限交集过滤/打码由前端按登录人做（后端 API 无用户上下文）

**数据参考**：全库 607 货品 = 单一间 493（Central 428 / J3 61 / J1 4）+ 多间 114（Central,J1,J2,J3 66 / J1,J2,J3 22 / Central,J3 13 / J1,J3 12 / Central,J1 1）

---

## 验证

- 中央设 SALMON=500 → 仅中央预警；J1 设 SALMON=50 → 仅 J1 预警；J2/J3 无设置不受影响 ✓
- 单条/批量保存、listMinimum、Settings 页列表均按系统独立 ✓
- 修改后的 dump 导入全新库验证：69 表导入成功、309 行数据、联合唯一键正确 ✓
- Toast：18 页面统一右下角旧系统样式；进出货保存/编辑/创建行/备注校验文案对齐旧系统 ✓
- 进出货：多行同时编辑、Ctrl+S 全存、编辑出货库存校验、货品/编号存在性校验 ✓
- 总览：admin 看全部 607 条真实分配可编辑；J2+J3 员工看 149 条（交集打码只读）；四间全勾看全部且行行可编辑 ✓
## 🗓️ 2026-08-26

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
## 🗓️ 2026-08-25

## 1. 问卷（/qna）提交后可重新填写

- 后端 `QnaService.create()`：重复提交改为**覆盖更新**（upsert，保留原 id）
- 前端 `Qna.tsx`：刷新后回到可编辑状态（预填上次答案）；查看模式新增「重新填写」按钮

## 2. 进出货：快捷键 + 删除撤销（对齐 stockeditall.js）

- 快捷键：`Ctrl+S` 保存 / `Ctrl+Shift+Z` 撤销删除 / `Ctrl+D` 批量删除 / `Ctrl+A` 快速加行 / `Ctrl+Shift+A` 新增记录弹窗
- 删除后底部撤销条（10 秒可撤销）；新增 `PUT /api/stock/inout/restore` 批量恢复，中央↔分店**双向联动**（含回收站 restore 升级）

## 3. 进出货：下拉选单全面对齐 live

- Combobox 重构：portal 渲染到 body 防滚动容器裁剪、底部空间不足自动向上翻转、宽度内容自适应不换行
- 货品显示 `名称 (供应商)`（无供应商回退编号）、编号显示 `编号 (名称)`；**显示全部价格**，库存不足标注「(库存:X, 不足)」
- 选择编号自动回填货品名/规格/类型/供应商（新增行 + 编辑行）
- 手动输入价格后保持输入框显示（不再被切回下拉显示「请选择价格」）
- 后端 `COALESCE(SUM(...))` 修复：**全新进货价**（出库列全 NULL）不再被净库存计算吞掉——此前新价不出现在「单价与库存」下拉、HIFO 拆行、总库存、备注编号"在库"判断

## 4. 收货单位规则（对齐旧系统）

- 新增行：输入**进货数量即锁死「中央」**；出货时才可选 J1/J2/J3/中央
- 编辑模式：收货单位改为**可下拉修改**；修改目标单位后**自动同步分店记录**（生成/清理 `jXstockedit_data` + `jXstockinout_data`，修复"改了出货单位分店却无记录"）

## 5. 后端：编辑出货记录备注校验修复

- 编辑时**保持原备注编号**则跳过「在库」校验（该编号可能已被本记录自身消耗）——前端 `saveEdit` 同逻辑，修复"编辑保存不了"

## 6. 全页面保存防连点（对齐 batchSaveNewRows）

- 进出货 + 全部有保存操作的页面（Suppliers/Price/Menu/Jobs/Staff/Schedule/Dishware/DishwareBreak/DishwareTransfer/Phone/Evaluation/Timeline/JobPositions）
- 保存中按钮禁用 + 转圈，`if (saving) return` 挡重复提交/双击

## 7. 快速选择（时段）下拉统一 KPI/Cost 设计

- 橙色按钮 + 2px 黑边菜单 + 600 权重选项（对齐全站统一设计）

---

## 附：Git 提交与当前状态

- 提交 `9d81d4c`（57 文件，+2673/-734）已推送 origin/main；工作区干净、本地=远端
- **安全**：`live-credentials.json`（live 同步凭证）已被 `.gitignore` 排除未推送；`sync-live-stock.cjs` 无硬编码凭证
- 后端 jar 于 16:58 重建运行在 8081；前端最新 bundle `index-CtewFiZ3.js` + `index-BfWkcJtf.css`
- 新增文件：`CHANGELOG_2026-08-25.md` / `LIVE_OPS.md` / `sync-live-stock.cjs` / 数据库主包更新

## 附：部署速查

- **前端**：`cd inventory-system/frontend && npm run build` → `cp -rf dist/* backend/static/` → 清旧哈希文件（静态免重启；注意 CSS 哈希可能不变、勿误删）
- **后端**：停 8081 进程 → `mvn -DskipTests package`（JAVA_HOME 用 Adoptium JDK 21，`runtime/jre21` 是 JRE 无 javac）→ `java -Duser.timezone=GMT+8 -jar backend/target/inventory-backend-1.0.0.jar`（WorkingDirectory=backend/）
- **Maven**：`C:\Users\kunzz\.m2\wrapper\dists\apache-maven-3.9.16\<hash>\bin\mvn.cmd`（旧 `~/tools/apache-maven-3.9.9` 也可用）
- **数据库**：XAMPP MariaDB `u690174784_kunzz`（127.0.0.1:3306，root 无密码）；demo/demo123
## 🗓️ 2026-08-24

## 1. 全站实时更新（Realtime）

**需求**：任意窗口做库存写入 → 其他窗口自动刷新，高峰期不被打爆。

### 改动
| 文件 | 内容 |
|---|---|
| `backend/.../controller/StockController.java` | 所有库存写操作（出入库增改删、最低库存保存）广播 `{"type":"stock_changed","system":"all"}`——从「按系统广播」改为**无条件广播 all**，解决中央→分店跨系统不刷新的问题 |
| `frontend/src/utils/useRealtime.ts` | hook 升级：**节流 3s**（高峰期最多每 3s 刷一次）+ **尾部补刷**（写完停 1s 内补最后一次）+ **忙时暂停**（编辑行/弹窗开着跳过，结束后自动补刷）+ 支持 `'*'` 通配订阅 |
| `frontend/src/utils/RealtimeStatus.tsx`（新建）| 侧边栏左下角连接状态灯：绿=已连接 / 黄=连接中 / 红=离线重连 |
| `frontend/src/components/AppLayout.tsx` | 挂载 RealtimeStatus |
| `frontend/src/pages/StockInout.tsx` | `useRealtime(system, load, 1000, 3000, isBusy)`——busy = editingId/viewOpen/checkOpen/rowsModal/exportOpen/sysOpen |
| `frontend/src/pages/StockRecords.tsx` | 只刷当前查看的系统；切换系统时 `switchSystem` 总是重新拉取（原只在未加载时拉，会看到旧数据） |

### 验证
- 端到端实测：登录 → WS 连接 → 触发写 → 收到 `{"system":"all"}` 广播 ✅

### 设计要点（为什么）
- 广播只发信号不发数据（安全，前端自行调已认证 API 拉取）
- 节流在**前端**做，后端 GET 压力有上限（每页 ≤ 20 次/分），与写入频率无关
- 台账页只刷当前视图（1 GET/3s），比全量刷 4 系统省 75%

---

## 2. 邮件系统：新成员欢迎邮件 + 首次登录强制改密

**需求**：admin 添加成员填邮箱 → 邮箱收临时密码 → 首次登录强制重设自己的密码。

### 关键发现
- 旧系统 SMTP 配置在 `kunzzgroup-main/backend/mailer_config.php`：Gmail `kunzzsup@gmail.com` + 应用密码（`pobc jkvr yygb dhyk`）
- 旧欢迎邮件模板：`kunzzgroup-main/backend/generatecodeapi.php` 的 `sendWelcomeEmail()`
- 新后端原本是**空壳**（写死 `emailSent=false`），无 SMTP、无改密流程

### 改动
| 文件 | 内容 |
|---|---|
| `backend/pom.xml` | 加 `spring-boot-starter-mail` |
| `backend/src/main/resources/application.yml` | `spring.mail.*` SMTP 配置（环境变量可覆盖 SMTP_HOST/PORT/USER/PASS）+ `app.base-url`（欢迎邮件登录按钮地址） |
| `backend/.../service/MailService.java`（新建）| 发送欢迎邮件（复用旧模板：橙色调 + 临时密码高亮 + 登录按钮），失败记日志不阻塞建账号 |
| `backend/.../service/StaffService.java` | `createUser` 真实发邮件，`emailSent` 反映结果 |
| `backend/.../dto/LoginResponse.java` | 加 `mustChangePassword` |
| `backend/.../dto/UserVO.java` | 加 `isFirstLogin` |
| `backend/.../service/AuthService.java` | login 返回 `mustChangePassword`；新增 `changePassword()`（校验旧密码→设新→清 is_first_login，新密码 ≥6 位且不能与旧相同） |
| `backend/.../dto/ChangePasswordRequest.java`（新建）| 校验 |
| `backend/.../controller/AuthController.java` | `POST /api/auth/change-password`（需登录态） |
| `frontend/src/pages/ChangePassword.tsx`（新建）| 首次登录重设密码页（复用登录页视觉） |
| `frontend/src/pages/Login.tsx` | 登录后 `mustChangePassword` → 跳转 /change-password |
| `frontend/src/App.tsx` | 加 `/change-password` 路由（RequireAuth 包裹） |
| `frontend/src/components/AppLayout.tsx` | 兜底：`getMe` 发现 isFirstLogin 且不在改密页 → 强制跳转 |
| `frontend/src/types.ts` / `api/index.ts` | 类型 + `changePassword` API |
| `frontend/src/pages/AddEmployee.tsx` | 提示文案：emailSent → 「临时密码已发送到邮箱（首次登录需重设）」；否则显示临时密码手动告知 |
| `deploy-ec2.sh` | 环境文件加 SMTP_HOST/PORT/USER/PASS + APP_BASE_URL |

### 验证（全链路实测）
1. admin 建成员 → `emailSent=true`（真实邮件发到 kunzzsup 邮箱）✅
2. 临时密码登录 → `mustChangePassword=true` ✅
3. 改密成功 → is_first_login 清除 ✅
4. 新密码登录 → 正常进入 ✅
5. 旧临时密码再登录 → 401 拒绝 ✅

---

## 3. gender 枚举修复（`Data truncated for column 'gender'`）

**症状**：编辑职员保存报 `Data truncated for column 'gender'`。

### 根因
`users.gender` 是 `enum('male','female','other')`，MySQL 严格模式（STRICT_TRANS_TABLES）**不接受空串 `''`**。性别为空的成员编辑保存时表单回填 `''` → 写库报错。

### 改动（`backend/.../service/StaffService.java` + `StaffMapper`）
- `normalizeGender()`：空串/非法值 → NULL，大小写统一（`" Female "` → `female`）
- `createUser` / `updateUser` 都走规范化
- 新增 `StaffMapper.clearGender`：显式把性别清为 NULL（enum 不接受 `''` 且动态 UPDATE 跳过 null，必须单独语句）
- 验证：NULL 用户存空性别不报错 ✅；male→清空真正清为 NULL ✅；非法值 XX → NULL ✅

---

## 4. HTML 实体产品名清洗（负数库存 / 幽灵产品）

**症状**：总库存出现负数（如 `HOT &amp; SPICY DRESSING -1.00 / RM -22.60`）。

### 根因
旧系统/手机端把 `&` 存成 `&amp;`（还有 `&#039;` 撇号）。汇总按产品名分组时编码名被当成**不同产品**，且这些行多为**出库**（无对应入库）→ 幽灵负数组。

### 处理（2026-08-24 本地库）
清洗范围：`stockinout_data`(中央 10)、`j1stockedit_data`(52)、`j2stockedit_data`(24)、`j3stockedit_data`(47)、`j1stockinout_data`(1)、`stock_data`(7)、`stock_minimum_settings`(5，需先合并重复再删)。
`users.gender` 空串 2 条 → NULL。

### 两个坑（已写进清单文档）
1. **检查要逐个表查**——UNION 查询在部分工具里输出被截断，曾漏掉中央表
2. **撇号实体 `&#039;` 用 `CHAR(39)`**——SQL 字符串里写字面 `'` 会把语句打断
3. `stock_minimum_settings` 是 **product_name 唯一键**，编码行+正常行并存时先合并非零值再删编码行

### 产物
- `DATA_SYNC_CHECKLIST.md`（数据同步检查清单：第 0 步备份 / 0.5 导入 / 1 HTML实体 / 2 enum / 3 负数甄别 / 4 验证 + 速查表）
- 注意 `users.account_type` 枚举里有**合法的 `r&d`**，清洗时不要动它

---

## 5. 供应值算法对齐（J1/J2/J3供应）

**症状**：本地供应值和线上差好几倍（J1 32,055 vs 线上 96,568）。

### 根因（已用旧代码实锤）
- **线上**：J1/J2/J3供应 = **本月进货总额**——`stocklistapi.php getSupplyTotal`：`jXstockinout_data` 表，`SUM(in_quantity × price)`，只统计**当月**
- **本地原来**：当前库存总价值——`jXstockedit_data` 全历史净库存×单价

### 改动
- `StockSummaryMapper` + `.xml`：新增 `supplyValue(table, start, end)`（本月入库额）
- `StockSummaryService.summary()`：中央时对 j1/j2/j3 用新算法
- 验证：J2/J3 与线上**完全一致**（19,154.55 / 18,816.45），J1 差 119 为数据新旧

---

## 6. 导入最新线上数据 + 表结构变更适配

### 导入过程（用户提供 `u690174784_kunzz (3).sql`，phpMyAdmin dump）
1. 备份旧库（`backup_before_import_20260824.sql`）
2. **collation 不兼容**：dump 是 MariaDB 11.8 的 `utf8mb4_uca1400_ai_ci`，本地 XAMPP 是 MariaDB 10.4 不认 → `sed` 替换为 `utf8mb4_unicode_ci`
3. **必须删库重建**：dump 的 CREATE TABLE 无 IF NOT EXISTS，直接导入撞「表已存在」
4. 导入 67 表成功 → 跑清洗清单

### ⚠️ 表结构变更：最低库存设置改为全局
线上 `stock_minimum_settings` **删掉了 `stock_system` 列**（原为分店独立设置，现 product_name 全局唯一，对齐线上 `getLowStockAlerts` 的按产品名 JOIN）。
后端适配：
- `StockMinimumSetting` 实体：删 stockSystem 字段
- `StockMinimumSettingRepository`：删 findByStockSystemOrderByProductNameAsc
- `StockMinimumMapper.java/.xml`：productsWithMinimum 去掉 stock_system 条件；upsert 只按 product_name
- `StockService`：listMinimum/saveMinimum/saveMinimumBatch 去 system（system 参数保留但忽略）
- `DashboardService`：低库存 = 全局设置 × 各系统库存（任一系统低于全局最低即预警）

### 验证
- 总库存 RM 79,597.94（线上 79,597.95，1 分舍入差）
- J1 96,567.85 / J2 19,154.55 / J3 18,816.45 —— 与线上一致
- Dashboard / 最低库存接口全部正常
- 低库存预警 1 项 = j2 HOT & SPICY（库存 0 < 全局最低 1，真实数据）

---

## 7. 一键同步脚本（下次直接用）

| 文件 | 用途 |
|---|---|
| `sync-live-data.bat` | 拖入线上 dump → 自动：备份 → 修复 collation → 停后端 → 重建库导入 → 清洗 → 验证 → 重启后端 |
| `sync_cleanup.sql` | 清洗 SQL（HTML 实体 / 最低库存合并去重 / gender），幂等可重复执行 |
| `docs/OPS.md`（原 DATA_SYNC_CHECKLIST.md，已合并） | 手动执行/排错参考（含第 0.5 步导入流程） |

### 实测
脚本完整跑通：备份 ✅ → fixed_dump ✅ → 67 表 ✅ → 清洗 ✅ → 后端重启 ✅ → 数字与线上一致 ✅

### 两个脚本坑（已修）
1. **bat 文件必须 CRLF 行尾**（LF 会乱解析）
2. **bat 里 `%` 字面量要写 `%%`**（如 LIKE `'%%&amp;%%'`），否则被当变量展开为空

---

## 附：常用信息速查

- **本地栈**：XAMPP MariaDB 10.4（root 无密码）/ Spring Boot 8081 / Vite 5174（React）/ 官网 5175
- **Maven**：`~/tools/apache-maven-3.9.9/bin/mvn.cmd`
- **demo 账号**：`demo@kunzz.local` / `demo123`（后端 DataInitializer 自动重建）
- **SMTP**：Gmail `kunzzsup@gmail.com`（旧系统应用密码，生产可换企业邮箱）
- **线上参考**：`https://www.kunzzgroup.com/backend/stocklistapi.php?action=summary&system=central`
- **数据库 67 张表**，库存表：`stockinout_data`(中央)、`j1/j2/j3stockedit_data`(分店)、`jXstockinout_data`(分店流水)、`stock_data`(台账)、`stock_minimum_settings`(最低库存，全局)

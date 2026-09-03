# 📋 工作日志（CHANGELOG）

> 按日期倒序；只记录重要功能与对齐改动，细节样式微调不在此列。
> （原 CHANGELOG_2026-08-24/25/26/27.md 已合并至此，2026-08-28 整理）

---
---
## 🗓️ 2026-09-03

### 6. 导入 live 最新数据库（9/3 10:37 dump，67 表）

- **dump**：`u690174784_kunzz (5).sql`（23.9MB，Generation Time Sep 3 02:37 UTC = 马来 10:37，Hostinger MariaDB 11.8.8）
- **流程**（照 docs/DB_IMPORT.md）：uca1400×3 → sed 修复副本（utf8mb4_unicode_ci）；本地备份 `backup_before_import_20260903_103806.sql`（66 表）；
  重建库（踩坑 #2 重现：DROP 报 errno 13 → 字典已空后清残留目录 C:\kunzz-mariadb-data\u690174784_kunzz）；导入退出码 0
- **验证全过**：67 表 = dump 数；4 视图全在；行数 j1 22400 / j2 15014 / j3 17966 / 中央流水 27607 / 台账 609 / 用户 22；
  业务日期 9/3（当天）；CHECK TABLE 6 表全 OK；时区 +08:00
- **结构补丁**：add_new_tables.sql（operation_logs/phone_records/price_change_log + **freezer_position 列**，
  live 无此列重建后自动补上，位次数据从零开始属预期）+ sync_cleanup.sql；70 表
- **后端重启后抽查**：总库存 central 258 货品 RM92,388.61 / j1 259 / j3 287，freezer 列正常带出；前端两页无 JS 错误

### 11. 再导入 live 更新 dump（9/3 11:28 dump (6)，j3 +21 条新录入）

- 同标准流程：备份 `backup_before_import_20260903_113042.sql`（66 表）→ DROP/重建（这次 DROP 正常无残留）→ 导入退出码 0 →
  验证 67 表/4 视图全过（行数对比上份：j3 17966→17987 其余持平，与 51 分钟间隔增长吻合）→ CHECK 5 表 OK →
  结构补丁 + 清洗 → 70 表含 freezer_position → 后端重启 → 总库存抽查 j3 货品 287→294 ✅；
  分发包 `database/u690174784_kunzz.sql` 同步更新

### 8. 同步最新数据包到 git（9/3 导入含结构补丁后的全量 70 表）

- `database/u690174784_kunzz.sql` 重新导出：live 9/3 10:37 数据 + 新系统结构（operation_logs/phone_records/
  price_change_log + stock_data.freezer_position），无 uca1400；旧换行噪声顺带消除；
  配合 update.ps1 可选导入（询问式 Y/N）即为用户交付最新系统

### 7. 修复：改价日志从未写入（用户问“功能有在生效吗”实测发现）

- **根因**：`StockProductService.update` 里 `logPriceChange` 在 `updateRow` **之后**才 `findById`——拿到的是已更新的新价，
  与 body 新价相等 → “价格未变不记录” 直接 return；自 9/1 功能上线（61ae8e2）起日志表一直是空
- **修复**：update 前先 `findById` 取旧值，`logPriceChange(before, body)` 用旧价判断/记录；价格未变仍不记录，首次维护价（旧价 NULL）也记一条
- **实测全链路**：改 A5 AWAGYU 600→555 → price_change_log 写入 (old 600/new 555/changedBy Soon) →
  总库存页 🕘 图标出现 + 悬停“最近改价：03/09/2026 RM555.00” + 点击弹窗“RM600.00(划线)→RM555.00 共 1 条”三件套全过；
  jar 重编译重启

### 2. 总库存「冰箱分类 + 位次」显示与排序（Kitchen 等全类型通用）

- **需求**：选中货品类型后，总库存显示「冰箱分类」列、按 冰箱分类→位次 排序；**位次（Position）只作后台排序，绝不出现在 UI**
- **数据链路（先分析后实施，真实字段非假设）**：
  - 冰箱分类 = 台账 `stock_data.freezer_category`（多选逗号分隔，真实值 K1-1..K1-7/C-1/KDI-1..4/S1-1..4/SBS-1/2/SBDI-1/2；中央/分店总库存通用）
  - 位次 = **新增** `stock_data.freezer_position` INT NULL（全系统原本无此字段）→ Migration + `add_new_tables.sql` 幂等补丁（information_schema 检查防重复执行）
  - 业务排序顺序 = 前端既有 `FREEZER_OPTIONS` 数组（字母序会把 C-1 排到 K1 前，故不用 ORDER BY 字符串）；后端不分页（全量返回）→ 排序在前端过滤后执行，无跨页错序风险
- **后端**（`StockData` entity + `StockDataRepository.productFreezerInfo()` + `StockSummaryService.productFreezerMap()`，仿 productTypeMap 先例）：summary 每 item 带出 freezer_category（多值原样）/ freezer_position；聚合 SQL 零改动，库存/价格计算不变
- **总库存前端**（`StockRecords.tsx`）：仅选中具体类型时 ① 表头/行新增「冰箱分类」列（货品后，多值显示原值）② 排序 冰箱分类(FREEZER_OPTIONS 序) → 位次(数字，NULL/空/0 排该冰箱最后) → 货品名兜底（重复位次稳定）；未选类型（全部）保持原布局原排序；UI 序号仍是排序后动态 idx+1（与位次完全分离）；colSpan 条件 8/9 同步；**无 Position/Rank/Order 任何栏位**；导出 PDF/搜索/审核逻辑不动
- **货品种类（数据入口）**：`StockProductMapper.xml` list/insert/update + `StockProductService`（parsePos：空/非法→0=未设置）+ `StockProducts.tsx` 新增「位次」数字编辑列（对齐现有 excel 编辑风格）
- **验证**（真实货品 K1-6 设 pos 1,1,2,3,5,10 + 大量 NULL，测后还原）：
  - 145 行 Kitchen：冰箱分组单调（K1-1→K1-2→…→SBDI）✅；K1-6 组内 = AWAGYU(1)→KANI CREAM KOROKE(1重复名称兜底)→CURRY(2)→EGG(3)→STICK(5)→FRANKFURTHER(**10 数字序不在 2 前**)→NULL 位次货品名称序 ✅
  - 未选类型无冰箱分类列；表头无 Position/Rank/Order；序号 1..N 连续；搜索 AWAGYU → 1 行 K1-6 ✅；无 JS 错误
  - 货品种类 API 写入/清空（""→0）实测通过；tsc+vite 构建通过，jar 重编译重启正常
- **Approval 不受影响**：总库存数据源为已入账流水，货品种类审批统计（approver 非空=approved）逻辑未动

### 3. 两个表格列宽微调（加列后 fixed 布局跑偏修复）

- **根因**：两张表均 `table-layout: fixed`，列宽靠 nth-child 百分比/min-width——插入新列后全部错位（fixed 下 min-width 无效、nth-child 指向错列）
- **总库存**（`stocklist.css` + `StockRecords.tsx`）：选中类型时 table 加 `has-fridge` class，
  新增 9 列宽度规则（6/9/16/9/11/12/9/14/14=100%）；未选类型 8 列走原规则零回归
- **货品种类**（`stockproducts.css` + `StockProducts.tsx`）：
  ① 新增 13 列 width 百分比（4/8.5/13.5/7/7/8/10.5/7/9.5/9.5/4.5/5.5/6=100%），th 冗余 minWidth 移除；
  ② 状态列色背景 nth-child 11→12（原高亮错打到位次列，已验证批准绿/待批准黄回归正确位置）
- **验证**：浏览器实测两页列宽（总库存 9 列序号 93/货品 212/冰箱分类 119…；货品种类 13 列序号 47/名字 210/位次 93…）
  与截图目视均对齐原设计密度；未选类型 8 列截图与改动前一致

### 4. 货品种类列宽二改：总览回原 12 列设计、位次列仅中央/分店显示（用户反馈）

- **反馈**：① 货品种类 table 设计很糟糕；② 总览不需要位次
- **发现**：stockproducts.css 本就存在原 12 列 nth-child 定宽规则（4/10/18/8/8/8/13/7/8/9/8/90px）——上一轮 13 列规则覆盖了它才是跑偏主因
- **修复**：① 表格 class 按视图切换（overview = 原 excel-table 12 列原规则，完全恢复原样；中央/J1/J2/J3 = has-pos）
  ② has-pos 只补 3 条：位次(第 11 列 4.5%)+状态(12 列 8%)+操作(13 列 90px)，前 10 列沿用原比例——中央视图与总览设计一致只多窄位次列
  ③ 状态高亮双选择器：总览 nth-child(11) / has-pos nth-child(12) ④ 位次 th/td 仅 system!==‘overview’ 渲染（数据仍随行保存，切换无损）
- **验证**：总览 12 列宽 49/124/223/99/99/99/161/87/99/111/99/90 = 原设计；中央 13 列前 10 列同比例 + 位次 53px + 状态 95/操作 90；截图目视两页均正常

### 9. 上 live 准备：本地清理 + GO_LIVE 部署清单

- **本地清理**（约 100MB，均 gitignored 无引用）：runtime 9/2 事故残留（quarantine/repair SQL/fixed_dump/
  backup_before_sync/live_j*_mobile 缓存/旧日志）删除；旧备份归档 database/backup/；
  **保留** runtime/mariadb（程序本体）+ jre21 + ollama（AI 助手）
- **新增 docs/GO_LIVE.md**：EC2 + DBeaver（现有 live 库）上线上线清单——
  ① DBeaver 跑 add_new_tables.sql（幂等补丁，对旧 PHP 零影响）+ 建 inventory_app 专用账号 + Remote MySQL 白名单
  ② EC2 装 JRE21/Nginx ③ deploy-ec2.sh / nginx-ec2.sh 配置运行 ④ 上线验证清单（含旧 PHP 并行验证）
  ⑤ 安全：**SMTP 应用密码已泄露进 git 历史，必须轮换**（deploy-ec2.sh 已改占位符）⑥ 回滚方案（结构无需回滚，旧系统不读新列）

### 5. 货品种类搜索修复：全能多字段 + 精准切换（用户反馈）

- **原问题**：① 后端只搜货品名字（编号/规格/类型/供应商/冰箱分类全搜不到）；② 无精准模式；③ **搜索慢一拍**——
  防抖回调持旧渲染闭包的 load（旧 kw），要多打一个字符才生效
- **修复**：
  - 后端（`StockProductMapper.xml/.java` + `StockProductService` + `StockEnhanceController`）：listRows 加 exact 参数——
    false = 全能模糊（名字/编号/规格/类型/供应商/冰箱分类 任一 LIKE）；true = LOWER(product_name) 完全等于
  - 前端（`StockProducts.tsx` + `api/index.ts`）：搜索框左侧图标改为模式切换（对齐总库存 smartSearch：
    放大镜=全能 / 等号=精准橙色高亮，title 提示，placeholder 随模式变化）；`load(kwArg?, exactArg?)` 直传最新值修慢一拍；
    smartSearch-icon 解除 pointer-events:none 改为可点击（对齐 stocklist.css）
- **验证**（API + 浏览器）：供应商 SENRI→57 条、分类 K1-6→27 条、编号片段 0001→11 条（编号真实格式带空格如 "DI 0001"）；
  精准 ASARI→4 条（同名多记录正常）、ASAR→0 条、完整名 A5 AWAGYU→1 条；截图确认等号橙色激活态

### 10. 全站实时推送审核：补 3 处漏广播 + 修 batch-save 广播时序 + 双端实测

- **静态审计**（后端 14 处写操作 vs 前端 5 页订阅）：桌面总库存/进出货/货品种类、手机出货/记录均已订阅 useRealtime（
  节流+尾部补刷+编辑中暂停）；发现缺口：① `/stock/minimum` 单条增删改（Settings 页在用，影响总库存最低库存列）无广播；
  ② `/stock/sot` 增删改（货品异常页）无广播；③ **batch-save 先广播后写入**（时序 bug：前端刷到旧数据）；
  ④ StockSot 页未订阅实时刷新；⑤ `/stock/records` 与 `/categories` 写接口无 UI 调用方（遗留，不补）
- **修复**：StockController minimum/sot 6 个端点补 `notifyStockChanged("all")`；MobileStockController batch-save 改为
  写入成功后广播；StockSot.tsx 加 `useRealtime('*')`；总库存切页签已确认总是重载（无缺口）
- **端到端实测**（headless 四页面同账号）：手机出货 batch-save（ASARI 扣 0.5）写入成功后 →
  桌面总库存/桌面进出货/手机出货/手机记录 **四页全部自动刷新** ✅；桌面 POST /stock/inout → 总库存/进出货自动刷 ✅；
  测试数据已全部清理（出货记录删/物理清 RT-TEST 残留）

### 1. 总库存导出支持类型多选（用户需求：只导出 Sake 类型）

- **需求**：总库存「导出数据」只想要某个/某几个类型（如今天只要 Sake），不需要每次导全量
- **实现**（`StockRecords.tsx` 导出弹窗，仅前端改动）：
  - 导出弹窗新增「导出类型（可多选，默认全选）」chips 行（Service Line / Sake / Kitchen / Sushi Bar），
    右上「全选」一键复位；全不选确认 → 拦截提示
  - **选项按实际数据过滤**（用户反馈补充）：选项 = 该系统 typeCards show 项 ∩ summary 里实际有有库存行的类型
    （对齐页面类型卡隐藏规则）——中央无 Sake 数据 → 中央导出弹窗不出现 Sake 选项；J1/J3 有 Sake → 正常显示
  - `confirmExport` 两条路径（页面数据直出 / 指定日期拉接口）都传入选中集合；`exportPDF` 用 `normalizeItemType`
    （Drinks→Service Line 兜底）过滤；过滤后无数据 → 提示「所选类型没有数据可导出」
  - PDF 头部：仅选部分类型时右上角标注 `Types: Sake`（全选不标注，对齐原样式）；默认全选 = 与原导出完全一致（零回归）
- **验证**（puppeteer + Chrome 有头窗口，CDP 下载落盘）：
  - J3 全类型 → Records: 282（= API 全量）且无 Types 标注 ✅
  - J3 仅 Sake → **Records: 51（= API Sake 恰好 51 条）** + `Types: Sake` 标注 + 无 Kitchen/Sushi 货品混入 ✅
  - chips 默认全选/单选切换/全不选拦截、tsc + vite 构建通过；backend/static 已同步（免重启）
  - 选项实测：central/j2 = 3 项（无 Sake），j3 = 4 项（含 Sake）；全选默认 ON 与原导出一致
  - 备注：无头模式下首次导出的「下载不落地/鼠标事件不派发」均为 headless 环境限制，有头（真实用户）一切正常

---
---
## 🗓️ 2026-09-02

### 0. 事故修复 + 根治：OneDrive 损坏数据库 → 数据目录迁出至 C:\kunzz-mariadb-data

- **事故**：电话版 J2/J3 报 `Got error 1877 from storage engine InnoDB` → CHECK 发现 `j2/j3stockedit_data` 表空间损坏（j1 在处理期间也被 OneDrive 回写损坏）。
  根因：`runtime/mariadb-data/` 在 OneDrive 同步范围内（同步运行中的 InnoDB 文件 = 页撕裂；实测删掉的坏文件几秒内被云端同步回）
- **修复**：MariaDB 10.4 字典级修复流程（暂停 OneDrive → 隔离坏文件 → 放回 .frm 让服务层重新认表 → 真正的 DROP 清 InnoDB 字典 →
  从 09-01 dump 重建 + 非严格模式导入）——j1/j2/j3 三张表全部 CHECK OK，全库 mysqlcheck 无其他隐患，数据零损失（仅差 1 行已清理的测试残留），详见 docs/OPS.md 四
- **根治**：datadir 迁出 OneDrive → `C:\kunzz-mariadb-data`；start.ps1 的 `$MDB_DATA` 改指新路径，旧目录存在时首次运行自动迁移；
  README 注明换新电脑时数据不跟项目文件夹走（拷 `C:\kunzz-mariadb-data` 或用备份数据包）

### 1. 权限双层化 + 手机出货记录页 + /mobile/out 改名 + 手机专用登录

- **用户反馈**：① 旧桌面「手机版」按钮指向 `jXstockeditmobile`（手机出货记录-JX），新系统没有这个页面；
  ② 在职员管理关闭全部中央/J1/J2/J3 权限后，桌面和手机仍能浏览；③ mobile 只出货应叫 /mobile/out；④ 需要手机用户专用登录入口
- **手机出货记录页 `/mobile/records?system=jX`**（新 `MobileRecords.tsx`，**1:1 对齐旧 /jX/jXstockeditmobile.php**）：
  CSS 整块机械移植（styles/mobile-records.css，加 .mobrec-root 前缀防污染）——头部（手机出货记录 - JX + 「返回上一页」灰钮 → 桌面进出货）、
  unified-header-row（日期范围[真日历弹窗：月/年切换+两击选范围+今日/起止/区间高亮，对齐旧 selectDate] + 快速选择「时段」8 档 +
  搜索 + 导出数据钮 + 总记录数）、5 列表格（日期「02 Sep」/货品编号/货品/出货[红字三位小数]/出货人，暂无数据态，滚动区）、
  **生成 PDF 发票弹窗**（DD/MM/YYYY 起止 + 店面 j1/j2/j3 + 发票日期 + 后三位 → 复用 getInvoiceData + generateInvoicePdf）；桌面「手机版」按钮改指此页
  （对齐旧 mobile-selector → jXstockeditmobile）。注：旧页的「新增记录」弹窗/「新增库存记录」表单无任何打开入口（孤儿代码），不实现
- **路由改名**：/mobile/inout → **/mobile/out**（旧路径 /mobile/inout、/m/inout、/m/out 均带参重定向）
- **手机专用登录 `/mobile/login`**（新 `MobileLogin.tsx` + `styles/mobile-login.css`，**1:1 对齐旧 /mobile/ch/login.html + css/login.css**）：
  phoneBG 背景图（已拷入 backend/static/images/bg/）+ 玻璃卡片（半透明白+blur+白边框）+ 登入 40px + 账号/密码（眼睛明暗切换）+
  记住我蓝色开关（inv_remember）+ 忘记密码？ + 橙金渐变登入钮 + 渐变分隔线；中文字符过滤对齐旧版；
  登录后按 branch ∩ 权限树解析可用分店——单店直达 /mobile/out、多店玻璃风大按钮选择、无权限提示；支持 ?redirect= 回跳（对齐旧 login.php）；
  手机页未登录自动跳 /mobile/login（带 redirect，不再跳桌面登录页）
- **权限双层化（branch + 权限树）**：
  - 后端 `stockPerms` 新增 `configured`（存在 stock_inventory 记录 = 管理员显式配置过；全空 = 明确关闭，区别于无记录=默认放行）
  - 后端 `MobileStockController.assertBranch` 双层校验：branch + 权限树（配置过且不含该店 → 403）
  - 前端共享 `utils/useMobileAccess`（branch ∩ 权限树 → allowedSystems）+ `MobileDenied` 403 卡片（对齐旧 branch_check.php 样式）
  - 桌面进出货（StockInout）/总库存（StockRecords）系统选项按权限树过滤（无记录 = 全部可用，兼容 demo）；全空 → 整页锁定横幅；
  - 货品种类（StockProducts）修正：以前「记录全空」被当未配置放行（正是用户遇到的 bug），改用 configured 判定
- **验证**：tsc + vite 构建通过；jar 重编译重启；demo（无记录）回归 totals/stock-perms 正常；ELAINE/JASON/ZHI ZEEN（全空权限记录）将被桌面锁定 + 手机 403

### 2. 电话版实测反馈重做：紧凑列表（一屏 8-10+ 货品）+ 去分店切换/返回桌面 + 功能补齐

- **用户实测反馈**：① 首版大卡片太占空间，一屏展示不到 8 个货品；② 分店用户经 URL 直达本店（权限限定），
  不应有分店切换 Tab 和「返回桌面版」按钮；③ 功能与设计未完全对齐旧版
- **设计 1:1 重做**（对照旧源码 `mobile/ch/css/stocklist.css` 逐条移植 → `src/styles/mobile-stocklist.css`，msl- 前缀防冲突）：
  紧凑卡片行（padding 12px 14px、radius 14、行距 10px，390×844 一屏 8-10 个，旧版同密度）+ **吸顶筛选区**（48px 双下拉/搜索、
  滚动常驻，旧版 form-section 行为）+ 页头改为「退出登录」橙钮（清 inv_token 回 /login，对齐旧 logout-button）+ 360px 小屏适配；
  移除分店 Tab 与返回桌面按钮（旧版本就一店一页、无此二者）
- **功能补齐**（对齐旧 stocklistjX.php 脚本）：工作日期按分店持久化 `jX_stock_edit_date`（localStorage+sessionStorage，对齐 workDateManager）；
  保存到非今天日期 → confirm（confirmWorkDateBeforeSave 原文）；分类 Drinks→Service Line 映射；区域下拉未选分类时 = 固定 20 项
  （K1-1…SBDI-2，对齐 allFreezerCategories），选分类 = 涉及区域子集；筛选结果按名称排序；库存不足 → 提示并把输入纠正为最大可用（保持编辑态）；
  成功提示带各价格层明细（RM 单价: 数量）；编辑钮对齐旧版 ✎→绿底白笔单按钮切换（旧版无取消钮，数量未变保存=取消）；日历弹窗文案「选择日期/取消/确定」
- **验证**：tsc+vite 构建通过；puppeteer-core+Edge 390×844 视口 mock 数据截图核对（首屏密度/吸顶/编辑态/绿色保存钮）
- **登录跳转对齐**（分店用户 URL 直达的闭环）：Login 保留被拦截页完整路径+查询（原来丢 `?system=jX` 会回错分店）；
  支持 `/login?redirect=/mobile/inout?system=j2`（对齐旧手机版 login.php?redirect=stocklistjX.php）；新版已同步 backend/static（磁盘伺服免重启）

### 3. 手机登录页 + 手机出货记录页 1:1 视觉重做（用户反馈「与旧系统不一样」）

- **登录页 `/mobile/login`**：login.css + phoneBG 背景图（已拷 backend/static/images/bg/）1:1 移植——
  phoneBG 整幅背景 + 玻璃卡片（半透明白+blur+白边框+radius20）+ 登入 40px + 账号/密码（眼睛明暗切换）+ 记住我蓝色开关 +
  忘记密码？ + 橙金渐变登入钮 + 深蓝渐变分隔线；中文字符过滤；登录后按 branch ∩ 权限树解析分店（单店直达/多店大按钮/无权限提示）
- **手机出货记录页**：旧页 jXstockeditmobile.php 的 `<style>` 块整段机械移植（`styles/mobile-records.css`，脚本加 .mobrec-root 前缀防污染）——
  头部「手机出货记录 - JX」+ 灰色「← 返回上一页」钮（回桌面进出货）+ unified-header-row（日期范围**真日历弹窗**：月/年切换 +
  两击选范围自动交换 + 今日/起止/区间/悬停预览高亮，对齐旧 selectDate + 快速选择「时段」8 档 + 搜索 + 导出数据钮 + 总记录数）+
  **5 列表格**（日期「02 Sep」/货品编号/货品/出货[红字三位小数]/出货人）+ **生成 PDF 发票弹窗**（DD/MM/YYYY 起止 + 店面 j1/j2/j3 +
  发票日期 + 号码后三位，复用 getInvoiceData + generateInvoicePdf）+ 回到顶部
- **实证**：旧页的「新增记录」弹窗/「新增库存记录」表单无任何打开入口（孤儿代码），故不实现；puppeteer 截图逐项比对

### 4. 桌面进出货对齐旧版样式 + 滚动修复

- **头部三按钮 1:1 对齐旧 stockeditall.css**：selector-button 固定宽 clamp(80px,6.77vw,130px) + justify-content space-between（文字左箭头右）+
  手机版钮居中自适应宽 + 右距 16px + 下拉菜单 top96%/margin-top4px；三按钮显式高度 clamp(30px,2.2vw,42px) + 字体继承
  （修复 `<a>`/`<button>` 行高漂移导致大小不一）
- **货品名过长自动换行**（非虚拟滚动模式；虚拟模式 >80 行保持省略号避免滚动定位错位）
- **权限锁定实现修正**：撤销早前插入的 DOM 包裹层（破坏 container flex 链导致表格无法滚动/设计跑位），改为全部 hooks 后提前返回；
  货品种类（StockProducts）同步改用 configured 判定（「记录全空」不再被当未配置放行）

### 5. 电话版两个严重 bug 修复（用户实测发现）

- **编辑全行同步 + 保存错行**：后端分组列表不返回 id → 所有行 `r.id` 均为 undefined → 点任一行 ✎ 全部行进入编辑态、共用输入值，
  且保存命中第一行（100 PLUS 排最前）。修复：每行生成「货品|编号|规格」复合行键，编辑/保存按键定位
- **负价格层多扣货**：100 PLUS 有 -4 的负价格层（历史超发遗留），保存时 totalStock = 各层之和但**负层截 0**（照搬旧 live 算法）→
  计算口径 78 ≠ 列表显示 74 → 输 73 实扣 5。修复：totalStock 改含负层真实净值（与列表口径一致，有意偏离旧版）；
  HIFO 扣货仍只从正数层扣（avail≤0 跳过），不会把负层扣得更深；bug 期间的误扣记录已软删清理，100 PLUS 还原 74

### 6. 手机出货双向闭环 + 全站实时推送

- **桌面删除 → 手机记录连删**：桌面进出货删除手机来源镜像行（mobile_ref_id）→ 联动硬删手机台账记录 + 反冲 jXstocklist_total 缓存
  （幂等，已删静默）；**桌面恢复 → 联动重建手机记录**（按桌面行数据重插，桌面行 mobile_ref_id 回指新 id + 缓存回补）
- **全站实时推送**：手机端创建/更新/删除/batch-save 后广播 stock_changed（对齐桌面写操作模式）→ 桌面页面自动刷新；
  手机版页/手机出货记录页订阅实时推送（编辑/保存中暂停刷新不打断输入，节流+尾部补刷）
- **端到端验证**：手机出 1 件 → 手机台账+桌面镜像出现 → 桌面删除 → 手机记录消失+镜像进回收站 → 桌面恢复 → 手机记录重建+回链 → 全链路清理
- **数据对齐**：live 已删的 3 条手机记录（j1 id587 + j3 id12947/12948）本地软删对齐（live 列表口径 344/1331/4500 完全一致）

### 7. 总库存报错排查 + 根治（用户反馈「打开总库存报错」）

- **排查**：本机全链路验证均正常——70 张表 mysqlcheck 全 OK；总库存接口中央/J1/J2/J3 与各员工权限类型实测正常；headless 浏览器真实打开总库存页 994 行无报错。
  复现报错机制：总库存依赖的 4 张核心表（stockinout_data + j1/j2/j3stockedit_data）任一缺失/损坏时，后端返回错误信息被前端整段弹出为红色报错
- **根因**：更新系统脚本的导入流程存在竞态——MariaDB 重启后只固定等 8 秒即备份/导入，本机 14:02 运行时已实际产生 0 字节备份
  （pre_update_20260902_140243.sql）；用户机器同流程会导致数据库被清空/导入残缺 → 打开总库存必然报错
- **修复 update.ps1 导入流程**：① MariaDB 就绪改为 mysqladmin ping 轮询（最多 120 秒）；② 备份为空但当前库有表时直接取消导入（不再可能毁掉唯一好数据）；
  ③ 每步导入检查退出码，失败立即中止并提示回滚命令；④ 改用 mysql source 导入（避免 PowerShell 管道逐行重编码）；⑤ 导入后额外验证总库存 4 张核心表可读
- **后端报错提示友好化**（GlobalExceptionHandler）：数据库异常不再把原始 SQL 弹给用户，改为可操作提示（重启系统重试/重新导入数据包），完整细节保留在后端日志；
  jar 重编译并重启，正常/报错两条路径均实测通过

### 8. 进出货长货品名自动换行（不再省略号截断）+ 本周/上周改周一起算

- **问题**：进出货表格记录数 >80 时启用虚拟滚动，此前虚拟模式为对齐固定 37px 行高，货品名强制 nowrap+省略号，长名（如 sushi…）展示不完整
- **变高行虚拟滚动（估算种子 + DOM 实测校正）**：货品名 CSS 自然换行（两种模式均生效，不截断不裁剪）；
  行高先用 canvas 按真实字体/列宽逐行估算做种子（参数与 CSS clamp() 完全一致），渲染后用真实 DOM 高度实测校正，虚拟画布前缀和随之修正——
  估算偏差只触发一次重算，不产生累积漂移；批量保存后回跳定位改用前缀和
  （第一版曾用估算高度强制限高导致个别行文字被裁剪，同日重做为自然换行+实测校正，无任何裁剪）
- **实测**（今年范围 18445 条虚拟模式）：横向截断 0、纵向裁剪 0、滚动中部/深处渲染带与上下留白接缝偏差 0px、滚到底正常、无 JS 报错；非虚拟模式（29 条）同样 0 截断
- **本周/上周周一起算**（用户反馈本周应为 31/8-2/9）：原为周日(getDay)起算（30/8-2/9），改 (getDay+6)%7 周一起算——本周 31/8-今天，上周一 24/8-日 30/8

### 9. 系统整体体检（晚间）

- 后端 8081 / MariaDB 3306 运行中；70 张表 mysqlcheck 全部 OK；
  总库存/进出货/最低库存/改价日志/仪表盘/碗碟/权限等 10 个核心接口全部 200；
  前端静态资源与最新构建一致（index-0TiVnUs1.js）；后端日志无真实故障（仅浏览器中途断开的常规噪音）

---
---
## 🗓️ 2026-09-01

### 1. 总库存「改价记录」（新表 price_change_log）

- **货品种类**每次更改单价 → 自动记录一条 log（旧价 → 新价、当天日期、操作人；价格未变不记录，只改名字不记录）
- **总库存页**展示：有改价记录的货品名旁显示 🕘 图标（无记录完全零痕迹）；悬停货品名提示最近一次改价；**点击货品名弹窗展示从旧到最新的完整历史**（旧价划线 → 新价，含日期与条数）
- 后端：新增 `PriceChangeLogMapper`（insertLog / listByProduct / latestAll）+ XML；`StockProductMapper.findById`（取旧价）；`StockProductService.update` 改价挂钩（decodeHtml 与流水/总库存货品名口径一致）；`StockEnhanceController` 新增 `GET /products/price-log`、`GET /products/price-log-latest`
- 建表 SQL 已追加 `add_new_tables.sql`（幂等；老库导入后执行一次即可）

### 2. 进出货：编辑补勾选「货品备注 / 备注编号」（当初漏勾漏填可补救）

- 编辑**进货**记录补勾选备注、编号留空 → 后端**自动生成下一个可用编号**（`StockService.updateInout` 支持 needGenerateCode，对齐创建路径；避让在库编号）
- 编辑行备注编号展示**对齐新增行**：前缀-编号组合框（纯进货编号框禁用显示「自动」；出货可手填且校验在库）；只填前缀（如 "AB-"）视为待自动生成，不会被当成编号入库；格式不完整拦截保存
- 分店 jXstockedit_data 无备注编号列，不受影响

### 3. 最低库存设置：清空输入 = 0

- 删除数值后失焦 / Ctrl+S 批量保存 / 行内保存 → 一律**视为 0**（取消最低库存限制），不再弹回原值逼用户手输 0；真正非法字符（abc 等）仍恢复原值
- 行内保存优先读最新待保存值，修复闭包旧值边缘错误

### 4. 货品备注卡片统计：根据货品判断展示

- "N PCS" 判断从硬编码 2 个货品（SALMON BELLY/HEAD 10PCS）推广为**通用规则**（名称/规格正则提取件数，任意 5/10/20PCS 自动匹配：📦 总件数 = 编号数 × N）
- 标签人性化：`总量: 345.57` → **`总重量: 345.57 Kilo`** / **`总件数: 160 PCS`**，新用户一眼看懂数字含义
- 数值统一 toFixed(2)，规避 BigDecimal stripTrailingZeros 的科学计数法显示隐患

### 5. 全站滚动条统一改版（index.css）

- 14px 加粗、圆角胶囊 + 悬空留边、hover/active 三态变色、轨道透明；横向滚动条同步
- `!important` 全局压制各页面散落的 6px 细条定义（add/corporate/cost/kpi/phone/qna/schedule/sidebar/staff 等），Firefox scrollbar-color 同步配色

### 6. 全站 Toast 改版（utils/toast.ts + styles/toast.css）

- 位置：右下角 → **顶部居中**（与报错提示位置一致；手机端贴顶全宽）
- 入场：顶部下滑弹性落位；退场向上收回
- 设计：毛玻璃白底 + 彩色圆形图标底衬（绿✓ 红✕ 黄！ 蓝ⓘ）+ 柔和大投影 + 底部进度条；关闭按钮悬停放大
- API 完全不变（showToast/showAlert/closeToast），全部调用点零改动自动套用

### 7. KPI 数据上传着色对齐（KpiEdit.tsx）

- `inputCls` 对齐 CostEdit / 旧系统 updateInputColors：**非编辑行也按数据状态着色**——有值(含 0)→浅蓝、未填→浅红；折扣列维持"关键字段 ≥4 项"规则
- 整月数据完整度打开页面即可扫视，不再只有编辑行变色

### 8. 侧边栏收起态悬浮 flyout（AppLayout.tsx + sidebar.css）

- 收起后悬浮分组图标 → 弹出白色手风琴面板；点击品牌/分店**在面板内逐级展开**（grid 平滑动画、箭头旋转、缩进+圆点层级），点击页面**直达**（例：集团架构 → tokyo Japanese cuisine → J1 Midvalley → 员工排班表）
- 当前所在页橙色高亮、hire 待审徽章保留、长名称省略号、导航后自动收起全部面板
- 旧「组名+页面列表」只读 tooltip 彻底移除（JSX/state/CSS 全清）

### 9. 侧边栏收起态 Flyout 与 Active 修复（AppLayout.tsx + sidebar.css）

- 收起侧栏后悬浮分组图标 → 白色手风琴面板：点击品牌/分店**面板内逐级展开**（grid 平滑动画、箭头旋转、缩进+圆点），点击页面直达（集团架构 → tokyo → J1 Midvalley → 员工排班表）
- 旧「组名+页面列表」只读 tooltip 移除（JSX/state/CSS 全清）
- **双 Active 修复**：组标题 active 由"点开过哪个组"（openGroups 残留）改为**跟随当前页面所在组**——点其他页面旧高亮自动消失；go() 导航清 openGroups/flyout 定时器；汉堡切换清 flyout，展开态侧栏与 flyout 不再并存
- 收起态下当前页所在组图标橙色反白，一眼可见当前位置

### 10. 部署脚本与静态资源治理

- 修复 `backend/static/assets` 孤儿构建产物堆积（index.es-* 系列从未被清理）；部署时以 `dist/assets` 为基准镜像同步，并同步复制 `index.html`

### 11. 总库存导出：日期范围选择（对齐旧 live 系统）

- 点击「导出数据」→ 弹出日期范围弹窗（默认本月；快捷 今天/本月/上月/全部；日期上限=今天；结束必填、开始≤结束校验）
- 语义对齐旧 stocklistapi.php：库存累积计算，**结束日期 = 截至该日的库存余额**（SQL `date <= endDate`）；开始日期不参与计算、仅用于 PDF 标注
- 「全部」（无开始且结束=今天）→ 用页面当前数据（对齐旧 usePageData）；指定范围 → `GET /stock/summary?endDate=` 拉取后导出
- PDF 日期行：有开始 → `Date Range: MM/DD/YYYY - MM/DD/YYYY`；否则 `As of Date`；J2 排除 Sake / 最低库存列 / 总计行等原有行为保留
- 后端：`StockSummaryMapper.summaryRows` 加可选 endDate 参数 + XML 条件；`StockSummaryService.summary(system, endDate)` 重载；`StockController` 加 endDate 入参

### 12. 总库存与 live「对不上」排查结论 + 文档沉淀（虚惊一场实录）

- **现象**：本地 `/records?system=j1` 总库存和 live `stocklistall?system=j1` 看起来对不上
- **排查**：`sync-live-stock.cjs --full` 全量流水对账（2025 至今三店 0 差异）→ 抓 live `stocklistapi.php?action=summary` JSON vs 本地同口径 SQL 逐行对账（行数/每行数量/库存合计/库存总值全部相等）
- **结论**：数据 100% 对齐，纯属**显示口径差异**：live 同货品不同进价拆多行（幽灵组，如 100 PLUS = 51@1.14 + 31@1.45 两行），新系统 `StockSummaryService`/前端 `mergeSummaryItems` 合并成一行（82，变体价存 `price_variants`）——总数一致，别当数据缺失去"补"
- 顺带确认两个非错误差异：live 名字里的 HTML 实体（`&#039;`）本地已按文档清洗；`SURUME IKA` 名字里有 live 带来的制表符
- **文档沉淀**：OPS.md 第二节新增「本机环境状态」（XAMPP 已弃用，改用内置库 runtime/mariadb，
  sync 脚本需设 `MYSQL_CMD`/`MYSQLDUMP_CMD`）+「总库存与 live 对不上标准排查流程」三步法；DB_IMPORT.md 验证清单加提醒 + 踩坑 #6
- 当天附带修复：XAMPP 数据目录损坏导致 MariaDB 起不来（孤儿表空间 + Aria 系统表损坏），改用内置库全新导入最新 dump (3).sql，全量验证通过后由 start.ps1 接管

### 13. 手机版进出货对齐旧 live（新模块：/m/inout + /api/stock/mobile/*）

- **后端** `MobileStockController`/`MobileStockService`/`MobileStockMapper`：完整复刻旧四步数据流（事务内）——
  ① jXstockeditmobile_data 主写 ② jXstocklist_total 缓存增减 ③ jXstockedit_data 镜像同步（receiver='Mobile' + mobile_ref_id）
  ④ 出货 HIFO 跨价格组拆行（FOR UPDATE）；指定价格层则单行直写并预检该层可用量
- 更新=关键字段变更撤旧加新/否则差值回补 + 桌面镜像删旧重同步；删除=mobile 硬删 + total 反冲 + mobile_ref_id 级联删桌面行
- 端点：records(CRUD) / price-tiers / options / totals；动态表名由 service 白名单映射
- **前端** `MobileInout.tsx`（路由 /m/inout?system=jX，独立布局无侧边栏）：日视图记录 + 前后翻日/今天、
  新增/编辑底部抽屉（类型分段、货品搜索下拉、出货价格层选择带可用量提示）、删除确认、总库存视图（读缓存表，带搜索）；桌面进出货页「手机版」按钮接通（原占位提示移除）
- 冒烟验证：创建进货→镜像+缓存 ✓；出货指定层→单行 @层价 ✓；PUT→镜像重写 ✓；DELETE→级联还原 ✓（测试数据已清理）

### 14. 电话版出货上线 + 数据源修正 + UI 对齐旧 live 手机应用

- **第一版后修正**：列表数量原读 `jXstocklist_total` 缓存表（已漂移：100 PLUS 缓存 1010，实际 82）；
  实测旧版 `stocklist_total` action 是**从 jXstockedit_data 实时计算**（按 product+code+spec 分组，注释「避免双重计算」）——已改同口径，
  截图对比验证：显示记录 255 / 总记录 262、各货品数量与 live 逐行一致
- **UI 像素级对齐旧 /mobile/ch/ 手机应用**（截取 live 页面实测）：白头区（返回/标题/日期/日历钮）、
  库存分类+区域双下拉（区域选项随分类联动）、搜索钮、stats（显示记录/总记录）、大圆角卡片 + 奶油编辑块、数量三位小数
- **电话版业务**：点 ✎ 改「剩余量」→ 保存时差值=出货量 → 实时按价格层预检 → HIFO 拆行 → batch-save 原子提交（receiver=当前用户名）
- **权限**：users.branch 校验（kh 全通/否则须含分店）覆盖全部 /api/stock/mobile/* 端点；分店 Tab 按 branch 过滤
- 路由定为 **/mobile/inout?system=j1|j2|j3**（/m/inout 重定向）；桌面进出货「手机版」按钮接通
- 明日续作清单已写入 docs/LEGACY_MOBILE.md 第六节（真机实测 / 出货记录 log 页 / 路径清理）

---

## 🗓️ 2026-08-29

## 1. 本地 AI 助手（Ollama + Qwen3-4B）：库存问答 / 进出货草稿 / 订单秒级解析

**背景**：进出货页面需要一个零费用 AI 助手帮用户查库存、录入出货单。选型本地 Ollama + Qwen3-4B Q4_K_M（GTX 1650 4GB 可装下）。安全设计：**AI 只生成草稿，用户确认后才写库**（走原有验证/HIFO/备注码流程）。

**后端**：
- 新增 `AiController`（POST `/api/ai/chat`、`/api/ai/parse-order`，受全局 JWT 保护）与 `AiService`（RestClient 调 Ollama `/api/chat`，think=false，工具循环 ≤6 轮）
- 6 个工具：`search_products` / `get_stock_summary` / `get_stock_records` / `get_minimum_alerts`（只读查询）；`draft_stock_inout`（单条草稿）/ `draft_order_batch`（批量草稿）
- **StockSummaryMapper 新增两条货品匹配查询**（草稿自动补全编号/规格/单价用）：
  - `latestProductInfo(table, words, full)`：最新一笔流水的货品信息（**取最新真实单价**，避免历史异常价；分词 AND 模糊 + 精确名优先；零库存/已售罄也能查到）
  - `stockDataProductInfo(words, full)`：台账 stock_data 兜底（从无流水的新品；无价时 AI 向用户追问）
  - 货品匹配三级兑底链：库存汇总（有净库存）→ 最新流水价 → 台账主表；**分词 AND 匹配**解决词序差异（"tanaka sake" → TANAKA VIET SAKE）
- 订单确定性解析 `/api/ai/parse-order`：正则解析 "udon-2 / nama panko -2 / 1. 2 kg XX"（单行多行通吃），跳过 Date/Kitchen 等表头，识别订单日期（D/M/Y）与送达分店（J1/J2/J3），**不走模型 → 11 条订单 1.5 秒全匹配**（纯模型路径曾需 89~234 秒且漏配）
- `application.yml` 新增 `ollama.base-url` / `ollama.model`（环境变量 OLLAMA_BASE_URL / OLLAMA_MODEL 可覆盖）

**前端**：
- 新增 `components/AiAssistant.tsx`：进出货页右下角聊天球（问答 / 单条草稿卡 / 批量订单草稿卡 + 送往分店下拉可改 / 对话内发「确认执行」直接触发批量执行）；`api/ai.ts`
- 多行或分段订单自动走确定性解析；确认后逐条调用原有 `createStockInout` 并汇总成功/失败，页面自动刷新

**性能调优**：模型上下文 8192→3072 + KV 缓存 q8_0（GPU 占比 70%→87%）；工具结果只回喂摘要给模型（大 JSON 直走内存给前端）

**数据修复**：执行 `sync_cleanup.sql` 清洗 HTML 实体货品名（F&amp;N→F&N、&#039;→' 等），流水/台账残留 0，总库存重复行合并（F&N SWEET CREAMER 净库存 12、S&B CURRY KO 6）

**升级路径**：无表结构变更；拉取后重跑 `一键启动.bat` 即可（后端 jar 已内置仓库）

---

## 2. 一键启动集成 AI 服务（新用户开箱即用）

- `start.ps1` 新增 `Ensure-Ollama` / `Ensure-AiModel` / `Download-Parallel`（8 线程分块 + 断点续传 + 校验重试）：Ollama(1.4GB, GitHub) 与 Qwen3-4B(2.4GB, HuggingFace) 缺失时自动下载、解压、`ollama create kunzz-ai` 导入后删除 gguf 释放空间
- 首次运行可选跳过（Y/S）；环境变量 `KUNZZ_SKIP_AI=1` 永久跳过；退出时自动停止 AI 服务
- 修复：8081 被自家旧后端进程占用时误报"端口被占" → 现自动终止旧实例重启
- README 新增「🤖 本地 AI 助手」章节；`backend/target/inventory-backend-1.0.0.jar`（含 AI 接口）首次纳入仓库，新克隆/下载 zip 的用户开箱即用

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

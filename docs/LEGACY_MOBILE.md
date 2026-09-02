# 📱 旧版 live 手机版进出货 调研（对齐开发前置）

> 调研日期：2026-09-01。来源：旧系统源码归档 `Downloads/kunzzgroup-main (1) (1)/kunzzgroup-main`（j1/j2/j3 + backend + mobile/ch），
> 交叉验证本地库 `u690174784_kunzz`（dump 自 live，含全部手机表与数据）。
> 用途：新系统对齐旧版 PHP 手机版的开发依据。

---

## 一、旧版手机端全景（三套资产）

| 资产 | 路径 | 说明 |
|---|---|---|
| **手机版进出货主页**（每店一份） | `/j1/j1stockeditmobile.php`、`/j2/…`、`/j3/…`（各 ~313KB 自包含 HTML+CSS+JS） | 桌面版 `stockeditall.php` 的**手机优化完整克隆**，功能集与桌面一致 |
| **手机版专用 API**（每店一份） | `/jX/jXstockeditmobile_api.php`（各 ~45KB） | 全部数据读写走它；页面本身 0 句 SQL |
| **独立手机总库存小应用** | `/mobile/ch/`：login.html/php、branch_check.php、stocklistj1/j2/j3.php、stock-date-utils.js | 有自己的登录页（标题「登入 - KUNZZ HOLDINGS」），验证**同一套 users 表**；库存列表页直接读 `jXstocklist_total` 缓存表 |

**入口**：桌面版 `backend/stockeditall.php` 顶部有「手机版」按钮（`mobile-selector`，按用户 branch 显示对应店的链接）；手机用户也可直接收藏 URL。鉴权 = `backend/session_check.php`（与桌面同一 session），API 按 `$_SESSION['branch']` 校验（须含 J1/J2/J3 或 KH）。

**三店版本关系**：J1/J2 几乎相同（313KB），J3 略新（318KB，附带 `create_j3stockeditmobile_tables.sql` 建表脚本，功能一致）。三份是克隆代码，改一处要改三处。

---

## 二、数据架构（对齐的核心）

### 涉及的表（本地库已全部随 dump 带入 ✓）

| 表 | 角色 | 结构要点 |
|---|---|---|
| `jXstockeditmobile_data` | **手机专用台账**（J1 现存 376 行） | date, time, product_name, code_number, specification, type, in_quantity, out_quantity, receiver, created_at/updated_at, deleted_by/deleted_at（软删） |
| `jXstockedit_data` | 桌面正式台账（J1 22,300 行） | 含 **`mobile_ref_id`** 列 → 关联手机记录；手机同步来的行 `receiver='Mobile'`、`target_system='jX'` |
| `jXstocklist_total` | 每店**库存总数缓存** | product_name + code_number + specification 唯一，total_qty, last_updated |
| `stock_data` | 货品主数据 | 手机端下拉/编号反查用 |

> 注：J3 建表脚本显示 mobile_data 初版是精简表（无 spec/type/receiver），后来 ALTER 加列——**以实际表结构为准**（上方即 live 真实结构）。

### 数据流（POST 创建一条手机记录，事务内）

```
手机提交
  ① INSERT INTO jXstockeditmobile_data（手机台账主记录）
  ② UPDATE jXstocklist_total（按 product+code+spec 增减 total_qty）
  ③ 同步到 jXstockedit_data（正式台账）：
       · 进货/纯入库 → 单行插入（receiver='Mobile', target_system='jX', mobile_ref_id=手机记录id）
       · 出货 → 「smart deduct」智能扣货：
           SELECT 按 (price, specification) 分组的可用库存，
           HAVING available > 0，ORDER BY price DESC   ← HIFO 高价层先扣
           逐层拆行 INSERT（每层一行 out_quantity，同一 mobile_ref_id）
           层扣完仍有剩 → 按最低价层再插一行兜底（允许负库存，error_log 记录）
  ④ 返回新记录 JSON
```

- **PUT 更新**：读旧记录算差值 → 改 mobile_data → 差值回补 stocklist_total 与桌面表（经 mobile_ref_id 定位）。
- **DELETE**：删 mobile_data 行（软删字段存在）+ **按 mobile_ref_id 精准删除**桌面表中该手机记录同步产生的行（出货拆行会产生多条，一并删）。
- 出货接口会**拒绝超扣提示但允许继续**（与桌面一致，负库存兜底，error_log 留痕）。

### 手机专用 API action 清单（j1stockeditmobile_api.php）

| 方法 | action | 用途 |
|---|---|---|
| GET | `list` | 按日期范围列记录（日历/列表视图） |
| GET | `single` / `codenumbers` / `products_list` | 单条 / 编号下拉 / 货品下拉 |
| GET | `product_by_code` / `code_by_product` | 编号⇄货品名互查（新增行联动） |
| GET | `stocklist_total` | 该店库存总数（读 jXstocklist_total） |
| GET | `product_stock_by_price` | **按价格分组的可用库存**（含负数，供出货选价格层） |
| POST | 创建 | 见上方数据流 |
| PUT / DELETE | 更新 / 删除 | 见上方 |

---

## 三、手机页 UI 功能（= 桌面版功能集的手机化）

页面标题「手机出货记录 - J1」（J3 为「出货记录」），容器 `max-width 1800` + `height:100vh` 不整页滚动的布局。功能与桌面 stockeditall 一致：

- **日历月视图**（createDayElement/changeMonth）+ 快捷范围：今天 / 昨天 / 本周 / 上周 / 上个月 / 今年 / 去年 / 日期范围
- **行内新增**：货品/编号双向 combobox（带库存提示 `checkProductStock`、按价格选层 `createNewRowPriceSelectWithStock`）、日期可另选（addNewRowWithDate）、一次多行（createMultipleRows / batchSaveNewRows）
- **字段**：日期、时间、货品、编号、进/出数量、类型、收货人、备注、备注编号、店面、发票号码后三位、发票日期、申请人
- **编辑 / 删除 / 审批**（approveRecord）/ **批量删除**（confirmBatchDelete）
- **导出**（exportData + 导出弹窗，pdf-lib 生成发票）
- Toast 提示体系（showToast/closeToast/closeAllToasts）

> 新系统 `StockInout.tsx` 已实现对齐桌面版的这些能力（含 mobile_ref_id 列在表结构中存在），
> **对齐手机版 = 把这套交互在手机尺寸下重做一遍**，并接通同一套数据流。

---

## 四、新系统对齐开发清单（建议）

1. **路由与入口**：新系统后台（React SPA）增加手机版进出货路由（如 `/m/inout?system=j1`），桌面进出货页加「手机版」入口（对齐旧版 mobile-selector 位置逻辑）
2. **页面**：单组件按 `system` 参数复用（不做三份克隆）；竖屏布局：日历/列表 + 底部大按钮新增 + 行内 combobox（价格层带库存提示）
3. **后端 API**：新增 `/api/stock/mobile/*`（或复用现有 inout API + 参数），必须实现旧版四步数据流：
   mobile_data 主写 → stocklist_total 缓存 → 桌面表同步（`receiver='Mobile'`、`mobile_ref_id`）→ **出货 HIFO 跨价格组拆行**
4. **删除/更新语义**：按 mobile_ref_id 级联桌面表行（出货拆行多行全删），差值回补 total 缓存
5. **手机总库存页**：对齐 `/mobile/ch/stocklistjX.php`（读 jXstocklist_total），含独立免导航入口
6. **权限**：沿用 JWT 用户 branch（J1/J2/J3/KH）过滤；KH（总部）可看全部
7. **兼容红线**：
   - `jXstocklist_total` 缓存必须与桌面表汇总保持一致（旧版靠增量维护，新系统写入路径必须同样维护它，否则手机总库存页会显示错数）
   - 与 live 双跑期间：sync-live-stock.cjs 已读取 `mobile_ref_id` 列——新系统写入该列的语义必须与旧版一致
   - 产品名 `&amp;` → `&` 解码口径不变（API 里有显式 Normalize）
8. **表结构**：无需建新表（三套表已随 dump 存在）；确认新后端实体不破坏 `mobile_ref_id` 列

---

## 五、快速事实卡

- 手机表行数：J1 376 / 桌面 22,300 → 手机是**低频补充入口**，桌面仍是主战场
- smart deduct 排序：`ORDER BY price DESC` = **HIFO（最高进价先出）**，与桌面/新系统 HIFO 口径一致
- 手机同步行在桌面表的标志：`receiver='Mobile'` + `mobile_ref_id` 非空
- `jXstocklist_total` UNIQUE 键：`(product_name, code_number)`（建表脚本）+ specification 维护（运行时 SQL 带 spec 过滤）
- 旧版手机页 CSS 已内嵌（注释：移除不存在的外部样式引用以避免 404）——新系统无此历史包袱

---

## 六、电话版（stocklistjX）实现状态 —— 2026-09-01 完成，09-02 实测反馈重做 + 出货记录页上线

> 新系统实现：路由 **`/mobile/out?system=j1|j2|j3`**（页面 `MobileOut.tsx`，独立布局无侧边栏；旧路径 /mobile/inout、/m/inout 重定向），
> 手机出货记录 **`/mobile/records?system=jX`**（页面 `MobileRecords.tsx`，对齐旧 /jX/jXstockeditmobile.php，桌面进出货「手机版」按钮落点），
> 手机专用登录 **`/mobile/login`**（页面 `MobileLogin.tsx`，登录后单分店直达 / 多分店大按钮选择，支持 ?redirect=），
> 后端 `/api/stock/mobile/*`（`MobileStockController`/`Service`/`Mapper`）。
> 已通过截图对比验证：**显示记录 255 / 总记录 262、各货品数量与 live 逐行一致**。
> **09-02 更新**：① 用户反馈首版卡片太占空间 → UI 按 stocklist.css **1:1 重做**（紧凑卡片行 + 退出登录钮 + 无分店 Tab）；
> ② 路由改 /mobile/out（只出货）；③ 手机出货记录页 **1:1 重做**（旧页 CSS 整块移植 .mobrec-root：头部返回钮 + unified-header-row +
>    真日历弹窗两击选范围 + 快速选择 8 档 + 5 列表格（02 Sep/红字三位小数）+ 生成 PDF 发票弹窗；旧页新增弹窗/表单是无入口孤儿代码，不实现）；
> ④ 手机专用登录页 **1:1**（login.css 移植：phoneBG 背景 + 玻璃卡片 + 记住我开关 + 眼睛切换 + 橙金渐变钮）；⑤ 权限双层化（见下）。

### 已对齐（勿回退）

### 已对齐（勿回退）

| 项 | 说明 |
|---|---|
| 数据源 ⚠️ | **必须实时计算**：按 `product+code_number+specification` 分组 `SUM(in)-SUM(out)` 自 `jXstockedit_data`（对齐旧 `stocklist_total` action，注释原话「避免双重计算」）。**不要用 jXstocklist_total 缓存表**——缓存已漂移（实测 100 PLUS 缓存 1010，实际 82） |
| 业务 | 改「剩余量」= 出货：出货量 = **实时库存（含负价格层真实净值，有意偏离旧版：旧版负层截 0 会导致多扣货，见 OPS）** − 输入值；超扣拒绝（提示当前库存并把输入纠正为最大可用、保持编辑态）；无变化取消；保存前工作日期非今天 → confirm（对齐旧 confirmWorkDateBeforeSave）；按价格从高到低拆行（每层时间 +1s，receiver=当前用户名）→ batch_save 原子提交；成功提示带各层明细（RM 单价: 数量）；**行定位用「货品|编号|规格」复合键**（后端分组列表无 id，早期版本用 undefined id 导致全行同步编辑/保存错行，已修勿回退） |
| 预检 | batch_save 按 (product, code, price) 聚合比对可用量，**不按 spec 过滤**（对齐旧 outSummary） |
| 筛选 | 库存分类（category，Drinks→Service Line 映射）+ 区域（**未选分类 = 固定 20 项** K1-1…SBDI-2，选了分类 = 该分类涉及区域子集，对齐旧 updateFreezerCategoryOptions）+ 搜索（名称/编号）；**隐藏 qty ≤ 0**；筛选结果按名称排序 |
| stats | 显示记录 = 筛选后行数；总记录 = summary 行数（product+code+spec+ROUND(price,2) 且 net≠0 = 262） |
| 数量格式 | **三位小数 `99.000`**（旧版 number_format(qty,3)），不得改成整数 |
| 权限 | **双层**：① users.branch（kh 全通/否则须含分店，后端 MobileStockController + 前端同源）；② 页面权限树 stock_inventory.system（后端 configured 标记：记录存在且全空 = 明确关闭 → 后端 403 + 前端 403 卡片；未配置老手机账号 → 放行）；所有端点 403 口径一致；**页面无分店切换、无返回桌面入口** |
| 页头 | 左「退出登录」橙钮（清 inv_token 回 /mobile/login，对齐旧 logout-button）+ 标题 + 日期（M月D日）+ 日历钮；工作日期按分店持久化 `jX_stock_edit_date`（localStorage+sessionStorage，对齐旧 workDateManager） |
| 设计 | stocklist.css **1:1 移植**（`src/styles/mobile-stocklist.css`，类名 msl- 前缀）：#f4f7f2 底 / 480px / 吸顶筛选区（48px 下拉+搜索、radius 14）/ stats 13px / **紧凑卡片行**（padding 12px 14px、radius 14、行距 10px，一屏 8-10+ 货品）/ 数量框编辑态 #583e04 边框 / ✎→绿底保存单按钮切换（旧版无取消钮，数量未变保存=取消）/ 360px 小屏适配 |
| 实时 | 手机页订阅全站 WebSocket 推送（编辑/保存中暂停刷新，节流+尾部补刷）；手机写操作（创建/更新/删除/batch-save）→ 广播 stock_changed → 桌面自动刷新 |
| 双向闭环 | 桌面删除手机镜像行 → 联动硬删手机台账记录+反冲缓存；桌面恢复 → 联动重建手机记录（桌面行 mobile_ref_id 回指新 id）；与桌面删除/恢复（撤销）完全对称 |

### 明日续作（按优先级）

1. **手机真机实测**：J1/J2/J3 三店 + kh 账号各验一遍（登录、列表数量、改量出货、HIFO 层提示、权限拦截）——09-02 已在桌面浏览器验证，真机待测
2. ~~手机出货记录 log 页~~ → **已完成（09-02）**：/mobile/records（快速日期 8 档 + 日期范围 + 搜索 + 记录卡 + CSV 导出；发票 PDF 导出待对齐）
3. ~~电话版页加「出货记录」入口~~ → 改由桌面进出货「手机版」按钮直达 /mobile/records（对齐旧 mobile-selector → jXstockeditmobile）；手机端如有需要后续再加入口
4. ~~`sync-live-data.bat` / `DB_IMPORT.md` 路径从 XAMPP 改指内置库~~ （XAMPP 已弃用）
5. 日常：`sync-live-stock.cjs --days=2 --apply`（暂停 OneDrive 后跑）；**数据目录已迁 `C:\kunzz-mariadb-data`（09-02 根治 OneDrive 损坏，见 OPS.md 四）**
6. 桌面「进出货/总库存/货品种类」已按权限树过滤系统选项；**货品异常（/sot）页面未接权限树，后续补**；桌面库存类 API 的后端级权限校验也待补（当前仅手机端接口后端强制）

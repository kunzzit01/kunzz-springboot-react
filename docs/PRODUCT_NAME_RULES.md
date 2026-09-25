# 货品名规范 与「出不了货」排查手册

> 起因：2026-09-25 `SK 0045 / OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML` —— 总库存显示有 1 瓶，
> 出货却被后端拦住「库存不足！可用库存: 0，请求出库: 1」。根因是名字里 `JIKOMI` 与 `700ML`
> 之间**是两个空格**。事故全过程见 `CHANGELOG.md` 2026-09-25 的 `name-whitespace-cleanup` 一条；
> 清洗脚本为仓库根目录的 `fix_name_whitespace_20260925.sql`（幂等）。

---

## 0. 为什么一个空格能造成这么大后果（30 秒版）

- 本系统拿**货品名当货品身份**：总库存按 `GROUP BY product_name` 分组；最低库存、改价日志、
  手机版总库存缓存、备注编号也都按名字关联。
- 网页渲染会把连续空格折叠成一个 → **在界面上永远看不出来**（`A␣␣B` 和 `A␣B` 长得一模一样），
  导出 Excel、截图同样看不出来；只有把字节打出来（`HEX()` / `LENGTH()`）才看得见。
- 2026-09-24 起，写入端会自动把连续空白折叠成一个空格（`common/ProductName.java`，
  挂在货品种类与进出货的请求上），而出货的库存校验是按这个**规范化后的名字**去**精确比对**历史数据的。
- 于是：**名字里带多余空白的旧数据 = 看得到有货、却永远出不了货**；而且一旦有新的进货写进来，
  同一条货品会在总库存里**裂成两行**（2026-09-19 `SURUME IKA P` 就是这样裂的，那次是名字里夹了制表符）。

**一句话规矩：一个货品只能有一个写法 —— 单空格、首尾无空格。**

---

## 1. 给一线（录入 / 仓管 / 出货）的规矩

### 要做

1. **新建货品前先搜**：按编号或名字搜一遍「货品种类」，已有就复用，别造第二个"看起来一样"的。
2. **货品名从「货品种类」里选或复制**，不要手打。
3. 名字中间只留**一个**空格；开头、结尾不要留空格。
4. 规格（`Bottle` / `Packet` / `Kilo` / `Nos` …）一律用下拉里的固定值，不手打。
5. 发现名字写错了、或这个货品出不了货：**报给管理员，并带上货品编号**（如 `SK 0045`）。

### 不要做

- ❌ 从 **Excel 单元格 / 发票 PDF / 微信消息**里复制货品名 —— 这些地方常带不可见字符
  （尾部空格、制表符、不换行空格），复制进系统就是另一条"货品"。
- ❌ 在流水里手打一个"差不多的"名字 —— **差一个空格就是另一条货品**，库存会分开计。
- ❌ 出货被拦住时反复重试，或自己改名 / 删掉那条记录 / 重新录一条 —— 改名要走「货品种类」编辑
  （它会级联改历史），删记录和重录只会让库存更乱。

### 出货被拦住时的三步自助

1. **F5 刷新页面**再试一次（下拉里可能还缓存着改名前的旧名字）。
2. 还是不行 → 把**货品编号**记下来报管理员，别自己试各种写法。
3. 如果这个货品在总库存里显示有两行（同样的名字、同样的编号出现两次）→ 也要报管理员（属于裂行）。

---

## 2. 给管理员 / IT

### 2.1 例行体检（每月一次；以及**每次重新导入旧 dump 之后**）

只读、不改数据。下面任意一行输出都表示"这条货品的名字有问题，迟早会卡住出货或在总库存裂行"：

```sql
-- 在 mysql 里先选中库（生产库名 u690174784_kunzz）
SELECT 'stockinout_data' AS tbl, product_name, HEX(product_name) AS hx, COUNT(*) AS n
  FROM stockinout_data
 WHERE product_name LIKE '%  %' OR product_name LIKE ' %' OR product_name LIKE '% '
    OR product_name LIKE CONCAT('%', CHAR(9), '%')
    OR HEX(product_name) LIKE '%C2A0%'   -- 不换行空格
    OR HEX(product_name) LIKE '%E38080%' -- 全角空格
    OR HEX(product_name) LIKE '%E2808B%' -- 零宽空格（完全看不见）
    OR HEX(product_name) LIKE '%EFBBBF%' -- BOM
 GROUP BY product_name;

-- 把上面 FROM 后面的表名换成下面这些，再各跑一遍：
--   j1stockedit_data / j2stockedit_data / j3stockedit_data      （分店台账：出货校验读的就是它）
--   j1stockinout_data / j2stockinout_data / j3stockinout_data   （中央→分店的镜像流水）
--   j1stockeditmobile_data / j2stockeditmobile_data / j3stockeditmobile_data （手机台账）
--   j1stocklist_total / j2stocklist_total / j3stocklist_total   （手机版总库存缓存）
--   stock_data（货品主档：下拉里发出去的名字就是它）、price_change_log、stock_minimum_settings
```

体检口径已验证：能抓出 2026-09-25 事故里的 4 个双空格名字，也能抓出制表符版的 `SURUME IKA<Tab>P`；
在清洗后的库上返回空。

### 2.2 发现异常名字怎么办

1. **先备份**：
   `sudo mysqldump --single-transaction u690174784_kunzz | gzip > /opt/backups/before_$(date +%F_%H%M).sql.gz`
2. **少量 / 单条**：在「货品种类」把该货品**点开保存一次**（名字会被规范化并触发改名级联，改 12 张表的同一条货品历史）。
   保存后必须按第 2.3 步复核 —— 如果名字**本来就已经是规范化形式**，就不会触发级联，等于白存一次。
3. **批量 / 历史脏数据**：跑 `fix_name_whitespace_20260925.sql`（幂等、事务包裹、只改名字、
   不动任何数量与金额、不改 `updated_at`）。执行时**必须指定库名**：
   `sudo mysql u690174784_kunzz < fix_name_whitespace_20260925.sql | tee /opt/backups/name_fix_$(date +%F_%H%M).log`
4. **判断有没有生效**：看日志**第 0 节（执行前快照）必须非 0**（全 0 = 库选错了，这是最快的自检）；
   再看第 5 节 ① / ② 全 0、③ `available_*` 为预期值；最后用 `LENGTH(product_name)` 复核字节数。

### 2.3 出货被拦的标准三步排查

| 步骤 | 怎么做 | 看什么 |
|---|---|---|
| ① 名字字节 | `SELECT LENGTH(product_name), HEX(product_name) FROM <表> WHERE code_number='SK 0045';` | 用 **`LENGTH()`** 判断有没有多余字符（单空格版的标准长度可先算好）。**不要靠数空格**：截图里的长 HEX 会被 OCR 吃掉字符 —— 这次就把 42 字节看成过 41 |
| ② 库在哪张表 | 分别查中央 `stockinout_data` 与分店 `jXstockedit_data` | 库存只在 J3、却从「进出货 - 中央」出货 → 永远报可用库存 0（校验查的是中央表），跟名字无关 |
| ③ 请求发的是哪个系统 | 浏览器 F12 → Network → 过滤 `inout` → 看 `POST /api/stock/inout?system=` 与 Request Payload | URL 里的 `system` 决定查哪张表；Payload 里的名字直接把空格暴露出来 |

### 2.4 验证方法论（避免把"看起来好了"当成好了）

- **必须复刻后端的口径**：后端会先 `ProductName.normalize()`（折叠空白）再比对。
  用"原样名字直接互比"算出来的可用量是**假阳性** —— 本次排查中就被一个 1.000 骗过一次
  （两边都带双空格时当然"相等"）。
- **推荐端到端验证**：起一个后端实例连生产数据的完整副本（`--server.port=8091
  --spring.datasource.url=...副本库`），用真实 API 打一笔出货：
  修复前应复现 `400 库存不足`，修复后应 `200` 且落库。本次修复就是这么验的。
- 生产数据副本的获取：`桌面/kunzz-backup-download.sh`（ssh 上服务器 mysqldump + scp 回本地），
  再用 `mysqldump ... | mysql <副本库>` 还原，所有实验都在副本上做，不碰生产。

### 2.5 可选加固（想彻底关掉这类风险再做）

把出货库存校验 / 价格下拉 / 总库存汇总的匹配键改成"**规范化后的名字**"比较，或给 `product_name`
增加一列规范化值 + 索引。好处：以后任何人再把名字敲歪都不卡出货；代价：`product_name` 上的索引失效，
几万行的表一次几十毫秒（可接受）。改动请按 `AGENTS.md` 的并行防撞流程先登记白名单，并做第 2.4 步的端到端验证。

---

## 3. 系统侧现在已经有的保护（别重复造）

- **写入端规范化**（2026-09-24 起）：新建/编辑货品、进出货、手机版写入都会把连续空白折叠成一个空格、去掉首尾空格。
- **改名级联**（2026-09-24 起）：在「货品种类」改名会同步中央流水、分店流水、分店台账、手机台账、
  手机版总库存缓存、改价日志、最低库存（`ProductRenameService.cascade`，按 `BINARY` 精确匹配旧名）。
- 所以：**改名本身是安全的**；危险的是"不改名，让两种写法并存"。

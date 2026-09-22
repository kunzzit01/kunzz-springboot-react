# 任务 2026-09-22-inactive-by-code

- 状态：已完成（2026-09-22）
- 开始时间：2026-09-22
- 分支：main
- 目标：把「货品种类停用」的匹配主键从**货品名**改为**货品编码**——停用/库存校验/各处过滤全部只认 `product_code`

## 用户原话

"我货品种类的停用功能目前好像是抓名字的 而不是 code。我需要精准停用货品编码而不是名字"

## 白名单（只允许改这些）

- backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
- backend/src/main/java/com/kunzz/inventory/service/StockEditService.java
- backend/src/main/java/com/kunzz/inventory/service/StockSummaryService.java
- backend/src/main/java/com/kunzz/inventory/service/MobileStockService.java
- backend/src/main/java/com/kunzz/inventory/mapper/StockDataSystemMapper.java
- backend/src/main/java/com/kunzz/inventory/mapper/StockProductMapper.java
- backend/src/main/resources/mapper/StockDataSystemMapper.xml
- backend/src/main/resources/mapper/StockProductMapper.xml
- inventory-system/frontend/src/pages/StockProducts.tsx
- docs/tasks/2026-09-22-inactive-by-code.md
- docs/tasks/README.md
- backend/static/**（构建产物，仅最后一步提交）
- backend/target/inventory-backend-1.0.0.jar（构建产物，仅最后一步提交）

- 明确不碰：其它页面逻辑、add_new_tables.sql（本次**不改表结构**）、CHANGELOG.md

## 问题诊断（基于生产快照 database/u690174784_kunzz.sql 实测）

| 事实 | 数值 |
|---|---|
| `stock_data` 行数 / 不同货品编码 | 610 / **608**（编码几乎唯一） |
| 同一个名字对应多个不同编码的名字数 | **92 / 485（19%）** |
| 「同名+同编码」重复行 | **0** |
| 中央台账 `stockinout_data` 里 (名字,编号) 匹配不上 `stock_data` 的行 | 2414 行 / 120 个名字 |
| 台账里同一个编码被多个名字复用的 | 中央 80 个编码（如 FRI 0020 → 「IKURA BIG AK」/「IKURA BIG」） |

**结论：按名字匹配在真实数据里会咬人**（19% 的名字下挂着多个编码），而「同名+同编码」重复行为 0 → 之前那条"该名字+编号下所有行都停用才算停用"的规则实际是空转。

### 名字被当主键的两处

1. **停用前库存校验**（最主要，直接拦人）：
   `StockProductService.assertNoStockBeforeDeactivate` → `netStockByName`，
   SQL 只有 `WHERE product_name = ?`。想停用「CHICKEN BONELESS LEG」的编码 `FI 0017` 时，
   会把同名的 `FI 0018 / FI 0149 / FI 0165` 的库存一起算进去 → 明明这个编码没库存也报"还有库存，不能停用"。
2. **各处停用名单**：`inactiveKeys` 返回 (名字, 编号) 二元组，消费方按 `名字 + \u0000 + 编号` 匹配。
   名字一旦在货品种类页被改名，历史台账里带旧名字的行就再也匹配不上 → 停用"失效"。

## 设计（改后）

**唯一主键 = `product_code`（货品编码）**，名字不再参与任何匹配。

- `inactiveKeys`：`INNER JOIN stock_data_system ... WHERE s.active = 0`，返回 **DISTINCT 货品编码**
  （语义由"该名字+编号下所有行都停用"变为"该编码被停用" —— 因重复行为 0，等价；且顺带覆盖改名场景）
- `StockEditService`（进出货下拉）/ `StockSummaryService`（总库存）/ `MobileStockService`（手机版）：只按编码过滤
- 停用前库存校验：`netStockByCode` → `WHERE code_number = #{productCode}`（台账表列名各系统都是 `code_number`）
- 前端停用确认/提示文案带上编码，避免同名多编码时点错

### 已知取舍（需向用户说明）

- `stock_data` 里有 **2 个编码被两个不同货品复用**：`PI 0031`、`SK 0009`。
  按编码停用会连带隐藏同编码的另一个货品。这是"按编码精准"的必然结果，且编码复用本身是数据错误。
- 台账里同一个编码对应多个名字的（如 `FRI 0020`）会被**一起**过滤/统计 —— 同一编码视为同一货品，符合预期。

## 验证结果（真后端 + 真库，全部实测通过）

环境：xampp MariaDB（127.0.0.1:3306）新建独立测试库 `kunzz_test`，导入生产快照
`database/u690174784_kunzz.sql`（610 个货品 / 28739 条中央台账）后应用 `add_new_tables.sql`；
后端用 `mvn package` 出来的 jar 连该库跑在 8081。**没有动用户现有的库**。

| 场景 | 结果 |
|---|---|
| 停用「无库存的 FI 0154」（同名 FI 0131 有库存 10） | **HTTP 200 成功** ✓（改前按名字求和 =10 → 会被拒） |
| 同一请求的改前口径直跑 SQL | `by-name(OLD) computed_stock=10.000 → REJECT`；`by-code(NEW)=0.000 → ALLOW` ✓ |
| 停用「有库存的 FI 0131」 | `400 该货品「ASARI」（编号 FI 0131）在 CENTRAL 还有库存 10，清完库存后才能停用` ✓ 报错指明编号与库存 |
| 总库存（central）：停用 `US 0002`（BLACK GLOVE） | 列表里 `US 0002` 1→0，同名 `US 0032` 仍为 1 ✓ 不误伤同名兄弟 |
| 进出货下拉（central）：同上 | 下拉 610→609 条，`US 0002` 消失、`US 0032` 仍在 ✓ |
| 手机版（j1）：停用 `PS 0038`（BLACK GARLIC OIL） | `PS 0038` 1→0，同名 `000004` 仍为 1 ✓ |
| 测试数据还原 | 库里 `active=0` 残留 0 条 ✓ |

**后端**：`mvn -DskipTests package` BUILD SUCCESS（203 个源文件）。
**前端**：`npm run build` 通过（`tsc -b` 也就校验了 TSX 改动）；构建后 `GET /` 200，
新 bundle 里能检出「…货品下拉」与「编号 」文案；同步产物到 `backend/static/` 并保留 `home/`、`tokyo/`。

> 过程中发现并修掉的自伤：一开始把 `frontend/dist/*` 整体覆盖进 `backend/static/`，
> 连带改了 `backend/static/images/` 下 19 张网站用图（内容确实变了）→ 已 `git checkout HEAD -- backend/static/images` 还原。
> 收尾用逐文件 `git hash-object` 与 `HEAD:` 比对，确认「真变了」的只剩本任务该动的文件。

### 复核时查出的第二个自伤：`backend/static/vendor/` 缺失自托管资源（已修）

重新构建并同步 `backend/static` 之后，`backend/static/index.html` 新增引用了 6 个
`/vendor/*` 资源（jquery / chart / html2canvas / jspdf / jspdf-autotable / fontawesome），
但这些文件在 `backend/static/vendor/` 下**未纳入 git**（那里只跟踪了 `orgchart.min.css/js`）。

对照改动前的版本可以确认是本任务引入的：

| | 引用的 `/vendor/*` |
|---|---|
| 改动前（3907513） | 只有 `orgchart.min.css`、`orgchart.min.js` —— **两个都已跟踪** |
| 改动后 | 额外 6 个自托管库 —— **都未跟踪** |

即 `backend/static` 原本是「陈旧但自洽」（它比前端源码旧，还没跟上 vendor 自托管那次改动），
本任务刷新后变成「最新但不自洽」：从 git 全新 clone 出来，Windows 单机版
（`一键启动.bat` → jar 从磁盘伺服 `backend/static`）会 404 掉 jQuery/Chart.js/jsPDF/FontAwesome/html2canvas。

修法：把这 15 个未跟踪文件补进 `backend/static/vendor/`（合计 1.9 MB）。
补之前已逐个 `md5sum` 与 `inventory-system/frontend/public/vendor/` 下**已在 git 的同一批文件**比对，
**15 个全部逐字节一致**，因此是纯拷贝、不引入新内容。

## 复核（第二轮）补充验证

被质疑「确定没问题吗」之后重查了一遍，补了 4 项之前没覆盖的：

| 项 | 结果 |
|---|---|
| 非中央系统（j1）的库存校验是否也按编码 | 3 个编码（j1 库存 2 / 2 / 0.283）全部被正确拦下，且报的是**该编号自己**的库存 ✓ |
| 编码大小写/首尾空格不一致会让 Java 侧 `Set.contains`（大小写敏感）漏匹配 | 快照里 **0 条**这类数据（含空格的 0 条、仅大小写不同的 0 条）→ 只是理论风险 ✓ |
| 旧实现（名字+编码）会漏掉多少行 | 中央 **1962** / J1 **1093** / J2 **664** / J3 **1108**，共 **4827 行**（96/68/46/64 个编码），且 **0 行**是空格/大小写假差异 ✓ |
| 新实现（按编码）会连带隐藏的规模 | **仅 2 个编码**：`PI 0031`、`SK 0009` ⚠️（见下） |

**唯一的真实退步（已向用户说明）**：`stock_data` 里有 2 个编码各被两个**不相关**的货品复用 ——
`PI 0031` = HIKARI SHIRO MISO P / UNAGI MAKI BOX，`SK 0009` = YAMAZAKI DISTILLER'S RESERVE 700ML /
KUBOTA MANJYU SAKE 720ML。按编码停用会连带隐藏同编码的另一个货品（编码复用本身是录入错误）。
权衡：换来 4827 行漏过滤的修复，代价是 2 个编码过度隐藏 —— 净收益为正，且这 2 处应该改数据而不是改逻辑。

### 验证脚本

- `.zcode/backup-inactive-by-code/verify.py` — 端到端断言脚本（A–E 五组）
- `.zcode/backup-inactive-by-code/{analyze,ledger,codeuniq}.js` — 生产快照的数据形态分析
- `.zcode/` 已被 `.gitignore` 忽略，不会进提交

## 待用户在生产环境执行的

1. `git pull --ff-only`
2. 重建后端 jar 并重启（**本次不改表结构**，无需跑 SQL 补丁）
3. 前端 `npm run build` 并按现有流程部署 dist（或直接用仓库里已同步好的 `backend/static/`）

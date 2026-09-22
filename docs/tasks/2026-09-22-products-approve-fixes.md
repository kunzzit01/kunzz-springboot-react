# 任务 2026-09-22-products-approve-fixes

- 状态：已完成（2026-09-22）
- 开始时间：2026-09-22
- 分支：main
- 目标：修掉复核货品种类改动时查出的两个问题——①「保存即批准」会顶掉原批准人；②`approve` 接口无权限校验的越权漏洞

## 来源

用户要求「审核当前系统最新改动后的变化」，复核后查出两处真问题：

1. **保存即批准顶替原批准人**：`StockProducts.tsx:635` 系统页保存时把 `approver` 清空（原设计"编辑后需重新批准"），
   叠加 2026-09-22 加的后端 `autoApproveIfBlank`，导致**有批准权限的人只改个错别字，批准人就从原来的 MJ 变成他自己**，
   "当初是谁批的"查不到。
2. **approve 接口越权**：`PUT /api/stock/products/{id}/approve` 方法签名里**没有 `Authentication`**，
   也不调 `assertCanApprove`；且批准人直接取请求体（前端传什么写什么）。任何登录用户都能批准任意记录并伪造批准人。
   对比：删除 / 停用 / 保存三个端点都做了校验。

## 白名单（只允许改这些）

- inventory-system/frontend/src/pages/StockProducts.tsx
- backend/src/main/java/com/kunzz/inventory/controller/StockEnhanceController.java
- backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
- docs/tasks/2026-09-22-products-approve-fixes.md
- docs/tasks/README.md
- backend/static/**（构建产物，仅最后一步提交）
- backend/target/inventory-backend-1.0.0.jar（构建产物，仅最后一步提交）

- **明确不碰**：`add_new_tables.sql`（本次不动表结构、不跑任何 SQL）、进出货/总库存/手机版逻辑、CHANGELOG.md

## 设计

### 改动 1：有批准权限的人保存时「不清空」批准状态

比我上次的后端兜底更干净——他本来就有批准权，他的编辑**本来就不该需要重新批准**。

```tsx
// StockProducts.tsx:635
const approver = (system === 'overview' || canApprove) ? (d.approver || '') : ''
```

| 场景 | 保存后 |
|---|---|
| 有批准权限 + 改**已批准**行 | 保持已批准，**原批准人不变** ✓（修掉顶替） |
| 有批准权限 + 改**待批准**行 | 发空 → 后端 `autoApproveIfBlank` 兜底 → 已批准、批准人=自己 ✓ |
| 无批准权限 + 改任意行 | 清空 → 待批准 ✓（行为不变） |
| 总览页 | 保持原批准状态 ✓（行为不变） |

后端 `autoApproveIfBlank` **保留**（它只补空值，不覆盖非空），作为"待批准 → 保存即批准"的兜底。

### 改动 2：approve 端点补权限校验 + 批准人由服务端取

- `StockEnhanceController.approveProduct`：加 `Authentication`，先 `assertCanApprove(authentication, "批准货品")`；
  批准人改为 `operatorOf(authentication)`（登录用户显示名），**请求体里的 approver 一律忽略** → 前端伪造不了。
  请求体参数直接去掉（前端仍会发 body，Spring 会忽略，不会 415）。
- `StockProductService.approve` 保留「审批人不能为空」与 404 两个校验。

## 验证结果（真库 + 真后端，全部实测通过）

环境：本地测试库 `kunzz_live`（导入用户 9-20 线上备份）+ 新 jar 连它跑 8081。
用**真实权限账号**做正反两组：`SEE HAO YANG`（显示名 **HY**，有 approve）、
`HONG MING SOON`（显示名 **Soon**，只有 apply）。

| # | 场景 | 结果 |
|---|---|---|
| 1 | 有批准权限，改一行**已批准**的（带原批准人） | 批准人仍是 **MJ**（原值），**没被顶替成 HY** ✓ |
| 2 | 有批准权限，改一行**待批准**的（发空） | 已批准，批准人 = **HY** ✓（后端兜底仍有效） |
| 3 | 只有申请权限，改一行 | 仍是**待批准** ✓（行为不变） |
| 4a | 只有申请权限的账号调 `approve` | **403**「没有批准货品的权限…」，且库里批准人**未被改动** ✓（改前会直接成功） |
| 4b | 有批准权限，body 里伪造 `approver: "HACKER"` | 库里写的是 **HY**（登录人），**伪造无效** ✓ |
| 5 | 回归：停用按编码 | `DI 0004` **成功**；`DI 0003` 被拒且报「（编号 DI 0003）…还有库存 2」✓ |
| 6 | 回归：列表 / 总库存 / 进出货下拉 / 手机版 | 全部 HTTP 200、code=0、条数正常（506 / 250 / 439）✓ |
| 7 | 收尾 | 测试行批准人已还原为 MJ；库里唯一 `active=0` 是用户 9-19 自己停用的 `DRY MUSHROOM`（非本次产生）✓ |

**前端产物验证**：`npm run build` 通过（`tsc -b` 也就校验了 TSX 改动）。把新旧 bundle 里同一段代码抓出来对比：

| | 实际代码 |
|---|---|
| 新 bundle | `const St=(n==="overview"\|\|z)&&Je.approver\|\|""` → `(总览 或 有批准权限) ? 原批准人 : ''` |
| 线上旧 bundle | `const St=n==="overview"&&Je.approver\|\|""` → 系统页一律清空 |

另外确认：这次 CSS 哈希**没变**（`index-BJmfGZAI.css`），因为改动只在 JS —— 这也是为什么"CSS 哈希相同"不能用来判断部署是否成功（只有 JS 能）。

`backend/static` 本次**只同步了 `index.html` + `assets/`**（外科式），`images/`、`home/`、`tokyo/` 一个文件都没动；
`index.html` 的 13 个本地引用全部存在。

### 验证脚本

`.zcode/backup-inactive-by-code/verify_fixes.py`

## 待用户在生产环境执行的

1. 先解决 `git pull` 被那个被跟踪的脏 jar 拦住的问题（见对话里的三步：备份 → 只丢该文件 → pull）
2. 重建后端 jar 并重启（**不改表结构、不需要跑任何 SQL**）
3. 重建后台前端（`npm run build` + rsync 到 `/var/www/admin`）

## 不在本次范围（等用户定口径）

- 批准按系统（需给 `stock_data_system` 加列 + 回填）
- 或退一步：只在「总览」页保留批准按钮


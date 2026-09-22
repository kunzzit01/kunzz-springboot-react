# 任务 2026-09-22-products-save-auto-approve

- 状态：已完成（2026-09-22）
- 开始时间：2026-09-22
- 分支：main
- 目标：货品种类页——**有「批准」权限的人保存即批准**，不用再点「批准」按钮

## 用户原话

"还有一个功能需要去开放 在货品种类有批准权限之人 不需要再去点击批准按键批准了 保存即可"

## 白名单（只允许改这些）

- backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
- backend/src/main/java/com/kunzz/inventory/controller/StockEnhanceController.java
- backend/src/main/resources/mapper/StockProductMapper.xml
- docs/tasks/2026-09-22-products-save-auto-approve.md
- docs/tasks/README.md
- backend/target/inventory-backend-1.0.0.jar（构建产物，仅最后一步提交）

- 明确不碰：前端任何文件（本次**不需要前端改动**，也就不动 `backend/static/**`）、数据库结构、其它页面

## 现状（为什么会掉回「待批准」）

| 位置 | 现在的行为 |
|---|---|
| `StockProducts.tsx:635` `doSaveEdit` | 系统页保存时把 `approver` 清成 `''`（"编辑后需重新批准"）→ 掉回待批准 |
| `StockProducts.tsx:593` `addRow` | 新增行 `approver: ''` → 建出来就是待批准 |
| `StockProducts.tsx:762` `approve` | 需要手动点按钮才写 `approver` |

所以有批准权限的人每次保存都要再点一次「批准」。

## 设计

**只在后端做，不动前端** —— 因为前端保存后会立刻 `load()` 重新拉列表，状态自然刷新成「已批准」。

规则（放在 `StockProductService` 内，是权限的真正把关点，前端伪造不了）：

> 调用者具备「批准」权限 **且** 这一行保存后 `approver` 会变成空 → 自动写成本次操作人（登录用户显示名）。

- **"具备批准权限"** 的口径与现有 `assertCanApprove` 完全一致：没配置过权限的老账号/demo = 放行
- **"会变成空"** 判断：请求体带了 `approver` 就用请求体的值；没带就用库里的当前值。
  空 → 补成本次操作人；非空 → **不动**（总览页"保持原批准状态"的既有行为不被破坏，不会把别人批的改成自己）
- `create`（新增行）同理：`approver` 为空则补成本次操作人
- 没批准权限的人（只有「申请」）：行为完全不变，仍然保存后是待批准

### 为什么不做成"有权限就无条件覆盖 approver"

那会把总览页点一次保存就把「批准人」从原来的人改成自己，属于无谓的数据改写。
只补空值既能治好"保存后又要点批准"，又不改已有的批准人。

## 验证结果（真库 + 真后端，全部实测通过）

环境同上一任务：本地测试库 `kunzz_test` + 新 jar 跑 8081。
用**真实的权限记录**做正反两组（不是造的假数据）：

- `SEE HAO YANG` / 显示名 **HY**（user 28）→ `views` 含 `approve` = **有批准权限**
- `YEOW JUN HAO` / 显示名 **JH**（user 107）→ `views` 含 `apply` 不含 `approve` = **只有申请权限**

| # | 场景 | 结果 |
|---|---|---|
| 1 | 有批准权限：系统页保存（带 `approver:''`） | 库里批准人 → **HY** ✓ 保存即批准 |
| 2 | 有批准权限：总览页保存**已被别人批准**的行（带原 approver） | 批准人**保持原值不变** ✓ 不会无谓改写数据 |
| 3 | 只有申请权限：系统页保存 | 批准人仍为**空** ✓ 仍是待批准，行为未变 |
| 4 | 只有申请权限：新增一行 | 批准人为**空** ✓ |
| 5 | 有批准权限：新增一行 | 批准人 → **HY** ✓ 新增即批准 |
| 6 | 列表统计：新增行在 `/products` 里返回 `approver=HY` | 显示**已批准** ✓ 不再出现待批准 |
| 7 | 收尾 | 测试行已删、被改行已还原、全库待批准 = 0 ✓ |

**回归**（因为改了 controller 的 `create`/`update` 调用签名）：

| 场景 | 结果 |
|---|---|
| 停用无库存的 `FI 0154`（同名 `FI 0131` 有库存 10） | **200 成功** ✓ 按编码校验未被破坏 |
| 停用有库存的 `FI 0131` | `400 该货品「ASARI」（编号 FI 0131）在 CENTRAL 还有库存 10…` ✓ |
| 只有申请权限的账号调停用 | `403 没有停用/启用货品的权限…` ✓ `assertCanApprove` 重构后行为不变 |

后端 `mvn -DskipTests package` BUILD SUCCESS。

### 验证脚本

`.zcode/backup-inactive-by-code/verify_approve.py`（7 组断言 + 收尾还原）

## 待用户在生产环境执行的

1. `git pull --ff-only`
2. 重建后端 jar 并重启（**不改表结构，不需要跑 SQL**）
3. **不需要重建前端**（本功能纯后端；前端保存后会自己 `load()` 刷新出「已批准」）

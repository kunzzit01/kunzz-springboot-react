# 任务 2026-09-19-remark-page-system-perms

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：货品备注页也按「库存权限 → 系统选项」限制（只勾了 J1 的账号，不能点到中央的货品备注）
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/RemarkAnalysis.tsx
  - backend/src/main/java/com/kunzz/inventory/controller/StockController.java
  - docs/tasks/2026-09-19-remark-page-system-perms.md
  - docs/tasks/README.md
- 明确不碰：数据库（权限数据本来就有）、其它页面、CHANGELOG.md、构建产物

## 问题（用户报）

"货品备注好像没设到权限欸，只有 j1 的权限仍然可以点到中央的货品备注页面"

## 根因

本系统有两层权限，货品备注页**只吃了第一层、第二层完全没接**：

| 层 | 数据 | 作用 | 备注页原状 |
|---|---|---|---|
| 页面/菜单权限 | `user_sidebar_permissions`（sections/submenu） | 能不能打开这一页（`RequirePage` 守卫） | ✓ 有效 |
| 库存功能权限 | `user_page_permissions.stock_inventory` → `{system:[...], views:[...]}` | 能用哪些**系统**（中央/J1/J2/J3） | ✗ **完全没用** |

对照：总库存（StockRecords）、进出货（StockInout）、货品种类（StockProducts）都读了 `getStockPerms()`，
按 `systems` 过滤页头系统切换、`[]` 时整页锁死；备注页没有这段，页头四个系统全部列出、URL 带 `?system=central` 就直接给数据。

## 做法

1. **前端**（RemarkAnalysis.tsx，抄总库存那套）：
   - 读 `getStockPerms()`：`configured=false`（没配置过，老账号/demo）→ 默认全部可用；配置过 → 只认 `systems` 列表
   - 页头系统下拉只列有权限的系统
   - URL 上的系统没权限 → `navigate('/remark?system=<有权限的第一个>', { replace: true })` 自动换过去
   - `systems: []`（全关）→ 整页显示「无权限访问」（用页面已有的 `.no-data` 样式）
   - **取数前先等权限就绪**，避免"先闪一下中央的数据再被踢走"
2. **后端**（StockController `/api/stock/remark-analysis`）：加了同样的鉴权
   （与 FreezerCategoryController 的 `assertCanApprove` 同一做法）——
   配置过权限且请求的 system 不在列表里 → 403「没有查看「CENTRAL」货品备注的权限」。
   前端即使被绕过（直接调接口）也拿不到数据。

## 本地验证

本地库先造了一个"有库存菜单、只勾 J1"的账号（user 34），再用它的登录态测：

**接口层**（`/api/stock/remark-analysis`）：

| 账号 | system=central | system=j1 | system=j2 |
|---|---|---|---|
| 只有 J1 权限 | `{"code":403,"message":"没有查看「CENTRAL」货品备注的权限"}` ✓ | 200 正常返回 ✓ | 403 ✓ |
| 未配置权限（用户 30 = MJ，生产现状） | 200 ✓ | 200 ✓ | 200 ✓ |

**页面层**（真实浏览器）：

| 场景 | 结果 |
|---|---|
| 只有 J1 权限的账号打开 `/remark?system=central` | URL 自动变成 `/remark?system=j1`、页头显示 **J1**、系统下拉只剩 **J1** ✓ |
| 权限全关（`systems: []`）的账号打开备注页 | 显示「无权限访问 / 权限设定已关闭全部系统（中央/J1/J2/J3）。如需使用请联系管理员开通。」✓ |

`tsc -b` + 后端 `mvn package` 均通过；测试用的权限改动只在本地库，跑完已重新导入还原。

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. 重建后端 jar 并重启（后端有改动）+ 前端 `npm run build` 并 rsync
3. 无数据库改动

## 说明

- 这次只堵了货品备注页。其它库存页（总库存/进出货/货品种类）本来就是按同一套权限过滤的 ✓；
  但它们和备注页一样，**权限判断在前端 + 备注页现在后端也拦**——如果用户希望所有库存接口都在后端强制鉴权，
  那是另一个（更大的）任务，需要逐页确认口径，不在这批里动。
- 老账号（没有 `stock_inventory` 权限记录的）保持默认放行，避免把现有账号挡在门外。
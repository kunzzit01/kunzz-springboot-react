# 任务 2026-09-19-settings-minimum-perms

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：最低库存设置页（/settings?view=minimum）按「库存权限 → 系统选项」限制——没权限的系统不能点进去/看不到数据
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/Settings.tsx
  - backend/src/main/java/com/kunzz/inventory/controller/StockController.java
  - docs/tasks/2026-09-19-settings-minimum-perms.md
  - docs/tasks/README.md
- 明确不碰：数据库、其它页面、CHANGELOG.md、构建产物

## 问题（用户报）

"这个页面好像也没有分配到权限哦"（截图：最低库存设置页，中央/J1/J2/J3 四个系统标签全都能点，
且直接显示中央的数据）

与「货品备注」那次同一类：页面完全没读 `stock_inventory` 的 systems 权限。

## 现状（代码）

- `Settings.tsx:27-28` system 只从 URL 读，默认 central；`:197` 四个系统标签无条件全列出
- `:58` `getMinimumProducts(sys)` / `:123` `saveMinimum(system,…)` / `:148` `saveMinimumBatch(system,…)`
  都不带权限判断；后端 `/api/stock/minimum/products|save|batch` 也没有鉴权
- 页面挂载只跑一次 `useEffect(() => { load(system) }, [])`（先按 URL 取数，权限未知）

## 做法（照「货品备注」那套，前端 + 后端一起）

**前端 Settings.tsx**
1. 读 `getStockPerms()`：`configured=false`（老账号/demo）→ 默认全部可用；配置过 → 只认 `systems`（小写）
2. 系统标签只列有权限的
3. URL/当前系统没权限 → 自动切到有权限的第一个（`switchSystem` 会同步地址栏）
4. `systems: []`（全关）→ 整页「无权限访问」
5. **权限就绪前不取数**（避免先闪一下中央的数据）

**后端 StockController**
- `/stock/minimum/products`、`/stock/minimum/save`、`/stock/minimum/batch` 三个端点加
  `Authentication` + 复用已有的 `assertSystemAllowed`（与 remark-analysis 同一个判定）：
  配置过权限且请求的 system 不在列表里 → 403
- 不动 `GET /stock/minimum`：总库存页要一次性拉四个系统的最低库存用于列表展示（那边已按系统权限过滤标签）

## 本地验证（真后端 + 真实浏览器，本地造了 J1+J2 权限的账号）

**接口层**（`/api/stock/minimum/products`）：

| 账号 | central | j1 | j2 | j3 |
|---|---|---|---|---|
| 只有 J1+J2 权限 | 403 `没有查看「CENTRAL」的权限（职员管理→权限设定→库存）` ✓ | 正常返回 266 行 ✓ | 正常返回 ✓ | 403 ✓ |
| 全系统账号（对照） | 正常 ✓ | — | — | 正常 ✓ |

保存接口同样拦截：`POST /api/stock/minimum/save?system=central` → 403 ✓

**页面层**：

| 场景 | 结果 |
|---|---|
| J1+J2 账号打开 `/settings?view=minimum`（默认 central） | 地址栏自动变 `?system=j1`、标题「最低库存设置 — J1」、系统标签**只剩 J1 / J2** ✓、表格显示 J1 的货品 ✓ |
| 权限全关的账号 | 整页「无权限访问 权限设定已关闭全部系统…」✓、系统标签 0 个、**最低库存接口 0 次请求** ✓ |

`tsc -b` + 后端 `mvn package` 通过。

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. 重建后端 jar 并重启（后端三个端点加了鉴权）+ 前端 `npm run build` 并 rsync
3. 无数据库改动

## 说明

- 错误提示统一成「没有查看「X」的权限（职员管理→权限设定→库存）」（原来写死了"货品备注"，现在两个页面共用同一个判定）。
- `GET /api/stock/minimum`（旧 CRUD 读接口）**没加**限制：总库存页要一次性拉四个系统的最低库存用于列表展示，
  而那边已经按系统权限过滤标签了；加了会把正常页面误伤。

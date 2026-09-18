# 任务 2026-09-18-stockrecords-silent-refresh

- 状态：进行中
- 开始时间：2026-09-18
- 分支：main
- 目标：同事A保存后，同事B在「总库存」页的数据照常自动更新，但**无感**——
  不闪「加载中」、不跳回顶部、不清搜索关键字与类型筛选、不收起正在看的多个单价明细。
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/StockRecords.tsx
  - docs/tasks/2026-09-18-stockrecords-silent-refresh.md
  - docs/tasks/README.md
  - CHANGELOG.md（只追加）
- 明确不碰：
  - backend/**
  - inventory-system/frontend/src/utils/useRealtime.ts
  - inventory-system/frontend/src/pages/ 下其它页面
  - inventory-system/frontend/src/styles/**（本次不需要新样式）
  - backend/static/**、backend/target/**（构建产物，按 AGENTS.md 第 4 节由发布侧处理）
  - AGENTS.md、.githooks/**

## 现象（用户报）

同事A在做数据时，同事B在总库存检查货品；A 一保存，B 的页面就自动刷新加载，
**看到一半被弹回顶部**，搜索关键字与类型筛选也没了。

## 根因

后端 `RealtimeWebSocketHandler` 广播 `{"type":"stock_changed","system":"all"}` 后，
`StockRecords.tsx:344` 直接调 `load(system)`，而 `load()`（`:298-307`）做了三件"看得见"的事：

| # | 代码 | 后果 |
|---|---|---|
| 1 | `setLoading[sys]=true` → `:781` tbody 换成单行「加载中...」 | `.table-scroll-container`（`styles/stocklist.css:383`，`overflow-y:auto`）内容高度瞬间小于视口 → 浏览器把 `scrollTop` 夹成 0 → **数据回来后停在顶部** |
| 2 | `setFilters[sys]=''`、`setTypeSel[sys]=new Set()`（`:303-304`） | B 打的搜索关键字、选的类型卡被清空 |
| 3 | `openVariants` 键是后端行号 `no`（`:284`、`:807`）；`reloadFreezer()` | 刷新后行号整体位移 → 展开的「多个单价」明细挂到别的货品上；选中类型时按 冰箱→位次 重排 |

对照：总库存是唯一一个 `useRealtime` 没传保护的页面
（进出货 `StockInout.tsx:387`、货品种类 `StockProducts.tsx:474`、电话版出货 `MobileOut.tsx:122` 都传了 `isBusy`）。

## 做法

不加任何新 UI（提示条/开关/toast 都会"有感觉"），改成**静默原地刷新**：

1. `load(sys, opts)` 增加 `resetFilters` / `silent` / `keepScroll` 三个可选项，
   **默认值 = 今天的旧行为**，所以挂载、URL 初始化、`switchSystem`、导出等调用点一行都不用改。
2. `useRealtime` 回调改调 `load(system, { resetFilters: false, silent: true, keepScroll: true })`。
   `silent` 不设 loading → 表格不塌陷 → 滚动位置自然保住（这是主修复）。
3. `keepScroll` 时先把 `.table-scroll-container` 的 `scrollTop` 存进 ref，
   再用 `useLayoutEffect([data])` 在数据渲染后还原（内容真变短时浏览器自然夹住，不会出错）。
4. 刷新时按**货品名**迁移 `openVariants`，避免明细串到别的货品上。

**不引入 `isBusy`**：它只能表达"正在编辑"，表达不了"正在逐行核对"，
而且暂停后仍会补刷（照样跳）。

## 已知边界

- 如果 A 的操作真的新增/删除/清零了货品，列表行数与内容本来就会变（数据变了，不是刷新的锅），
  选中类型时的排序位置也可能挪；能保证的是**不再闪、不再跳顶部、不再清输入**。
- 后端广播固定发 `system:"all"`，所以 B 看中央时 A 写 J1 也会触发一次静默刷新
  （中央的 J1/J2/J3 供应值本来也依赖 J1 数据）。后端不改。

## 顺带记录（本次不改代码）

同样没有防打扰保护的页面，留待后续：

- `inventory-system/frontend/src/pages/MobileRecords.tsx:124`（电话版-记录）
- `inventory-system/frontend/src/pages/StockSot.tsx:256`（货品异常）

## 验证

`npx tsc -b`（frontend）通过。

本机没有跑后端/数据库，所以用 **mock 后端 + mock `/ws/realtime`** 在真实浏览器里做了端到端验证
（mock 脚本放在系统临时目录，未进仓库；前端用 `npx vite --port 5174`）：

| 场景 | 结果 |
|---|---|
| 滚到 400 后收广播 | `scrollTop` 400 → 400、无一次滚动事件；MutationObserver 全程 0 次「加载中」；数字 10.000 → 11.000（真更新） |
| 搜索「MOCK-PRODUCT-00」后收广播 | 关键字保留、仍显示 9 条 |
| 选中 Kitchen 类型卡后收广播 | 卡片仍激活、显示记录 20 不变、冰箱分类列还在 |
| 展开「多个单价」+ 行号整体位移 | 明细仍挂在同一货品（MOCK-PRODUCT-019，序号 20 → 19 = 行号确实位移了） |
| 刷新前后给 DOM 打标记 | 标记全部存活 → 表格容器/tbody 没有被重建 |
| 切换系统（中央 → J1） | 搜索框与类型筛选仍会被清空（原有行为未被改坏） |

> ⚠️ 踩坑记录：`carryVariantKeys` 最初写成
> `setOpenVariants(prev => carryVariantKeys(rowsRef.current[sys], ...))` —— updater 要等下一次渲染才执行，
> 那时 `rowsRef.current` 已被改成**新**数据，等于拿新行做迁移，展开永远被清掉。
> 正是上面的浏览器实测抓到的（展开明细刷新后消失），改为 setState 之前把旧行存进局部变量后通过。

> 测试环境备注：内置浏览器里 Playwright 的 `click/fill` 派发会超时（环境问题，非页面问题），
> 改用 `cua.click` 坐标点击 + `cua.type` 真实键盘；少数交互用页面内 `element.click()`
> （派发的仍是真实 MouseEvent，跑同一套 React onClick）。


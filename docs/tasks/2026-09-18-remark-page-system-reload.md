# 任务 2026-09-18-remark-page-system-reload

- 状态：已完成（2026-09-18）
- 开始时间：2026-09-18
- 分支：main
- 目标：货品备注页切换系统（中央 → J1/J2/J3）后自动重新取数，不需要手动刷新页面
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/RemarkAnalysis.tsx
  - docs/tasks/2026-09-18-remark-page-system-reload.md
  - docs/tasks/README.md
- 明确不碰：
  - backend/**（接口本身没问题：`?system=` 已经按系统返回）
  - 其它页面
  - CHANGELOG.md、README.md、AGENTS.md
  - 构建产物（按 AGENTS.md 第 4 节，VPS 自己构建）

## 问题（是我上一个改动引入的）

任务 `2026-09-18-branch-remark-codes` 里我把页头的系统按钮改成了可切换的下拉，切换走的是
**前端路由跳转**（`navigate('/remark?system=j1')`，不刷新页面）。但这一页的取数是：

```tsx
useEffect(() => { load() }, [])   // ← 只在挂载时跑一次
```

而 `system` 是从 `new URL(window.location.href)` 现读的、`load` 的 useCallback 依赖里也没有 `system`
→ **切完系统数据不重取**，还显示上一个系统的内容，必须手动刷新 ✗。
（原来没有切换器、只能手改地址栏，等于整页重载，所以没暴露出来。）

对照：进出货页 / 货品种类页的 system 是 **state**，load 的依赖里带 `system`，切换会正常重载 ✓。

## 改动（1 个文件）

1. 系统从 `useSearchParams()` 读（响应式），不用 `window.location.href` 现读
2. `load` 的依赖补上 `system`；把 `if (loading) return` 的闭包判断换成 `useRef` 防重入
   （否则 `loading` 既在依赖里又被 `setLoading` 改，容易变成重跑循环）
3. 挂载 effect 依赖改为 `[load]` → `system` 变化时重跑一次，数据自动更新

## 本地验证（真实浏览器）

在页面上埋一个 `window.__noReloadMark` 标记（整页刷新会丢失它），然后点下拉切换：

| 动作 | 结果 |
|---|---|
| 中央（9 个货品）→ 点 J1 | 地址栏变 `?system=j1`、标题变 J1、**货品块数 9 → 1**、标记仍在（**没有整页刷新**）✓ |
| J1 → 点回中央 | 变回 9 个、标记仍在 ✓ |
| 连续来回切 | 每次都立即更新，无残留 ✓ |

对照：修之前切完还显示上一次的 9 个，必须手动 F5。

## 待用户在生产环境执行

`npm run build` → rsync 到 `/var/www/admin/`（纯前端）。

# 任务 2026-11-18-add-staff-layout

- 状态：进行中
- 开始时间：2026-11-18
- 分支：main
- 目标：重构「添加新职员」页（`/staff/add`）布局 —— 从「整页锁死 100vh + 内部多层滚动」改为「整页滚动 + 顶部标题栏 sticky + 底部保存栏 sticky」，并按方案 B（轻量现代）调整视觉；同时修正平板/手机断点。

## 白名单（只允许改这些）

- inventory-system/frontend/src/styles/add.css
- inventory-system/frontend/src/styles/form-ui.css
- inventory-system/frontend/src/styles/perm-tree.css
- inventory-system/frontend/src/pages/AddEmployee.tsx
- CHANGELOG.md（只在顶部新增 2026-11-18 小节，不改老行、不重编号）
- docs/tasks/2026-11-18-add-staff-layout.md（本文件）

> 追加说明（2026-11-18 10:5x）：实施时才确认真正的配色源在 `form-ui.css`，
> 它比 `add.css` **后加载**且用相同特异性 + `!important` 写死了橙色渐变，
> 在 add.css 里覆盖无效。因此把视觉规则落到了 `form-ui.css`（仅被 AddEmployee 引用，
> 属本页专属）。原白名单漏登此文件，现补登记。
> `perm-tree.css` 只追加 `.add-root` 规则，`.staff-root`（员工列表弹窗）不受影响。

## 明确不碰

- `inventory-system/frontend/src/pages/Staff.tsx`（`PermTree` 的内联 `height` 改用 CSS 覆盖，不动共享组件）
- `backend/**`、`backend/static/**`、`backend/target/*.jar`（构建产物由发布任务统一处理）
- `CHANGELOG.md`、其它页面、`package.json` / `package-lock.json`

## 根因记录（为什么改这三个文件）

站长报告：1440×900 下权限区内容被裁、保存栏压住内容。实测三层固定高度叠加：

1. `AddEmployee.tsx` 里 `<div className="container" style={{ height: '100vh' }}>` —— 内联，把整页锁在视口高；
2. `add.css` 的 `.add-root { overflow: hidden auto }` —— 自身成了滚动容器，导致 `position: sticky` 的标题栏跟着内部滚动一起消失；
3. `Staff.tsx` 的 `PermTree` 里 `.perm-layout-container` 内联 `height: 420` —— 权限树被压缩（可视 384px 装 516px）。

修复后实测：整页可滚（`scrollHeight` 927~989），`headerTop=0`（标题栏固定生效），保存栏完整贴底且不与内容重叠。

## 计划推送分支

main（快进推送）

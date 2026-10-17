# 任务 2026-10-17-inout-virtual-scroll-185

- 状态：进行中
- 开始时间：2026-10-17
- 分支：main
- 目标：修掉生产崩溃「进出货 选今年 → 切分店 → 页面出错了（React #185 Maximum update depth exceeded）」
- 白名单（只允许改这些）：
  - docs/tasks/2026-10-17-inout-virtual-scroll-185.md
  - docs/tasks/README.md
  - CHANGELOG.md
  - inventory-system/frontend/src/pages/StockInout.tsx
  - inventory-system/frontend/verify-inout-year-switch.cjs
- 明确不碰：其他页面、后端、数据库、backend/static/**、backend/target/**、他人工作区改动
- 计划推送分支：main

## 现象与复现

- 生产：`/inout?system=j1` → 快速选择「今年」→ 展示货品 → 切分店 → 整页变成「页面出错了」。
- 本地 dev 复现（真实后端 demo 登录）：选「今年」后 `rows=20000`（超过虚拟滚动阈值 80）→ 切分店后
  `Maximum update depth exceeded`，组件栈指向 `<StockInout>`，即 React #185 无限更新。

## 根因

`StockInout.tsx` 的「渲染后实测行高」`useLayoutEffect`：

1. **没有依赖数组** → 每次渲染都执行一次 `setRowH`；
2. 高度取自 `getBoundingClientRect().height`，是**亚像素**值（如 42.375），每次测量有微小抖动；
3. 于是「测量 → setRowH（新数组）→ 重渲染 → 再测量」永不收敛。
4. 只有 `rows.length > 80`（`useVirtual`）才会进入这段逻辑 —— 所以平时看不出来，
   选「今年」（2 万行）才触发；切分店重载数据后立刻炸。

## 修法（两行）

- 测量值 `Math.round(...)`：整数像素让结果稳定，不再因亚像素抖动反复 setState。
- 补依赖 `[rows, useVirtual, tableW, scrollTop]`：只在数据/宽度/滚动变化时校正，不再每渲染都 dispatch。

## 验证

- `verify-inout-year-switch.cjs`（vite dev + puppeteer + 真实后端）：8 项全部 PASS
  - 选「今年」后有行且未崩溃（domRows≈27）
  - J2 → J3 → J1 → J2 反复切店：标题正确、有行、无崩溃
  - 滚到中间仍渲染行（domRows≈34，远小于 2 万）
  - 滚动后再切店不崩溃；全程无 #185 / 未捕获异常
- `npm run build`（tsc -b + vite build）通过。

## 已知边界（本次不改）

- 选「今年」一次返回 **20000 行**（后端上限），弱网下这份 payload 本身就很重；
  属于独立的「大数据量/分页」议题，本次只修崩溃。

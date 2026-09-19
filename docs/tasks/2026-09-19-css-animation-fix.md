# 任务 2026-09-19-css-animation-fix

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：修掉 CSS 里那批坏掉的 `@keyframes`（十几个页面的转圈/淡入动画一直是失效的）+ 顺手修两处同类破损
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/styles/add.css
  - inventory-system/frontend/src/styles/cost.css
  - inventory-system/frontend/src/styles/dishware.css
  - inventory-system/frontend/src/styles/kpi.css
  - inventory-system/frontend/src/styles/kpiedit.css
  - inventory-system/frontend/src/styles/phone.css
  - inventory-system/frontend/src/styles/staff.css
  - inventory-system/frontend/src/styles/stocklist.css
  - inventory-system/frontend/src/styles/corporate.css
  - inventory-system/frontend/src/styles/sidebar.css
  - inventory-system/frontend/src/styles/mobile-records.css
  - docs/tasks/2026-09-19-css-animation-fix.md
  - docs/tasks/README.md
- 明确不碰：后端、数据库、页面逻辑/TSX、CHANGELOG.md、构建产物

## 问题（构建日志暴露的）

`npm run build` 报 52 条 `css-syntax-error`。根因是**某次批量改 CSS 时把类名前缀塞进了 `@keyframes` 里**：

```css
@keyframes spin {.staff-root to{      /* ← 非法：@keyframes 里只能写 from/to/百分比 */
    transform: rotate(360deg);
} }

@keyframes toastProgress {            /* dishware.css 那种是 { 换到下一行 */
.dw-root 0%{ transform: scaleX(1); }
.dw-root 100%{ transform: scaleX(0); }
}
```

后果不只是"动画不跑"：`@keyframes` 块解析失败时，浏览器会把附近的规则一起丢掉 ——
所以这些页面的**转圈/淡入/滑入/进度条动画实际上都是死的**。

## 做法

1. **解析 `@keyframes` 块 → 剥掉里面非法的 `.类名` 前缀**（只动 keyframes 内部，别的地方不碰）：
   8 个文件、**66 处**；corporate.css 那种 `{` 换行的又补了 **17 处**（共 83 处）
2. **corporate.css** 里集团架构页的水印 logo 路径 `url('../images/images/logo.png')` 是错的
   （多一层 images）→ 改成 `/static/images/logo.png`（public 资源路径），水印恢复
3. **sidebar.css** 末尾多出两个 `}`（同一批改动的遗留）→ 删掉（浏览器会在那里丢规则 + 构建报警）
4. **mobile-records.css** 有一条规则的选择器被吃掉了（变成 `.mobrec-root font-size: clamp(...)`），
   无法还原原来挂哪个元素 → **原文注释保留**并写明原因（它本来就是死规则，注释掉不改观感，但能让构建干净）

## 本地验证

| 检查 | 结果 |
|---|---|
| 构建警告 | `css-syntax-error` **52 → 0** ✓；`didn't resolve`（logo）也没了 ✓ |
| 大括号 | 全量扫 `src/styles/*.css`：**无一个文件不平衡** ✓ |
| 浏览器（局部） | `document.styleSheets` 里 84 条 `@keyframes`、**0 条空/坏**；`spin`、`toastProgress` 等关键帧都在 ✓ |
| 观感 | 只删了两处多余 `}`、注释了一条本就失效的规则、修了一个 404 的图片路径 → 不改任何现有样式 ✓ |

`npm run build` 通过。

## 待用户在生产环境执行

纯前端：`npm run build` + rsync 到 `/var/www/admin/`

## 备注

- 那批"批量改 CSS"导致的其它破损如果还有（比如某些选择器被吃掉），这次没搜到更多；
  以后如果哪个页面样式怪怪的，先看 `npm run build` 有没有 CSS 警告。
- 跨文件同名的动画（`spin` / `fadeIn` / `slideIn` / `toastProgress` 等）目前是"后定义者生效"，
  修好语法后它们都能跑，但个别页面拿到的可能是别处那份（观感差异很小）。要彻底干净得给它们改名，
  是个可选的后续小任务。

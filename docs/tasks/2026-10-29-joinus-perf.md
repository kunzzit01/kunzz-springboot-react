# 任务 2026-10-29-joinus-perf

- 状态：已完成（P0 + P1），P2 资源优化未做
- 现象：`www.kunzzgroup.com/home/joinus` 滚动明显卡顿（用户 2026-10-29 反馈）。
- 审核结论（源码 + 线上资源实测）：
  1. `useComphotoBounce.js` 用 `requestAnimationFrame` 无限循环，**每帧对 10 张照片写 `left`/`top`**
     → 触发布局；再叠加 `joinus.css` 的 `.comphoto { transition: all .3s }`（每帧重开过渡）。
  2. 该循环**从不暂停**：滑出视口、标签页隐藏时照样跑。
  3. `.comphoto-section`（100vh）同时叠了 3 层逐帧动画：12 段渐变的 `background-position`、
     `::before` 光晕脉冲、`::after` 粒子浮动 → 每帧整屏重绘 3 次。
  4. `backdrop-filter`：`.company-job-container`（背景已 97% 不透明，模糊看不见）、
     `.job-section`（背景图本身不透明）→ 纯浪费，Swiper 平移时每帧重算背景。
  5. 资源：10 张照片 150–400 KB（显示仅 ~100×80）、hero 图 751 KB、首包 JS 447 KB / CSS 141 KB。
- 本次改动：
  - 照片定位 `left/top` → `transform: translate3d()`；`.comphoto` 去掉 `transition: all` 与静态大阴影，
    hover 才加阴影（不再与 JS 的位置写入打架）；加 `will-change: transform`。
  - `IntersectionObserver` + `document.hidden` 门控：不可见时不跑物理计算与样式写入。
  - 删除三层整屏动画（渐变位移 / 光晕脉冲 / 粒子浮动），保留静态配色与装饰。
  - 删除 `.company-job-container`、`.job-section` 的 `backdrop-filter`。
- A/B 实测（headless Chrome + CDP `Performance.getMetrics`，10 元素 × 3 秒）：
  | 指标 | 改前 left/top + transition:all | 改后 transform |
  |---|---:|---:|
  | 布局次数 | 181 | **0** |
  | 布局耗时 | 4.7 ms | **0 ms** |
  | 样式重算耗时 | 68.6 ms | **10.9 ms** |
  | 主线程总耗时 | 171 ms | **48.2 ms** |
- P2 已完成（2026-10-29 第二轮）：
  - 路由懒加载：首包 460 → 327 KB（gzip 135 → 103 KB），joinus 代码独立 21 KB chunk；
  - 照片缩略图：后端 `/api/comphotos-files/{name}?w=240` 用 ImageIO 生成 JPEG 缩略图并落盘缓存
    （`data/cache/thumbs/`），官网按 `&w=240` 请求。实测单张 **406 KB → 8 KB（240×160）**；
    解不了（HEIC/WebP）或异常时回退原图；
  - `public/images/背景4.webp`（首页/About 全屏背景）**906 KB → 9.3 KB**（ffmpeg libwebp q82，肉眼一致）；
  - hero 图 / 福利图标加 `decoding=async`、`fetchPriority=high`、`loading=lazy`。
- 未做（可选）：照片缩略图（~160px）、hero `srcset`/WebP、首包拆分（swiper 动态 import）。
- 白名单：`website/src/hooks/useComphotoBounce.js`、`website/src/styles/joinus.css`、本文件、`CHANGELOG.md`
- 部署：`/var/www/website`（`npm run build` → rsync dist，base `/home/`）

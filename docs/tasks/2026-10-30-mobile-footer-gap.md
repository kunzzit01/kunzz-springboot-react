# 任务 2026-10-30-mobile-footer-gap

- 状态：已完成并部署；白屏修复 4f15cc3，双向手势修复 853769d，生产回归通过
- 目标：修复 JoinUs 手机滑动到页脚后大块白屏；同时审核首页、关于我们、JoinUs 中英文页和 Tokyo 的同类末屏问题；补充修复用户报告的手机只能向下不能返回；保留刚恢复的 laptop 意见卡布局和提交按钮修复。
- 白名单（只允许改这些）：
  - website/src/styles/joinus.css
  - website/src/styles/joinus-mobile.css
  - website/src/components/VerticalSwiper.jsx
  - docs/tasks/2026-10-30-mobile-footer-gap.md
  - .zcode/2026-10-30-mobile-footer-gap/**
- 明确不碰：database/**、backend/**、CHANGELOG.md、管理端、图片资源、package-lock.json、意见表单组件和 laptop 布局规则。
- 扩展原因：SPA 切换后改变手机尺寸，Home_en 缓存 slide 高 671.5px、实际 667px，产生 4.5px 空隙；About_en 两张内容 slide 合计缩短约 65px、Swiper 未补测，留下约 65px 白底。需在共享 VerticalSwiper 同步实际 slide 高度，不改变布局、速度或手势参数。
- 计划推送分支：main
- 验证：独立无头浏览器逐屏滑到页脚，记录页脚高度、Swiper 尺寸/边界、末屏底部及触控后状态；检查中英文和浏览器可视区域高度变化。Windows 无 iOS Safari，需明确仿真验证范围，不宣称真机通过。
- 已知基线：5b0e10f（意见卡修复）及 dcbf2ce（任务记录）。database/u690174784_kunzz.sql 为其它任务改动，保持原样。

## 复现与修复

1. JoinUs 中英文：393×664 时，Swiper 初始末屏缓存为 664px，页脚实际 317.75px，末屏下面出现 346.25px 空白；390×844 时约 523px。`content-visibility` 的整屏占位错误包含短页脚。仅从这项性能优化中排除 footer，不改变其它屏的照片/动画。
2. 跨路由与尺寸切换：Home_en 可复现 4.5px 空隙，About_en 可复现约 65px。响应式内容高度在 Swiper 窗口 resize 测量后继续变化，而原观察器仅监听视口，不监听各个 auto-height slide。
3. 共享 VerticalSwiper 对实际 slide border-box 尺寸增设 ResizeObserver：与缓存相差超过 0.5px 才请求 rAF 合并更新；拖拽和切屏动画期间延后到结束事件，不打断手势。观察集合增量同步，卸载取消 rAF、disconnect、解绑事件。保留原 450ms 和滚轮参数。后续确认 oneWayMovement 被误用于「一次一屏」，实际会把反向拖拽也强制向前；需移除此锁定并验证上下往返。
4. 未更改意见表单、卡片排版、原图、后端或数据库；没有通过全屏深色背景掩盖几何误算。

## 本地回归

- 构建、修改组件 ESLint、git diff --check 均通过；新增 effect 经只读审查未发现阻断性重入/泄漏/手势问题。
- 主站首页、关于我们、加入我们及对应英文共 6 路由：393×664 与 390×844 的 12 组逐屏到底、再次上滑检查通过。
- 6 路由连续 SPA 切换，各经过 393×759、393×620、430×740、768×900、375×667，含入场共 36 组末屏检查通过；页脚之后空白 <1px，版权文字在视口内。
- 中英文 laptop 共 12 组，对比上一任务线上记录，卡片比例、内边距、标题及前四行字段位置不变；提交按钮完整可见。
- 触摸与鼠标滚轮各两次均一次一屏，speed=450 保持；手势/动画期间故意改变页脚高度，更新仅在结束后执行；稳定后 idle update=0，忙碌时 update=0，无运行时错误。
- Tokyo 属独立 raw HTML / 独立主轮播初始化路径，已静态审查但不属于共用 VerticalSwiper；未改动，不将其列为本次已运行验收的 6 页之一。初始化脚本的既有风险需独立处理，不能套用本修复宣称通过。
- 验证环境为 Windows 无头 Chromium 手机尺寸/触控仿真，不等同于 iPhone Safari 真机验收。

## 手机双向手势补充

- 用户报告只能一路向下不能返回。确认 shared VerticalSwiper 的 oneWayMovement=true 会在 Swiper core 中把 diff 与 touchesDiff 强制改为向前，不是「一次一屏」开关；已移除该误用，恢复默认双向。
- 其余 speed=450、slidesPerGroup=1、长滑阈值和滚轮门槛保持不变。
- 本地六个中英文主站路由均使用真实 CDP 触控事件完成「顶端→底部→顶端」：首页各 3 次上划/3 次下划，关于我们各 4/4，加入我们各 6/6；均回到 translate=0，无末屏白屏。
- 4f15cc3 的线上直达 12 组、SPA/尺寸 36 组和 laptop 12 组复核通过。串行独立页测试，避免同一个无头浏览器多页并发时背景 rAF 暂停导致的无效测量。
- 853769d 生产六路由也完成相同「顶端→底部→顶端」52 次触控，均通过；触摸与桌面滚轮单次一屏、速度 450、不在手势中更新以及稳定后无循环更新的检查再次通过。
- 站点备份：白屏修复前 /var/www/website.bak.20261030_121636-mobile-footer-gap/；双向修复前 /var/www/website.bak.20261030_122325-mobile-bidirectional/。
- iPhone Safari 实机仍由用户刷新后确认；未操作用户桌面、鼠标或键盘。

# 任务 2026-10-29-brand-icons

- 状态：已完成
- 需求（用户 2026-10-29，成本分析仪表盘 `/cost`）：
  1. GrabFood / foodpanda / ShopeeFood 三张成本卡片原来都用 Font Awesome 的通用图标（`fa-shuttle-van` / `fa-shopping-bag`），
     看不出是谁 → 换成三个平台的**品牌图标**；
  2. 顺便**统一这个页面其它图标的风格**。
- 做法：
  - 品牌图标取自 **Simple Icons**（simpleicons.org，图标数据 CC0；商标归各公司所有）：
    `grab` / `foodpanda` / `shopee`。ShopeeFood 没有独立条目，用母品牌 Shopee（购物袋 + S，即 ShopeeFood 图标主体）。
  - 新增 `components/BrandIcons.tsx`：三个组件，`fill="currentColor"` + `viewBox 0 0 24 24`，
    颜色由调用方给（Grab `#00B14F`、foodpanda `#D70F64`、Shopee `#EE4D2D`，与趋势图图例同色）。
    Grab 是**文字标**，尺寸太小会糊 → 该卡片给 44；panda 30、Shopee 27（按光学重心微调）。
  - 统一风格：`cost.css` 里卡片图标槽统一 `50×50`、业务图标统一 `24px`/`#111827`（原来 font-size 跟随 `1.5vw` 缩放，
    大小不稳定）；业务图标继续用 FA solid，品牌图标同处一个槽位，视觉重量对齐。
- 未动：图例/图表配色、卡片数据口径、其它页面图标。

- 白名单：
  - inventory-system/frontend/src/components/BrandIcons.tsx（新增）
  - inventory-system/frontend/src/pages/Cost.tsx（三个外卖卡片图标 + import）
  - inventory-system/frontend/src/styles/cost.css（图标尺寸统一）
  - docs/tasks/2026-10-29-brand-icons.md
  - CHANGELOG.md（仅追加）
- 计划推送分支：main

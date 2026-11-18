# 任务 2026-11-18-add-staff-layout-v2

- 状态：已完成（2026-11-18，本地 5174 实测通过，待部署）
- 目标：`/staff/add` 在 tablet / laptop / desktop 三种尺寸下**不整页滚动**（页面锁视口高），权限树完整可见、不被压缩。只改布局，不动配色。（第一版做成整页滚动，方向错了，已撤销。）
- 白名单：
  - inventory-system/frontend/src/styles/add.css  # 仅追加
  - inventory-system/frontend/src/pages/AddEmployee.tsx  # 6 个原生 select 换 SelectField；所属公司占位样式
  - docs/tasks/2026-11-18-add-staff-layout-v2.md
- 明确不碰：form-ui.css、perm-tree.css、Staff.tsx、backend/**（含 static、jar）、CHANGELOG.md
- 计划推送分支：main

## 结果（本地实测，均无整页滚动）

| 尺寸 | 布局 | 权限树（宽×高） |
|---|---|---|
| 1920×1080 | 左右两栏 | 926×724 |
| 1536×825（1920 屏 125% 缩放） | 左右两栏，左栏一屏放下 | 731×469（原约 390×285） |
| 1366×768 | 左右两栏 | 645×412 |
| 1024×768 横屏 tablet | 左右两栏（2:3） | 487×416 |
| 820×1180 / 768×1024 竖屏 tablet | 上下两块 | 634×438 |

根因：详情卡被旧规则钉死 420px（树只剩 131px 宽）；权限组件钉死 480px 高；卡片 24px 内边距 + 底部外边距
（卡中卡）；form-ui.css 的 `40fr 52fr !important` 盖掉列宽（用 `form#addUserForm` 提高优先级压过，未改该文件）。
附带：标签改为文字流（星号紧跟文字，同排输入框底对齐）；未选中任何项时详情面板收起、树占满。

附：上线后发现「所属公司」下拉被账号设置卡的 overflow:hidden 切掉（为标题条贴齐圆角而加），已改为该卡不裁切 + 标题条继承卡片圆角。

附 2：下拉统一——性别/国籍/种族/银行/账号类型/职位由原生 <select>（系统蓝底菜单）换成现有 SelectField；所属公司多选面板改成与 SelectField 同一套样式（实测逐项一致）。公用 select-field.css 未动。

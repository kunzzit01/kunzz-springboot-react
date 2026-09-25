# 任务登记（并行防撞）

多个 task 同时在这个仓库里干活时，**每个 task 开工前必须先在这里登记自己的写入白名单**。
规则见仓库根目录的 [`AGENTS.md`](../../AGENTS.md)。

## 怎么用

1. 复制下面模板，存成 `docs/tasks/<任务ID>.md`。任务 ID 用 `<日期>-<短名>`，例如 `2026-09-17-hifo-split`。
2. 在下方「活跃任务」表里加一行，让其它 task 一眼看到谁在改什么。
3. 任务收工（推送完成）后，把状态改成 `已完成`，或直接从表里删掉并把文件保留作记录。

## 模板

```markdown
# 任务 <任务ID>

- 状态：进行中
- 开始时间：YYYY-MM-DD HH:mm
- 分支：main / task/<任务ID>
- 白名单（只允许改这些文件）：
  - 路径1
  - 路径2
- 明确不碰：
  - backend/**
  - CHANGELOG.md
- 备注：与其它 task 有交集的地方
```

## 活跃任务

| 任务 ID | 状态 | 白名单要点 | 分支 |
|---|---|---|---|
| 2026-09-17-anti-collision-rules | 已完成 | AGENTS.md、.githooks/、.gitattributes | main |
| 2026-09-17-updater-guard | 已完成 | git-update.ps1、AGENTS.md、docs/tasks/ | main |
| 2026-09-17-pin-freezer | 已完成 | 冰箱分类功能 15 个文件（固化并发会话未提交的改动） | main |
| 2026-09-17-push-all | 已完成 | 固化全部剩余改动（代码 / 构建产物 / 文档），分 4 个提交 | main |
| 2026-09-17-verify-script-cleanup | 已完成 | 提交被取代的旧验证脚本删除 | main |
| 2026-09-18-forgot-password | 已完成 | 忘记密码：后端 8 文件（新增 5 改 3）+ 前端 5 文件；不碰构建产物与数据库结构 | main |
| 2026-09-18-inout-price-required | 已完成 | 进出货单价不再自动填 0.00；只改 StockInout.tsx 一个文件 | main |
| 2026-09-18-inout-hifo-autoprice | 已完成 | 出货单价自动带出 HIFO 最高价那层；只改 StockInout.tsx 一个文件 | main |
| 2026-09-18-inout-price-selectall | 已完成 | 金额框点一次即全选，可直接打新金额；只改 StockInout.tsx 一个文件 | main |
| 2026-09-18-shortcut-keys | 已完成 | Ctrl+S 存当前行 / Ctrl+Shift+S 批量存 / 去掉 Ctrl+Enter；改进出货 + 货品种类两个页面 | main |
| 2026-09-18-stockdata-price-scale | 已完成 | stock_data.price 精度 3→5 位（SQL 补丁），货品种类单价框 step 0.00001 | main |
| 2026-09-18-stockrecords-silent-refresh | 已完成 | 总库存：别人保存后静默更新，不跳顶部/不清筛选；只改 StockRecords.tsx | main |
| 2026-09-18-products-assign-preserve | 已完成 | 单系统页保存不再覆盖「系统分配」；总览外不展示该列 | main |
| 2026-09-18-products-assign-column-restore | 已完成 | 纠正上一任务：中央/分店恢复「系统分配」列并改显真实值；数据修复保留 | main |
| 2026-09-18-remark-total-no-round | 已完成 | 货品备注「总重量」不再进位到 2 位（0.338 不再显示成 0.34）；只改 RemarkAnalysis.tsx | main |
| 2026-09-18-per-system-fields | 已完成 | 冰箱分类/位次/默认单价改为按系统各存一份（新表 stock_data_system）；总览只读展示 4 套 | main |
| 2026-09-18-per-system-delete-cleanup | 已完成 | 删货品时级联清掉 stock_data_system 的行（不留孤儿行） | main |
| 2026-09-18-branch-remark-codes | 已完成 | 备注编号支持分店：分店台账加两列，取数/校验/生成按系统 | main |
| 2026-09-18-remark-page-system-reload | 已完成 | 备注页切系统后自动重新取数（此前要手动刷新）；只改 RemarkAnalysis.tsx | main |
| 2026-09-18-price-log-daily | 已完成 | 改价记录同一天同一货品同一系统只留一条（当天只更新新价，old 保持当天起点价）；补丁第 10 节清历史重复 | main |
| 2026-09-18-price-log-who | 已完成 | 改价记录显示是谁改的：改价人改取登录用户（原为货品申请人）；弹窗+悬浮提示 | main |
| 2026-09-19-mobile-tier-rounding | 已完成 | 手机版出货价格层口径改为显示价 ROUND(price,2)，与电脑一致；修「手机出完货电脑总库存倒扣」；只改 MobileStockMapper.xml | main |
| 2026-09-19-editor-tracking | 已完成 | 编辑不再清掉创建人；新增 updated_by 记「编辑人」，进出货/货品种类悬浮提示显示；补丁第 11 节给 5 张表加列 | main |
| 2026-09-19-products-price-log-tip | 已完成 | 货品种类单价悬浮显示「最近改价 + 改价人」（按系统取，改价后实时更新）；只改 StockProducts.tsx | main |
| 2026-09-19-inout-newrow-single-save | 已完成 | 进出货新增行的单行保存只存/只摘这一行，不再把其余待存行一起清掉；只改 StockInout.tsx | main |
| 2026-09-19-stockrecords-raw-price-tip | 已完成 | 修回总库存的原始单价悬浮提示（后端把 price_raw 带出来 + 前端按"原始价≠显示价"判断）；子行也提示 | main |
| 2026-09-19-raw-price-dec-only | 已完成 | 悬浮卡片只显示带小数位的原始价（不再带"转换后"的显示价，如 1.4541 ~ 1.45416） | main |
| 2026-09-19-remark-page-system-perms | 已完成 | 货品备注页补上「系统权限」：只勾 J1 的账号进不去中央（前端过滤+自动跳转，后端也拦） | main |
| 2026-09-19-products-overview-single-system | 已完成 | 货品种类：只有一间分店权限不显示「总览」；顺带修「权限到达前先拉全量、旧响应覆盖新数据」的越权竞态 | main |
| 2026-09-19-products-overview-masked-edit | 已完成 | 总览打码行放开编辑（保存不发 system_assign，别家分配不受影响）；4 套文本按权限收敛 +「另有中央/J3」标记；新增行必选分配 | main |
| 2026-09-19-approve-btn-wrap | 已完成 | 修「批准」按钮在窄窗口被竖着折成两行：按钮 nowrap + 状态列改固定 88px；只改 CSS | main |
| 2026-09-19-products-column-sort | 已完成 | 货品种类：编号/名字表头可点排序（自然排序），默认改「编号升序」（原来按更新时间看起来是乱的） | main |
| 2026-09-19-products-overview-text-width | 已完成 | 总览单价/冰箱分类：去掉「（另有X）」标记、加宽两列、悬浮看完整文本；前端 + 后端各一处 | main |
| 2026-09-19-settings-minimum-perms | 已完成 | 最低库存设置页补「系统权限」：标签只列有权限的系统 + 自动跳转 + 锁定态，后端三个端点也拦 | main |
| 2026-09-19-overview-tip-simplify | 已完成 | 总览单价/冰箱分类悬浮简化：去掉「最近改价（中央）」与「要修改」两行，单价带 RM 单位 | main |
| 2026-09-19-whitescreen-hardening | 已完成 | 网络不好不再白屏：启动加载提示 + CDN 全部 defer/异步 + 全局 ErrorBoundary + 权限加载转圈 | main |
| 2026-09-19-vendor-selfhost | 已完成 | jQuery/Chart.js/jspdf+autotable/html2canvas/Font Awesome 全部自托管到 public/vendor，不再依赖外网 CDN | main |
| 2026-09-19-css-animation-fix | 已完成 | 修 83 处被污染的关键帧（十几个页面的动画其实一直是死的）+ logo 路径 + sidebar 多余大括号；构建 CSS 警告清零 | main |
| 2026-09-19-products-delete-needs-approve | 已完成 | 货品种类的删除按钮只给「批准」权限（申请权限看不到）；后端 DELETE 也加校验（403） | main |
| 2026-09-19-products-inactive | 已完成 | 货品种类加「启用/停用」（按系统）：停用后不进进出货下拉/总库存/手机版；有库存不让停用；需批准权限；补丁第 12 节加列 | main |
| 2026-09-19-mail-smtp-diagnosis | 已完成 | 查清「添加职员收不到临时密码邮件」= VPS 的 SMTP_PASS 故意留空（旧应用密码泄露）；补强失败日志与前端提示 | main |
| 2026-09-19-mail-provider-switch | 已完成 | 真因是 Gmail 550-5.4.5 每日发信配额超限（认证已通过）；加 MAIL_FROM 与 SMTP_SSL 开关，换服务商只改 env 不改代码；失败日志按真实原因给建议 | main |
| 2026-09-19-staff-resend-invite | 已完成（当日已撤除） | 职员管理加「重发登录邮件」：生成新临时密码补发（旧密码作废），邮件不通时把新密码返回给管理员手动转告；后端 + 前端各两处。**当日 21:15 按用户要求整体移除**，实现留在 git 5347f18 | main |
| 2026-09-19-remove-resend-invite | 已完成 | 按用户要求移除「重发登录邮件」按钮与功能（前端按钮/API 封装 + 后端端点/Service 方法）；编译、构建、404/200 实测通过 | main |
| 2026-09-22-inactive-by-code | 已完成 | 货品种类停用改「只认货品编码」：停用前库存校验原按名字（同名多编码会互相拦），改成按编码；进出货下拉/总库存/手机版过滤也统一按编码；前端确认文案带编号 | main |
| 2026-09-22-products-save-auto-approve | 已完成 | 货品种类：有「批准」权限的人**保存即批准**（本该掉回待批准的行自动写成本人），不用再点「批准」按钮；只在后端做，不动前端 | main |
| 2026-09-22-products-approve-fixes | 已完成 | 复核查出的两处：①有批准权限的人保存时不再清空批准状态（修掉"改个错别字就把原批准人顶掉"）；②`approve` 接口补「批准」权限校验 + 批准人改由服务端取（堵住任何登录用户都能批准任意记录的越权口子） | main |
| 2026-09-25-schedule-align-old | 进行中 | 排班页对齐旧 PHP 系统：员工管理按部门分组、多选跳位/取消、假期底色被班次覆盖、批量输入不落库 | main |

# 任务 2026-09-27-schedule-pdf-incomplete

- 状态：已完成（源码 + 产物已提交并推送；待用户部署后复核线上 PDF）
- 背景：用户在 https://www.kunzzgroup.com/schedule?restaurant=J1 下载 10 月 PDF
  （`schedule_J1_2026_10.pdf`），发现表格不完整：表头（No./名字/手机号码/职位 + 日期）出现在
  表格中间，压住了 SERVICE LINE 的若干行人名；员工加多以后才出现。
- 根因（已实证）：html2canvas 的 DocumentCloner 会记录「有滚动偏移的元素」并在克隆文档里
  **还原同样的 scrollTop/scrollLeft**（vendor 里 `0===A.scrollTop&&0===A.scrollLeft||this.scrolledElements.push(...)`）。
  于是导出时 `.table-wrapper` 的滚动位置被复制进克隆文档，`position: sticky` 的表头/字段列
  按「滚动后的位置」绘制：表头画进表格中部盖住行，字段列也会被横向平移。
  员工少时表格不满一屏、scrollTop=0，所以一直没暴露。
- 修法：`downloadPDF` 里给表格的 html2canvas 调用加 `onclone`，在克隆文档里把
  `#scheduleContainer` 的祖先滚动容器 scrollTop/scrollLeft 归零（`onclone` 在克隆文档还原滚动之后执行）。
  页面本身不滚动，无跳动；不改样式、不改 DOM。
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/pages/Schedule.tsx
  - docs/tasks/2026-09-27-schedule-pdf-incomplete.md
  - CHANGELOG.md
  - backend/static/index.html
  - backend/static/assets/
- 明确不碰：backend/src/**、backend/target/**、其它页面、其它 task 的登记文件与脏文件
- 计划推送分支：main

> 注：CHANGELOG.md 只追加、不改老行；`backend/static/**` 是本任务重新构建的前端产物，收尾阶段单独提交。
> 上面白名单每行必须是纯路径（pre-commit 钩子按精确路径/目录前缀匹配，带中文括号说明会匹配不上）。

## 验证记录（本机 headless Chrome，真实产物 + 真实 html2canvas-1.4.1）

1. 复现页（真实 schedule.css + 复刻 DOM，31 天 × 17 人）：旧逻辑在滚动后导出 → 表头落进表格中部、
   第 4/5 行被压住、字段列横移；新逻辑 → 表头在顶部、17 人全在、31 天全在。
2. 真实页面 A/B（mock 排班接口，加载仓库里的真实旧/新 bundle，滚到右下角后点「下载PDF」）：
   - 新产物·滚动后 vs 新产物·未滚动 → **0 差异**
   - 旧产物·未滚动 vs 新产物·未滚动 → 0 差异（未滚动时零回归）
   - 旧产物·滚动后 vs 新产物·未滚动 → 20.7% 像素不同；顶部 60px 表头灰占比 0、左侧 500px 纯白占比 73%（复现用户现象）
   - 新产物导出前后 `.table-wrapper` 滚动位置不变（不跳页）
3. 手工复现入口（本机，临时目录 `.tmp-pdfcheck/`，验证完可整个删掉）：
   `node .tmp-pdfcheck/serve.cjs` → 打开 http://127.0.0.1:8901/schedule?restaurant=J1（新产物，
   mock 17 人数据，表格超屏 → 先滚动再点「下载PDF」）；8902 是 git 里的旧产物，可对照看旧问题。

## 部署提示

- 本次只改前端：`backend/static/index.html` + 新 chunk（`index-BtHM1yTW*.js`/`index.es-*`），
  后端 jar 不用重打；部署机 `git pull` 后刷新页面即可（静态免重启，必要时 Ctrl+F5 清缓存）。

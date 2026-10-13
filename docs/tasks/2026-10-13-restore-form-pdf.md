# 任务 2026-10-13-restore-form-pdf

- 状态：进行中
- 开始时间：2026-10-13 10:05
- 分支：main
- 目标：恢复「职员管理 → 下载面试表」的 PDF 模板（kh / j1 / j2 / j3），
  以及同目录备份里的 survey / surveyform 模板
- 白名单（只允许改这些）：
  - docs/tasks/2026-10-13-restore-form-pdf.md
  - docs/tasks/README.md
  - CHANGELOG.md
  - inventory-system/frontend/public/form/kh.pdf
  - inventory-system/frontend/public/form/j1.pdf
  - inventory-system/frontend/public/form/j2.pdf
  - inventory-system/frontend/public/form/j3.pdf
  - inventory-system/frontend/public/form/survey.pdf（新增）
  - inventory-system/frontend/public/form/surveyform.pdf（新增）
  - backend/static/form/kh.pdf
  - backend/static/form/j1.pdf
  - backend/static/form/j2.pdf
  - backend/static/form/j3.pdf
  - backend/static/form/survey.pdf（新增）
  - backend/static/form/surveyform.pdf（新增）
- 明确不碰：`backend/src/**`、其它前端源码（`src/**`）、`backend/static/assets/**`、
  `backend/target/*.jar`、其它 `backend/static/**`、`website/**`、`database/**`
- 计划推送分支：main

## 现象

`https://www.kunzzgroup.com/staff` → 职员管理 → 「下载面试表」选 KUNZZHOLDINGS / TOKYO (J1/J2/J3)，
下载到的 PDF 只有一行 `KUNZZ Interview Application Form`，**没有任何表格内容**。

## 根因

`/form/*.pdf` 由前端 `public/form/` 提供（`Staff.tsx` 里 `KUNZZHOLDINGS: '/form/kh.pdf'` …）。
仓库里这 8 个文件（`inventory-system/frontend/public/form/` + `backend/static/form/`）
**从 initial commit 起就是 559 字节的占位 stub**：单页、无字体嵌入、正文只有
`BT /F1 24 Tf 72 720 Td (KUNZZ Interview Application Form) Tj ET`。
线上 `https://www.kunzzgroup.com/form/kh.pdf` 的响应体 md5 与该 blob **完全一致**
（`a3aa52ddb5d03410e9c8e91b35356e3f`），确认线上就是这份 stub —— 不是部署事故，
而是**真正的模板从未进过仓库**。

## 修复

用户提供的原始备份（`_form.zip`，6 个 PDF）重新放回两处：

| 文件 | 目标 | md5 |
|---|---|---|
| kh.pdf | KUNZZ HOLDINGS SDN BHD 面试表 | `2ae194d1e36fcba78263efd0e3dd6747` |
| j1.pdf | TOKYO JAPANESE CUISINE SDN BHD | `42558ca2c06fafbd4ff9b1f5641fa93a` |
| j2.pdf | TOKYO JAPANESE (J2) SDN BHD | `0eda70f7ff5c58962dae0d032f5a32a7` |
| j3.pdf | TOKYO IZAKAYA (J3) SDN BHD | `65b6e050863448d0ede75891d080e4b1` |
| survey.pdf / surveyform.pdf | 旧站同目录模板（当前无代码引用，随备份一并归档） | `51027c09…` / `0c09930b…` |

- 两处（`public/form` = 构建源；`backend/static/form` = 提交进仓库的静态副本）都要放，
  否则下次 `npm run build` + 部署会把 stub 又推进线上。
- 只换 PDF，**不重建** JS 产物：`backend/static/assets/**` 与 jar 一律不动（AGENTS.md §4）。

## 验证

- `md5sum` 与备份逐一比对（见上表）。
- `pdftotext` 抽出的正文是完整表格（A. PERSONAL INFORMATION / B. POSITION APPLIED /
  C. EMPLOYMENT HISTORY / D. EMERGENCY CONTACT，含公司抬头），不再是单行占位文本。
- 本地 `http://localhost:5173/form/kh.pdf`（vite dev 直接服务 `public/`）打开即为真表。

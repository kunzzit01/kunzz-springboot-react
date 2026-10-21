# 任务 2026-10-21-hire-resume-pdf

- 状态：进行中
- 开始时间：2026-10-21 16:55
- 分支：main
- 目标：招聘申请列表「预览 PDF」→ 预览照旧，但浏览器「保存/另存为」必须落成 **.pdf**
  （现状：Edge 存成无扩展名的 `f`，类型显示「TXT File」）
- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/controller/MediaController.java
  - inventory-system/frontend/src/pages/Jobs.tsx
  - docs/tasks/2026-10-21-hire-resume-pdf.md
  - docs/tasks/README.md
  - CHANGELOG.md
- 明确不碰：其它 backend/**、其它前端源码、backend/static/**、backend/target/**、database/**
- 计划推送分支：main

## 现象

`/hire` 招聘申请列表 → 点「预览 PDF」→ 简历能在浏览器里渲染出来，但按「保存」时
Edge 的另存为对话框给出：文件名 `f`、类型 **TXT File**、大小 116KB（内容其实是 PDF）。
详情弹窗里的「📄 下载/预览简历」同样问题。

## 根因

1. 前端预览：`Jobs.tsx` 里 `window.open(resolveFileUrl(app.resumeFileUrl), '_blank')`
   （`resolveFileUrl`：`http…` 原样用，否则 `origin + '/' + path`）。
2. 服务端（`MediaController.java:361`）：
   ```java
   @GetMapping(value = "/files/{name}", produces = "application/octet-stream")
   ```
   - **写死 `application/octet-stream`**：PDF 不会被当成 PDF，浏览器只能「下载」；
   - **没有 `Content-Disposition` 文件名**：文件名只能从 URL 最后一段猜 ——
     老数据的路径没有扩展名（`…/f` 这类）时，Edge 直接存成 `f` 并标成 TXT。
3. 新系统上传的简历是 `data/uploads/resume_xxxxxxxx.pdf`，URL = `/api/media/files/resume_xxxxxxxx.pdf`
   （`JobService.saveResume`），同样被这个端点用 octet-stream 下发。

## 修复

### 后端（MediaController）

`/api/media/files/{name}` 改为：
- 按扩展名给正确 MIME（`pdf → application/pdf`、doc/docx、图片、视频、音频）；
- 扩展名未知时**嗅探文件头 `%PDF-`**，是 PDF 就按 PDF 下发；
- 显式下发 `Content-Disposition: inline; filename="<name>"`（UTF-8），
  这样「预览」= 内嵌查看器，「保存」= 正确文件名 + `.pdf`。

### 前端（Jobs.tsx）

新增 `openResume(url)`：
- URL 带 `.pdf/.doc/.docx` → 直接新标签打开（服务端已给对头）；
- URL 没扩展名（老数据）→ `fetch` 取回字节，`new Blob([...], { type: 'application/pdf' })`
  → `blob:` 打开，强制浏览器用 PDF 查看器处理（保存即 `.pdf`）；失败再退回直接打开原 URL。

## 验证

- 本地：`/hire` 点「预览 PDF」→ 新标签页显示 PDF；Ctrl+S → 文件名 `resume_xxxxxxxx.pdf`、类型 PDF。
- 线上：部署后同步骤验证，文件不再是 `f` / `.txt`。
- 回归：`/api/media/files/**` 还被后台媒体列表（图片/视频）使用，MIME 由 octet-stream 变正确值属于改进，
  需确认图片仍能显示（`<img>` 不受影响）。

## 部署

后端改了 → **必须重建 jar**；前端改了 → **必须重建 dist**。

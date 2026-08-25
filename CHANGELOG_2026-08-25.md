# 工作日志 2026-08-25（重要功能 & 对齐 live/旧系统）

> 只记录重要功能与对齐改动，供回溯；细节样式微调不在此列。

---

## 1. 问卷（/qna）提交后可重新填写

- 后端 `QnaService.create()`：重复提交改为**覆盖更新**（upsert，保留原 id）
- 前端 `Qna.tsx`：刷新后回到可编辑状态（预填上次答案）；查看模式新增「重新填写」按钮

## 2. 进出货：快捷键 + 删除撤销（对齐 stockeditall.js）

- 快捷键：`Ctrl+S` 保存 / `Ctrl+Shift+Z` 撤销删除 / `Ctrl+D` 批量删除 / `Ctrl+A` 快速加行 / `Ctrl+Shift+A` 新增记录弹窗
- 删除后底部撤销条（10 秒可撤销）；新增 `PUT /api/stock/inout/restore` 批量恢复，中央↔分店**双向联动**（含回收站 restore 升级）

## 3. 进出货：下拉选单全面对齐 live

- Combobox 重构：portal 渲染到 body 防滚动容器裁剪、底部空间不足自动向上翻转、宽度内容自适应不换行
- 货品显示 `名称 (供应商)`（无供应商回退编号）、编号显示 `编号 (名称)`；**显示全部价格**，库存不足标注「(库存:X, 不足)」
- 选择编号自动回填货品名/规格/类型/供应商（新增行 + 编辑行）
- 手动输入价格后保持输入框显示（不再被切回下拉显示「请选择价格」）
- 后端 `COALESCE(SUM(...))` 修复：**全新进货价**（出库列全 NULL）不再被净库存计算吞掉——此前新价不出现在「单价与库存」下拉、HIFO 拆行、总库存、备注编号"在库"判断

## 4. 收货单位规则（对齐旧系统）

- 新增行：输入**进货数量即锁死「中央」**；出货时才可选 J1/J2/J3/中央
- 编辑模式：收货单位改为**可下拉修改**；修改目标单位后**自动同步分店记录**（生成/清理 `jXstockedit_data` + `jXstockinout_data`，修复"改了出货单位分店却无记录"）

## 5. 后端：编辑出货记录备注校验修复

- 编辑时**保持原备注编号**则跳过「在库」校验（该编号可能已被本记录自身消耗）——前端 `saveEdit` 同逻辑，修复"编辑保存不了"

## 6. 全页面保存防连点（对齐 batchSaveNewRows）

- 进出货 + 全部有保存操作的页面（Suppliers/Price/Menu/Jobs/Staff/Schedule/Dishware/DishwareBreak/DishwareTransfer/Phone/Evaluation/Timeline/JobPositions）
- 保存中按钮禁用 + 转圈，`if (saving) return` 挡重复提交/双击

## 7. 快速选择（时段）下拉统一 KPI/Cost 设计

- 橙色按钮 + 2px 黑边菜单 + 600 权重选项（对齐全站统一设计）

---

## 附：Git 提交与当前状态

- 提交 `9d81d4c`（57 文件，+2673/-734）已推送 origin/main；工作区干净、本地=远端
- **安全**：`live-credentials.json`（live 同步凭证）已被 `.gitignore` 排除未推送；`sync-live-stock.cjs` 无硬编码凭证
- 后端 jar 于 16:58 重建运行在 8081；前端最新 bundle `index-CtewFiZ3.js` + `index-BfWkcJtf.css`
- 新增文件：`CHANGELOG_2026-08-25.md` / `LIVE_OPS.md` / `sync-live-stock.cjs` / 数据库主包更新

## 附：部署速查

- **前端**：`cd inventory-system/frontend && npm run build` → `cp -rf dist/* backend/static/` → 清旧哈希文件（静态免重启；注意 CSS 哈希可能不变、勿误删）
- **后端**：停 8081 进程 → `mvn -DskipTests package`（JAVA_HOME 用 Adoptium JDK 21，`runtime/jre21` 是 JRE 无 javac）→ `java -Duser.timezone=GMT+8 -jar backend/target/inventory-backend-1.0.0.jar`（WorkingDirectory=backend/）
- **Maven**：`C:\Users\kunzz\.m2\wrapper\dists\apache-maven-3.9.16\<hash>\bin\mvn.cmd`（旧 `~/tools/apache-maven-3.9.9` 也可用）
- **数据库**：XAMPP MariaDB `u690174784_kunzz`（127.0.0.1:3306，root 无密码）；demo/demo123

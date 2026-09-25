# 任务 2026-09-25-schedule-align-old

- 状态：已完成（本地已验证，未提交/未推送）
- 开始时间：2026-09-25 15:40
- 分支：main
- 背景：用户对比旧 PHP 系统（`kunzzgroup/backend/schedule_manager.php`）后指出新排班页 4 处未对齐：
  1. **员工管理弹窗**：旧版按部门分组（SERVICE LINE / SUSHI BAR / KITCHEN，每组带 `当前人数/上限` 徽章、
     组内独立编号、每行「编辑 + 删除」两个按钮、工作区域显示为彩色 pill）；新版是平铺列表、无 No.、只有删除钮。
  2. **选格子跳位 + 取消不掉**：Shift 拖动多选时会跳到别的格子，且点别处/按 Esc 都取消不了选择，只能刷新页面。
     根因：新版用 `cellRefs.current` 这个**只增不减**的 Map 做行列换算（旧版每次 `querySelectorAll` 现查现算），
     分店/月份切换后残留旧 key，索引错位；且旧版 `handleCellClick` 非 Shift 点击会 `clearSelection()`，新版没有。
  3. **班次压掉假期底色**：在公共假期格子里打班次，自动保存后 `applyCellStyle(cell, code)` 未带 `keepHolidayBg`
     → 假期底色被清掉（旧版自动保存路径不重设样式，颜色保留）。
  4. **批量输入不进排班**：新版 `applyBatchInput` 只标记 modified 不触发自动保存（旧版逐个 `scheduleAutoSave(cell)`）。
  5. **班次管理弹窗**（用户第二轮反馈）：旧版表格有「餐厅」列 + 每行「编辑」按钮 + 末尾内联新增行（代码/开始/结束 + 绿色 ✓），
     新版只有删除按钮、没有餐厅列、新增要走单独的「添加班次」弹窗；旧版编辑班次时会禁用班次代码输入、只更新起止时间。
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/Schedule.tsx
  - inventory-system/frontend/src/styles/schedule.css
  - backend/src/main/java/com/kunzz/inventory/service/ScheduleService.java   # ② 假期叠加：upsertRecord 对齐旧 save_schedule；⑤ 班次编辑：saveShift 支持 update
  - backend/src/main/java/com/kunzz/inventory/mapper/ScheduleMapper.java      # ⑤ 新增 updateShiftTime
  - backend/src/main/resources/mapper/ScheduleMapper.xml                      # ⑤ 新增 updateShiftTime（对齐旧 update_shift：只改起止时间）
  - backend/static/                                                           # 本任务改了前端源码 → 重新构建的产物（整目录）
  - backend/target/inventory-backend-1.0.0.jar                                # 本任务改了后端源码 → 重新打包的 jar
  - docs/tasks/2026-09-25-schedule-align-old.md
  - docs/tasks/README.md
  - CHANGELOG.md
- 明确不碰：
  - backend/src/main/java/com/kunzz/inventory/controller/**（接口签名不变）
  - 其它页面（AppLayout.tsx、Phone.tsx、Staff.tsx 等）
  - 旧 PHP 系统目录（C:\xampp\htdocs\kunzzgroup）——只读参考，不改
- 计划推送分支：main
- 备注：旧系统参考文件（只读）`backend/js/schedule_manager.js`：
  `displayEmployeesInModal()`（员工管理分组）、`updateSelection()/handleCellClick()`（选择逻辑）、
  `autoSaveCell()/applyBatchInput()`（自动保存与批量输入）。

## 验证记录（2026-09-25 本机，浏览器 + 数据库实测）

- 环境：8081 后端已重打包重启（新 jar），`backend/static/` 已同步新产物 `index-CiTZNG_G.js`。
- ① 员工管理：分组标题 `SERVICE LINE 6/9`、`SUSHI BAR 3/4`、`KITCHEN 8/13`；表格宽 835 = 容器宽（无横向溢出）；17 行各有编辑/删除按钮。
- ② 多选：Shift 拖动 (89/2026-09-22) → (90/2026-09-23) 精确选中 4 格；普通点击另一格 → 选择清空；Esc → 选择清空。
- ③ 假期叠加：89/2026-09-05（holiday MCPH）输入 `B` → 自动保存后底色仍为假期色、文字 `B`；库里 `holiday/MCPH` + `notes='B'`（已改回 `D`）。
- ④ 批量输入：选 2 格应用 `B` → 两格落库 `shift/B`（已改回 `D`）。
- ⑤ 班次管理：内联新增 ZZ 07:30-15:45 → 落库；编辑改 16:20 → 生效且代码保持 ZZ（编辑框禁用）→ 测完删除。
- 测试写入的数据已全部按原值恢复（89/9-05 notes=D、89/9-22/23=D、ZZ 班次已删）。
- 旧系统参照：`php -S 127.0.0.1:8082 -t C:/xampp/htdocs/kunzzgroup <router>`（临时，仅本机查看旧页面用）。

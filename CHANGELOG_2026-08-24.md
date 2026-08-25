# 工作日志 2026-08-24（全站实时 / 邮件系统 / 数据清洗 / 线上同步）

> 本文档记录 2026-08-24 当天对库存系统做的全部改动，含根因、改法、验证结果。
> 供以后回溯使用（尤其是「为什么这样设计」和「下次拉数据要注意什么」）。

---

## 1. 全站实时更新（Realtime）

**需求**：任意窗口做库存写入 → 其他窗口自动刷新，高峰期不被打爆。

### 改动
| 文件 | 内容 |
|---|---|
| `backend/.../controller/StockController.java` | 所有库存写操作（出入库增改删、最低库存保存）广播 `{"type":"stock_changed","system":"all"}`——从「按系统广播」改为**无条件广播 all**，解决中央→分店跨系统不刷新的问题 |
| `frontend/src/utils/useRealtime.ts` | hook 升级：**节流 3s**（高峰期最多每 3s 刷一次）+ **尾部补刷**（写完停 1s 内补最后一次）+ **忙时暂停**（编辑行/弹窗开着跳过，结束后自动补刷）+ 支持 `'*'` 通配订阅 |
| `frontend/src/utils/RealtimeStatus.tsx`（新建）| 侧边栏左下角连接状态灯：绿=已连接 / 黄=连接中 / 红=离线重连 |
| `frontend/src/components/AppLayout.tsx` | 挂载 RealtimeStatus |
| `frontend/src/pages/StockInout.tsx` | `useRealtime(system, load, 1000, 3000, isBusy)`——busy = editingId/viewOpen/checkOpen/rowsModal/exportOpen/sysOpen |
| `frontend/src/pages/StockRecords.tsx` | 只刷当前查看的系统；切换系统时 `switchSystem` 总是重新拉取（原只在未加载时拉，会看到旧数据） |

### 验证
- 端到端实测：登录 → WS 连接 → 触发写 → 收到 `{"system":"all"}` 广播 ✅

### 设计要点（为什么）
- 广播只发信号不发数据（安全，前端自行调已认证 API 拉取）
- 节流在**前端**做，后端 GET 压力有上限（每页 ≤ 20 次/分），与写入频率无关
- 台账页只刷当前视图（1 GET/3s），比全量刷 4 系统省 75%

---

## 2. 邮件系统：新成员欢迎邮件 + 首次登录强制改密

**需求**：admin 添加成员填邮箱 → 邮箱收临时密码 → 首次登录强制重设自己的密码。

### 关键发现
- 旧系统 SMTP 配置在 `kunzzgroup-main/backend/mailer_config.php`：Gmail `kunzzsup@gmail.com` + 应用密码（`pobc jkvr yygb dhyk`）
- 旧欢迎邮件模板：`kunzzgroup-main/backend/generatecodeapi.php` 的 `sendWelcomeEmail()`
- 新后端原本是**空壳**（写死 `emailSent=false`），无 SMTP、无改密流程

### 改动
| 文件 | 内容 |
|---|---|
| `backend/pom.xml` | 加 `spring-boot-starter-mail` |
| `backend/src/main/resources/application.yml` | `spring.mail.*` SMTP 配置（环境变量可覆盖 SMTP_HOST/PORT/USER/PASS）+ `app.base-url`（欢迎邮件登录按钮地址） |
| `backend/.../service/MailService.java`（新建）| 发送欢迎邮件（复用旧模板：橙色调 + 临时密码高亮 + 登录按钮），失败记日志不阻塞建账号 |
| `backend/.../service/StaffService.java` | `createUser` 真实发邮件，`emailSent` 反映结果 |
| `backend/.../dto/LoginResponse.java` | 加 `mustChangePassword` |
| `backend/.../dto/UserVO.java` | 加 `isFirstLogin` |
| `backend/.../service/AuthService.java` | login 返回 `mustChangePassword`；新增 `changePassword()`（校验旧密码→设新→清 is_first_login，新密码 ≥6 位且不能与旧相同） |
| `backend/.../dto/ChangePasswordRequest.java`（新建）| 校验 |
| `backend/.../controller/AuthController.java` | `POST /api/auth/change-password`（需登录态） |
| `frontend/src/pages/ChangePassword.tsx`（新建）| 首次登录重设密码页（复用登录页视觉） |
| `frontend/src/pages/Login.tsx` | 登录后 `mustChangePassword` → 跳转 /change-password |
| `frontend/src/App.tsx` | 加 `/change-password` 路由（RequireAuth 包裹） |
| `frontend/src/components/AppLayout.tsx` | 兜底：`getMe` 发现 isFirstLogin 且不在改密页 → 强制跳转 |
| `frontend/src/types.ts` / `api/index.ts` | 类型 + `changePassword` API |
| `frontend/src/pages/AddEmployee.tsx` | 提示文案：emailSent → 「临时密码已发送到邮箱（首次登录需重设）」；否则显示临时密码手动告知 |
| `deploy-ec2.sh` | 环境文件加 SMTP_HOST/PORT/USER/PASS + APP_BASE_URL |

### 验证（全链路实测）
1. admin 建成员 → `emailSent=true`（真实邮件发到 kunzzsup 邮箱）✅
2. 临时密码登录 → `mustChangePassword=true` ✅
3. 改密成功 → is_first_login 清除 ✅
4. 新密码登录 → 正常进入 ✅
5. 旧临时密码再登录 → 401 拒绝 ✅

---

## 3. gender 枚举修复（`Data truncated for column 'gender'`）

**症状**：编辑职员保存报 `Data truncated for column 'gender'`。

### 根因
`users.gender` 是 `enum('male','female','other')`，MySQL 严格模式（STRICT_TRANS_TABLES）**不接受空串 `''`**。性别为空的成员编辑保存时表单回填 `''` → 写库报错。

### 改动（`backend/.../service/StaffService.java` + `StaffMapper`）
- `normalizeGender()`：空串/非法值 → NULL，大小写统一（`" Female "` → `female`）
- `createUser` / `updateUser` 都走规范化
- 新增 `StaffMapper.clearGender`：显式把性别清为 NULL（enum 不接受 `''` 且动态 UPDATE 跳过 null，必须单独语句）
- 验证：NULL 用户存空性别不报错 ✅；male→清空真正清为 NULL ✅；非法值 XX → NULL ✅

---

## 4. HTML 实体产品名清洗（负数库存 / 幽灵产品）

**症状**：总库存出现负数（如 `HOT &amp; SPICY DRESSING -1.00 / RM -22.60`）。

### 根因
旧系统/手机端把 `&` 存成 `&amp;`（还有 `&#039;` 撇号）。汇总按产品名分组时编码名被当成**不同产品**，且这些行多为**出库**（无对应入库）→ 幽灵负数组。

### 处理（2026-08-24 本地库）
清洗范围：`stockinout_data`(中央 10)、`j1stockedit_data`(52)、`j2stockedit_data`(24)、`j3stockedit_data`(47)、`j1stockinout_data`(1)、`stock_data`(7)、`stock_minimum_settings`(5，需先合并重复再删)。
`users.gender` 空串 2 条 → NULL。

### 两个坑（已写进清单文档）
1. **检查要逐个表查**——UNION 查询在部分工具里输出被截断，曾漏掉中央表
2. **撇号实体 `&#039;` 用 `CHAR(39)`**——SQL 字符串里写字面 `'` 会把语句打断
3. `stock_minimum_settings` 是 **product_name 唯一键**，编码行+正常行并存时先合并非零值再删编码行

### 产物
- `DATA_SYNC_CHECKLIST.md`（数据同步检查清单：第 0 步备份 / 0.5 导入 / 1 HTML实体 / 2 enum / 3 负数甄别 / 4 验证 + 速查表）
- 注意 `users.account_type` 枚举里有**合法的 `r&d`**，清洗时不要动它

---

## 5. 供应值算法对齐（J1/J2/J3供应）

**症状**：本地供应值和线上差好几倍（J1 32,055 vs 线上 96,568）。

### 根因（已用旧代码实锤）
- **线上**：J1/J2/J3供应 = **本月进货总额**——`stocklistapi.php getSupplyTotal`：`jXstockinout_data` 表，`SUM(in_quantity × price)`，只统计**当月**
- **本地原来**：当前库存总价值——`jXstockedit_data` 全历史净库存×单价

### 改动
- `StockSummaryMapper` + `.xml`：新增 `supplyValue(table, start, end)`（本月入库额）
- `StockSummaryService.summary()`：中央时对 j1/j2/j3 用新算法
- 验证：J2/J3 与线上**完全一致**（19,154.55 / 18,816.45），J1 差 119 为数据新旧

---

## 6. 导入最新线上数据 + 表结构变更适配

### 导入过程（用户提供 `u690174784_kunzz (3).sql`，phpMyAdmin dump）
1. 备份旧库（`backup_before_import_20260824.sql`）
2. **collation 不兼容**：dump 是 MariaDB 11.8 的 `utf8mb4_uca1400_ai_ci`，本地 XAMPP 是 MariaDB 10.4 不认 → `sed` 替换为 `utf8mb4_unicode_ci`
3. **必须删库重建**：dump 的 CREATE TABLE 无 IF NOT EXISTS，直接导入撞「表已存在」
4. 导入 67 表成功 → 跑清洗清单

### ⚠️ 表结构变更：最低库存设置改为全局
线上 `stock_minimum_settings` **删掉了 `stock_system` 列**（原为分店独立设置，现 product_name 全局唯一，对齐线上 `getLowStockAlerts` 的按产品名 JOIN）。
后端适配：
- `StockMinimumSetting` 实体：删 stockSystem 字段
- `StockMinimumSettingRepository`：删 findByStockSystemOrderByProductNameAsc
- `StockMinimumMapper.java/.xml`：productsWithMinimum 去掉 stock_system 条件；upsert 只按 product_name
- `StockService`：listMinimum/saveMinimum/saveMinimumBatch 去 system（system 参数保留但忽略）
- `DashboardService`：低库存 = 全局设置 × 各系统库存（任一系统低于全局最低即预警）

### 验证
- 总库存 RM 79,597.94（线上 79,597.95，1 分舍入差）
- J1 96,567.85 / J2 19,154.55 / J3 18,816.45 —— 与线上一致
- Dashboard / 最低库存接口全部正常
- 低库存预警 1 项 = j2 HOT & SPICY（库存 0 < 全局最低 1，真实数据）

---

## 7. 一键同步脚本（下次直接用）

| 文件 | 用途 |
|---|---|
| `sync-live-data.bat` | 拖入线上 dump → 自动：备份 → 修复 collation → 停后端 → 重建库导入 → 清洗 → 验证 → 重启后端 |
| `sync_cleanup.sql` | 清洗 SQL（HTML 实体 / 最低库存合并去重 / gender），幂等可重复执行 |
| `DATA_SYNC_CHECKLIST.md` | 手动执行/排错参考（含第 0.5 步导入流程） |

### 实测
脚本完整跑通：备份 ✅ → fixed_dump ✅ → 67 表 ✅ → 清洗 ✅ → 后端重启 ✅ → 数字与线上一致 ✅

### 两个脚本坑（已修）
1. **bat 文件必须 CRLF 行尾**（LF 会乱解析）
2. **bat 里 `%` 字面量要写 `%%`**（如 LIKE `'%%&amp;%%'`），否则被当变量展开为空

---

## 附：常用信息速查

- **本地栈**：XAMPP MariaDB 10.4（root 无密码）/ Spring Boot 8081 / Vite 5174（React）/ 官网 5175
- **Maven**：`~/tools/apache-maven-3.9.9/bin/mvn.cmd`
- **demo 账号**：`demo@kunzz.local` / `demo123`（后端 DataInitializer 自动重建）
- **SMTP**：Gmail `kunzzsup@gmail.com`（旧系统应用密码，生产可换企业邮箱）
- **线上参考**：`https://www.kunzzgroup.com/backend/stocklistapi.php?action=summary&system=central`
- **数据库 67 张表**，库存表：`stockinout_data`(中央)、`j1/j2/j3stockedit_data`(分店)、`jXstockinout_data`(分店流水)、`stock_data`(台账)、`stock_minimum_settings`(最低库存，全局)

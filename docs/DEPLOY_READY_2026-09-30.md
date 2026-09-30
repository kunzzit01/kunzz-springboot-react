# 可推上 live 的修复清单 — 2026-09-30

> 本文件列出**已在本地验证通过、确认可以直接推送到生产（VPS live）**的修复。
> 本地 `main` 当前领先 `origin/main` **6 个提交**，全部属于本清单。
> **本次无数据库结构变更** —— 不需要跑 `add_new_tables.sql`。
> 部署需要：**重建后端 jar** + **重建后台前端**（本批次含一处前端改动）。

---

## 0. 待推送提交

| 提交 | 任务 ID | 内容 | 状态 |
|---|---|---|---|
| `e20a537` | 2026-09-30-phone-page-fixes | 手机版 PDF 对齐旧版 + 员工管理补回「编辑」（**前端**） | ✅ 已验证 |
| `8d20297` | 2026-09-30-dishware-stock-by-restaurant | 碗碟数量读对了表 | ✅ 已验证 |
| `b21bf58` | 2026-09-30-branch-remark-from-one | 分店自动编号从 1 起取最小未出现号 | ✅ 已验证 |
| `4f4f16b` | 2026-09-30-branch-list-remark-fields | 分店列表显示编号 + 编辑不再清号 | ✅ 已验证 |
| `9ac1f41` | 2026-09-30-branch-remark-own-sequence | **中间提交，已被 `b21bf58` 取代**（净效果为空，随批次一起推即可） | — |
| `5b6dc99` | —— | 本部署清单（纯文档） | — |

净效果 = **3 块修复**：① 进出货/货品备注（分店）② 碗碟数量 ③ 手机版 PDF + 员工管理编辑。

改动文件（全部）：
- `backend/src/main/java/com/kunzz/inventory/service/StockService.java`
- `backend/src/main/resources/mapper/StockInoutMapper.xml`
- `backend/src/main/java/com/kunzz/inventory/mapper/DishwareStockMapper.java`（新增）
- `backend/src/main/resources/mapper/DishwareStockMapper.xml`（新增）
- `backend/src/main/java/com/kunzz/inventory/service/DishwareService.java`
- `inventory-system/frontend/src/pages/Phone.tsx`
- `inventory-system/frontend/src/styles/phone.css`
- `CHANGELOG.md`、`docs/tasks/README.md`、`docs/tasks/2026-09-30-*.md`、本文件
- ⚠️ **不含** `backend/target/*.jar` 与 `backend/static/**`（构建产物，按 AGENTS.md §4 在部署时重建）

---

## 1. 修复一：进出货 / 货品备注（分店）

### 1.1 分店列表不显示备注编号 + 编辑分店记录把编号清掉（`4f4f16b`）

- **现象**：① 中央勾选生成的编码出货给分店后，分店进出货里**看不到货品编码**；② 在 J1 编辑带编码的记录后，编号**直接被清掉**。
- **根因（两者同一个）**：`StockInoutMapper.xml` 的 `listBranch` 查询**漏取** `remark_number` /
  `product_remark_checked` 两列 → 接口永远返回 `remarkNumber: null` → 前端显示 "-"/未勾选；
  且编辑草稿因此为空，保存时前端发 `null`/`false`，`updateBranch` 无条件覆盖 → 编号被清。
- **改动**：
  - `listBranch` 补上这两列
  - `StockService.updateInout` 分店分支加固：客户端**两个字段都未提供**时保留原值（取消勾选会显式传 `false`，仍可清空）
- **验证**：`GET /api/stock/inout?targetSystem=j1` 对 J1 行 27577 返回 `remarkNumber=SH-518, checked=true`；
  编辑不带备注字段 → 编号保留；显式传 false/空 → 能清。

### 1.2 分店自动编号从 1 起取「最小未出现号」（`b21bf58`）

- **现象**：J1 自己进货勾选「货品备注」自动生成时，编号接着中央/本店旧号往后排（实测 `SB-433`），
  不是"从新号码开始"。
- **根因**：分店台账 `jXstockedit_data` 里混着中央调拨继承来的号，以及修复前用"全表 MAX"生成的旧号，
  取号算法取全表 MAX → 被带偏。
- **改动**：`generateRemarkCode` —— 分店改为**从 1 起找第一个本店表里从未出现过的号**；
  **中央维持不变**（同前缀 MAX+1、避让在库）。移除中间版本不再需要的 `remarkCodePoolOwn`。
- **验证**：J1 `SALMON BELLY` → `SB-001`、再进 → `SB-002`；J1 `SALMON` → `SA-001`；
  中央 `SALMON BELLY` → `SB-455`（接自己 454，不变）。

---

## 2. 修复二：碗碟数量读错表（`8d20297`）

- **现象**：碗碟页数量几乎全 0（文化楼 0 / 中央 0 / J1 4 / J2 6 / J3 3，合计 13），实际应约 1 万件。
- **根因**：`DishwareService.listStocks` 读的是 `dishware_stock` —— 旧系统里就没在维护、实测几乎全 0 的聚合表；
  真实数量在 `dishware_stock_by_restaurant`（按店面）。
- **改动**：新增 `DishwareStockMapper.stockByRestaurant()`（by_restaurant 聚合）；
  `listStocks` 改为按**启用店面 order by display_order 的前 5 个**映射成 文华楼/中央/J1/J2/J3，
  total = 五桶之和（映射规则对齐旧版 live PHP）。
- **验证（与旧版 live PHP `dishware_api.php?action=stock` 全量逐行对比）**：
  - 五桶合计 `[585, 1701, 2520, 2451, 2901]` = 总 **10158**
  - 342 条货品 × 5 桶 + total，**0 条差异**
  - 抽查 item 249 → J1 70 / J2 46 / J3 50 / total 166

> ⚠️ **已知边界（本次有意未做）**：碗碟页「编辑弹窗」改那 5 个数量仍写 `dishware_stock`，
> 所以**编辑后页面数字不会变**（数据源已不看那张表）。需要时另开任务把编辑接到 by_restaurant。

---

## 3. 修复三：手机版 PDF + 员工管理（前端，`e20a537`）

- **① 下载PDF 字体小/发虚**：原来只是把屏幕表格截屏再拉伸到 A4 宽（≈ 6pt、位图发虚）。
  改为**照旧版 `phone_manage.js` 的算法复刻**：克隆表格重排版（勾选框画方框、时间转文本、
  橙表头 `#f99e00`、隔行 `rgb(255,230,183)`、正文 12px、0.3px 黑边）→ 离屏 **200mm** 容器
  → `html2canvas({scale:3})` → 纵向 A4 铺满页宽、超高按页切片；文件名 `手机管理_JX_YYYYMMDD.pdf`。
- **② 员工管理缺「编辑」**：`setEmpId` 只在「添加」时置 null，编辑模态框没人能打开（死代码）。
  表格「操作」列加回「编辑」按钮（预填 + `setEmpId`），保存走既有接口，后端不用改。
- **验证**：本地 vite dev 实测 PDF 与页面一致、字体够大清晰；员工每行「编辑/删除」、可预填保存。

---

## 4. 部署到 VPS（按 `docs/VPS_DEPLOY_2026-09-17-vps-deploy.md`）

```bash
# ① 备份（30 秒，别省）
cp /opt/inventory/app.jar /opt/inventory/app.jar.bak
sudo mysqldump --single-transaction u690174784_kunzz | gzip > /opt/backups/pre_update_$(date +%F_%H%M).sql.gz

# ② 拉代码（先确认没人在 VPS 上改过源码）
cd /opt/kunzz-springboot-react
git status --short        # 应为空
git pull --ff-only
git log --oneline -3      # 应看到 e20a537 在最上面

# ③ 本次改了 backend/** 与 inventory-system/frontend/** → 两样都要重建
cd backend
mvn -DskipTests clean package
sudo cp target/inventory-backend-1.0.0.jar /opt/inventory/app.jar
sudo chown kunzz:kunzz /opt/inventory/app.jar
sudo systemctl restart inventory-backend
sleep 10 && sudo systemctl is-active inventory-backend

# ④ 重建后台前端（手机版 PDF / 员工管理改动在这里）
cd /opt/kunzz-springboot-react/inventory-system/frontend
npm ci              # 仅当 package-lock.json 变过才需要
npm run build
sudo rsync -a --delete dist/ /var/www/admin/
sudo chown -R www-data:www-data /var/www/admin
# 前端不需要重启服务，刷新浏览器即可
```

> ✅ **无需跑任何 SQL**（本次无 `database/**` 与 `add_new_tables.sql` 改动）。
> ⚠️ 确认 `git diff --name-only` 里**没有** `database/**`，有的话才需要走数据更新流程。

### 部署后验证（1 分钟）

```bash
curl -s -o /dev/null -w "root=%{http_code}\n" http://127.0.0.1:8080/
curl -s -o /dev/null -w "api=%{http_code}\n"  http://127.0.0.1:8080/api/auth/me   # 期望 401
```
浏览器：
1. **碗碟页** → 五桶合计应 ≈ `[585,1701,2520,2451,2901]`（不再是 0）
2. **进出货 → 切到 J1** → 带编号的行应显示编号（如 `SH-518`）
3. **J1 新增一行进货、勾选货品备注、编号留空** → 生成 `前缀-001`（J1 自己的序列）
4. 编辑一条带编号的 J1 记录 → 编号**不被清掉**
5. **手机版**（`/phone?restaurant=j1`）→ 点「下载PDF」成品与页面一致、字体够大清晰；
   员工管理每行有「编辑」+「删除」，编辑可预填保存

---

## 5. 回滚

```bash
# 后端回滚（最快）
cp /opt/inventory/app.jar.bak /opt/inventory/app.jar
sudo systemctl restart inventory-backend
```
- 本次为**纯代码改动，不涉及数据**；数据库无需回滚。
- 源码回滚：`git revert e20a537 8d20297 b21bf58 4f4f16b`（或直接恢复到上一个正常提交）。
- 前端回滚：恢复上一版 dist 到 `/var/www/admin/`，或 `git checkout <上一个正常提交> -- inventory-system/frontend` 后重新 build。

---

## 6. 注意事项

- **不要**把 `backend/target/*.jar` 提交/上传 —— 在 VPS 上重建（AGENTS.md §4）。
- 本批次**不涉及** `CHANGELOG.md` 冲突风险之外的热点文件；`CHANGELOG.md` 已按"只追加"写入。
- 生产 `SPRING` 环境变量无需新增/修改。

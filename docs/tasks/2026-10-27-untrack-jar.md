# 任务 2026-10-27-untrack-jar

- 状态：已完成
- 背景（事故）：2026-10-27 上午把「创建时间排序（方案 B）」和「进出货全列搜索」改好并推到 git，
  但线上仍然跑旧逻辑。原因：`backend/target/inventory-backend-1.0.0.jar` 被 `.gitignore` 特意放行并纳入 git，
  而部署流程是「`git pull` → 把仓库里的 jar 拷到 `/opt/inventory/app.jar`」。
  于是 pull 下来的 jar 是旧的（`6df568b`，10:05 构建，只含年份兜底）：
  - `StockInoutMapper.xml` 里仍是 `ORDER BY date ASC, time ASC`（排序被回退）
  - 没有 `branchSearchHaystack`（全列搜索/备注编号搜索不生效）
- 根因：**构建产物入 git + 部署时直接消费该产物**，两者叠加，任何「只提源码不提 jar」的改动都会被静默回退。
- 方案（用户选定 = B）：
  1. `git rm --cached backend/target/inventory-backend-1.0.0.jar`（磁盘文件保留）；
  2. `.gitignore` 删掉例外 `!backend/target/*.jar`，`backend/target/` 全忽略；
  3. 部署固定为 **VPS 上就地构建**：`git pull` → `mvn -DskipTests package` → 校验产物 → 替换 → 重启
     （写进 `docs/OPS.md` 3.1 / 3.1.1）；
  4. `AGENTS.md` §4 热点表格里关于该 jar 的说明同步更新（原写“已被 .gitignore 特意放行”已不成立）。
- 说明：git 历史里仍留有历史 jar blob（体积不会自动变小）；如需彻底瘦身需重写历史，本次不做。

- 白名单（本次只改这些）：
  - .gitignore
  - backend/target/inventory-backend-1.0.0.jar（仅取消跟踪，不删磁盘文件）
  - AGENTS.md（仅 §4 热点表格那一行）
  - docs/OPS.md（3.1 / 新增 3.1.1）
  - docs/tasks/2026-10-27-untrack-jar.md
  - CHANGELOG.md（仅追加）
- 计划推送分支：main

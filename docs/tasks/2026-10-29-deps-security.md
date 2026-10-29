# 任务 2026-10-29-deps-security

- 状态：**待做**（未开始；本文件只登记范围与计划，不动任何依赖）
- 分支：main
- 目标：清掉 `npm audit` 报的 11 个漏洞（其中 5 个在**生产依赖**里，1 个 critical），
  且**不破坏**现有构建与功能。

---

## 1. 基线（2026-10-29 实测，升级前后都拿这个对比）

`cd inventory-system/frontend && npm audit --json`

```
总计: {"moderate":3, "high":7, "critical":1, "total":11}
```

| 包 | 严重度 | 直接依赖 | 当前版本 | 目标版本 | 说明 |
|---|---|---|---|---|---|
| `axios` | high | 是 | 1.19.0 | **1.21.0** | patch/minor，无破坏性 |
| `follow-redirects` | high | 否（axios） | 1.16.0 | **1.16.2** | 传递依赖 |
| `dompurify` | **critical** | 否（jspdf） | 3.4.13 | **3.4.17** | 传递依赖 |
| `react-router` / `react-router-dom` | moderate | 是（dom） | 6.30.4 | **6.30.6** | 仍是 6.x，**不需要**上 7 |
| `vite` | high | 是（dev） | 5.4.x | 8.3.5（**破坏性**） | 只影响构建工具，可缓 |
| `esbuild` | moderate | 否（vite） | - | 随 vite | 同上 |
| `puppeteer-core` | high | 是（dev） | 25.8.0 | 更大版本 | 仓库脚本用，非线上 |
| `chromium-bidi` / `zod` / `source-map-js` | high | 否 | - | 随 puppeteer | 传递依赖 |

> 结论：**Stage 1 全部是 patch/minor，一次 `npm audit fix --omit=dev` 就能清掉 5 个生产漏洞**
> （dry-run 实测只动 6 个包：axios 1.21.0、follow-redirects 1.16.2、dompurify 3.4.17、
> react-router(-dom) 6.30.6、@remix-run/router 1.23.4）。

---

## 2. 分阶段计划（每阶段单独提交、单独验收）

### Stage 1（低风险，先做）：生产依赖 patch/minor

```bash
cd inventory-system/frontend
git status --porcelain -- package.json package-lock.json    # 必须为空，否则别人正在改 → 等
npm audit fix --omit=dev
npm ls axios dompurify follow-redirects react-router react-router-dom   # 核对版本
rm -rf node_modules && npm ci && npm run build               # 干净安装 + 构建必须过
npm audit --omit=dev                                          # 期望 0 vulnerabilities
```

验收：`npm run build` 通过；回归清单（见 §4）全绿；前端发到 `/var/www/admin` 后线上点一遍。
提交：`chore(deps): 升级 axios/dompurify/follow-redirects/react-router 至安全版本（task 2026-10-29-deps-security）`

### Stage 2（可选，dev 构建链）：vite 5 → 8

- 影响面：`vite.config.ts`、`@vitejs/plugin-react`（要一起升）、`esbuild`；Node 版本要求提高。
- 属于**构建工具**，不进线上包（线上产物是 `dist/`），所以优先级低于 Stage 1。
- 验收同上 + 检查构建产物体积/顺序不变、`npm run dev` 能跑。

### Stage 3（可选，仓库脚本）：puppeteer-core 升级

- 先确认它在哪儿被用（`grep -rn "puppeteer" --include=*.mjs --include=*.js .` 及 `docs/`），
  升级后要把用到它的脚本跑一遍（截图/巡检类脚本）。
- 不进线上包，出问题不影响业务。

---

## 3. 硬性禁止

- ❌ `npm audit fix --force`（会把 vite 拉到 8、puppeteer 拉到新大版本，可能直接构建失败）
- ❌ 在别人正在改 `package.json` / `package-lock.json` 时动手（AGENTS §1.1：先 `git status --porcelain --` 检查）
- ❌ 一次提交里混入功能改动；一次只做一个 Stage
- ❌ 不跑 `npm ci && npm run build` 就提交 lock 文件

---

## 4. 回归清单（每个 Stage 都要过）

前端（本地 `npm run dev` 或部署后手点）：

- [ ] 登录（勾 / 不勾「记住我」）→ 进 `/dashboard`；关浏览器重开仍直接进
- [ ] 登出 → 回 `/login`，可换账号
- [ ] 进出货：搜索（全列模糊）、快速选择时段、保存一条记录
- [ ] 货品种类、库存台账、分店、供应商各开一次
- [ ] 员工管理 / 权限设定 / KPI / 价格对比（依赖 react-router 的路由参数）
- [ ] 发票 / PDF 导出（**jspdf + dompurify 这条链**，Stage 1 必测）
- [ ] 手机版 `/mobile/login` → `/mobile/out?system=j1`，退出登录
- [ ] 官网 `/home/` 不受影响
- [ ] F12 Console 无新报错；接口无新增 4xx/5xx

后端：本任务不涉及；`/api/**` 无改动。

---

## 5. 白名单（本任务只允许改这些）

- `inventory-system/frontend/package.json`
- `inventory-system/frontend/package-lock.json`
- `inventory-system/frontend/vite.config.ts`（仅 Stage 2）
- `inventory-system/frontend/tsconfig*.json`（仅 Stage 2 确实需要时）
- 必要的源码适配（仅 Stage 1/2 编译报错时，逐条说明原因）
- `docs/tasks/2026-10-29-deps-security.md`（本文件，记录实测结果）
- `CHANGELOG.md`（只追加）

明确不碰：`backend/**`、`database/**`、`website/**`、任何业务页面逻辑。

---

## 6. 部署与回滚

```bash
# 部署（只前端）
cd /opt/kunzz-springboot-react && git fetch origin main && git merge --ff-only origin/main
cd inventory-system/frontend && npm ci && npm run build
sudo rsync -a /var/www/admin/ /var/www/admin.bak/ && sudo rsync -a --delete dist/ /var/www/admin/
sudo chown -R www-data:www-data /var/www/admin
```

回滚：`git revert <依赖升级提交>` → 重新 `npm ci && npm run build` → rsync；
或直接 `sudo rsync -a /var/www/admin.bak/ /var/www/admin/`（前端产物立刻回到上一版）。

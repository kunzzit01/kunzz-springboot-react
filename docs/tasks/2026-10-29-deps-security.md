# 任务 2026-10-29-deps-security

- 状态：**Stage 1 / Stage 2 / Stage 3 均已完成**（2026-10-29）；只剩 react-router 6→7（两个 moderate，需单独任务）
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

## 1.1 Stage 1 实测结果（2026-10-29）

```bash
cd inventory-system/frontend
npm audit fix --omit=dev
```

| 包 | 升级前 | 升级后 |
|---|---|---|
| axios | 1.19.0 | **1.21.0** ✅ |
| follow-redirects | 1.16.0 | **1.16.2** ✅ |
| dompurify（jspdf 带） | 3.4.13 | **3.4.17** ✅ |
| react-router / react-router-dom | 6.30.4 | **6.30.6**（只修了一个 advisory） |

- `npm audit --omit=dev`：**5 → 2**（不是 0）。剩 2 个都是 `react-router` moderate：
  1. `GHSA-wrjc-x8rr-h8h6` `<Link>`/`useNavigate` 反斜杠 open redirect；
  2. `GHSA-337j-9hxr-rhxg` SSR hydration `deserializeErrors()` 注入。
  官方修复只能 `react-router-dom@7.18.5`（**破坏性大版本**），所以本阶段不动。
  本项目是纯 CSR（无 SSR hydration），且登录 `?redirect=` 已限定只允许站内 `/` 开头，
  实际不可利用 → **接受为已知风险**，真要清就单开一个 v7 迁移任务（不在本任务范围）。
- `package.json` **未改**（现有 `^1.7.9` / `^6.28.0` 已覆盖新版本），只有 `package-lock.json` 改 21 行。
- 验证：`npm ci && npm run build` 通过（vite 7.56s，2014 modules）；
  无头 Chrome 冒烟：`/login` 表单全在、`/dashboard`→`/login`、`/devices`→`/login`、`/`→`/login`、
  `/mobile/login` 正常渲染，**console/pageerror 0 条**。

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

> 实测：**期望值改为 2**（只刺 react-router，见 §1.1 —— 需 7.x 破坏性升级才能清）。

验收：`npm run build` 通过；回归清单（见 §4）全绿；前端发到 `/var/www/admin` 后线上点一遍。
提交：`chore(deps): 升级 axios/dompurify/follow-redirects/react-router 至安全版本（task 2026-10-29-deps-security）`

### Stage 2（可选，dev 构建链）：vite 5 → 7

> **实测决定：只升到 vite 7.3.7，不升 8。** 原因：
> - advisories 的受影响范围是 `vite <=6.4.3`，vite 7 已修复；升 8（Rolldown 引擎）风险不成比例。
> - vite 8 目前只配 `@vitejs/plugin-react@6`，而 plugin-react 6 还会拉 oxc/babel 相关 peer，改动面更大。
> - vite 7 仍是 Rollup 引擎，与 5 同构（同一套 `build.rollupOptions`）。

```bash
cd inventory-system/frontend
node -v                                   # 必须 v20.19+ 或 v22.12+（vite 7 engines）
npm install -D vite@^7.3.7 @vitejs/plugin-react@^5.2.0
npm ci && npm run build
```

**Stage 2 实测结果（2026-10-29）**

| 项 | 结果 |
|---|---|
| vite | 5.4.21 → **7.3.7** ✅ |
| @vitejs/plugin-react | 4.3.x → **5.2.0** ✅ |
| `npm audit` 全量 | 8 → **6**（vite / esbuild 两条已消失） |
| `npm audit --omit=dev` | 保持 **2**（只刺 react-router） |
| 构建 | ✅ 通过（≈8s，2014 modules） |
| dev server | ✅ `vite v7.3.7 ready`，`/login` 与 `/src/main.tsx` 均 200 |
| 构建产物冒烟（无头 Chrome） | ✅ 表单/toggles/路由守卫/手机登录页均正常，console 错误 0 |

**两个跟升需要记住的点**

1. **build.target 已显式钉回 `es2020`**（`vite.config.ts`）：vite 6+ 默认抬到
   `baseline-widely-available`（Chrome 107 / Safari 16），仓库使用者里有旧 iPhone / 旧 Windows 浏览器，
   不钉会出现升级后老设备白屏。
2. **VPS 的 Node 必须先确认**：`node -v` 低于 20.19（例如 Ubuntu 自带的 Node 18）会直接
   `npm run build` 报 `Unsupported engine`。升级方式（二选一）：
   ```bash
   # 方式 A：NodeSource
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs
   # 方式 B：nvm（不影响系统包）
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && . ~/.nvm/nvm.sh && nvm install 22
   node -v   # 重开 shell 后再确认
   ```

### Stage 3（已完成，2026-10-29）：puppeteer-core 升级

**实测结果**

| 项 | 结果 |
|---|---|
| puppeteer-core | 25.8.0 → **25.16.0** ✅ |
| chromium-bidi | 17.0.2 → **157.0.8090-0** ✅ |
| zod | 3.25.76 → **4.6.7** ✅ |
| source-map-js（vite→postcss 带） | 1.2.1 → **1.2.2**（`npm audit fix` 顺带清掉）✅ |
| `npm audit` | 6 → **3** → 再 `npm audit fix` 后 **2**（只剩 react-router） |
| `npm ci && npm run build` | ✅ 通过 |

**脚本回归（全部真实跑过）**

- `verify-stockrecords-weak-network.cjs` → **=== 全部通过 ===**（请求拦截/延迟/失败/乱序/取消全 PASS）
- `verify-inout-year-switch.cjs` → **=== 全部通过 ===**（选「今年」+ 反复切店 + 滚动，无 #185）
- `verify-remark-picker.cjs` → 5 项全 PASS，错误：无
- `sync-live-stock.cjs` **未跑**（会连 live 拉数据并写本地库，属数据同步工具，不在本任务验收范围）

**说明**：puppeteer-core 是 `devDependencies`，不进 `dist/`（`grep` 产物 0 命中），
不影响线上；`puppeteer-core`（非 `puppeteer`）不会下载 Chromium，用本机已装 Chrome。
若要重跑：`verify-inout-year-switch.cjs` 需要后端 8081 + demo 账号；
`verify-remark-picker.cjs` 打的是 8081 上由后端发的 `backend/static` 旧包。

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

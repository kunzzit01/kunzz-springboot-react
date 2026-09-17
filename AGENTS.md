# AGENTS.md — 多任务并行防撞规则

> 本文件是**强制规则**，适用于本仓库内所有 AI 任务（task）与会话。
> 场景：同一台机器上同时开着多个 task，各自改代码、各自往 `main` 推送。
> 目标：**任何一个 task 都不允许覆盖、回滚或"顺手带走"其它 task 的改动。**

分支只有 `main`，远程 `origin` = `https://github.com/kunzzit01/kunzz-springboot-react.git`。
没有 PR 流程，直推 main，所以下面每一条都是硬约束，不是建议。

---

## 0. 五条铁律

1. **只 stage 自己声明过的文件**，绝不 `git add -A` / `git add .` / `git commit -a`。
2. **只做快进推送**，绝不 `git push -f`。
3. **冲突涉及白名单外的文件 → 停下来报告**，不许用"以我为准"解决。
4. **一个文件同一时刻只属于一个 task**（这是根因：两个 task 写同一个文件，磁盘上就是后写的赢，git 管不了）。
5. **并行任务进行中，绝不运行 `Git更新.bat` / `git-update.ps1` / `update.ps1`**。

> ⛔ **第 5 条是硬禁止，原因见下方「并行期间的禁区」**：
> `git-update.ps1` 第 119 行执行 `git reset -q --hard origin/main`。
> 它会把整个工作区**回退到 origin/main**：别的 task 未提交的改动直接从磁盘消失，
> 本地已提交但还没推送的提交被丢弃（只剩 reflog 能捞）。它自带的 `.patch` 备份
> **排除了 `*.jar` 和 `*.sql`**，所以像 `add_new_tables.sql` 这类改动连备份都没有。
> 这个脚本是给「部署机双击更新」用的，开发机在跑并行 task 时绝对不要碰它。
> 要更新代码，用 `git fetch` + `git pull --rebase`。

---

## 1. 任务开始：先登记，再动手

新 task 的第一件事不是写代码，是登记写入范围。

1. 取任务 ID：`<日期>-<短名>`，例如 `2026-09-17-hifo-split`。
2. 在 `docs/tasks/<task-id>.md` 写下**白名单**（本 task 允许改的文件/目录），模板：

```markdown
# 任务 2026-09-17-hifo-split

- 状态：进行中
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/pages/StockInOut.tsx
  - inventory-system/frontend/src/components/HifoDialog.tsx
- 明确不碰：backend/**、CHANGELOG.md、其它页面
- 计划推送分支：main（或 task/2026-09-17-hifo-split）
```

3. 之后**只改白名单里的文件**。想改白名单外的文件 → 先停下，把它加进登记文件并说明原因，再改。

> 为什么必须登记：多个 task 共用同一个工作目录，磁盘上的文件是共享的。
> 没有白名单，你根本无法判断 `git status` 里那一堆改动里哪些是自己的。

### 1.1 整文件重写 = 最危险的覆盖（本仓库已真实发生过）

**2026-09-17 17:30 实际事故**：一个会话在做「货品种类」批量保存 + 快捷键，另一个会话在
**同一个** `StockProducts.tsx` 上做冰箱分类面板。后者**整文件重写**了这个文件，把前者的改动连同
快捷键一起覆盖掉了，部署包 17:31 重建后页面上的快捷键直接消失。而且那份改动当时**尚未提交**，
git 里没有任何记录，只能靠手工逐处重贴救回。

所以：

- **动手前先确认这个文件有没有人正在改**（此刻你自己还没动过它）：

  ```bash
  git status --porcelain -- <你要改的文件>
  ```

  没有输出 = 干净 = 可以上手。出现 ` M` / `M ` / `MM` = **已经有别的 task 在改它**，
  按铁律 4 它此刻不属于你：换做法（不去改它），或等对方提交后再动。
  **不要**因为"我的改动很小"就直接上手——上面那起事故里被覆盖的功能也是"很小"的改动。

- **禁止整文件重写不属于你的文件**。用整文件写入的方式覆盖一个文件，
  会把别的 task 在同一文件里的改动**静默抹掉**：没有冲突提示、没有备份、git 也帮不了你，
  因为文件内容是"合法"的，只是少了别人的改动。
  一律用最小范围的行级编辑，只碰你要改的那几行。

- **确实要大范围重写时**，先把当前文件整份复制到 `.zcode/backup-<任务ID>/` 再动手
  （本仓库已有先例：`.zcode/backup-batchsave/` 就是这么来的）。给自己留一条能取回的退路。

- 被覆盖的改动**如果从未提交过，git 里没有任何记录**，第 9 节的取证手段也救不回来。
  这就是为什么第 2 节要求**尽早提交固化**：提交过的改动才是可恢复的。

---

## 2. 提交：只提交自己的文件（最容易出事的一步）

多个 task 共用**同一个 git 索引（index）**。别人 `git add` 过的文件会躺在索引里，
你一个 `git commit`（不带路径）就会把**别人的文件**打包进你的提交——这就是覆盖的起点。

### 提交前的强制核对

```bash
git status --porcelain                 # 看全部改动
git diff --cached --name-only          # 看当前索引里到底有什么
```

> **本仓库特有：`git status` 会大量误报（已实测定性）。** 仓库位于 OneDrive 目录下，
> `backend/static/**` 等约 113 个文件是 OneDrive 的「仅在线」占位文件（ReparsePoint）——
> git 每次 stat 都对不上索引缓存，于是**永远报「已修改」，其实内容与 HEAD 逐字节相同**
> （用 `git hash-object` 与 `git rev-parse HEAD:<文件>` 比对可自证）。
> 判断真实改动要用 `git diff --name-only`：实测 `git status` 报 125 个，真实改动只有 12 个。
> 所以在这个仓库里 **`git add -A` 格外危险**——它会让 OneDrive 强行下载这一百多个占位文件，
> 并把索引搅乱。一律用显式路径提交。
> 根治：把仓库移出 OneDrive，或对该文件夹选「始终保留在此设备上」。

逐条核对索引里的每个路径：

- 属于我的白名单 → 保留。
- **不属于我** → 从索引里摘出来，**但绝不丢弃它的工作区改动**：

```bash
git restore --staged <别人的文件路径>    # 只取消暂存，文件内容原样留在磁盘上
```

- 工作区里别人未提交的改动 → **一律不动**。不要 `git add`、不要 revert、不要 stash。

### 提交命令模板（显式路径，一条一条列）

```bash
git add -- path/to/my/file1.tsx path/to/my/file2.tsx
git diff --cached --name-only          # 再确认一次：只有我的文件
git commit -m "fix(进出货): 一句话说明（task 2026-09-17-hifo-split）"
```

- 提交信息沿用本仓库现有风格：`<type>(<scope>): 中文描述`，`type` 用 `feat` / `fix` / `chore` / `refactor` / `docs`。
- 并行期间在信息末尾带上 `task <任务ID>`，出问题时能一眼定位是谁的提交。

---

## 3. 推送：只允许快进，被拒就整合，绝不强推

```bash
git fetch origin main

# 我的提交是不是直接长在 origin/main 上？（快进检查）
git merge-base --is-ancestor origin/main HEAD && echo "FF-OK" || echo "NEED-INTEGRATE"

# 我要推的这批提交，必须全部是我自己的
git log --oneline origin/main..HEAD
```

- `FF-OK` 且提交都是自己的 → 推送。
- `NEED-INTEGRATE` → 别人先推了。**先整合再推，不要强推**：

```bash
git pull --rebase origin main
```

- **rebase 冲突的处理原则**：
  - 冲突文件在**我的白名单内** → 我负责解决，保留双方意图。
  - 冲突文件在**白名单外**（说明两个 task 撞了同一个文件）→
    **`git rebase --abort`，停下来向用户报告**：哪个文件、哪两个 task、各自想改什么。
    不要在不知情的情况下选一边。

**绝对禁止**：`git push -f`、`git push --force`、对 `main` 的 `--force-with-lease`、
`git reset --hard`、`git clean -fd`、`git checkout -- .`、`git restore .`、`git stash`。
这些命令在共享目录里会直接抹掉别人的工作区改动，且不可恢复。

（例外：如果你走的是模式 A 的**自己的 `task/*` 分支**，允许
`git push --force-with-lease origin task/<任务ID>`。`main` 上永远不允许。）

---

## 4. 构建产物：本仓库最大的撞车点

以下文件**已纳入版本控制**，但是自动生成的，每次构建都会变，多个 task 同时提交必然互相回退：

| 热点文件 | 说明 |
|---|---|
| `backend/static/index.html` | 指向带 hash 的资源名，构建即变 |
| `backend/static/assets/index-<hash>.js/.css` | 文件名带 hash，新构建会**删旧文件加新文件** |
| `backend/static/home/assets/**` | 同上（官网页） |
| `backend/target/inventory-backend-1.0.0.jar` | 已被 `.gitignore` 特意放行，每次打包都变 |
| `inventory-system/frontend/package-lock.json` | 任何 `npm install` 都会改 |

规则：

1. **不是这个 task 的产物，就不要提交它。** 工作区里这些文件是脏的 → 留着，别 `git add`。
2. 只有当本 task 确实改了前端源码并重新构建时，才提交产物，且**必须最后一步做**：
   - 先 `git pull --rebase origin main` 拿到最新代码；
   - 再重新构建一次（用包含双方改动的最新源码）；
   - 再一次性提交产物，提交信息 `chore(static): 同步前端产物（task <任务ID>）`。
3. 删掉旧 hash 资源文件时，确认它确实已被新构建替代，不要手动 `git rm` 别的 task 刚加的文件。
4. **推荐做法**：并行期间由**一个** task（"发布 task"）统一负责构建与提交产物，其它 task 一律不碰
   `backend/static/**` 和 `backend/target/*.jar`。这条能消掉本仓库八成的撞车。

---

## 5. 共享单文件：CHANGELOG.md / README.md / docs/**

`CHANGELOG.md` 是 95KB 的单文件、所有人往**顶部**追加，是第二个高发冲突点。

- **只追加，不改老行**：不要重排、不要重编号、不要重排格式、不要把整段挪位置。
- Diff 越小越好。改一行就是一行。
- 今天已有 `## 🗓️ 2026-09-17` 标题时，**在已有的同日期小节里追加**，不要再建一个同日期的标题。
- 小节编号（`### 7.`）在多任务下必然撞号：追加时**不要给已有条目重新编号**；
  如果你要加的是新条目，用 `### [<任务ID>] 标题` 这种形式，避免抢号。
- 冲突解决：**两边都保留**（union），按日期/主题排好后提交。永远不要用一侧整篇覆盖另一侧。
  本仓库已开启加固（见 `.gitattributes`）：`CHANGELOG.md merge=union` ——
  rebase / merge 时两边新增的条目都会保留，不会再出现「日志整段被一侧覆盖」。**不要删掉这一行。**

- `docs/` 下新建报告类文件时，文件名带上任务 ID（如 `docs/DAILY_REPORT_2026-09-17-hifo.md`），
  避免两个 task 落在同一个文件名上互相覆盖。

---

## 6. 模式 A（推荐）：用 worktree 做物理隔离

一个工作目录跑多个 task，是撞车的根源。**给每个 task 一个独立目录 + 独立分支**，从结构上消除冲突：

```bash
# 主目录：保持 main，只用来拉取和整合
git worktree add ../wt-hifo -b task/2026-09-17-hifo-split origin/main

# 在 ../wt-hifo 里干活（ZCode 打开这个目录作为 workspace）
# ...改代码、提交...

# 推自己的分支，随便 rebase，不干扰 main
git fetch origin main && git rebase origin/main
git push -u origin task/2026-09-17-hifo-split

# 合并回 main：在 main 工作目录里做快进即可
git fetch origin && git merge --ff-only origin/task/2026-09-17-hifo-split

# 收工清理
git worktree remove ../wt-hifo
```

要点：

- **每个 worktree 有自己的索引**，`git add -A` 的危害面缩小到自己这个分支，但第 2 节的显式路径规则仍然照守。
- 同一个分支不能同时被两个 worktree 检出，所以**天然不会有两个 task 写同一份文件**。
- 构建产物各构建各的：合并回 main 前，在 main 上按第 4 节重新构建一次再提交产物。

---

## 7. 模式 B（当前默认）：共用目录时的操作顺序

如果还是同一个目录跑多个 task，把动作串成一条**不会互相踩**的流水线：

1. 动手前：`git status --porcelain` 记住当前有哪些别人的脏文件，**全程不要碰**。
2. 只改自己白名单内的文件。
3. 提交前：`git diff --cached --name-only` 核对，摘掉别人的文件（`git restore --staged`）。
4. 提交：显式路径 `git add -- <我的文件>`。
5. 推送前：`git fetch origin main` → 快进检查 → `git pull --rebase origin main`。
6. 推送：`git push origin main`。
7. 推送后立刻：`git log --oneline -3` 确认自己的提交在线，且**没有把别人的提交盖掉**。

**推送窗口串行化**：同一时刻只允许一个 task 执行第 5～6 步。
推送前后各 `git fetch` 一次，缩短窗口。

---

## 8. 提交前自检清单（每次都要过）

- [ ] 我改的每个文件都在本 task 的登记白名单里（`docs/tasks/<task-id>.md`）。
- [ ] `git diff --cached --name-only` 里**没有**别人的文件。
- [ ] 没有执行 `git add -A` / `git add .` / `git commit -a` / `git stash` / `git checkout -- .`。
- [ ] 构建产物只在收拾阶段提交，且是重新构建过的（不是别人的旧产物）。
- [ ] `CHANGELOG.md` 只追加、没有重排老行、没有改动别人的条目。
- [ ] `git fetch` 过，且 `git merge-base --is-ancestor origin/main HEAD` 为真。
- [ ] `git log --oneline origin/main..HEAD` 里全是我自己的提交。
- [ ] 没有用 `-f` / `--force`。

---

## 9. 已经覆盖了别人的代码，怎么救（先别急着再 push）

1. **停止推送**。再做一次强推只会覆盖得更彻底。
2. 先确认损失范围：

   ```bash
   git reflog --date=iso | head -40          # 本地丢失的提交还能找到
   git log --oneline --all --since="2 days ago"
   git fetch origin && git log --oneline origin/main -20
   ```

3. 别人的提交**只要推上过 origin 就还在**，直接取回单个文件：

   ```bash
   git checkout <好的提交SHA> -- <被覆盖的文件路径>
   git commit -m "fix: 恢复被并行任务覆盖的 <文件>（task <任务ID>）"
   ```

4. main 上修正历史用 **revert**，不要用 `reset + 强推`：

   ```bash
   git revert <覆盖了别人代码的那个提交>
   ```

5. 恢复完把事故写进 `CHANGELOG.md`，并回头补第 1 节的登记白名单，避免再发生。

---

## 10. 一页速查

| 场景 | 正确做法 | 禁止 |
|---|---|---|
| 暂存改动 | `git add -- <显式路径>` | `git add -A` / `git add .` |
| 提交 | `git commit -m "..."`（核对过索引） | `git commit -a` |
| 索引里有别人的文件 | `git restore --staged <路径>` | 直接 commit / 丢弃它的改动 |
| 推送被拒 | `git pull --rebase` 后重推 | `git push -f` |
| rebase 撞到白名单外的文件 | `git rebase --abort` + 报告用户 | 选一边覆盖 |
| 别人工作区有脏文件 | 原样留着 | revert / stash / checkout |
| 构建产物 | 发布 task 统一构建后提交 | 多 task 各提交各的产物 |
| CHANGELOG.md | 只追加、冲突两边都留 | 整篇覆盖 |
| 并行改造 | 模式 A：worktree + `task/*` 分支 | 同目录多 task 写同一文件 |

---

## 11. 内置的强制措施（hook）

上面的规则是「该怎么做」，下面是**会真的拦住你的东西**——不靠自觉。

### 11.1 启用（每台机器一次）

```bash
git config core.hooksPath .githooks
```

`.githooks/` 里的钩子随仓库分发，但 `core.hooksPath` 是本地配置，**每台机器/每个克隆都要执行一次**。
撤销：`git config --unset core.hooksPath`。跳过单次：命令前加 `KUNZZ_NO_GUARD=1`。

### 11.2 `pre-commit`：只让你提交自己白名单里的文件

- 有登记任务时：你声明的任务 ID 写在 `$(git rev-parse --git-dir)/CURRENT_TASK`（每个 worktree 独立），
  钩子读 `docs/tasks/<任务ID>.md` 的白名单。**暂存了白名单外的文件 → 直接拒绝提交**，
  并告诉你用 `git restore --staged <路径>`（只取消暂存，内容不丢）。
- 没有登记任务时：不阻塞，只在「暂存超过 15 个文件」或「命中构建产物」时提醒一次。
- 声明当前任务：

  ```bash
  echo "2026-09-17-hifo-split" > "$(git rev-parse --git-dir)/CURRENT_TASK"
  ```

### 11.3 `pre-push`：不许强推 / 非快进推送 main

推送前检查 `remote_sha` 是不是 `local_sha` 的祖先。不是 → **拒绝推送**，并打印
"别人先推了什么、你该 `git pull --rebase`"的完整指引。删除 main 也被拒绝。
自己的 `task/*` 分支不受限制（允许 rebase 后强推自己的分支）。

### 11.4 注意

- 钩子脚本必须保持 **LF 换行**，`.gitattributes` 已固定（`.githooks/* text eol=lf`）。
  若钩子报 `cannot run`，先查是不是被编辑器改成了 CRLF。
- **不要用 `--no-verify` 绕过**。被拦住说明你正要做规则里禁止的事，去看提示。
  确实需要绕过时用 `KUNZZ_NO_GUARD=1`，它会在输出里留一行记录。
- **`CURRENT_TASK` 会残留**：上一个任务留下的值不会自动清掉。所以**每个 task 开工第一件事
  就是用 echo 覆盖它**（见 11.2）。若你突然被拦住、提示里的任务名却不是自己，
  那就是读到了上一个任务的登记文件——覆盖它即可。
  收工时清掉：`rm -f "$(git rev-parse --git-dir)/CURRENT_TASK"`

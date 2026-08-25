# 工作日志 2026-08-25（问卷可重填 / 进出货快捷键+撤销 / 下拉选单裁剪修复）

> 本文档记录 2026-08-25 当天对库存系统做的全部改动，含需求、根因、改法、验证结果。
> 供以后回溯使用（尤其是「为什么这样设计」和「部署时要重启什么」）。

---

## 1. 问卷（/qna）提交后刷新可重新填写

**需求**：提交问卷 → 生成 PDF → 刷新页面后应能再次填写（修改/重填）。

### 根因
两层限制导致刷新后卡死在只读查看模式：
1. **后端** `QnaService.create()` 规定「每个用户只能提交一次」，重复提交直接抛异常
2. **前端** 页面加载时调 `getMyQna()`，只要查到已提交记录就置为**查看模式**（只读），没有回到编辑的入口

### 改动
| 文件 | 内容 |
|---|---|
| `backend/.../service/QnaService.java` | `create()` 从「拒绝重复提交」改为 **upsert**：已存在记录则原地更新 10 个问题字段（保留原 id，`updated_at` 由 DB ON UPDATE 自动刷新），无则新建。数据库仍保持每用户一条（`unique_user_response` 唯一键不变） |
| `frontend/src/pages/Qna.tsx` | 新增 `viewMode` 状态（原 `submitted` 语义改为「仅本次会话提交成功后进入查看模式」）；`load()` 刷新页面时**始终预填已有答案并回到可编辑状态**；提交成功后进入查看模式（方便立即点「生成PDF」）；查看模式新增 **「重新填写」** 按钮一键回到编辑 |

### 验证
- 用 demo 账号连续提交两次：第二次返回**同一个 id** 且内容被覆盖更新（不再报「只能提交一次」）✅
- `/api/qna/mine` 返回最新内容 ✅

---

## 2. 进出货页面：快捷键 + 删除撤销（Undo 货品）

**需求**：对齐老系统 `stockeditall.php/js` 的「快键功能」和「undo 货品」——本地此前只有软删除 + 回收站手动恢复。

### 老系统参考（kunzzgroup-main/backend/js/stockeditall.js）
- 全局快捷键区（Capture 模式）：`Ctrl+Shift+Z` 撤销删除、`Ctrl+D` 批量删除、`Ctrl+Shift+A` 新增记录弹窗、`Ctrl+A` 快速加行、`Ctrl+S` 保存
- 删除后底部弹出撤销条（`#undoBar`，10 秒自动消失），`action:'restore'` 恢复记录
- 恢复逻辑：清空 `deleted_at/deleted_by`，**中央↔分店双向联动**（中央出货→分店入库的记录，撤销时同步恢复分店的 `jXstockinout_data` / `jXstockedit_data`）

### 后端改动
| 文件 | 内容 |
|---|---|
| `backend/.../mapper/StockInoutMapper.java` + `.xml` | 新增 3 条恢复 SQL（与软删除镜像对称）：`restoreBranch`（分店 edit 行）、`restoreBranchInoutByMainId`（分店流水）、`restoreBranchEditByMainId`（分店 edit 按 main_record_id） |
| `backend/.../service/StockService.java` | 新增 `restoreInout(List<Integer> ids, String system)`：批量恢复 + 双向联动（镜像 `deleteInout`） |
| `backend/.../controller/StockController.java` | 新增 `PUT /api/stock/inout/restore`（body: `{ids, system}`），完成后广播实时刷新 |
| `backend/.../dto/RestoreInoutRequest.java`（新建） | `{ List<Integer> ids, String system }` |
| `backend/.../service/StockEnhanceService.java` | 回收站 `restore(id)` 升级为**双向联动**（此前只恢复中央主记录，分店联动行会残留已删状态） |

### 前端改动
| 文件 | 内容 |
|---|---|
| `frontend/src/api/index.ts` | 新增 `restoreStockInout(ids, system)` |
| `frontend/src/pages/StockInout.tsx` | ① **撤销条**：删除（单个/批量）后底部弹出「已删除 N 条记录 [撤销 (Ctrl+Shift+Z)]」，10 秒自动消失，点击/快捷键调 restore 接口并刷新；② **快捷键**：Ctrl+S 保存（编辑行/批量）、Ctrl+Shift+Z 撤销、Ctrl+D 批量删除（开启→确认）、Ctrl+A 快速加行、Ctrl+Shift+A 新增记录弹窗——弹窗/日历内不抢快捷键（对齐 `isShortcutBlockedInput`）；③ `appendNewRow()` |
| `frontend/src/styles/stockinout.css` | `.sio-undo-bar` 撤销条样式（底部居中浮出动画） |

### 快捷键速查
| 快捷键 | 功能 |
|---|---|
| `Ctrl+S` | 保存：编辑中保存当前行；有待保存新增行则批量保存 |
| `Ctrl+Shift+Z` | 撤销删除 |
| `Ctrl+D` | 批量删除：未开启→进入批量模式；已开启→确认删除 |
| `Ctrl+A` | 快速追加一行（表格内不抢焦点，弹窗/输入框外才生效） |
| `Ctrl+Shift+A` | 打开「新增记录」弹窗 |

### 验证
- 创建测试记录 → 软删除 → 批量恢复接口 → `deleted_at`/`deleted_by` 均清空 ✅（测试数据已清理）
- 新 bundle 含 `sio-undo-bar`、`Ctrl+Shift+Z` 等 ✅

---

## 3. 进出货新增行下拉选单被裁剪（掉下去看不到）

**症状**：新增记录在最后一排时，打开货品/编号/收货人的下拉选单会「掉下去」，要滑动滚动条才能看到选项。

### 根因
Combobox 下拉用 `position: absolute`（相对输入框），而表格外层 `.table-scroll-container` 是 `overflow-y: auto` 的滚动容器——**下拉框超出容器可视区域即被裁剪**。最后一行在最底部时，向下弹出的选单直接掉出可视区。

### 老系统做法（已实锤）
`stockeditall.js` 的 `.combobox-dropdown` 用 `position: fixed` + `calculateDropdownPosition()`：
- 基于 `getBoundingClientRect()` 计算坐标
- **底部空间不足（输入框 bottom > 视口 70%）或会超出视口时向上展开**
- 注释原文：*「position: fixed; /* 改为 fixed 定位，避免被表格限制 */」*
- 本地 raw-price 悬浮提示也是同款思路（fixed 定位到 body 防裁剪）

### 改动（`frontend/src/pages/StockInout.tsx` Combobox 组件重写）
| 点 | 内容 |
|---|---|
| **portal 渲染** | 下拉菜单用 `createPortal` 渲染到 `document.body` + `position: fixed`，彻底摆脱滚动容器裁剪 |
| **向上翻转** | 输入框下方空间不足（约 220px）时，选单改为在**上方**展开 |
| **宽度自适应** | canvas 测量最长选项宽度（min 输入框宽 / max 400px），长货品名不再截断 |
| **滚动即关闭** | 选单打开期间滚动表格/窗口自动关闭（fixed 定位与输入框会脱节，避免错位残留） |
| **点击外部关闭** | 输入框包裹层或 portal 选单内点击不误关，其余关闭 |

### 验证
- 新 bundle 含 `createPortal`、`getBoundingClientRect` 定位逻辑 ✅
- 其他弹出层核查：日历弹窗已是 `position: fixed`；原生 `<select>`（规格/类型/价格）由浏览器原生层渲染不会被 overflow 裁剪——均无需改

### ⚠️ 二次修正（用户反馈：选单被鼠标滚动误关 + 向上展开对不齐）

**反馈**：① 打开选单后鼠标一滚/滑动就消失；② 比之前的选单差，向上展开时选单没有对齐输入框位置。

**根因**：
1. 上一版「滚动即关闭」用 `window.addEventListener('scroll', ..., true)` 捕获阶段监听——**选单自身滚动列表时也会触发**，鼠标滚轮一滑就关闭
2. 向上翻转用**估算高度 220px** 定位（`top = r.top - 220 - 4`），实际渲染高度更短时选单底部与输入框之间出现**缝隙**，看起来没对齐

**改法**：
| 点 | 内容 |
|---|---|
| 滚动不关闭 | 去掉关闭逻辑，改为滚动时**跟随输入框重新定位**（`computePos` 重算）——选单永不因滚动消失，且始终贴住输入框 |
| 向上对齐 | 向上展开改用 **`bottom` 定位**（`bottom = 视口高 - 输入框顶 + 4`）——选单底部天然贴住输入框顶部，按实际高度自然贴合，**无估算缝隙**；向上时按可用空间限高（`maxHeight = min(200, 可用上方空间)`）避免超出视口顶 |
| 宽度对齐 | 宽度改回**与输入框一致**（去掉内容自适应 400px），左缘完全对齐，视觉与最初的 absolute 版一致 |
| 点击外部关闭 | 保留（输入框包裹层 / portal 选单内点击不误关） |

**验证**：新 bundle（`index-Db73SimG.js`）已部署，`createPortal`/`maxH` 逻辑在；向下展开 `top = 输入框底+2`，向上展开 `bottom` 定位，均与输入框零缝隙对齐 ✅

---

## 4. 货品下拉只显示前 30 个（比 live 少）

**症状**：进出货页面新增记录时，货品下拉展示的货品比 live 老系统**少很多**。

### 根因（数据源对比）
| 项 | 老系统 | 本地 |
|---|---|---|
| 数据源 | `stockeditapi.php action=products_list`：`stock_data` DISTINCT product_name，带 `approver 已批准` 过滤 | `/stock/options/products`：`stock_data` DISTINCT product_name（无 approver 过滤，更宽） |
| 前端展示 | 全部匹配项（滚动列表） | Combobox 里 **`.slice(0, 30)` 只渲染前 30 个** |

数据核对：本地 `stock_data` 共 **484** 个 DISTINCT 货品（全部已批准），`stockinout_data` 实际进出过 451 个——**数据本身不少，是老系统同款数据源**。少的纯粹是前端 `.slice(0, 30)` 截断。

### 改动
| 文件 | 内容 |
|---|---|
| `frontend/src/pages/StockInout.tsx` | Combobox `filtered` 去掉 `.slice(0, 30)`，展示全部匹配项（下拉滚动，对齐老系统） |
| `frontend/src/pages/StockSot.tsx` | 货品异常页同款 Combobox 同样去掉截断（同一坑） |

### 验证
- 新 bundle 中 `slice(0,30)` 数量 = 0 ✅；`/stock/options/products` 返回 484 个货品 ✅
- 若以后仍觉比 live 少：那是 dump 导出后 live 新增货品没同步（静态 dump 天然缺陷，见 LIVE_OPS.md），与代码无关

---

## 5. 货品下拉补齐供应商标签 + 容器宽度（对齐 live）

**症状**：① 货品下拉只显示裸货品名，live 会在旁边备注供应商；② 下拉容器比 live 小，长货品名被换行（wrap）。

### 老系统实锤
`stockeditall.js generateComboboxOptions`：
- **货品**：`NAME (SUPPLIER)`，无供应商回退 `NAME (CODE)`
- **编号**：`CODE (NAME)`
- 容器 `min-width: 200px / max-width: 400px` 内容自适应，选项**不换行**

### 改动
| 文件 | 内容 |
|---|---|
| `frontend/src/pages/StockInout.tsx` | ① Combobox 选项支持 `{ label, value }`（归一化：字符串原样，对象取 label/value）；**过滤按 value（真实值）**，渲染 label；② 货品选项 = `NAME (SUPPLIER)`（无供应商回退 `NAME (CODE)`），编号选项 = `CODE (NAME)`；③ 宽度改回**内容自适应**（canvas 测量最长 label，min 输入框宽≥200 / max 400）；④ 选项 `whiteSpace: nowrap` + 超长 ellipsis，不换行；⑤ 货品统计弹窗 datalist 改用 `o.value` |
| `frontend/src/pages/StockSot.tsx` | 同款改造（货品异常页 Combobox：label/value + 供应商标签 + nowrap，key 用 value+label 防重复） |

### 要点
- 下拉显示 label（带供应商），**选中存的是 value（纯货品名）**——`onPickProduct` 按 product_name 匹配、自动补编号/供应商逻辑不受影响
- 选中后输入框仍显示纯货品名（对齐旧系统 value 语义）

### 验证
- 新 bundle（`index-Bo5NszpZ.js`）已部署，`whiteSpace:"nowrap"` 逻辑在 ✅
- 构建通过（TS 无错）✅

### 跟进：选单字体加大（视力友好）
- 下拉选项字号 **13 → 15px**、内边距 `6px 10px → 8px 12px`（点击区域更大），「无匹配」12 → 14px——两个页面（进出货 / 货品异常）同步
- 宽度测量字体同步改为 15px（否则容器会偏窄、过早出现省略号）
- 新 bundle（`index-DeR659Or.js`）已部署 ✅

---

## 6. 中央进货：输入数量即锁死收货单位

**需求**：用户在中央页面进货（非出货）时，一输入进货数量，收货单位就锁死为「中央」。

### 老系统实锤
`stockeditall.js handleNewRowOutQuantityChange`：outQty=0（含进货行）→ target select **禁用且强制 value='central'**；只有 outQty>0 才可编辑（required）。add-form 同理（`central页面 + 进货：收货单位默认为 central`）。

### 本地原 bug
```jsx
// 原条件：进货时 onChange 已把 target 自动设为 'central'，导致 !nr.target=false → 反而可编辑 ✗
disabled={parseFloat(nr.outQty) <= 0 && !nr.target}
```

### 改动（`frontend/src/pages/StockInout.tsx`）
| 点 | 内容 |
|---|---|
| 选单禁用条件 | `disabled={parseFloat(nr.outQty) <= 0}`——进货行 / 无出货数量行一律禁用（对齐旧系统） |
| 出货数量变化 | `handleOutQty` 同步强制：outQty<=0（含清空）时 `target='central'`；outQty>0 保留已选目标（可编辑） |
| 进货数量变化 | 已有逻辑不变：inQty>0 → `target='central'`（配合禁用即锁死） |

### 行为表（中央页面新增行）
| 状态 | 收货单位选单 |
|---|---|
| 空行（未输数量） | 禁用，显示「请选择」 |
| 输入进货数量 | **禁用，锁死显示「中央」** ✓ |
| 输入出货数量 | 可编辑（选 J1/J2/J3/中央） |
| 出货数量清空 | 恢复禁用 + 强制回「中央」 |

### 验证
- 构建通过；新 bundle（`index-DDJDih7k.js`）已部署 ✅

---

## 7. 快速选择（时段）下拉统一为 KPI/Cost 设计

**需求**：进出货页「快速选择 / 时段」下拉的展开设计与 KPI（/kpi）等其他页面不统一，要求对齐。

### 基准确认
KPI 与 Cost 两页的下拉设计**完全一致**（`kpi.css` / `cost.css`）：
- `.btn-secondary`：橙色 `#f99e00`（hover `#f98500`）
- `.dropdown-menu`：`left:0; width:100%; border:2px solid #000; border-radius:8px; box-shadow:0 4px 12px rgba(88,62,4,.15); z-index:1000`
- `.dropdown-item`：`background:transparent; font-weight:600; font-size:clamp(8px,0.74vw,14px)`；hover `rgba(88,62,4,.1)`；首/末项圆角

### 本地原差异（`stockinout.css`）
| 项 | 原（不一致） | 改后（统一） |
|---|---|---|
| `.btn-secondary` | 灰色 `#6b7280` | 橙色 `#f99e00` |
| `.dropdown-menu` | `right:0; min-width:120px; 1px #e5e7eb 细边` | `left:0; width:100%; 2px 黑边; KPI 阴影/圆角` |
| `.dropdown-item` | `13px; 无权重; #fff 底; #f8f5eb hover` | `clamp 字号; 600 权重; 透明底; rgba(88,62,4,.1) hover; 首末圆角` |
| `.dropdown-toggle` | （无规则） | `display:flex; gap:8px`（按钮撑满列宽，菜单=按钮宽度） |

### 注意
- 该页 `.btn-secondary` 同时用于「货品统计」「批量删除切换」「各弹窗取消」——一并变为橙色，与 KPI/Cost 全站标准一致
- 视图/系统选择器用的是 `.selector-dropdown .dropdown-item`，不受影响

### 验证
- 新 CSS bundle（`index-U90ZVELc.css`）已部署：`btn-secondary{background-color:#f99e00`、2px 黑边菜单均在 ✅

---

## 8. 进出货数量被截断（147.000 显示成 147.0…）

**症状**：中央进出货 RAMEN EGG 一行出货 147.000，屏幕只显示「147.0…」。

### 根因（已实锤）
- 数据本身没问题：DB `decimal(10,3)` 存的就是 `147.000`，API 返回 `147.0`，前端 `fmtNum` 会 `toFixed(3)` → `147.000`
- 问题在**列宽**：`.stock-table td span` 有 `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`，而出货列宽只有 **4.5%（约 54px）**，扣除 span 左右 padding（12px）+ 边框后内容区仅 ~40px——`147.000`（7 字符 ≈ 51px）放不下 → 被省略号截成 `147.0…`

### 改动（`frontend/src/styles/stockinout.css` 列宽再平衡）
| 列 | 原 | 改 | 说明 |
|---|---|---|---|
| 进货 (4) | 4.5% | **6.5%** | 容纳 147.000 / 1470.000 不截断 |
| 出货 (5) | 4.5% | **6.5%** | 同上 |
| 收货单位 (6) | 5.4% | 5.0% | 微调补偿 |
| 货品备注 (11) | 4.5% | 4.0% | 微调补偿 |
| 备注编号 (12) | 5.4% | 4.9% | 微调补偿 |
| 操作 (16) | 6.3% | 5.9% | 微调补偿 |

另外 th 内联 `minWidth:80` 与 6.5% 叠加，小屏也保证 ≥80px。

### 验证
- 新 CSS bundle（`index-qoIggjHb.css`）已部署，`width:6.5%` 在 ✅

---

## 9. 搜索框宽度改为响应式（随屏幕缩放）

**症状**：进出货页搜索框展开宽度是固定像素，不随屏幕大小变化。

### 根因
```css
/* 展开固定 260px；头部覆盖又固定 250px——两种屏幕下一样宽 */
.smartSearchWrapper.expanded { width: 260px; ... }
.header-search .smartSearchWrapper.expanded { width: 250px; }
```

### 改动（`frontend/src/styles/stockinout.css`）
| 点 | 内容 |
|---|---|
| 展开宽度 | 固定 `260px` → **`clamp(200px, 22vw, 420px)`**（随视口宽度缩放） |
| 重复覆盖 | 删除 `.header-search .smartSearchWrapper.expanded { width:250px }`（与基础规则合并，单一来源） |
| 折叠态 | 保持 40px 图标按钮不动（本来就该固定） |

### 效果
| 屏幕宽 | 展开搜索框宽 |
|---|---|
| 1024px | ≈225px |
| 1366px | ≈300px（原 250px） |
| 1920px | ≈420px |

（`.unified-header-row` 本身有 `flex-wrap: wrap`，窄屏自动换行不会挤爆）

### ⚠️ 回归修复（第一次改完搜索反而不会展开）

**症状**：第一次只改宽度后，搜索框**完全不展开**（点图标没反应，一直 40px）。

**根因（CSS 特异性冲突）**：
```css
/* 基础展开规则：3 个类 */
.smartSearchWrapper.expanded { width: clamp(...) }            /* 特异性 (0,3,0) */
/* 头部折叠规则：同样 3 个类，但位置更靠后 → 永远赢 */
.header-search .smartSearchWrapper { width: 40px }            /* 特异性 (0,3,0) */
```
删掉原来的 `.header-search .smartSearchWrapper.expanded { width:250px }`（4 个类、能压住）之后，40px 规则反超，展开失效。

**修复**：头部折叠规则改用 `:not(.expanded)`——只在折叠时生效，展开时让位给基础 clamp 规则：
```css
.header-search .smartSearchWrapper:not(.expanded) { width: 40px; ... }
```

**验证**：新 CSS bundle（`index-Dhzx4Yfd.css`）已部署：`header-search .smartSearchWrapper:not(.expanded){width:40px` + `smartSearchWrapper.expanded{width:clamp(200px,22vw,420px)` 都在 ✅

### 二次修正：搜索框与「新增记录」按钮同比缩放
- **反馈**：屏幕放大后「新增记录」按钮不涨，搜索框却涨到 420px——比例失调
- **根因**：按钮字号 `clamp(8px,0.74vw,14px)` 到 ~1900px 就封顶（约 1.4 倍增长），搜索框 `22vw` 却线性涨到 420px（2.3 倍）
- **改法**：搜索展开宽度 `clamp(200px, 22vw, 420px)` → **`clamp(200px, 15vw, 350px)`**——15vw 在 1334→1920px 区间恰好给出与按钮相同的 ~1.4 倍增长，最高 350px 不再突兀
- 新 bundle（`index-uWC6YUes.css`）已部署 ✅

### 二次修正：封顶点对齐按钮（1900px 同时停止缩放）
- **反馈**：按钮受屏幕大小影响，但搜索框封顶点比按钮晚，大屏上按钮停了搜索还在变
- **根因**：按钮字号 `clamp(8px,0.74vw,14px)` 在 ~1900px 封顶；搜索 `15vw/350px` 要到 2334px 才封顶
- **改法**：搜索展开宽度 → **`clamp(200px, 15vw, 285px)`**——15vw 恰好 ~1900px 时 = 285px 封顶，与按钮字号**同一视口宽度同时封顶**，全程同速率（1334→1900px 区间两者都是 ~1.42 倍）
- 新 bundle（`index-BLxpGZO6.css`）已部署 ✅

### 三次修正：浏览器缩放（150%）与 100% 一致
- **反馈**：150% 缩放下搜索框变大，要求与 100% 一样
- **根因**：搜索框宽度 `clamp(200px,15vw,285px)` 和字号 `clamp(11px,0.74vw,14px)` 的 **px 下限在浏览器缩放时失效**——浏览器缩放会把 CSS 视口缩小（1920 屏 150% = 1280 视口），vw 部分自动补偿，但 px 下限（200px/11px）把补偿卡死 → 物理尺寸变大；而按钮 `clamp(8px,0.74vw,14px)` 的 vw 部分在常见缩放区间主导，所以按钮 150%/100% 看起来一样
- **改法**（`frontend/src/styles/stockinout.css`）：
  - 展开宽度：`clamp(200px,15vw,285px)` → **`max(150px, 15vw)`**（vw 主导，缩放自补偿）
  - 输入字号：`clamp(11px,0.74vw,14px)` → **`clamp(8px,0.74vw,14px)`**（与按钮同款下限，缩放行为一致）
- **坑**：各页面 CSS（stockinout/products/sot/dishware/stocklist）各有自己的 `.smartSearch-input` 规则（按页面根类隔离），只改进出货页的 `.sio-root` 版；构建曾出旧产物（vite 缓存），需 `rm -rf node_modules/.vite dist` 后重建才生效
- 新 bundle（`index-B52dVUVv.css`）已部署，`.sio-root .smartSearch-input{...clamp(8px,.74vw,14px)` + `.sio-root .smartSearchWrapper.expanded{width:max(150px,15vw)` 均在 ✅

---

## 10. 新增行：选择编号后货品不自动更换

**症状**：新增记录时先选了货品，再在「货品编号」下拉换其他编号，货品名不会跟着变。

### 根因
新增行编号 Combobox 只有 `onChange`（存编号），没有 `onSelect` 回填逻辑；老系统 `handleCodeNumberChange` 会调 `product_by_code` 自动回填货品名/规格/类型/供应商。

### 改动（`frontend/src/pages/StockInout.tsx`）
| 点 | 内容 |
|---|---|
| `onPickCode(key, code)`（新增） | 按 `product_code` 在 `getProducts()` 中匹配 → 回填 **productName / codeNumber / 规格 / 类型 / 供应商 / 备注前缀**，并按出库数量加载价格+库存（与 `onPickProduct` 同款）；进货时自动填入该货品供应商并锁死（对齐 `updateSupplierIfNeeded`） |
| 新增行编号 Combobox | 加 `onSelect={(v) => onPickCode(nr.key, v)}` |
| `onEditPickCode(code)`（新增） | 编辑模式同款：换编号 → 回填编辑草稿的货品名/规格/类型（对齐旧系统编辑态） |
| 编辑行编号 Combobox | 加 `onSelect={(v) => onEditPickCode(v)}` |

### 验证
- 构建通过；新 bundle（`index-2Tjzib_K.js`）已部署，`product_code ... toUpperCase` 匹配逻辑出现 2 次（新增+编辑）✅

---

## 附：部署与速查（本次用到）

### 前端部署流程（React 后台）
1. `cd inventory-system/frontend && npm run build`（产物 `dist/`）
2. `cp -rf dist/* backend/static/`（保留 `home/` 官网、`images/`、`tokyo/`）
3. 清理 `backend/static/assets/` 下**已不被 index.html 引用**的旧哈希 JS/CSS
4. **静态资源走文件系统，后端无需重启**（WebConfig 的 PathResourceResolver 每次请求读盘）
5. ⚠️ 教训：`index.html` 引用的 CSS/JS 哈希要逐一确认存在，本次曾误删同名 CSS（两次构建 CSS 哈希恰好相同）导致样式 404

### 后端重建/重启
```bash
# 停后端（jar 被占用，必须先停才能 repackage）
taskkill //PID <pid> //F
# 构建（-DskipTests）
export JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-21.0.12.8-hotspot"
<Maven>/bin/mvn.cmd -q -DskipTests package
# 启动（与 start.ps1 一致：WorkingDirectory=backend/，静态目录解析自 cwd）
java -Duser.timezone=GMT+8 -jar backend/target/inventory-backend-1.0.0.jar
```

### 本机工具链
- **JDK**：`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot`（`runtime/jre21` 只是 JRE，**没有 javac**，不能编译）
- **Maven**：`C:\Users\kunzz\.m2\wrapper\dists\apache-maven-3.9.16\<hash>\bin\mvn.cmd`（Maven Wrapper 下载的完整发行版；本机另有 `~/tools/apache-maven-3.9.9/bin/mvn.cmd` 同样可用，旧日志记的就是它）
- **后端运行**：`runtime/jre21/bin/java.exe -jar backend/target/inventory-backend-1.0.0.jar`（start.ps1 同款）
- **数据库**：XAMPP MariaDB `u690174784_kunzz`（127.0.0.1:3306，root 无密码）
- **demo 账号**：`demo` / `demo123`

### 涉及的核心表
| 表 | 说明 |
|---|---|
| `qna_responses` | 问卷回答，`user_id` 唯一键（每人一条，重复提交覆盖） |
| `stockinout_data` | 中央进出货（软删除 `deleted_at/deleted_by`） |
| `j1/j2/j3stockedit_data` | 分店进出货（`main_record_id` 关联中央） |
| `j1/j2/j3stockinout_data` | 分店流水（中央出货生成，`main_record_id` 关联） |

---

## 11. 手动输入价格后不显示，反而显示「请选择价格」

**症状**：出货新增行/编辑行，选「手动输入价格」→ 输入数字后，界面切回下拉且显示「请选择价格」，手输的价格不展示。

### 根因
下拉/输入框的切换条件是 `price !== 'manual'`：
1. 选「手动输入价格」→ `price='manual'` → 显示输入框
2. 输入 12.5 → `price='12.5'` ≠ `'manual'` → **切回下拉**
3. 下拉 value='12.5' 不在选项里 → 显示「请选择价格」✗

### 改动（`frontend/src/pages/StockInout.tsx`）
| 点 | 内容 |
|---|---|
| 新增行价格 | 切换条件改为 **`priceMode === 'batch'`**（批价下拉）vs 其余（手动输入框）；下拉选「手动输入价格」→ `price=''` + `priceMode='manual'`；输入框始终显示 `nr.price`（手输值） |
| 编辑行价格 | `editDraft` 新增 `priceMode` 字段；`startEdit` 出库行先置 batch，价格批次加载后**按当前价格是否匹配**修正（匹配→batch 下拉；不匹配→manual 输入框显示手输价）；切换条件同样用 `priceMode` |

### 行为（修复后）
| 场景 | 显示 |
|---|---|
| 出库 + 价格匹配批次 | 下拉，显示对应批次价 |
| 出库 + 选「手动输入价格」+ 输入 | **输入框，显示手输价格** ✓ |
| 编辑一条手输价格的历史记录 | 输入框，显示原价格 ✓（原来显示「请选择价格」） |

### 验证
- 构建通过；新 bundle（`index-D7qEVyWh.js`）已部署，`priceMode==="batch"` 逻辑出现 2 处（新增+编辑）✅

---

## 12. 新进货价不出现在「单价与库存」下拉（NULL 陷阱）

**症状**：SALMON 刚进货 4 kilo 新价格 50.55（勾了备注、进了货品备注页），出货时单价与库存下拉不显示该价格。

### 根因（SQL NULL 陷阱）
```
价格组 50.55：4 条全是进货记录，out_quantity 全为 NULL
→ SUM(out_quantity) = NULL
→ SUM(in) - SUM(out) = NULL
→ HAVING NULL > 0 不成立 → 整组被排除 ✗
```
老数据出库行 `out_quantity=0`、进货行 `out_quantity=NULL`——全新进货价（从未出过货）的出库列全 NULL，净库存算成 NULL 被 `HAVING` 吞掉。45.50 组因为有出货记录所以能显示（对照出差异）。

### 修复（3 个 Mapper XML，6 处）
所有 `SUM(in) - SUM(out)` 改为 **`COALESCE(SUM(in),0) - COALESCE(SUM(out),0)`**：
| 文件 | 查询 |
|---|---|
| `StockEditMapper.xml` | `priceBatches`（HIFO 批次）、`priceStock`（单价与库存下拉）、`remarkCodes`（在库备注编号） |
| `StockInoutMapper.xml` | `countInStockRemarkNumber`、`countRemarkNumberInStock` |
| `StockSummaryMapper.xml` | `summaryRows`（总库存：total_stock + total_price 的 `(in-out)*price` 也加 COALESCE） |

`StockRemarkMapper.xml` 原本就用 `IFNULL`（货品备注页能显示的原因），未动。

### 验证
- `price-stock SALMON`：**50.55 / 库存 86.74 / is_sufficient=true** 出现 ✅（修复前缺失）
- 总库存 summary：SALMON 50.55 → 86.74 ✅
- 后端已重建重启（`inventory-backend-1.0.0.jar` 15:55）✅

### 影响面
同样的 NULL 陷阱曾影响：HIFO 自动拆行（全新价格不参与拆行）、备注编号"在库"判断（全新编号被当不在库）、总库存列表（全新价货品行整个消失）。

---

## 13. 单价与库存下拉隐藏了库存不足的价格（35.50 消失）

**症状**：出货时单价与库存下拉只显示 50.55、45.50，35.50（库存 23.7）不见——用户以为被合并进了 45.50。实际没有合并（45.50 组原始单价全是 45.50000，差额 20.78 = 本地新建记录 27435），是**前端把库存不足的价格过滤掉了**：outQty > 23.7 时 35.50 被 `.filter(p => available_stock >= outQty)` 隐藏。

### 老系统实锤
`stockeditall.js` 新行加载价格：**"显示所有价格选项，不管库存是否足够"**（`(库存: X)` 全部列出）；编辑模式本意标注 `(库存: X, 不足)`（虽为死代码，意图明确）。本地却整个 filter 掉。

### 改动（`frontend/src/pages/StockInout.tsx`）
| 点 | 内容 |
|---|---|
| 新增行价格下拉 | 去掉 `.filter()`，**显示全部价格**；库存不足的标注 **(库存:X, 不足)**；空态文案改为「暂无历史价格」（对齐旧系统） |
| 编辑行价格下拉 | 同上（去掉 filter + 标注不足） |

### 行为（修复后）
出货 SALMON、outQty=30 时下拉显示：
```
请选择价格 / 手动输入价格
50.550 (库存:86.74)
45.500 (库存:210.7)
35.500 (库存:23.7, 不足)   ← 不再消失
45.200 (库存:1.3, 不足)
44.700 (库存:0.75, 不足)
```
选库存不足的价格保存时由后端事务内校验拦截（对齐旧系统）。

### 验证
- 新 bundle（`index-CQh7ByE3.js`）已部署，"不足"标注出现 2 处（新增+编辑）✅

---

## 14. 编辑出货记录无法保存（备注编号被本记录消耗后校验失败）

**症状**：编辑货品记录（如 SALMON 出货）后点保存失败——即使只是换收货人。用户以为是收货人问题。

### 根因（编辑时错误复用"新增"的备注校验）
`updateInout` 对**编辑**也套用了"出货备注编号必须在库"校验：
- SALMON 的 SA-177/SA-178 已被各自的出货记录**消耗**（净库存 ≤ 0）
- 编辑这条记录（保持 SA-178）→ 校验 `countRemarkNumberInStock` → 不在库 → 400「备注编号 [SA-178] 不在库中」→ 保存被拦
- 老系统编辑走 PATCH 逐字段更新，**不做**备注校验；本地把 create 的校验误用于 update

### 修复（`backend/.../service/StockService.java` updateInout）
| 场景 | 行为 |
|---|---|
| 保持原备注编号 | **跳过「在库」校验**（原编号可能已被本记录消耗）✅ 可保存 |
| 改为新编号 | 校验新编号在库（无效仍拦截）✅ |
| 新出货/改编号为空且原记录无编号 | 照旧要求填写 ✅ |
| 编辑时编号为空但原记录有 | 保留原编号（防误清） |

### 验证（真实记录 27448，SA-178 已被自身消耗）
- 保持 SA-178 编辑 → **成功** ✅（修复前 400 不在库中）
- 改成 SA-999 → 400「不在库中」✅（校验仍有效）
- 改成在库 SA-174 → 成功 ✅

### 测试副作用已清理
- 27448 已恢复：remark SA-178 / time 16:19 / created_by HONG MING SOON（receiver 原值无法确认，暂为 A KIM，如有误请页面改回）
- 27435（已删除）receiver 已清 NULL
- 后端已重建重启（jar 16:22）✅

### 补充修复：前端 saveEdit 也有同款校验（第一次没完全修好）

用户反馈"还是保存不了"——因为**前端** `saveEdit` 里也有一道备注校验：`getRemarkCodes` 只返回在库编号，SA-178 不在其中 → `!codes.includes(rn)` → 前端 `return`，**请求根本没发到后端**（后端日志无记录 = 佐证）。

**修复**（`frontend/src/pages/StockInout.tsx` saveEdit）：编辑时取原记录 `origRemark`，`rn === origRemark`（保持原编号）→ 跳过在库校验；`rn` 为空但原记录有编号 → 不拦截（由后端保留原编号）；改动编号 → 照旧校验在库。

**验证**：新 bundle（`index-BJbXKQmM.js`）已部署，前后端逻辑现已一致 ✅

---

## 15. 保存防连点（防重复提交，对齐旧系统 batchSaveNewRows）

**需求**：旧系统保存时有"防网卡"机制——保存中禁用按钮 + 转圈，一次点击保存所有新增行，避免双击/连点导致重复提交。

### 本地原缺失
- `saveNewRows` 逐条请求保存（for 循环逐个 createStockInout），**保存中没有禁用按钮**——快速连点会重复提交
- `saveEdit` 同样无防连点

### 改动（`frontend/src/pages/StockInout.tsx`）
| 点 | 内容 |
|---|---|
| `saving` 状态（新增） | 保存中标志 |
| `saveNewRows` | 开头 `if (saving) return`；`setSaving(true)` 开始、`finally setSaving(false)` 结束 |
| `saveEdit` | 同上防连点 |
| 批量保存按钮 | 保存中 `disabled` + spinner「保存中...」 |
| 新增行/编辑行保存按钮 | 保存中 `disabled` + 转圈图标 |

### 行为
- 保存中所有保存按钮禁用，连点/双击/Ctrl+S 重复触发全部被 `if (saving) return` 挡住
- 保存结束（成功或失败）恢复可点
- 备注校验、库存校验逻辑不变

### 验证
- 构建通过；新 bundle（`index-dLU_8OB3.js`）已部署 ✅

---

## 16. 防连点机制推广到全部页面

**需求**：「其他页面也是」——把进出货页的保存防连点（防重复提交）推广到所有有保存操作的页面。

### 已覆盖页面（14 个新增 + 8 个原有）
| 本轮新增 | 保存处理器 |
|---|---|
| `Suppliers.tsx` | saveEntity / saveNewRows / saveEdit |
| `Price.tsx` | saveEntity / saveNewRows / saveEdit |
| `Menu.tsx` | submit |
| `Jobs.tsx` | saveModal（antd Button loading） |
| `Staff.tsx` | submitAdd / submitEdit（savePerm 原有） |
| `Schedule.tsx` | saveSchedule / saveAllChanges / saveEmployee / saveShiftItem |
| `Dishware.tsx` | saveModal（含套装）/ saveRest |
| `DishwareBreak.tsx` | saveBreak / saveEditBreak |
| `DishwareTransfer.tsx` | saveEditTransfer / saveRest（saveTransferDraftRow 原有） |
| `Phone.tsx` | saveAll / saveEmployee |
| `Evaluation.tsx` | saveForm / saveStandards |
| `Timeline.tsx` | doAdd / doSave |
| `JobPositions.tsx` | doSave |

原有（已有 saving/disabled）：AddEmployee / CorporateEdit / CostEdit / KpiEdit / Qna / Settings / StockProducts / StockSot（确认按钮均有 disabled={saving}）。

### 统一模式
```tsx
const [saving, setSaving] = useState(false)
const saveX = async () => {
  if (saving) return          // 防连点
  setSaving(true)
  try { ... } finally { setSaving(false) }
}
<button onClick={saveX} disabled={saving}>{saving ? '保存中...' : ...}</button>
```

### 坑（已修）
- 多处保存按钮原来是多行结构（icon 在下一行），单行替换后残留孤儿 `</button>`/`<i>` 导致 JSX 报错——Suppliers/Price/Phone 各修一处

### 验证
- 构建通过（TS 无错）；新 bundle（`index-QphUbgQX.js`）已部署，「保存中」按钮文案 30 处 ✅

---

## 17. 编辑模式可修改收货单位（目标单位）

**需求**：进出货点击编辑后，收货单位（目标单位 J1/J2/J3/中央）应可编辑——老系统编辑态就有 target select。

### 老系统实锤
`stockeditall.js` 编辑行：`target-select-{id}`，`out_quantity === 0` 时 disabled（值强制 central），出货时可改（对齐 `handleEditOutQuantityChange`）。

### 改动（`frontend/src/pages/StockInout.tsx`）
| 点 | 内容 |
|---|---|
| `startEdit` | editDraft 新增 `targetSystem` 字段 |
| 编辑行收货单位单元格 | 中央系统：渲染下拉（J1/J2/J3/中央），**出货数量 > 0 时可编辑**，否则禁用并锁定「中央」；分店系统照旧显示系统名 |
| `saveEdit` | payload 新增 `targetSystem`：出货 → 送下拉所选（无则 undefined）；进货/无出货 → 强制 `'central'`（对齐新行逻辑） |

### 行为
| 编辑场景 | 收货单位 |
|---|---|
| 出货记录（outQty>0） | **可下拉选择** J1/J2/J3/中央 ✓ |
| 进货/无出货（outQty=0） | 禁用，锁定「中央」 |

### 验证
- 构建通过；新 bundle（`index-BCju3T_f.js`）已部署 ✅
- API：编辑出货记录 targetSystem=j1 → 保存成功；清空 → NULL，均正常 ✅（测试记录 27448 已恢复原状）

### 补充：首次部署其实没生效（edit 调用原子回滚）

用户反馈"还是编辑不了"——排查发现上一轮 edit 调用因第三处（saveEdit）匹配失败而**整体回滚**，startEdit 的 targetSystem 字段和编辑行下拉都未应用，只部署了 saveEdit 的 payload 改动。本次补上两处并重新部署：
- `startEdit`：editDraft 加 `targetSystem`
- 编辑行收货单位：渲染可编辑下拉（出货可改 / 否则锁死中央）
- 新 bundle（`index-Cy1GmSsF.js`）已部署，bundle 中确认含 `disabled:parseFloat(...outQuantity)<=0` + j1/j2/j3/central 选项 ✅

**教训**：edit 工具的多个 edits 是原子的——一个失败全部回滚，需逐个确认。

---

## 18. 编辑改出货单位后分店无记录（分店同步条件过严）

**症状**：中央页面编辑出货记录、把出货单位改成其他分店（J1/J2/J3）后，分店页面查不到记录。

### 根因
`updateInout` 的分店同步块整体被条件包裹：
```java
if (oldOutgoing && oldTarget != null && List.of("j1","j2","j3").contains(oldTarget.toLowerCase())) {
```
要求**原记录本来就是出货到分店**才同步。原目标为 NULL/central 的记录改成出货到分店时，整块跳过 → 新分店无记录。

### 改动（`backend/.../service/StockService.java` updateInout）
重构为两步（不再依赖原目标）：
| 步骤 | 逻辑 |
|---|---|
| 1) 旧分店清理 | 原目标为分店 &&（不再出货 / 目标改了 / 货品改了）→ 软删旧分店记录 |
| 2) 新分店写入 | **当前**出货到分店 → 软删该分店旧记录后重建（保证数量/价格一致），覆盖「原目标空→分店」场景 |

顺带修复：仅改数量/价格时（目标不变）分店 edit 记录也会重建（旧逻辑只重建 inout 表，edit 表数量会滞后）。

### 验证（真实记录 27448）
- target NULL → j1：j1stockedit_data(24610) + j1stockinout_data(9154) 生成，in 20.78 ✓
- target j1 → 空：两条分店记录软删 ✓
- 测试后已恢复原状（target 空，j1 记录已删）
- 后端已重建重启（jar 16:58）✅

---

## 19. /price 的 .stats-bar 出现莫名 margin-bottom（CSS 作用域泄漏）

**症状**：/price（及 /suppliers）页底部统计栏下方有多余的 margin-bottom，影响视觉。

### 根因（实锤）
bundle 里有一条**未限定作用域**的规则：
```css
.stats-bar{...;margin-bottom:20px}   /* timeline.css 里的 */
```
`.price-root .stats-bar` 没有声明 margin，未限定的 `.stats-bar`（0,1,0）的 margin-bottom 就叠加生效。这条规则本是给 **JoinComphoto**（导入 timeline.css）的统计栏用的，泄漏到了 price/suppliers。

### 修复（`frontend/src/styles/timeline.css`）
`.stats-bar` → **`.content .stats-bar`**（JoinComphoto 的统计栏在 `.content` 内；price/suppliers 在 `.table-container` 内，天然隔离）。
顺带修掉了同规则泄漏的 `gap/border/border-radius/flex-wrap` 等属性对 price/suppliers 的污染。

### 验证
- 新 bundle（`index-yXVnIL1D.css`）：未限定的 `.stats-bar{...margin-bottom}` 已消失，只剩 `.content .stats-bar`（JoinComphoto 用）与 `.price-root/.supply-root .stats-bar`（无 margin）✅

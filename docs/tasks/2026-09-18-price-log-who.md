# 任务 2026-09-18-price-log-who

- 状态：已完成（2026-09-18）
- 开始时间：2026-09-18
- 分支：main
- 目标：改价记录里显示**谁改的价**（弹窗每行 + 货品名悬浮提示），并且记录来源改成「登录用户」而不是货品申请人
- 白名单（只允许改这些文件）：
  - backend/src/main/java/com/kunzz/inventory/controller/StockEnhanceController.java
  - backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
  - backend/src/main/resources/mapper/PriceChangeLogMapper.xml
  - inventory-system/frontend/src/pages/StockRecords.tsx
  - inventory-system/frontend/src/api/index.ts
  - docs/tasks/2026-09-18-price-log-who.md
  - docs/tasks/README.md
- 明确不碰：
  - 数据库结构（`changed_by` 列早就有，不用补丁）
  - 其它页面、CHANGELOG.md、构建产物（依赖 VPS 构建）
  - docs/tasks/2026-09-18-price-log-daily.md（上个任务，已推送）

## 需求

用户："我还需要投放 谁去更改单价的显示" —— 改价记录里要能看出是谁改的。

## 先修数据源（比显示更要紧）

`changed_by` 现在是这么来的：

```java
log.put("changedBy", decodeHtml(str(body.getOrDefault("applicant", ""))));
```

而前端保存时传的 `applicant` 是**这一行的「申请人」**（当初建这条货品记录的人）：

```ts
await updateStockProduct(id, { ...d, applicant: d.applicant || currentUser, ... })
```

→ 只要这行有申请人，改价记录里记的就是**申请人**，不是**改价人**。
（实测本地库里那行 `24K GOLD FLAKE / changed_by=MJ` 之所以正确，只是因为当时那行没有 applicant，回落到了 currentUser。）

**改成：改价人 = 登录用户**（后端从 SecurityContext 取，服务端权威、前端伪造不了）：

- `JwtAuthFilter` 把整个 `User` 实体放进 principal（`AuthController.me` 就是这么取的）
- 取 `user.getDisplayName()`（昵称优先 → 中文名 → 用户名），与前端 `currentUser`、`/auth/me` 的 displayName 完全一致
- 取不到登录态时才回落到请求里的 applicant（内部调用/极端情况的兜底）

**历史数据**：已经写进去的那些 `changed_by` 是当时的申请人，无法追溯真实改价人，只能保持原样 ——
从这次部署之后的记录才是准的。（要不要把历史行清成「未知」，等用户决定，不擅自改。）

## 显示（前端）

1. **弹窗「改价记录 — 货品名」** 每行：日期后面跟一个灰色的改价人（`· MJ`），鼠标悬浮显示「操作人：MJ」
2. **总库存货品名的悬浮提示**：「最近改价：18/9/2026 RM32.00（MJ）」—— 需要后端 `latestAll` 多返回一列 `changed_by`

## 本地验证

### 接口层（本地后端 8081 + 登录态 JWT，用户 = CHONG KAH SIN / 显示名 MJ）

| 步骤 | 结果 |
|---|---|
| 请求体里故意写 `applicant: "SOMEONE-ELSE"`，改价 40 → 41 | 库里 `changed_by = **MJ**`（不是 SOMEONE-ELSE）✓ 改价人来自登录态 |
| 请求体不带 applicant，改价 41 → 42 | `changed_by = MJ` ✓；且两笔合并成同一条 `40 → 42`（上个任务的按天合并仍正常）✓ |
| `GET price-log` | 返回 `{"oldPrice":40,"newPrice":42,"changedBy":"MJ"}` ✓ |
| `GET price-log-latest` | 返回 `{...,"changedBy":"MJ"}` ✓ |

### 页面层（真实浏览器，本地 5174 开发服 + 本地库）

- 货品名悬浮提示：`最近改价：18/09/2026 RM32.50（MJ）` + `点击查看完整改价记录（从旧到最新，含改价人）` ✓
- 点货品名 → 弹窗「改价记录 — 1/7 CUT NORI」：

  ```
  2026年09月17日  [👤 Soon]   RM32.00(划线) RM30.00
  2026年09月18日  [👤 MJ]                     RM32.50
  共 2 条 · 从旧到最新
  ```

  每行日期后面是改价人的灰色小药丸（人形图标 + 名字），右侧还是价格；多行不会挤乱 ✓
- 关闭弹窗再点一次能重新打开（弹窗取数在每次点击时发生，显示的是当前数据）✓

测试数据已还原：测试货品经接口删除、`price_change_log` 恢复成跑测试前的 1 行、
被测货品（1/7 CUT NORI）的单价恢复成改前的 NULL。

## 历史数据说明（需要用户知道）

已有的那些改价记录里，`changed_by` 是**当时的货品申请人**（不是真正改价的人）——
因为老代码取的是请求体里的 `applicant`。真实改价人无法追溯，只能保持原样。
本任务上线之后产生的记录才是准的。（若要把历史行的"谁"统一改成"未记录"，需用户点头再动，不擅自改。）

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. 重建后端 jar 并重启（本次有前端改动 → 也要 `npm run build` 并 rsync）
3. 无数据库结构改动

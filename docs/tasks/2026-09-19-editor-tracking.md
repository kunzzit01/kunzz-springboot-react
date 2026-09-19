# 任务 2026-09-19-editor-tracking

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：① 编辑保存后**创建人不能被清掉**；② 记录并显示**编辑人**（悬浮提示多一行）。进出货页 + 货品种类页都做。
- 白名单（只允许改这些文件）：
  - add_new_tables.sql（第 11 节：5 张表加 updated_by）
  - backend/src/main/java/com/kunzz/inventory/entity/StockInout.java
  - backend/src/main/java/com/kunzz/inventory/service/StockService.java
  - backend/src/main/java/com/kunzz/inventory/controller/StockController.java
  - backend/src/main/resources/mapper/StockInoutMapper.xml
  - backend/src/main/resources/mapper/StockProductMapper.xml
  - backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
  - inventory-system/frontend/src/types.ts
  - inventory-system/frontend/src/pages/StockInout.tsx
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - docs/tasks/2026-09-19-editor-tracking.md
  - docs/tasks/README.md
- 明确不碰：CHANGELOG.md、构建产物、其它页面、手机版逻辑（手机版镜像行本来就写 receiver='Mobile'）

## 问题（用户报）

进出货记录里有一列「创建人」（悬浮提示：创建人 + 创建时间）。用户编辑保存一条记录后，**创建人的名字不见了**。

根因（代码）：

```java
private void applyInout(StockInout s, StockInoutRequest req) {
    ...
    s.setCreatedBy(req.createdBy());   // ← 新增和编辑共用；编辑请求不带 createdBy → 被写成 null
}
```

创建人的值只在新增时由前端发送，编辑时请求里没有这个字段，`applyInout` 却无条件覆盖 → 编辑一次，创建人变空。
（分店那条路径走 `updateBranch` SQL，SET 列表里没有 created_by，所以只有中央记录中枪。）

用户要求：**创建人保留**，另外**悬浮提示多一行显示编辑人是谁**。

## 做法

1. **创建人不再被编辑覆盖**：`applyInout` 只在请求真的带了 createdBy 时才写
2. **新增「编辑人」**：5 张表加 `updated_by`（stockinout_data + j1/j2/j3stockedit_data + stock_data），
   编辑保存时由**后端从登录态**写入（前端伪造不了，与「改价记录显示谁改的」同一套做法）
3. **显示**：
   - 进出货记录：创建人那一格的悬浮提示变成「创建人 / 创建时间 / 编辑人 / 编辑时间」（编辑人为空则不加后两行）
   - 货品种类：申请人那一格的悬浮提示同样加上编辑人（该页原本没有提示）
4. **货品种类不再拿编辑人当申请人**：编辑保存时 `applicant: d.applicant || currentUser` 会把"当前用户"
   写进申请人栏 —— 记录已存在时申请人应当保持原样，编辑人另有 updated_by 记录
5. 时间用现成的 `updated_at`（两张表都有 ON UPDATE CURRENT_TIMESTAMP），不用新加时间列

## 本地验证

准备：本地库导入 9/18 生产备份 → 跑 `add_new_tables.sql`（第 11 节，5 张表都加上 `updated_by` ✓）→
重建 jar 跑起来（登录态 JWT = 用户 CHONG KAH SIN，显示名 MJ）。

### 接口层

| 场景 | 结果 |
|---|---|
| 中央记录 29453（原 created_by=CHONG KAH SIN）提交编辑（**不带 createdBy**，与前端一致） | `created_by` **仍是 CHONG KAH SIN** ✓、`updated_by=MJ` ✓ |
| 分店记录 26678（J1，同样不带 createdBy） | `created_by` 保留 ✓、`updated_by=MJ` ✓ |
| 新建一条（带 createdBy）：`createdBy=CHONG KAH SIN, updatedBy=null` → 再编辑一次 | 创建人保留 ✓、编辑人写入 ✓ |
| 列表接口 `/api/stock/inout?targetSystem=j1` | 返回带 `updatedBy` / `updatedAt` ✓ |
| 货品 id=264（SHOGA SAUCE）改位次 | `applicant` 不变 ✓、`updated_by=MJ` ✓、`updated_at` 刷新 ✓ |
| 列表接口 `/api/stock/products` | 返回带 `created_at` / `updated_at` / `updated_by`（没编辑过的行 `updated_by` 为空）✓ |

### 页面层（真实浏览器，本地 5174）

- **进出货**：新建 + 编辑一条记录后，创建人那一格显示 MJ，悬浮提示：

  ```
  创建人: MJ
  创建时间: 2026-09-19 12:09:42
  编辑人: MJ
  编辑时间: 2026-09-19 12:09:42
  ```

  （编辑过的记录才多出后两行；没编辑过的仍是创建人 + 创建时间两行）✓
- **货品种类**：申请人那一格的悬浮提示：

  ```
  申请人: MJ
  创建时间: 2025-08-15 14:20:37
  编辑人: MJ
  编辑时间: 2026-09-19 12:05:09
  ```

  申请人栏的值保持原样（编辑不再把它改成"当前用户"）✓

前端 `tsc` 构建通过；测试数据在本地库（跑完重新导入还原）；本地服务已停。

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. `sudo mariadb < add_new_tables.sql`（第 11 节加列，幂等；加列不改数据）
3. 重建后端 jar 并重启 + 前端 `npm run build` 并 rsync（两端都有改动）

## 已知边界

- 只有**这次改动之后**编辑过的记录才有「编辑人」——历史记录那两行本来就没记过，不会凭空出现。
- 手机版镜像行（receiver='Mobile'）是插进来的，创建人一栏本来就是空的（手机端没传）；编辑人同样在手机端改过才知道。

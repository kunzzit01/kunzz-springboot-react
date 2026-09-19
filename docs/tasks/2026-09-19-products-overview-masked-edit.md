# 任务 2026-09-19-products-overview-masked-edit

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：货品种类·总览——① 打码行（还分配给无权限系统的货品）放开编辑；② 4 套单价/冰箱分类文本按权限收敛并加「另有X」标记；③ 顺手修两个小坑
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
  - backend/src/main/java/com/kunzz/inventory/controller/StockEnhanceController.java
  - docs/tasks/2026-09-19-products-overview-masked-edit.md
  - docs/tasks/README.md
- 明确不碰：数据库（不用补丁）、其它页面、CHANGELOG.md、构建产物

## 用户报的问题 + 调查结论

"我现在有两间分店的权限 j1/j2，但是我的总览有一些却操作不了设置" +
"总览只展示 j1 和 j2 的设置，但是有一些货品有牵连到中央和 j3，那么他的展示到底又该如何设置？"

**局限点 = 打码行整行没有操作列**（`StockProducts.tsx:1164`）：

```tsx
{canApply && !(system === 'overview' && r._assignMasked) && ( ...编辑/保存/删除... )}
```

`_assignMasked`（`:478-486`）= 货品的系统分配里含**用户没有权限的系统**（J1+J2 用户看 `Central,J1,J2,J3` 的货品）
→ 总览只显示交集 `J1,J2` 并打标记 → 操作列整格不渲染（只剩「批准」能点）。
原意图（`:474` 注释）：防止保存时把打码后的 `J1,J2` 写回去、误删中央/J3 的分配。

总览下其它限制（本次按用户选择保持不变）：单价/冰箱分类只读显示 4 套文本、位次列不存在、
系统分配只有总览能改（选项限有权限的系统）、新增行填不了三件套。

## 用户确认的做法

1. **打码行放开编辑**，但保存时**不发送 system_assign**（后端"只更新请求里带的字段" → 别家分配原样保留）；
   编辑态里系统分配那一格对打码行保持只读 + 提示
2. **4 套文本收敛**：只拼有权限的系统，无权限的只给「（另有中央/J3）」这样的标记、不显示具体值；
   没配置权限的账号（老账号/demo）行为不变
3. 总览**不**提供改三件套（保持"去系统页改"）
4. 顺手修：① 总览新增行系统分配必填（否则存完因"可见交集=0"从列表消失）；② 总览保存不发三件套（避免边角情况写出 system 为空的改价日志）

## 实现要点

- 前端：操作列去掉 `_assignMasked` 限制；分配格 `isEditing && !r._assignMasked` 才给 MultiSelect；
  `doSaveEdit` 在总览下 delete 掉 price/freezer_category/freezer_position，打码行再 delete system_assign；
  `doSaveNewRow` 总览下校验 system_assign
- 后端：`/api/stock/products` 加 `Authentication` → `staffService.stockPerms` 取允许系统（未配置 → null 不限制，
  空列表 → null 让前端锁屏处理）→ `StockProductService.list(..., allowedSystems)` →
  `joinBySystem` 只拼允许的系统 + `excludedMark()` 输出「（另有中央/J3）」

## 本地验证（真后端 + 真实浏览器，本地库用的是 9/18 生产数据）

本地把 user 34 造成 **J1+J2 权限（含 apply/approve）**，测 `Central,J1,J2,J3` 的货品（id=2 1/7 CUT NORI）：

| 检查 | 结果 |
|---|---|
| 打码行操作列 | **编辑/删除按钮都在** ✓（改前整格是空的） |
| 编辑态的系统分配格 | 只读输入框 `J1,J2` + 提示「该货品还分配给其它系统…保存不会改动系统分配」✓（不是 MultiSelect） |
| 改供应商 → 保存 | 库里 `supplier` 变了，**`system_assign` 仍是 `Central,J1,J2,J3`** ✓✓（没被写成打码值），`updated_by=阿娃` ✓ |
| 单价文本（J1+J2） | `J1 2222 · J2 0（另有中央/J3）` ✓ |
| 冰箱分类文本（J1+J2） | `J1 ICE BOX 1 · J2 -（另有中央/J3）` ✓ |
| 单价文本（只有 J1） | `2222（另有中央/J2/J3）` ✓ |
| 单价文本（全系统账号 MJ） | `中央 1111 · J1 2222 · J2 0 · J3 0` ✓ 行为不变 |
| 只分配给中央的货品（J1 账号看） | 返回 `（另有中央）`，不报错 ✓（这种行前端本来就会过滤掉） |
| 总览新增行不选系统分配 | 被拦下：「请选择「系统分配」：总览里没选系统的货品，保存后会从列表里消失」✓，没落库 |
| 回归：J1 系统页 | 单价/位次/冰箱分类都能改（位次 2→5 保存成功，写进 `stock_data_system.j1` ✓，中央/j2/j3 不变 ✓）；系统分配只读显示**真实**值 `Central,J1,J2,J3` ✓ |
| 改价日志 | 总览这次保存**没有**产生 `stock_system` 为空的日志 ✓（D2 的目的达到） |

`tsc -b` + 后端 `mvn package` 均通过；测试数据（供应商/位次/user 34 权限）只在本地库，跑完已重新导入还原。

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. 重建后端 jar 并重启 + 前端 `npm run build` 并 rsync
3. 无数据库改动

## 说明 / 边界

- 「打码」在总览里仍然存在（系统分配列只显示你有权限的部分），现在只是**不再连带禁用整行操作**；
  防覆盖从"锁死整行"换成"保存时不发 system_assign"（后端只更新请求里带的字段）。
- 总览仍然不能改单价/冰箱分类/位次（按你的选择），要到对应系统页改。
- 列表接口本身仍返回全部货品行（只是文本按权限收敛 + 前端过滤），和总库存/进出货的模型一致；
  要所有库存接口都在后端按系统鉴权是另一个更大的任务。

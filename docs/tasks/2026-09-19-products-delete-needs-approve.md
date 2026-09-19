# 任务 2026-09-19-products-delete-needs-approve

- 状态：已完成（2026-09-19）
- 开始时间：2026-09-19
- 分支：main
- 目标：货品种类页的**删除（垃圾桶）按键只给有「批准」权限的人**；只有「申请」权限的人不显示删除
- 白名单（只允许改这些文件）：
  - inventory-system/frontend/src/pages/StockProducts.tsx
  - backend/src/main/java/com/kunzz/inventory/controller/StockEnhanceController.java
  - docs/tasks/2026-09-19-products-delete-needs-approve.md
  - docs/tasks/README.md
- 明确不碰：数据库、其它页面、CHANGELOG.md、构建产物

## 用户要求

"只有批准权限的人 可以使用也展示垃圾桶删除按键 但是申请权限之人不能有删除按键"（截图：货品种类页操作列的橙色编辑 + 红色垃圾桶）

## 现状

`StockProducts.tsx:1222-1235`：

```tsx
{canApply && (isEditing ? ( 保存 / 取消 ) : ( 编辑 / 删除 ))}
```

→ 只要有**申请（apply）**权限，编辑和删除**两个按钮都出现**，删除没有任何独立门。

权限来源：`getStockPerms()` 的 `views` → `canApply`（apply）/ `canApprove`（approve）（"职员管理→权限设定→库存"）。

## 做法

**前端**（操作列）：
- 操作列整体：`canApply || canApprove` 就显示
- 编辑/保存/取消：`canApply`（不变）
- **删除：`canApprove`** ← 本次要求
（编辑态只有能申请的人进得去，所以保存/取消沿用原样）

**后端**：`DELETE /api/stock/products/{id}` 现在**没有任何权限校验** → 加一个 `assertCanApprove`
（与「冰箱分类」接口同一套判定：配置过权限且没有 approve → 403），避免绕过界面直接调接口删除。
未配置权限的老账号/demo 仍默认放行（与其它页一致）。

## 本地验证（真后端 + 真实浏览器）

本地把 user 34 的库存权限在"有申请、无批准"和"申请+批准"两种之间切换来测：

| 账号权限 | 页面操作列（前 5 行实测） | 直接调接口 DELETE |
|---|---|---|
| 只有申请（apply） | **只有「编辑」**，没有垃圾桶 ✓ | **403**「没有删除货品的权限（需要「批准」权限，见 职员管理→权限设定→库存）」✓ |
| 申请 + 批准 | 「编辑」+「删除此行（需要「批准」权限）」✓ | 200 删除成功 ✓（测试货品随后确实从库里消失 ✓） |

`tsc -b` + 后端 `mvn package` 通过。

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. 重建后端 jar 并重启（后端 DELETE 加了校验）+ 前端 `npm run build` 并 rsync
3. 无数据库改动

## 备注（本次不做，等用户确认）

进出货页（StockInout）也有删除按钮（`StockInout.tsx:1893`），那一页**完全没按 views 权限区分**
（它只读了系统权限 ✓，没有 canApply/canApprove 的概念）。如果要"进出货也只有批准权限的人能删"，
是同一个改法的另一个任务。

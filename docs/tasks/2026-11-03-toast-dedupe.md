# 任务 2026-11-03-toast-dedupe

- 状态：已完成（待前端重新构建上线）
- 背景：2026-11-03 在 live 站点的进出货页看到同一条错误弹了两次（`货品 [SALMON] …备注编号在库…`）。
  排查结论：不是新加的进货校验重复触发，而是全站旧机制 —— `api/http.ts` 响应拦截器在 `code!==0` 时弹
  antd `message.error`，页面 `catch` 又调 `showMsg`（自研 toast）弹同一条，两者都在屏幕顶部中间，看起来像两条。
  同类双弹在出货备注校验、库存不足等所有业务错误上都会出现。
- 白名单（只允许改这些）：
  - inventory-system/frontend/src/api/http.ts
  - inventory-system/frontend/src/utils/toast.ts
  - docs/tasks/2026-11-03-toast-dedupe.md
  - CHANGELOG.md
- CHANGELOG.md 只在顶部追加本任务小节（不改老行）
- 明确不碰：其它页面、backend/**、backend/static/**（前端产物由发布 task 重新构建）
- 计划推送分支：main

## 改动

1. `inventory-system/frontend/src/api/http.ts`：业务错误（`code!==0`）不再弹 antd `message.error`，
   改用自研 `showToast(..., 'error')`（去掉了 `antd` 的 `message` import）。
2. `inventory-system/frontend/src/utils/toast.ts`：`showToast` 入口去重 —— 容器里已有同类型 + 同文案、
   且未在关闭动画中的 toast 时，直接返回它的 id（不再新建）。

## 验证

- `npm run build` 通过（exit 0，dist/assets/index-DNoM_aSd.js）。
- 逻辑：拦截器先弹（自研 toast）→ 页面 catch 再弹同文案 → 被去重，只留一条。
- live 线上前端仍是旧包（`index-Bd9T_U6a.js` 里没有本次新增文案），需重新 build + 发布后才生效。

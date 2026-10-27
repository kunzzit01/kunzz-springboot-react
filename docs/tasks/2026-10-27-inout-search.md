# 任务 2026-10-27-inout-search

- 状态：进行中
- 需求（用户 2026-10-27）：进出货搜索框要能搜到**表格里所有列**的东西（现在只搜 3 列）。
- 现状：
  - 中央（JPA Specification）：只匹配 `product_name` / `code_number` / `remark`
  - 分店（MyBatis `listBranch` / `countBranch`）：同上 3 列
  - 表格可见列：日期、货品编号、货品、进货、出货、收货单位、规格、单价、总价、类型、货品备注、备注编号、供应商/出货人、备注、创建人
- 方案（“稳”的要点）：
  1. **一条 CONCAT_WS 拼成"可搜文本"，再单次 LIKE** —— 不再手写 N 个 OR，新增列只改一处；
  2. 列清单**白名单**（不用 `*`），NULL 由 `CONCAT_WS` 自动跳过（不会被 NULL 吞掉整行）；
  3. 数字列直接交给 CONCAT_WS 转字符串（`20.000`/`8.30`），日期用 `DATE_FORMAT(date,'%Y-%m-%d')`，
     「总价」用 `ROUND(ABS(in-out)*price,2)` 与界面显示口径一致；
  4. 用户输入的 `%` `_` `!` **转义**（`ESCAPE '!'`），避免 `%` 匹配全表；
  5. `LOWER()` 双侧统一，大小写不敏感；
  6. 分店的 list 与 count 共用 `<sql>` 片段，防止两处条件漂移；中央与 XML 两边的列清单互相对照注释；
  7. `exactMatch=true` 时保持原语义（只精确匹配货品名）。

- 白名单（只允许改这些）：
  - backend/src/main/java/com/kunzz/inventory/service/StockService.java
  - backend/src/main/resources/mapper/StockInoutMapper.xml
  - inventory-system/frontend/src/pages/StockInout.tsx（仅搜索框 placeholder 文案）
  - docs/tasks/2026-10-27-inout-search.md
  - CHANGELOG.md（仅追加）
- 明确不碰：其它接口/页面、导出逻辑、排序逻辑
- **待确认 → 已定（2026-10-27，方案 C）**：搜索仍受日期范围限制，但界面上明确告知并给一键切换：
  - 搜索框下方提示：`仅搜 2026年10月27日`（或范围）→ 旁边 `改为全时段`；
  - 点“全时段”后：请求不带 `startDate/endDate`（后端不加日期条件），日期范围框变橙色 `全时段（不限日期）`，
    提示改为 `当前：全时段（不限日期）` + `回到今天`；
  - 手动选日期范围 / 快速选时段 → 自动退出全时段。
- 待定（可选）：中文搜“厨房 / 中央”目前不命中（库里存 `Kitchen` / `central`），需要时再加别名映射。
- 计划推送分支：main

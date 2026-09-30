# 任务 2026-09-30-branch-remark-own-sequence

- 状态：已完成（2026-09-30）
- 开始时间：2026-09-30
- 分支：main
- 目标：分店（J1/J2/J3）自己进货勾选「货品备注」自动生成编号时，从**各自自己的最小号**（SA-001…）起，不受中央调拨继承来的编号影响；中央调拨的编号在分店侧仍照常显示（继承保留）。只改生成规则，不动历史数据。
- 白名单（只允许改这些）：
  - docs/tasks/2026-09-30-branch-remark-own-sequence.md
  - docs/tasks/README.md
  - CHANGELOG.md
  - backend/src/main/java/com/kunzz/inventory/service/StockService.java
  - backend/src/main/resources/mapper/StockInoutMapper.xml
  - backend/src/main/java/com/kunzz/inventory/mapper/StockInoutMapper.java
- 明确不碰：backend/** 其它文件、inventory-system/**、website/**、database/**、任何历史数据、构建产物（backend/static/**、backend/target/*.jar 由发布 task 统一构建）
- 计划推送分支：main

## 问题

2026-09-18（task `2026-09-18-branch-remark-codes`）引入「中央调拨把编号继承给分店入库行」
（`StockService.insertBranchEdit`，写 `main_record_id`）。此后分店台账 `jXstockedit_data`
里混进了中央的编号，而自动生成 `generateRemarkCode` 对该表**不区分来源**，取全表同前缀 MAX：

- 实测（SALMON / SA-）：中央最大 SA-228；J1=203、J2=204、J3=205（全是继承来的）
- 于是 J1 自己进货的"下一个号"= **SA-204**，而不是设计初衷（task 2026-09-18 文档写的）"分店各自从 1 开始"

## 做法（判定规则）

分店台账三类行（已用真实数据核实）：

| 行 | main_record_id | 进/出 | 是否计入"当前最大号" |
|---|---|---|---|
| 中央调拨写入（继承号） | 有值 | 只有 in | ❌ |
| 分店出货复制该号 | NULL | 只有 out | ❌ |
| 分店自己 mint 的号 | NULL | 只有 in | ✅ |

- 生成时「当前最大号」只统计 `main_record_id IS NULL AND in_quantity > 0` 的行
- 「在库占用」仍统计全部行（避免与继承来的号撞号）

→ J1 当前无自己的入库编号 → MAX=0 → 下一个 = SA-001 ✓

## 改动

- `StockInoutMapper.xml` + `StockInoutMapper.java`：新增 `remarkCodePoolOwn`（仅统计自己 mint 的编号）
- `StockService.generateRemarkCode`：分店表走 own 池取 lastVal，full 池取在库集合；中央逻辑不变

## 验证

1. 构建：`~/tools/apache-maven-3.9.9/bin/mvn -DskipTests package`
2. 停后端 → 备份并替换 jar → 启动
3. J1 进货、勾选货品备注、编号留空 → 断言生成 **SA-001**
4. J1 货品备注仍显示中央继承来的 SA-221 ✓
5. 中央、出货选号/在库校验行为不变

## 回滚

不涉及数据；`git revert` 或还原备份 jar 即可。

# 任务 2026-09-18-price-log-daily

- 状态：已完成（2026-09-18）
- 开始时间：2026-09-18
- 分支：main
- 目标：改价记录**同一天同一货品同一系统只保留一条**（当天无论改多少次价，只更新那一条的新价，不再堆一长串）
- 白名单（只允许改这些文件）：
  - backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
  - backend/src/main/java/com/kunzz/inventory/mapper/PriceChangeLogMapper.java
  - backend/src/main/resources/mapper/PriceChangeLogMapper.xml
  - add_new_tables.sql（追加第 10 节：清历史重复）
  - docs/tasks/2026-09-18-price-log-daily.md
  - docs/tasks/README.md
- 明确不碰：
  - 前端（StockRecords.tsx 的弹窗/列只读接口数据，本次接口返回的行数变少，页面代码不用改）
  - 其它页面与后端文件、CHANGELOG.md、构建产物（依赖 VPS 构建）
  - docs/DAILY_REPORT_2026-09-18.md、docs/tasks/2026-09-18-per-system-delete-cleanup.md（其它 task 的改动）

## 问题（用户反馈）

总库存 → 点货品名 → 「改价记录」弹窗里，同一个货品**同一天**出现一长串记录：

```
2026年09月18日   RM32.00   RM0.00
2026年09月18日   RM0.00    RM32.00
2026年09月18日   RM32.00   RM0.00   ...
```

原因：`logPriceChange` 是**无条件 INSERT**（只要价格与上一次不同就插一条），当天来回改几次就堆几条。

用户要求：**同一天只保存一个单价** —— 当天无论怎么改，只留一条记录。

## 做法

**后端（`StockProductService.logPriceChange`）**：插入前先查「当天 + 该货品 + 该系统」有没有记录：

- 没有 → INSERT（old_price = 改价前的价，即当天起点价）
- 有 → 只 UPDATE `new_price` / `changed_by`，**`old_price` 保持当天起点价不动**

这样每条记录的含义固定为「**当天开始时是多少 → 现在是多少**」，一天最多一条。
（`old_price` 保持不动是刻意的：如果每次都把 old 换成上一次的 new，来回改价会得到 32→32 这种
看不出所以然的记录；保持当天起点价才能一眼看出"今天这一天到底动了多少"。）

同系统才合并：单价已经是按系统各存一份（任务 2026-09-18-per-system-fields），
所以中央改价不会合进 J1 那条记录。查询用 `IFNULL(stock_system,'central')`，
让老数据（stock_system 为 NULL = 当年全局一份）并入中央。

**SQL（`add_new_tables.sql` 第 10 节，幂等）**：清掉**历史**的当天重复行。
每组（货品 + 系统 + 日期）保留 id 最小的那条：把它的 `new_price` 更新为当天最后一条的价格，
其余删除。没有重复行时 0 行受影响，可重复执行。

## 不做的事（避免过度改动）

- 不删「当天改回原价」的记录：那天的记录会显示成 `RM32.00 → RM32.00`，
  意思是"当天动过价、最终回到原值"。保留比删除更透明（用户若要求这类也不留，再加一条删除分支）。
- 不动弹窗/前端展示逻辑，不动 `latestAll`（总库存「最近改价」列）的取数方式。

## 本地验证（真实后端 + 本地库，实测记录）

环境：本地 MariaDB 10.4（库 `u690174784_kunzz`，线上数据的副本）+ 本次新构建的 jar（8081）。
造了一个测试货品 `ZZTEST PRICE LOG`（初始单价 32），走真实接口 `PUT /api/stock/products/{id}` 改价：

| 步骤 | 库里的改价记录 | 结果 |
|---|---|---|
| 中央改价 33 → 34 → 32 → 35 → 34（同一天 5 次） | 始终 **1 行**：`32 → 33`、`32 → 34`、`32 → 32`、`32 → 35`、`32 → 34` | ✓ 不再堆行；`old_price` 保持当天起点价 32 |
| 再改 J1 的价 99（同一货品） | 另起一行：`j1 NULL → 99`；中央那行不动 | ✓ 按系统各记各的 |
| 库里造一条昨天的记录（30 → 31），今天再改中央价 36 | 昨天那条**原样不动**，今天那行更新为 `32 → 36` | ✓ 只合并"同一天" |
| 总库存弹窗接口 `price-log?system=central` | 返回 2 条（9/17、9/18 各一条） | ✓ 弹窗不再一长串 |
| 同一接口 `system=j1` / `system=j2` | j1 只返回自己那条，j2 空 | ✓ 各系统只看自己的 |
| 总库存「最近改价」列接口 `price-log-latest` | 返回当天那条的最终价 | ✓ |

补丁第 10 节（清历史重复）单独验证：

- 造重复行：中央 3 条 + J1 2 条（同一天）→ 跑完**中央只剩 id 最小那条**（`old_price` 32 不变，
  `new_price` 变成组内最后一条的 70，`changed_by` 也跟着最后一条 = BB）；J1 只剩 1 条（NULL → 77）✓
- 不同日期（9/16、9/17 各一条）**没有被合并** ✓
- 连跑两次：第二次 0 行受影响，数据不变（幂等）✓
- 整份 `add_new_tables.sql` 连跑两次均 exit 0 ✓
- 缺列保护：拿一张没有 `stock_system` 列的同结构表跑 → 打印"跳过"、**一行都没删**、exit 0 ✓
  （第一版这里有个坑：`@pcl_dup` 那句自己就引用了 `stock_system`，没这一列时直接报错中断，
  已改成三条语句各自用 `@pcl_sys_col` 守卫）

测试数据已全部还原：测试货品经接口删除、`price_change_log` 恢复成跑测试前的那 1 行、
`stock_data_system` 无残留。

## 已知边界（刻意接受，不影响使用）

- **同一天又改回原价**：会留一条 `RM32.00 → RM32.00`（表示"当天动过价、最终回到原值"）。
  比"记录凭空消失"更透明，所以不做自动删除。
- **同一秒两个人改同一个货品的价**：两边都可能查到"今天还没有记录"→ 各插一条，
  当天会短暂出现 2 条（点开弹窗能看出来；下次有人改价时只更新最新那条）。
  规模上属于极端情况，为它加重试/唯一索引会让"保存失败"的风险大于收益，故不做。

## 待用户在生产环境执行

1. `cd /opt/kunzz-springboot-react && git pull --ff-only`
2. `sudo mariadb < add_new_tables.sql`（第 10 节：清历史重复，幂等；想更稳妥可先
   `mariadb-dump -u root -p u690174784_kunzz price_change_log > /opt/backups/price_change_log_$(date +%F).sql`）
3. 重建后端 jar 并重启 `inventory-backend`（前端无改动，不用重新构建）

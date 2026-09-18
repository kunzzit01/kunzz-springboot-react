# 任务 2026-09-18-per-system-delete-cleanup

- 状态：进行中
- 开始时间：2026-09-18
- 分支：main
- 目标：删除货品时，把它在 stock_data_system 里的按系统行一并删掉（不留孤儿行）
- 白名单（只允许改这些文件）：
  - backend/src/main/java/com/kunzz/inventory/mapper/StockDataSystemMapper.java
  - backend/src/main/resources/mapper/StockDataSystemMapper.xml
  - backend/src/main/java/com/kunzz/inventory/service/StockProductService.java
  - docs/tasks/2026-09-18-per-system-delete-cleanup.md
  - docs/tasks/README.md
- 明确不碰：
  - 其它任何文件
  - 构建产物（按 AGENTS.md 第 4 节，VPS 自己构建）

## 背景

上一个任务（`2026-09-18-per-system-fields`）新建了 `stock_data_system`（按系统存冰箱分类/位次/默认单价）。
实测发现：**删除货品只删了 `stock_data` 那一行，新表里的对应行留了下来**（孤儿行）。
所有读取都 JOIN `stock_data`，所以孤儿行看不见、也不会串到别的货品（自增 id 不复用），
但会一直堆积、也没法从界面上清理 —— 属于该收拾的尾巴，部署前补掉。

## 改动

1. `StockDataSystemMapper` 加 `deleteByDataId(dataId)`
2. `StockProductService.delete(id)` 在删掉 `stock_data` 行之后，顺手删掉该货品的按系统行

## 待用户在生产环境执行

无额外步骤（跟上一个任务一起部署即可）。

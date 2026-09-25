# 任务 2026-09-25-name-whitespace-cleanup

- 状态：完成（2026-09-25 晚已在生产执行，用户复测出货成功）
- 背景（用户反馈）：J3 出货 `SK 0045 / OZEKI JUNMAI DAIGINJO JUNDAN JIKOMI 700ML` 被拒：
  「库存不足！可用库存: 0，请求出库: 1」，但总库存页显示该货品有 1.000。
- 根因：货品名里 `JIKOMI` 与 `700ML` 之间是**两个空格**（HEX `...4D49 2020 3730304D4C`）。
  2026-09-24 起写入端 `ProductName.normalize()` 会把连续空白折叠成一个空格（`StockInoutRequest` 等），
  而出货库存校验 `availableStockBranch/availableStockCentral` 按 `product_name` **逐字节**比对
  → 规范化后的名字匹配不到历史行 → 可用库存算成 0。（总库存/价格下拉用原样名字，所以"看得到、出不了"。）
  同一类隐患还有 3 个名字（净库存目前为 0，属未爆的雷）。
- 处理范围（只做**数据清洗**，不动查询代码 —— 查询端做空白兼容会让 `product_name` 索引失效、
  并掩盖数据漂移；写入端已经规范化，故按 9/24 SURUME IKA 的既定口径清历史）：
  - 新写一份覆盖全部空白变体、全部 16 张表的修复脚本（比 SURUME IKA 那份按名字写死的范围更大）
  - 在生产数据完整副本上验证：名字归一、库存/总额不变、出货校验由 0 → 1.000、可重复执行
- 白名单（只允许改这些）：
  - fix_name_whitespace_20260925.sql                               # 新增：数据修复脚本（放仓库根目录，database/ 在 .gitignore 里）
  - docs/tasks/2026-09-25-name-whitespace-cleanup.md                # 本登记文件
  - CHANGELOG.md                                                    # 只追加一条本任务记录
- 明确不碰：backend/**（含 mapper/XML 查询代码）、inventory-system/**（前端）、其它页面、
  backend/static/**、backend/target/*.jar
- 数据处理：脚本在本机生产副本上验证通过后，**由用户在生产执行**（需先 mysqldump 备份）
- 计划推送分支：main
- 验证记录（2026-09-25 本机，生产副本 `kunzz_deploy` 的完整拷贝 `kunzz_wsclean` 上实跑两遍）：
  - 修复前 16 张表异常名字共 146 行：stockinout 65、j1stockinout 13、j1/j2/j3stockedit 11+9+28、
    手机台账 1+1+11、主档 2、改价日志 1、三个总库存缓存各 1、最低库存 1
    （只有 `OZEKI…700ML` 净库存 ≠ 0；`HALF CUT NORI` DI 0024 的 j1 净库存 5.000 全部来自已软删的行，线上实为 0）
  - 修复后：异常名字全 0、HEX 类别扫描（NBSP/全角空格/零宽空格/BOM）全 0、4 个名字在各表残留 0
  - 出货校验（规范化名 + RM324）：**0.000 → 1.000**；价格下拉同值；总库存仍是**一行** `1.000 / RM 324.00`
  - 16 张表行数 before = after；四系统净库存/总额分文不变
    （central 6047.689 / 90821.77、J1 3341.766 / 32040.00、J2 2758.740 / 29788.27、J3 2815.748 / 47172.75）
  - 第二遍执行残留仍为 0（幂等）
- 上线动作（已执行）：服务器 curl 从 GitHub raw 取脚本（sha256 `b734f5f3…`）→ mysqldump 备份 →
  `sudo mysql u690174784_kunzz < fix_name_whitespace_20260925.sql` → 复核名字 42→41 字节 → 出货成功。
  教训：第一次「跑了却没用」是文件没上传到服务器（第 0 节全 0 = 库选错的指纹）；
  「原样名字互比」的 1.000 是假阳性，验证要按规范化后的口径（第 5 节 ③）。

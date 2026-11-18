# 任务 2026-11-18-vps-update-bat-crlf

- 状态：已完成（2026-11-18）
- 目标：修好双击 `kunzz-vps-update.bat` 的乱码报错，并把部署脚本入库（此前 .bat/.sh 都未入库，别的电脑拿不到）。
- 白名单：
  - kunzz-vps-update.bat
  - kunzz-vps-update.sh
  - docs/tasks/2026-11-18-vps-update-bat-crlf.md
- 明确不碰：backend/**、inventory-system/**、CHANGELOG.md、其它 .bat
- 计划推送分支：main

## 根因

工作区里的 .bat 是 LF 换行。cmd 读 LF 换行 + 多字节 UTF-8 中文的批处理时会算错行边界，
中文片段被当成命令执行（`'…' is not recognized`）。`.gitattributes` 已规定 `*.bat eol=crlf`，
但文件从未入库，规则没生效。

## 处理

- `kunzz-vps-update.bat`：只把 18 行换行改成 CRLF，内容逐字节不变。入库后由 `.gitattributes` 保证各机器签出都是 CRLF。
- `kunzz-vps-update.sh`：原样入库（LF，`*.sh eol=lf`）。不含密码/令牌，只有 VPS IP 与 root 用户名；登录仍需人工输密码。
- 顺带：`sync-live-data.bat`（已入库）工作区副本也是 LF + 中文，同样改回 CRLF；git 归一化后无内容差异，无需提交。
- 验证：用把「连 VPS」那行换成 `exit 1` 的副本跑，中文提示全部正常、0 报错；sync-live-data 只跑到「找不到文件」就退出，未触发任何数据库操作。

## 追加（同日）：验证段探测了已关闭的 8081

react-router 7 部署时 .bat 首次正确显示退出码，暴露出 `[失败]`：验证段写死 `127.0.0.1:8081`，
但 11-16 加固后后端在 `127.0.0.1:8082`（8081 原为 telegram-bot-api，已关）。直连永远 000，
限速自检 curl 连不上 → `set -euo pipefail` 中断整个远端脚本（后端日志与「完成」都没打印）。此前每次部署都在这里中断，只是没人看到退出码。

修复：按 `systemctl show -p MainPID` + `ss -ltnp` 找后端实际监听端口（找不到回退 8082）；探测失败只提示不中断。
本地验证：外层与远端 heredoc 均 `bash -n` 通过；端口识别 4 种情形（8082 / 换端口 / 服务未运行 / 进程号前缀误匹配）均正确，且不触发 set -e。

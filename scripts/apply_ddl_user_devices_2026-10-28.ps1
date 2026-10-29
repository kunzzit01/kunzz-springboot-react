# =============================================================================
# 建表：user_devices（「记住这台设备」，任务 2026-10-28-remember-device）
# PowerShell 版（Windows 直接跑，不需要 Git Bash）
#
# 用法（在 PowerShell 里，仓库根目录）：
#   powershell -ExecutionPolicy Bypass -File .\scripts\apply_ddl_user_devices_2026-10-28.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\apply_ddl_user_devices_2026-10-28.ps1 -DryRun
#   powershell -ExecutionPolicy Bypass -File .\scripts\apply_ddl_user_devices_2026-10-28.ps1 -Remote root@1.2.3.4
#
# 做的事：
#   1) scp add_new_tables_user_devices.sql + 同名 .sh 到远端 /tmp
#   2) ssh 上去：bash /tmp/kunzz_apply_ddl.sh --local --sql /tmp/kunzz_user_devices.sql
#      （以 root 登录时直接建表；非 root 账号由脚本内部 sudo，此时需要 -t 让 sudo 问密码）
#      （建表要 DDL 权限 → 远端用 root；应用账号 kunzz_app 只有 DML 权限）
#   3) 执行完删除远端临时文件；退出码透传（0 = 成功且校验通过）
#
# 前提：本机 ssh/scp 可用，且已经能免密登录（或会提示输入一次密码）。
# =============================================================================
[CmdletBinding()]
param(
    [string]$Remote = "root@187.127.125.136",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sql = Join-Path (Resolve-Path (Join-Path $here "..")).Path "add_new_tables_user_devices.sql"
$sh = Join-Path $here "apply_ddl_user_devices_2026-10-28.sh"

if (-not (Test-Path $sql)) { throw "找不到 SQL 文件：$sql" }
if (-not (Test-Path $sh)) { throw "找不到远端执行脚本：$sh" }

$remoteSql = "/tmp/kunzz_user_devices.sql"
$remoteSh = "/tmp/kunzz_apply_ddl.sh"

if ($DryRun) {
    Write-Host "[dry-run] scp `"$sql`" ${Remote}:${remoteSql}"
    Write-Host "[dry-run] scp `"$sh`" ${Remote}:${remoteSh}"
    Write-Host "[dry-run] ssh $Remote 'bash $remoteSh --local --sql $remoteSql'"
    exit 0
}

Write-Host "==> 目标服务器：$Remote"
Write-Host "==> 上传 SQL 与执行脚本到 /tmp"
scp -q "$sql" "${Remote}:${remoteSql}"
if ($LASTEXITCODE -ne 0) { throw "scp 失败（退出码 $LASTEXITCODE）——ssh/scp 能用吗？" }
scp -q "$sh" "${Remote}:${remoteSh}"
if ($LASTEXITCODE -ne 0) { throw "scp 失败（退出码 $LASTEXITCODE）" }

Write-Host "==> 远端执行（root 登录直接建表；非 root 会在服务器上用 sudo）"
ssh $Remote 'bash /tmp/kunzz_apply_ddl.sh --local --sql /tmp/kunzz_user_devices.sql'
$rc = $LASTEXITCODE

Write-Host "==> 清理远端临时文件"
ssh $Remote "rm -f $remoteSql $remoteSh" | Out-Null

if ($rc -ne 0) {
    Write-Host "✖ 建表失败（退出码 $rc），上面有远端输出" -ForegroundColor Red
    exit $rc
}
Write-Host "✅ user_devices 表已就绪" -ForegroundColor Green
Write-Host "   下一步：重启后端 systemctl restart inventory-backend"
exit 0

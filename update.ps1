# Kunzz 系统更新脚本：无需 git，直接从 GitHub main 分支拉取最新文件
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT
$RAW = 'https://raw.githubusercontent.com/kunzzit01/kunzz-springboot-react/main'

# 需要更新的文件清单（按需增减）
$files = @(
    'start.ps1',
    'backend/target/inventory-backend-1.0.0.jar',
    'docs/AI_ASSISTANT.md',
    'docs/ai-assistant-progress.md'
)

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    Kunzz 系统更新（无需 git）" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# 提醒：更新前最好关闭正在运行的系统
$pid8081 = $null
try {
    $conns = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
    if ($conns) { $pid8081 = ($conns | Select-Object -First 1).OwningProcess }
} catch {}
if ($pid8081) {
    Write-Host "  [..] 检测到系统正在运行，先停止..." -ForegroundColor Yellow
    Stop-Process -Id $pid8081 -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

$updated = 0
$failed = 0
foreach ($f in $files) {
    $dest = Join-Path $ROOT ($f -replace '/', '\')
    $url  = "$RAW/$f"
    Write-Host "  [..] 拉取 $f ..."
    if (Test-Path $dest) { Copy-Item $dest "$dest.bak" -Force }
    curl.exe -sL --fail --retry 3 --retry-delay 2 --max-time 3600 -o $dest $url
    if ($LASTEXITCODE -eq 0 -and (Test-Path $dest) -and (Get-Item $dest).Length -gt 10) {
        if (Test-Path "$dest.bak") { Remove-Item "$dest.bak" -Force }
        Write-Host "  [OK] $f" -ForegroundColor Green
        $updated++
    } else {
        if (Test-Path "$dest.bak") { Copy-Item "$dest.bak" $dest -Force; Remove-Item "$dest.bak" -Force }
        Write-Host "  [!!] $f 更新失败（网络问题），已保留原文件" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
if ($failed -eq 0) {
    Write-Host "  ✨ 更新完成（$updated 个文件）。请重新运行 一键启动.bat 使其生效。" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ 完成，但 $failed 个文件失败。请检查网络后重跑本脚本。" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  按回车键退出..."
Read-Host

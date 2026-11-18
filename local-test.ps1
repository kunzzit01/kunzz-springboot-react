# Kunzz 本地测试：本地数据库 + 后端(8081) + 前端开发服务器(5174，改代码保存即刷新)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT

function Test-PortOpen([int]$port) {
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect('127.0.0.1', $port); $c.Close(); return $true } catch { return $false }
}

$jar = Join-Path $ROOT 'backend\target\inventory-backend-1.0.0.jar'
$old = Join-Path $ROOT '_jar_backup_20260930\inventory-backend-1.0.0.jar'
if (-not (Test-Path $jar)) {
    if (Test-Path $old) {
        Write-Host '[提示] 本机没有后端 jar，使用 9-30 的旧包：只适合测前端改动，接口可能比线上旧。' -ForegroundColor Yellow
        New-Item -ItemType Directory -Force (Split-Path $jar) | Out-Null
        Copy-Item $old $jar
    } else { Write-Host '[错误] 找不到后端 jar' -ForegroundColor Red; Read-Host '按回车退出'; exit 1 }
}

if (-not (Test-PortOpen 8081)) {
    Write-Host '[1/2] 启动数据库 + 后端（新窗口，已跳过 AI 助手）...'
    $env:KUNZZ_SKIP_AI = '1'
    Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $ROOT 'start.ps1') -WorkingDirectory $ROOT
    Write-Host '      等待后端就绪(8081)，首次可能要一两分钟...'
    $ok = $false
    for ($i = 0; $i -lt 240; $i++) { if (Test-PortOpen 8081) { $ok = $true; break }; Start-Sleep 1 }
    if (-not $ok) { Write-Host '[错误] 后端没起来，请看「数据库+后端」那个窗口的报错。' -ForegroundColor Red; Read-Host '按回车退出'; exit 1 }
} else { Write-Host '[1/2] 后端已在运行，跳过' }

Write-Host '[2/2] 启动前端开发服务器...'
Set-Location (Join-Path $ROOT 'inventory-system\frontend')
if (-not (Test-Path 'node_modules')) { npm install }
Start-Job { Start-Sleep 4; Start-Process 'http://localhost:5174/' } | Out-Null
Write-Host ''
Write-Host '  本地测试页面： http://localhost:5174/    演示账号 demo / demo123' -ForegroundColor Green
Write-Host '  改了 src 里的代码，保存后浏览器自动刷新。关闭本窗口即停止前端。' -ForegroundColor Green
Write-Host ''
npm run dev

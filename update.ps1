# Kunzz 系统更新脚本 v2：无需 git，从 GitHub main 分支 zip 包一次性更新
# 覆盖：代码产物(jar/前端 static) + 数据包 + 启动脚本 + 全部文档
# 安全：白名单更新——绝不触碰本地数据库文件(runtime/)、上传文件(backend/data、uploads)、live 凭证
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT
$ZIP_URL = 'https://codeload.github.com/kunzzit01/kunzz-springboot-react/zip/refs/heads/main'
$TMP = Join-Path $env:TEMP ('kunzz_update_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    Kunzz 系统更新（无需 git）" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  说明：整包下载（约 90MB，含最新 jar + 前端页面 + 数据包 + 全部文档）" -ForegroundColor Gray
Write-Host "        数据包仅用于新装/重装自动导入；已装机器的业务数据请用 sync-live-stock.cjs 同步" -ForegroundColor Gray
Write-Host ""

# ---------- 更新前关闭正在运行的系统 ----------
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

try {
    # ---------- 1. 下载整包 ----------
    Write-Host "  [1/4] 下载最新代码包..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $TMP -Force | Out-Null
    $zip = Join-Path $TMP 'main.zip'
    curl.exe -sL --fail --retry 3 --retry-delay 2 --max-time 3600 -o $zip $ZIP_URL
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zip) -or (Get-Item $zip).Length -lt 1MB) {
        throw "下载失败（网络问题），本地文件未做任何改动"
    }

    # ---------- 2. 解压 ----------
    Write-Host "  [2/4] 解压..." -ForegroundColor Cyan
    tar.exe -xf $zip -C $TMP
    $src = Get-ChildItem $TMP -Directory | Select-Object -First 1
    if (-not $src) { throw "解压失败" }

    # ---------- 3. 白名单更新 ----------
    Write-Host "  [3/4] 更新文件..." -ForegroundColor Cyan
    $updated = 0
    function Copy-In([string]$rel) {
        $from = Join-Path $src.FullName $rel
        $to   = Join-Path $ROOT ($rel -replace '/', '\')
        if (Test-Path $from) {
            New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force | Out-Null
            Copy-Item $from $to -Recurse -Force
            $script:updated++
            Write-Host "    [OK] $rel" -ForegroundColor Green
        }
    }
    # 启动脚本
    Copy-In 'start.ps1'; Copy-In 'update.ps1'; Copy-In '一键启动.bat'; Copy-In '更新系统.bat'
    # 数据库补丁 + 数据包（新装/重装用；已装机器业务数据不受影响）
    Copy-In 'add_new_tables.sql'; Copy-In 'sync_cleanup.sql'
    Copy-In 'database/u690174784_kunzz.sql'
    # 文档
    Copy-In 'CHANGELOG.md'; Copy-In 'README.md'
    Copy-In 'docs'
    # 后端程序（含内嵌依赖，最新构建）
    Copy-In 'backend/target/inventory-backend-1.0.0.jar'
    # 前端页面（后端从磁盘伺服 backend/static，必须随更新走）
    $staticFrom = Join-Path $src.FullName 'backend/static'
    if (Test-Path $staticFrom) {
        $staticTo = Join-Path $ROOT 'backend/static'
        if (Test-Path $staticTo) { Remove-Item $staticTo -Recurse -Force }
        Copy-Item $staticFrom $staticTo -Recurse -Force
        $script:updated++
        Write-Host "    [OK] backend/static（前端页面）" -ForegroundColor Green
    }

    # ---------- 4. 收尾 ----------
    Write-Host "  [4/4] 清理临时文件..." -ForegroundColor Cyan
    Remove-Item $TMP -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ""
    if ($updated -gt 0) {
        Write-Host "  ✨ 更新完成（$updated 项）。请重新运行 一键启动.bat 使其生效。" -ForegroundColor Green
        Write-Host "     提醒：本次更新内容见 CHANGELOG.md 顶部日志。" -ForegroundColor Gray
    } else {
        Write-Host "  ⚠️ 没有任何文件被更新，请检查网络后重试。" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [!!] 更新失败: $($_.Exception.Message)" -ForegroundColor Red
    Remove-Item $TMP -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host ""
Write-Host "  按回车键退出..."
Read-Host

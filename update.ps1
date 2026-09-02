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
Write-Host "        更新完代码后可选择：是否用最新数据包替换本地数据库（导入前自动备份）" -ForegroundColor Gray
Write-Host "        只想增量补业务流水请改用 sync-live-stock.cjs（不覆盖本地新增数据）" -ForegroundColor Gray
Write-Host ""

# ---------- 数据库导入函数（最新数据包 → 本地库） ----------
function Import-LatestDatabase {
    $MDB = Join-Path $ROOT 'runtime\mariadb'
    $MYSQL  = Join-Path $MDB 'bin\mysql.exe'
    $DUMP   = Join-Path $MDB 'bin\mysqldump.exe'
    $PKG    = Join-Path $ROOT 'database\u690174784_kunzz.sql'
    $MYSQLD = Join-Path $MDB 'bin\mysqld.exe'
    # 数据目录：与 start.ps1 一致（已迁出 OneDrive）
    $MDB_DATA = 'C:\kunzz-mariadb-data'
    $MDB_DATA_LEGACY = Join-Path $ROOT 'runtime\mariadb-data'
    if (-not (Test-Path $MDB_DATA) -and (Test-Path $MDB_DATA_LEGACY)) { $MDB_DATA = $MDB_DATA_LEGACY }
    $BACKUP = Join-Path $ROOT 'database\backup'
    if (-not (Test-Path $MYSQL))  { throw "未找到内置 MariaDB（runtime\mariadb），请先跑过一次 一键启动.bat" }
    if (-not (Test-Path $PKG))    { throw "未找到数据包 database\u690174784_kunzz.sql" }

    Write-Host "  [..] 停止后端（导入期间不写库）..." -ForegroundColor Yellow
    try {
        $conns = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
        if ($conns) { Stop-Process -Id ($conns | Select-Object -First 1).OwningProcess -Force -ErrorAction SilentlyContinue }
        # 停掉运行中的 mysqld（导入前需独占）
        & (Join-Path $MDB 'bin\mysqladmin.exe') -u root shutdown 2>$null
        Start-Sleep -Seconds 3
    } catch {}

    # 重启 mysqld（与 start.ps1 同参数：时区 +08:00）
    Write-Host "  [..] 启动内置 MariaDB..." -ForegroundColor Cyan
    Start-Process $MYSQLD -ArgumentList "--datadir=$MDB_DATA", "--port=3306", "--default-time-zone=+08:00", "--console" `
        -RedirectStandardOutput (Join-Path $ROOT 'runtime\mysqld.out.log') `
        -RedirectStandardError  (Join-Path $ROOT 'runtime\mysqld.err.log') -WindowStyle Hidden
    Start-Sleep -Seconds 8

    # 备份当前库
    Write-Host "  [..] 备份当前数据库..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $BACKUP -Force | Out-Null
    $bk = Join-Path $BACKUP ("pre_update_" + (Get-Date -Format 'yyyyMMdd_HHmmss') + ".sql")
    & $DUMP -u root --quick u690174784_kunzz 2>$null | Out-File -FilePath $bk -Encoding utf8
    if ((Get-Item $bk).Length -lt 1KB) { Write-Host "    [!] 备份为空（可能当前无库），继续导入" -ForegroundColor Yellow }
    else { Write-Host "    [OK] 备份: $bk" -ForegroundColor Green }

    # 重建库 + 导入 + 补丁 + 清洗
    Write-Host "  [..] 重建库并导入最新数据包（约 1~2 分钟）..." -ForegroundColor Cyan
    & $MYSQL -u root -e "DROP DATABASE IF EXISTS u690174784_kunzz; CREATE DATABASE u690174784_kunzz CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
    Get-Content $PKG -Encoding UTF8 | & $MYSQL -u root --default-character-set=utf8mb4 u690174784_kunzz
    Get-Content (Join-Path $ROOT 'add_new_tables.sql') -Encoding UTF8 | & $MYSQL -u root u690174784_kunzz
    Get-Content (Join-Path $ROOT 'sync_cleanup.sql') -Encoding UTF8 | & $MYSQL -u root u690174784_kunzz

    # 验证
    $cnt = & $MYSQL -u root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='u690174784_kunzz'"
    if ([int]$cnt -lt 69) { throw "导入验证失败：仅 $cnt 张表（应 >= 69），请查看上方报错或用备份回滚" }
    Write-Host "  [OK] 数据库已更新为最新（$cnt 张表，含新系统结构补丁 + 数据清洗）" -ForegroundColor Green
    Write-Host "       回滚方法：mysql -u root < $($bk | Split-Path -Leaf)（在 database\backup\ 内）" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  按回车键退出..."
Read-Host

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

    # ---------- 4. 可选：导入最新数据库 ----------
    Write-Host ""
    Write-Host "  [4/5] 数据库更新" -ForegroundColor Cyan
    Write-Host "  是否用最新数据包（2026-09-02）替换本地数据库？" -ForegroundColor Yellow
    Write-Host "    · 导入前自动备份当前数据库到 database\backup\" -ForegroundColor Gray
    Write-Host "    · ⚠️ 会覆盖本地数据库！本地未同步的录入会丢失（如有请先跑 sync-live-stock.cjs --apply）" -ForegroundColor Gray
    Write-Host "    · 若本地只跑新系统、数据都在线上 live，选 Y 最省事" -ForegroundColor Gray
    $ans = Read-Host "  用最新数据包替换本地数据库? (Y=是 / N=否，回车默认N)"
    if ($ans -match '^[Yy]') {
        Import-LatestDatabase
    } else {
        Write-Host "  [跳过] 本地数据库保持不变（新装机器由 一键启动.bat 自动导入数据包）" -ForegroundColor Gray
    }

    # ---------- 5. 收尾 ----------
    Write-Host ""
    Write-Host "  [5/5] 清理临时文件..." -ForegroundColor Cyan
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

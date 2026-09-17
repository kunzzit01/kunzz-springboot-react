# Kunzz 系统更新脚本 v3：无需 git，从 GitHub main 分支 zip 包一次性更新
# 覆盖：代码产物(jar/前端 static) + 数据包 + 启动脚本 + 全部文档
# 安全：白名单更新——绝不触碰本地数据库文件(runtime/)、上传文件(backend/data、uploads)、live 凭证
#
# v3 修复（2026-09-17，针对"用户更新不到/更新后缺图片"）：
#   1) 解压改用 .NET ZipFile：Windows 自带 tar.exe 会静默跳过**全部中文文件名条目**
#      （实测 1062 条目里跳过 72 个：一键启动.bat、更新系统.bat、backend/static 下 48 个中文名图片），
#      而旧脚本不检查 tar 退出码，于是"更新完成"却缺文件；更糟的是 backend/static 先删后拷，
#      图片会被真的删掉。现改为解压后比对条目数，不齐即中止。
#   2) 本文件必须保存为 **UTF-8 with BOM**：PowerShell 5.1 对无 BOM 的 UTF-8 脚本按系统 ANSI
#      代码页解码，中文文件名会变乱码（一键启动.bat → ä¸€é”®å¯åŠ¨.bat），Test-Path 永远为假，
#      这两个文件就永远复制不过去。另存为时请保留 BOM。
#   3) 白名单齐全性校验：更新包缺必需文件时直接中止，绝不半更新。
#   4) 备份改用 mysqldump --result-file 直写文件：旧写法经 PowerShell 管道，
#      在非 UTF-8 控制台（如 ACP 1252）下会把中文产品名写坏，回滚文件等于废纸。
#   5) 自我覆盖保护：包内 update.ps1 版本号低于本机时不覆盖自己，避免"修复版被旧包回滚"，
#      这样单独把本文件拷给用户也能长期生效（不必等 GitHub 上的包更新）。
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT
$ZIP_URL = 'https://codeload.github.com/kunzzit01/kunzz-springboot-react/zip/refs/heads/main'
$TMP = Join-Path $env:TEMP ('kunzz_update_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))

# 更新包必需文件（缺一即中止，避免"更新完成"其实缺文件）
$REQUIRED = @(
    'start.ps1', 'update.ps1', '一键启动.bat', '更新系统.bat',
    'add_new_tables.sql', 'sync_cleanup.sql',
    'database/u690174784_kunzz.sql',
    'CHANGELOG.md', 'README.md', 'docs',
    'backend/target/inventory-backend-1.0.0.jar', 'backend/static'
)
# 可选文件（旧包可能没有；缺了只提示，不中止）
$OPTIONAL = @(
    'sync-live-data.bat', 'backup-data.ps1', 'inventory-system/frontend/sync-live-stock.cjs',
    'Git更新.bat', 'git-update.ps1'
)

# 读取更新脚本版本号（首行的 vN），用于防止更新器被旧包降级覆盖
function Get-UpdateScriptVersion([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    try {
        $first = Get-Content -LiteralPath $Path -TotalCount 1
        if ($first -match 'v(\d+)') { return [int]$Matches[1] }
    } catch {}
    return 0
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    Kunzz 系统更新（无需 git）" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  说明：整包下载（约 150MB，含最新 jar + 前端页面 + 数据包 + 全部文档）" -ForegroundColor Gray
Write-Host "        更新完代码后可选择：是否用最新数据包替换本地数据库（导入前自动备份）" -ForegroundColor Gray
Write-Host "        只想增量补业务流水请改用 inventory-system/frontend/sync-live-stock.cjs" -ForegroundColor Gray
Write-Host ""

# ---------- 解压（.NET；Windows 自带 tar.exe 会丢中文名文件） ----------
function Expand-UpdatePackage([string]$ZipPath, [string]$Dest) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $Dest) { Remove-Item -LiteralPath $Dest -Recurse -Force }
    New-Item -ItemType Directory -Path $Dest -Force | Out-Null
    try {
        [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $Dest)
    } catch {
        Write-Host "    [..] .NET 解压失败，改用 Expand-Archive 兜底：$($_.Exception.Message)" -ForegroundColor Yellow
        Expand-Archive -LiteralPath $ZipPath -DestinationPath $Dest -Force
    }
    # 完整性校验：压缩包内文件条目数 必须 = 解出的文件数（中文名条目最容易被静默丢弃）
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try { $expected = @($zip.Entries | Where-Object { $_.Name -ne '' }).Count } finally { $zip.Dispose() }
    $actual = @(Get-ChildItem -LiteralPath $Dest -Recurse -File -Force).Count
    if ($actual -lt $expected) {
        throw "解压不完整：压缩包 $expected 个文件，仅解出 $actual 个（磁盘空间不足或被安全软件拦截？）。已中止更新，本地文件未做任何改动"
    }
    Write-Host ("    [OK] 解压完成：{0} 个文件（含中文名资源）" -f $actual) -ForegroundColor Green
}

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

    # 等待 mysqld 就绪（InnoDB 恢复可能超过 8 秒；固定等待曾导致备份/导入在未就绪时静默失败）
    Write-Host "  [..] 等待数据库就绪（最多 120 秒）..." -ForegroundColor Cyan
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        & (Join-Path $MDB 'bin\mysqladmin.exe') -u root ping 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw "MariaDB 120 秒内未就绪（见 runtime\mysqld.err.log），已取消导入，本地数据库未做任何改动" }

    # 备份当前库（导入前唯一保险：必须确认备份有效，否则绝不动库）
    # 用 --result-file 让 mysqldump 直接落盘：避免经 PowerShell 管道在非 UTF-8 控制台
    # （本机 ACP 1252）下把中文产品名解码写坏，导致回滚文件不可用
    Write-Host "  [..] 备份当前数据库..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $BACKUP -Force | Out-Null
    $oldTables = & $MYSQL -u root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='u690174784_kunzz'" 2>$null
    if ($LASTEXITCODE -ne 0) { $oldTables = 0 }
    $bk = Join-Path $BACKUP ("pre_update_" + (Get-Date -Format 'yyyyMMdd_HHmmss') + ".sql")
    & $DUMP -u root --quick --default-character-set=utf8mb4 --result-file=(($bk) -replace '\\','/') u690174784_kunzz 2>$null
    if (-not (Test-Path -LiteralPath $bk) -or (Get-Item -LiteralPath $bk).Length -lt 1KB) {
        if ([int]$oldTables -gt 0) { throw "备份失败（mysqldump 未产出有效文件，但当前库有 $oldTables 张表）！已取消导入，本地数据库未做任何改动——请先解决备份问题再更新" }
        else { Write-Host "    [i] 当前无库（全新安装），跳过备份" -ForegroundColor Gray }
    } else { Write-Host ("    [OK] 备份: {0}（{1:N1} MB）" -f $bk, ((Get-Item -LiteralPath $bk).Length / 1MB)) -ForegroundColor Green }

    # 重建库 + 导入 + 补丁 + 清洗（每步校验退出码，失败立即中止并提示回滚）
    Write-Host "  [..] 重建库并导入最新数据包（约 1~2 分钟）..." -ForegroundColor Cyan
    & $MYSQL -u root -e "DROP DATABASE IF EXISTS u690174784_kunzz; CREATE DATABASE u690174784_kunzz CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
    if ($LASTEXITCODE -ne 0) { throw "重建数据库失败（退出码 $LASTEXITCODE），请用备份回滚：mysql -u root u690174784_kunzz < $($bk | Split-Path -Leaf)" }
    # 用 mysql source 导入（forward slash 路径；避免 PowerShell 管道逐行重编码 + 编码问题）
    $pkgSrc = ($PKG -replace '\\', '/')
    $patchSrc = ((Join-Path $ROOT 'add_new_tables.sql') -replace '\\', '/')
    $cleanSrc = ((Join-Path $ROOT 'sync_cleanup.sql') -replace '\\', '/')
    & $MYSQL -u root --default-character-set=utf8mb4 u690174784_kunzz -e "source $pkgSrc"
    if ($LASTEXITCODE -ne 0) { throw "导入数据包失败（退出码 $LASTEXITCODE），请用备份回滚：mysql -u root u690174784_kunzz < $($bk | Split-Path -Leaf)" }
    & $MYSQL -u root --default-character-set=utf8mb4 u690174784_kunzz -e "source $patchSrc"
    if ($LASTEXITCODE -ne 0) { throw "结构补丁失败（add_new_tables.sql，退出码 $LASTEXITCODE）" }
    & $MYSQL -u root --default-character-set=utf8mb4 u690174784_kunzz -e "source $cleanSrc"
    if ($LASTEXITCODE -ne 0) { throw "数据清洗失败（sync_cleanup.sql，退出码 $LASTEXITCODE）" }

    # 验证：表数 + 总库存核心表（stockinout_data / j1j2j3stockedit_data 缺一打开总库存就报错）
    $cnt = & $MYSQL -u root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='u690174784_kunzz'"
    if ([int]$cnt -lt 69) { throw "导入验证失败：仅 $cnt 张表（应 >= 69），请查看上方报错或用备份回滚" }
    foreach ($t in 'stockinout_data','j1stockedit_data','j2stockedit_data','j3stockedit_data') {
        & $MYSQL -u root -N -e "SELECT 1 FROM u690174784_kunzz.$t LIMIT 1" *> $null
        if ($LASTEXITCODE -ne 0) { throw "导入验证失败：核心表 $t 不可读，请用备份回滚：mysql -u root u690174784_kunzz < $($bk | Split-Path -Leaf)" }
    }
    Write-Host "  [OK] 数据库已更新为最新（$cnt 张表，含新系统结构补丁 + 数据清洗）" -ForegroundColor Green
    Write-Host "       回滚方法：mysql -u root < $($bk | Split-Path -Leaf)（在 database\backup\ 内）" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  按回车键开始更新..." -ForegroundColor Gray
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
    Write-Host "  [1/5] 下载最新代码包..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $TMP -Force | Out-Null
    $zip = Join-Path $TMP 'main.zip'
    curl.exe -sL --fail --retry 3 --retry-delay 2 --max-time 3600 -o $zip $ZIP_URL
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zip) -or (Get-Item $zip).Length -lt 1MB) {
        throw "下载失败（网络问题），本地文件未做任何改动"
    }

    # ---------- 2. 解压（含完整性校验） ----------
    Write-Host "  [2/5] 解压..." -ForegroundColor Cyan
    $ext = Join-Path $TMP 'pkg'
    Expand-UpdatePackage $zip $ext
    $src = Get-ChildItem -LiteralPath $ext -Directory | Select-Object -First 1
    if (-not $src) { throw "解压后未找到项目目录，已中止，本地文件未做任何改动" }

    # ---------- 3. 白名单更新 ----------
    Write-Host "  [3/5] 更新文件..." -ForegroundColor Cyan
    # 3a. 先校验更新包齐全（缺必需文件 → 中止，不做任何写入）
    $lack = @($REQUIRED | Where-Object { -not (Test-Path -LiteralPath (Join-Path $src.FullName $_)) })
    if ($lack.Count -gt 0) {
        throw ("更新包不完整，缺少必需文件: " + ($lack -join '、') + "。已中止，本地文件未做任何改动")
    }
    foreach ($o in $OPTIONAL) {
        if (-not (Test-Path -LiteralPath (Join-Path $src.FullName $o))) { Write-Host "    [i] 包内无 $o（跳过）" -ForegroundColor Gray }
    }

    # 3b. 复制（-LiteralPath：中文名/括号名不被当通配符；缺失不再静默跳过）
    $script:updated = 0
    $script:skipped = @()
    function Copy-In([string]$rel, [switch]$Optional) {
        $from = Join-Path $src.FullName ($rel -replace '/', '\')
        $to   = Join-Path $ROOT ($rel -replace '/', '\')
        if (-not (Test-Path -LiteralPath $from)) {
            # 可选文件缺失属正常（旧包没有），不算失败，也不进 skipped 汇总
            if (-not $Optional) {
                $script:skipped += $rel
                Write-Host "    [!!] 包内缺失，跳过: $rel" -ForegroundColor Yellow
            }
            return
        }
        New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $from $to -Recurse -Force
        $script:updated++
        Write-Host "    [OK] $rel" -ForegroundColor Green
    }
    # 启动脚本（update.ps1 单独判定：包内版本更低时不自我覆盖，避免修复版被旧包回滚）
    Copy-In 'start.ps1'; Copy-In '一键启动.bat'; Copy-In '更新系统.bat'
    $pkgVer  = Get-UpdateScriptVersion (Join-Path $src.FullName 'update.ps1')
    $selfVer = Get-UpdateScriptVersion (Join-Path $ROOT 'update.ps1')
    if ($pkgVer -lt $selfVer) {
        Write-Host ("    [i] 包内 update.ps1 为 v{0}，本机为 v{1}：跳过自我覆盖以免更新器降级（其余文件不受影响）" -f $pkgVer, $selfVer) -ForegroundColor Yellow
        Write-Host "        建议让维护方把新版 update.ps1 推到 GitHub，后续更新才能自动带上修复。" -ForegroundColor Gray
    } else {
        Copy-In 'update.ps1'
    }
    # 数据库补丁 + 数据包（新装/重装用；已装机器业务数据不受影响）
    Copy-In 'add_new_tables.sql'; Copy-In 'sync_cleanup.sql'
    Copy-In 'database/u690174784_kunzz.sql'
    # 文档
    Copy-In 'CHANGELOG.md'; Copy-In 'README.md'
    Copy-In 'docs'
    # 后端程序（含内嵌依赖，最新构建）
    Copy-In 'backend/target/inventory-backend-1.0.0.jar'
    # 数据同步工具（可选：按需覆盖脚本本体，不碰 live-credentials.json）
    Copy-In 'sync-live-data.bat' -Optional; Copy-In 'backup-data.ps1' -Optional
    Copy-In 'inventory-system/frontend/sync-live-stock.cjs' -Optional
    # Git 更新工具（可选：装了 Git 的机器可改用 Git更新.bat 走 git 增量更新）
    Copy-In 'Git更新.bat' -Optional; Copy-In 'git-update.ps1' -Optional
    # 前端页面（后端从磁盘伺服 backend/static，必须随更新走）
    $staticFrom = Join-Path $src.FullName 'backend\static'
    if (Test-Path -LiteralPath $staticFrom) {
        $nFrom = @(Get-ChildItem -LiteralPath $staticFrom -Recurse -File -Force).Count
        $staticTo = Join-Path $ROOT 'backend\static'
        $nTo = 0
        if (Test-Path -LiteralPath $staticTo) { $nTo = @(Get-ChildItem -LiteralPath $staticTo -Recurse -File -Force).Count }
        if ($nFrom -lt 1) { throw "更新包内 backend/static 为空，已中止（避免清空本地前端页面）" }
        if ($nFrom -lt $nTo) {
            Write-Host ("    [i] 包内前端文件数 {0} < 本地 {1}，若更新后页面缺图请跑 更新系统.bat 再来一次" -f $nFrom, $nTo) -ForegroundColor Yellow
        }
        if (Test-Path -LiteralPath $staticTo) { Remove-Item -LiteralPath $staticTo -Recurse -Force }
        Copy-Item -LiteralPath $staticFrom $staticTo -Recurse -Force
        $script:updated++
        Write-Host ("    [OK] backend/static（前端页面，{0} 个文件）" -f $nFrom) -ForegroundColor Green
    } else {
        $script:skipped += 'backend/static'
        Write-Host "    [!!] 包内缺失，跳过: backend/static" -ForegroundColor Yellow
    }

    # ---------- 4. 可选：导入最新数据库 ----------
    Write-Host ""
    Write-Host "  [4/5] 数据库更新" -ForegroundColor Cyan
    Write-Host "  是否用更新包内的最新数据包（database\u690174784_kunzz.sql）替换本地数据库？" -ForegroundColor Yellow
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
    if ($script:skipped.Count -gt 0) {
        Write-Host "  ⚠️ 有文件未能更新（见上方 [!!]）：$($script:skipped -join '、')" -ForegroundColor Yellow
    }
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

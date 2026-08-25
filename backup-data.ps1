# ============================================================
#  Kunzz 库存系统 - 备份当前数据（刷新数据包）
#  把"当前在用的数据库"（XAMPP 或内置便携库）完整导出，
#  覆盖更新 database/u690174784_kunzz.sql。
#  之后把整个文件夹复制给新电脑 = 带着最新数据走。
# ============================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT

$MDB      = Join-Path $ROOT 'runtime\mariadb'
$MYSQL    = Join-Path $MDB 'bin\mysql.exe'
$MYSQLDUMP= Join-Path $MDB 'bin\mysqldump.exe'
$DUMP_DIR = Join-Path $ROOT 'database'
$DUMP     = Join-Path $DUMP_DIR 'u690174784_kunzz.sql'
$DB_NAME  = 'u690174784_kunzz'
$PORT_DB  = 3306

function Wait-Enter([string]$msg = '') {
    # 设置环境变量 KUNZZ_AUTO_EXIT=1 可跳过交互等待（自动化测试用）
    if ($env:KUNZZ_AUTO_EXIT -eq '1') { return }
    if ($msg) { Write-Host $msg -ForegroundColor Yellow }
    Read-Host
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    Kunzz 库存系统 - 备份数据" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

try {
    # ---------- 1. 检查便携客户端 ----------
    if (-not (Test-Path $MYSQLDUMP) -or -not (Test-Path $MYSQL)) {
        Write-Host "  [!!] 缺少数据库客户端（runtime\mariadb）。" -ForegroundColor Red
        Write-Host "       请先双击「一键启动.bat」运行一次（会自动下载数据库）。" -ForegroundColor Yellow
        Wait-Enter "按回车退出"; exit 1
    }

    # ---------- 2. 探测当前在用的数据库 ----------
    Write-Host "  [..] 检测当前在用的数据库服务 (端口 $PORT_DB)..."
    $probe = & $MYSQL --ssl=0 -h 127.0.0.1 -P $PORT_DB -u root -N `
             -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'" 2>$null
    if ($LASTEXITCODE -ne 0 -or $null -eq $probe) {
        Write-Host "  [!!] 没有检测到可用的数据库。" -ForegroundColor Red
        Write-Host "       请先双击「一键启动.bat」启动系统，再回来备份。" -ForegroundColor Yellow
        Wait-Enter "按回车退出"; exit 1
    }
    if ([int]$probe -eq 0) {
        Write-Host "  [!!] 数据库 $DB_NAME 存在但没有数据（0 张表），无需备份。" -ForegroundColor Yellow
        Wait-Enter "按回车退出"; exit 1
    }
    Write-Host "  [OK] 检测到数据库 $DB_NAME（$probe 张表）" -ForegroundColor Green

    # ---------- 3. 保留上一次快照（历史备份，最多 5 份） ----------
    if (Test-Path $DUMP) {
        $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
        $hist = Join-Path $DUMP_DIR "backup_$ts.sql"
        Copy-Item $DUMP $hist
        Write-Host "  [..] 已保留上一次快照: $(Split-Path $hist -Leaf)"
        # 清理过旧的历史备份（只保留最近 1 份）
        Get-ChildItem (Join-Path $DUMP_DIR 'backup_*.sql') |
            Sort-Object LastWriteTime -Descending |
            Select-Object -Skip 1 |
            ForEach-Object { Remove-Item $_.FullName -Force }
    }

    # ---------- 4. 完整导出 ----------
    $oldSize = if (Test-Path $DUMP) { [math]::Round((Get-Item $DUMP).Length / 1MB) } else { 0 }
    Write-Host "  [..] 正在导出数据$($(if ($oldSize -gt 0) { "（旧数据包约 $oldSize MB）" } else { '' }))..."
    $tmp = Join-Path $DUMP_DIR 'u690174784_kunzz.sql.tmp'
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
    & cmd /c "`"$MYSQLDUMP`" --ssl=0 -h 127.0.0.1 -P $PORT_DB -u root --default-character-set=utf8mb4 --single-transaction --routines --triggers $DB_NAME > `"$tmp`" 2>nul"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmp)) {
        Write-Host "  [!!] 导出失败，请检查数据库是否正常。" -ForegroundColor Red
        Wait-Enter "按回车退出"; exit 1
    }

    # ---------- 5. 校验 + 修复排序规则 ----------
    $size = (Get-Item $tmp).Length
    $hasTable = Select-String -Path $tmp -Pattern 'CREATE TABLE' -Quiet
    if (-not $hasTable -or $size -lt 1MB) {
        Write-Host "  [!!] 导出内容异常（文件过小或缺少表结构），已中止，未覆盖数据包。" -ForegroundColor Red
        Remove-Item $tmp -Force
        Wait-Enter "按回车退出"; exit 1
    }
    # 若库的排序规则是 MariaDB 11.8 的 uca1400/0900（老线上库），转成 10.4 可识别的 unicode_ci
    $fixCollation = Select-String -Path $tmp -Pattern 'uca1400|0900_ai' -Quiet
    if ($fixCollation) {
        Write-Host "  [..] 检测到 uca1400/0900 排序规则，正在转换为 utf8mb4_unicode_ci..."
        $content = [System.IO.File]::ReadAllText($tmp)
        $content = $content.Replace('utf8mb4_uca1400_ai_ci', 'utf8mb4_unicode_ci').Replace('utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci')
        [System.IO.File]::WriteAllText($tmp, $content, (New-Object System.Text.UTF8Encoding($false)))
    }

    # ---------- 6. 覆盖正式数据包 ----------
    Move-Item $tmp $DUMP -Force
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "   ✅ 备份完成！" -ForegroundColor Green
    Write-Host "      数据包: database\u690174784_kunzz.sql ($([math]::Round((Get-Item $DUMP).Length/1MB)) MB, $probe 张表)" -ForegroundColor White
    Write-Host "      现在把整个文件夹复制给新电脑，新电脑将装到最新数据。" -ForegroundColor White
    Write-Host "  ============================================" -ForegroundColor Green
} catch {
    Write-Host "  [!!] 备份失败: $($_.Exception.Message)" -ForegroundColor Red
}
Wait-Enter ""

# ============================================================
#  Kunzz 库存系统 - 一键启动（免安装版）
#  新电脑零安装：绿色 JRE + 绿色 MariaDB + 后端自托管前端
#  首次运行自动下载/初始化，之后直接秒开
# ============================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT

# ---------- 配置 ----------
$JRE      = Join-Path $ROOT 'runtime\jre21'
$MDB_ZIP  = Join-Path $ROOT 'runtime\mariadb.zip'
$MDB      = Join-Path $ROOT 'runtime\mariadb'
$MDB_DATA = Join-Path $ROOT 'runtime\mariadb-data'
$JAR      = Join-Path $ROOT 'backend\target\inventory-backend-1.0.0.jar'
$DUMP     = Join-Path $ROOT 'database\u690174784_kunzz.sql'
$DB_NAME  = 'u690174784_kunzz'
$PORT_DB  = 3306
$PORT_API = 8081

$script:startedMdb = $false
$script:backendPid = $null

# ---------- 工具函数 ----------
function Test-PortOpen([int]$port) {
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect('127.0.0.1', $port); $c.Close(); return $true }
    catch { return $false }
}

function Wait-Port([int]$port, [int]$seconds, [string]$what) {
    for ($i = 0; $i -lt $seconds; $i++) {
        if (Test-PortOpen $port) {
            Write-Host "  [OK] $what 已就绪" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Wait-Enter([string]$msg = '') {
    # 设置环境变量 KUNZZ_AUTO_EXIT=1 可跳过交互等待（自动化测试用）
    if ($env:KUNZZ_AUTO_EXIT -eq '1') { return }
    if ($msg) { Write-Host $msg -ForegroundColor Yellow }
    Read-Host
}

function Run-Mysql([string]$sql) {
    # 返回结果（多行）；失败返回 $null
    $out = & "$MDB\bin\mysql.exe" --ssl=0 -h 127.0.0.1 -P $PORT_DB -u root -N -e $sql 2>$null
    if ($LASTEXITCODE -eq 0) { return $out } else { return $null }
}

function Import-Dump {
    Write-Host "  [..] 创建数据库并导入数据包 (约 $([math]::Round((Get-Item $DUMP).Length/1MB)) MB)..."
    & cmd /c "`"$MDB\bin\mysql.exe`" --ssl=0 -h 127.0.0.1 -P $PORT_DB -u root -e `"CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`""
    if ($LASTEXITCODE -ne 0) { throw "创建数据库失败" }
    & cmd /c "`"$MDB\bin\mysql.exe`" --ssl=0 -h 127.0.0.1 -P $PORT_DB -u root --default-character-set=utf8mb4 $DB_NAME < `"$DUMP`" 2>nul"
    if ($LASTEXITCODE -ne 0) { throw "导入数据失败" }
    Write-Host "  [OK] 数据导入完成" -ForegroundColor Green
}

function Get-JRE {
    if (Test-Path "$JRE\bin\java.exe") {
        Write-Host "  [OK] 已找到绿色 JRE 21" -ForegroundColor Green
        return
    }
    Write-Host "  [..] 未找到 JRE，正在下载 (约 48MB，首次运行仅一次)..."
    $zip = Join-Path $ROOT 'runtime\jre21.zip'
    curl.exe -L --progress-bar -o $zip "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk"
    if ($LASTEXITCODE -ne 0) { throw "JRE 下载失败，请检查网络后重试" }
    Write-Host "  [..] 解压 JRE..."
    $tmp = Join-Path $ROOT 'runtime\_jre'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    New-Item -ItemType Directory -Path $tmp | Out-Null
    tar.exe -xf $zip -C $tmp
    $d = Get-ChildItem $tmp -Directory | Select-Object -First 1
    Move-Item $d.FullName $JRE
    Remove-Item $tmp -Recurse -Force
    Remove-Item $zip -Force
    Write-Host "  [OK] JRE 就绪" -ForegroundColor Green
}

function Get-MariaDB {
    if (Test-Path "$MDB\bin\mysqld.exe") {
        Write-Host "  [OK] 已找到绿色 MariaDB" -ForegroundColor Green
        return
    }
    if (-not (Test-Path $MDB_ZIP)) {
        Write-Host "  [..] 未找到 MariaDB，正在下载 (约 75MB，首次运行仅一次)..."
        curl.exe -L --progress-bar -o $MDB_ZIP "https://archive.mariadb.org/mariadb-10.4.32/winx64-packages/mariadb-10.4.32-winx64.zip"
        if ($LASTEXITCODE -ne 0) { throw "MariaDB 下载失败，请检查网络后重试" }
    }
    Write-Host "  [..] 解压 MariaDB..."
    tar.exe -xf $MDB_ZIP -C (Join-Path $ROOT 'runtime')
    $d = Get-ChildItem (Join-Path $ROOT 'runtime') -Directory |
         Where-Object { $_.Name -like 'mariadb-*' -and $_.Name -ne 'mariadb' } |
         Select-Object -First 1
    if ($d) { Move-Item $d.FullName $MDB }
    if (-not (Test-Path "$MDB\bin\mysqld.exe")) { throw "MariaDB 解压失败" }
    Write-Host "  [OK] MariaDB 就绪" -ForegroundColor Green
}

# ---------- 准备数据库 ----------
function Prepare-Database {
    if (Test-PortOpen $PORT_DB) {
        # 端口被占用：尝试直接使用现有数据库服务（如 XAMPP）
        $probe = Run-Mysql "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$DB_NAME'"
        if ($null -eq $probe) {
            Write-Host "  [!!] 端口 $PORT_DB 已被占用，但无法用 root 空密码连接。" -ForegroundColor Yellow
            Write-Host "       若该数据库设置了密码，请修改 start.ps1 顶部数据库连接配置后重试。" -ForegroundColor Yellow
            Wait-Enter "按回车退出"; exit 1
        }
        Write-Host "  [OK] 检测到已有数据库服务 (端口 $PORT_DB)，直接复用" -ForegroundColor Green
        if ([int]$probe -eq 0) { Import-Dump }
        else {
            $tbl = Run-Mysql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'"
            Write-Host "  [OK] 数据库 $DB_NAME 已就绪 ($tbl 张表)" -ForegroundColor Green
        }
        return
    }

    # 端口空闲：使用内置绿色 MariaDB
    Get-MariaDB
    if (-not (Test-Path (Join-Path $MDB_DATA 'mysql'))) {
        Write-Host "  [..] 首次运行：初始化 MariaDB 数据目录..."
        # 10.4 为 mysql_install_db.exe，10.5+ 为 mariadb-install-db.exe
        if (Test-Path "$MDB\bin\mariadb-install-db.exe") {
            & "$MDB\bin\mariadb-install-db.exe" -d $MDB_DATA
        } else {
            & "$MDB\bin\mysql_install_db.exe" -d $MDB_DATA
        }
        if ($LASTEXITCODE -ne 0) { throw "MariaDB 数据目录初始化失败" }
    }
    Write-Host "  [..] 启动内置 MariaDB (端口 $PORT_DB)..."
    $p = Start-Process "$MDB\bin\mysqld.exe" `
         -ArgumentList "--datadir=$MDB_DATA", "--port=$PORT_DB", "--console" `
         -WindowStyle Hidden `
         -RedirectStandardOutput (Join-Path $ROOT 'runtime\mysqld.out.log') `
         -RedirectStandardError  (Join-Path $ROOT 'runtime\mysqld.err.log') `
         -PassThru
    $script:startedMdb = $true
    if (-not (Wait-Port $PORT_DB 60 "内置 MariaDB")) {
        Write-Host "  [!!] MariaDB 启动失败，请查看 runtime\mysqld.err.log" -ForegroundColor Red
        Wait-Enter "按回车退出"; exit 1
    }
    $tables = Run-Mysql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'"
    if ($null -eq $tables -or [int]$tables -eq 0) { Import-Dump }
    else { Write-Host "  [OK] 数据库 $DB_NAME 已就绪 ($tables 张表)" -ForegroundColor Green }
}

# ---------- 启动后端 ----------
function Start-Backend {
    if (Test-PortOpen $PORT_API) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$PORT_API/" -UseBasicParsing -TimeoutSec 5
            if ($resp.Content -match 'KUNZZ') {
                Write-Host "  [OK] 检测到后端已在运行，直接复用" -ForegroundColor Green
                return
            }
        } catch {}
        Write-Host "  [!!] 端口 $PORT_API 被其他程序占用，无法启动本系统后端" -ForegroundColor Red
        Wait-Enter "按回车退出"; exit 1
    }
    if (-not (Test-Path $JAR)) {
        Write-Host "  [!!] 缺少后端程序: $JAR" -ForegroundColor Red
        Wait-Enter "按回车退出"; exit 1
    }
    Write-Host "  [..] 启动后端服务 (http://localhost:$PORT_API)..."
    $p = Start-Process "$JRE\bin\java.exe" `
         -ArgumentList "-jar", "`"$JAR`"" `
         -WorkingDirectory (Join-Path $ROOT 'backend') `
         -WindowStyle Hidden `
         -RedirectStandardOutput (Join-Path $ROOT 'backend_run.log') `
         -RedirectStandardError  (Join-Path $ROOT 'backend_run.err.log') `
         -PassThru
    $script:backendPid = $p.Id
    if (-not (Wait-Port $PORT_API 60 "后端服务")) {
        Write-Host "  [!!] 后端启动失败，请查看 backend_run.log" -ForegroundColor Red
        Wait-Enter "按回车退出"; exit 1
    }
}

# ---------- 主流程 ----------
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    Kunzz 库存系统 - 一键启动" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue) -or
    -not (Get-Command tar.exe  -ErrorAction SilentlyContinue)) {
    Write-Host "  [!!] 需要 Windows 10/11（内置 curl/tar 命令）" -ForegroundColor Red
    Read-Host "按回车退出"; exit 1
}

try {
    Write-Host "  [1/3] 检查运行环境..."
    Get-JRE
    Write-Host ""
    Write-Host "  [2/3] 检查数据库..."
    Prepare-Database
    Write-Host ""
    Write-Host "  [3/3] 启动系统..."
    Start-Backend
} catch {
    Write-Host "  [!!] 启动失败: $($_.Exception.Message)" -ForegroundColor Red
    Wait-Enter "按回车退出"
    exit 1
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   ✨ 系统已启动！" -ForegroundColor Green
Write-Host "      后台管理:  http://localhost:$PORT_API" -ForegroundColor White
Write-Host "      演示账号:   demo / demo123" -ForegroundColor White
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  按回车键 或 直接关闭本窗口 即可退出并停止服务。" -ForegroundColor Yellow

Start-Process "http://localhost:$PORT_API"
Wait-Enter

# ---------- 退出清理 ----------
Write-Host "  正在停止服务..."
if ($script:backendPid) {
    Stop-Process -Id $script:backendPid -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] 后端已停止"
}
if ($script:startedMdb) {
    & "$MDB\bin\mysqladmin.exe" --ssl=0 -h 127.0.0.1 -P $PORT_DB -u root shutdown 2>$null
    Write-Host "  [OK] 数据库已停止"
}
Write-Host "  再见！"

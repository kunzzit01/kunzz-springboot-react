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
$OLLAMA   = Join-Path $ROOT 'runtime\ollama\ollama.exe'
$PORT_AI  = 11434
$OLLAMA_ZIP_URL = 'https://github.com/ollama/ollama/releases/download/v0.33.1/ollama-windows-amd64.zip'
$GGUF_URL       = 'https://huggingface.co/bartowski/Qwen_Qwen3-4B-GGUF/resolve/main/Qwen_Qwen3-4B-Q4_K_M.gguf'
$GGUF_LOCAL     = Join-Path $ROOT 'runtime\ollama\Qwen_Qwen3-4B-Q4_K_M.gguf'
$MODELFILE      = Join-Path $ROOT 'runtime\ollama\Modelfile'
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

function Get-UrlSize([string]$url) {
    $h = curl.exe -sIL --max-time 30 $url 2>$null
    foreach ($line in $h) { if ($line -match '(?i)^content-length:\s*(\d+)') { return [long]$Matches[1] } }
    return 0
}

# 并行分块下载（多线程叠加脱脱速网络；断点续传：未完块保留，重跑继续）
function Download-Parallel([string]$url, [string]$out, [int]$parts = 8) {
    $size = Get-UrlSize $url
    if ($size -le 0) { throw "无法获取文件大小: $url" }
    $dir = "$out.parts"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $chunk = [Math]::Ceiling($size / $parts)
    for ($pass = 1; $pass -le 3; $pass++) {
        $procs = @()
        for ($i = 0; $i -lt $parts; $i++) {
            $p = Join-Path $dir ("{0:D3}" -f $i)
            $start = $i * $chunk
            $end = [Math]::Min($start + $chunk - 1, $size - 1)
            if ($start -gt $end) { continue }
            $want = $end - $start + 1
            if ((Test-Path $p) -and ((Get-Item $p).Length -eq $want)) { continue }
            $procs += Start-Process curl.exe -ArgumentList @('-sL','--fail','--max-time','1800','-r',"$start-$end",'-o',"`"$p`"",$url) -PassThru -WindowStyle Hidden
        }
        if ($procs.Count -gt 0) { $procs | ForEach-Object { $_.WaitForExit() } }
        $missing = $false
        for ($i = 0; $i -lt $parts; $i++) {
            $p = Join-Path $dir ("{0:D3}" -f $i)
            $start = $i * $chunk
            $end = [Math]::Min($start + $chunk - 1, $size - 1)
            if ($start -gt $end) { continue }
            if (-not (Test-Path $p) -or (Get-Item $p).Length -ne ($end - $start + 1)) { $missing = $true }
        }
        if (-not $missing) { break }
        if ($pass -eq 3) { throw "分块下载失败（已重试 3 次）: $url（重跑脚本可断点续传）" }
    }
    $fs = [System.IO.File]::Open($out, 'Create')
    Get-ChildItem $dir | Sort-Object Name | ForEach-Object {
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
        $fs.Write($bytes, 0, $bytes.Length)
    }
    $fs.Close()
    if ((Get-Item $out).Length -ne $size) { throw "合并后大小不符: $out" }
    Remove-Item $dir -Recurse -Force
}

# 确保 Ollama 程序存在（缺失则并行下载 + 解压，约 1.4GB）
function Ensure-Ollama {
    if ($script:skipAi) { return }
    if (Test-Path $OLLAMA) { return }
    Write-Host "  [AI] 并行下载 Ollama (1.4GB, 8 线程)..."
    $zip = Join-Path $env:TEMP 'ollama-windows-amd64.zip'
    Download-Parallel $OLLAMA_ZIP_URL $zip 8
    Write-Host "  [AI] 解压到 runtime\ollama ..."
    Expand-Archive -Path $zip -DestinationPath (Join-Path $ROOT 'runtime\ollama') -Force
    Remove-Item $zip -Force
    if (-not (Test-Path $OLLAMA)) { throw "Ollama 解压失败" }
}

# 确保 kunzz-ai 模型已导入（缺失则并行下载 gguf 2.4GB + ollama create）
function Ensure-AiModel {
    if ($script:skipAi) { return }
    if (-not (Test-Path $OLLAMA)) { return }
    if (-not (Test-PortOpen $PORT_AI)) { return }  # 需 serve 已运行（Start-Ollama 在前）
    $models = (& $OLLAMA list 2>$null | Out-String)
    if ($models -match 'kunzz-ai') { return }
    Write-Host "  [AI] 并行下载 Qwen3-4B 模型 (2.4GB, 8 线程)..."
    Download-Parallel $GGUF_URL $GGUF_LOCAL 8
    Write-Host "  [AI] 导入模型 kunzz-ai ..."
    @"
FROM $($GGUF_LOCAL -replace '\\', '/')
PARAMETER temperature 0.6
PARAMETER top_p 0.95
PARAMETER top_k 20
PARAMETER num_ctx 3072
PARAMETER repeat_penalty 1.05
"@ | Set-Content -Path $MODELFILE -Encoding UTF8
    & $OLLAMA create kunzz-ai -f $MODELFILE 2>&1 | Out-Null
    Remove-Item $GGUF_LOCAL -Force  # 已导入 ollama 内部存储，释放 2.4GB
    $check = (& $OLLAMA list 2>$null | Out-String)
    if ($check -notmatch 'kunzz-ai') { throw "模型导入失败" }
    Write-Host "  [OK] AI 模型 kunzz-ai 已就绪" -ForegroundColor Green
}

# 启动本地 AI 服务（Ollama，若已在跑则跳过；模型未导入时仅提示不阻断）
function Start-Ollama {
    if (-not (Test-Path $OLLAMA)) {
        Write-Host "  [AI] 未找到 runtime\ollama\ollama.exe，AI 助手不可用（不影响其他功能）" -ForegroundColor Yellow
        return
    }
    if (Test-PortOpen $PORT_AI) {
        Write-Host "  [OK] AI 服务(Ollama)已在运行" -ForegroundColor Green
        return
    }
    Write-Host "  [..] 启动本地 AI 服务 (Ollama, 端口 $PORT_AI)..."
    $p = Start-Process $OLLAMA `
         -ArgumentList "serve" `
         -WorkingDirectory (Join-Path $ROOT 'runtime\ollama') `
         -WindowStyle Hidden `
         -PassThru
    $script:ollamaPid = $p.Id
    if (Wait-Port $PORT_AI 30 "AI 服务(Ollama)") {
        $models = & $OLLAMA list 2>$null
        if ($models -notmatch 'kunzz-ai') {
            Write-Host "  [AI] 提示：模型 kunzz-ai 未导入，聊天球会提示连接失败（导入方法见 docs/ai-assistant-progress.md）" -ForegroundColor Yellow
        }
    }
}

function Wait-Enter([string]$msg = '') {
    # 设置环境变量 KUNZZ_AUTO_EXIT=1 可跳过交互等待（自动化测试用）
    if ($env:KUNZZ_AUTO_EXIT -eq '1') { return }
    if ($msg) { Write-Host $msg -ForegroundColor Yellow }
    Read-Host
}

function Run-Mysql([string]$sql) {
    # 返回结果（多行）；失败返回 $null
    $out = & "$MDB\bin\mysql.exe" --ssl=0 --default-character-set=utf8mb4 -h 127.0.0.1 -P $PORT_DB -u root -N -e $sql 2>$null
    if ($LASTEXITCODE -eq 0) { return $out } else { return $null }
}

function Import-Dump {
    if (-not (Test-Path $DUMP)) {
        Write-Host "  [!!] 缺少数据库数据包: $DUMP" -ForegroundColor Red
        Write-Host "       请将 database/u690174784_kunzz.sql 放入此目录后重试。" -ForegroundColor Yellow
        Write-Host "       （该文件不包含在 GitHub 源码包中，需要单独提供）" -ForegroundColor Yellow
        Wait-Enter "按回车退出"; exit 1
    }
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
    # 从 GitHub 下载的源码包没有 runtime/ 目录，需先创建
    New-Item -ItemType Directory -Path (Join-Path $ROOT 'runtime') -Force | Out-Null
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
    # 从 GitHub 下载的源码包没有 runtime/ 目录，需先创建
    New-Item -ItemType Directory -Path (Join-Path $ROOT 'runtime') -Force | Out-Null
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
        # 固定数据库会话时区为 UTC+8（马来西亚），确保 CURRENT_TIMESTAMP 与老系统一致
        Run-Mysql "SET GLOBAL time_zone = '+08:00'" | Out-Null
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
    # 固定数据库时区为 UTC+8（马来西亚），确保 CURRENT_TIMESTAMP 默认值与老系统一致
    $p = Start-Process "$MDB\bin\mysqld.exe" `
         -ArgumentList "--datadir=$MDB_DATA", "--port=$PORT_DB", "--default-time-zone=+08:00", "--console" `
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

function Ensure-NewTables {
    # 新系统功能表（老库备份/数据包不含，导入后需补齐）
    $existing = Run-Mysql "SELECT GROUP_CONCAT(table_name) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name IN ('operation_logs','phone_records')"
    if ($existing -and $existing -match 'operation_logs' -and $existing -match 'phone_records') {
        Write-Host "  [OK] 新系统功能表已就绪 (operation_logs, phone_records)" -ForegroundColor Green
    } else {
        Write-Host "  [..] 补齐新系统功能表 (operation_logs, phone_records)..."
        Run-Mysql "CREATE TABLE IF NOT EXISTS $DB_NAME.operation_logs (\
          id int(11) NOT NULL AUTO_INCREMENT, operator varchar(100) DEFAULT NULL, action varchar(200) DEFAULT NULL, \
          target varchar(200) DEFAULT NULL, detail text DEFAULT NULL, created_at timestamp NULL DEFAULT current_timestamp(), \
          PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci" | Out-Null
        Run-Mysql "CREATE TABLE IF NOT EXISTS $DB_NAME.phone_records (\
          id int(11) NOT NULL AUTO_INCREMENT, employee_id int(11) DEFAULT NULL, record_date date DEFAULT NULL, \
          get_checked tinyint(1) DEFAULT 0, start_time varchar(10) DEFAULT NULL, end_time varchar(10) DEFAULT NULL, \
          return_checked tinyint(1) DEFAULT 0, restaurant varchar(10) DEFAULT NULL, \
          created_at timestamp NULL DEFAULT current_timestamp(), updated_at timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(), \
          PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci" | Out-Null
        $chk = Run-Mysql "SELECT GROUP_CONCAT(table_name) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name IN ('operation_logs','phone_records')"
        if (-not $chk -or $chk -notmatch 'operation_logs' -or $chk -notmatch 'phone_records') {
            throw "新系统功能表创建失败"
        }
        Write-Host "  [OK] 新系统功能表已补齐" -ForegroundColor Green
    }

    # 货品种类默认单价列 stock_data.price（2026-08-26 新增，进货自动抓取单价来源）
    $hasPrice = Run-Mysql "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='$DB_NAME' AND table_name='stock_data' AND column_name='price'"
    if ($hasPrice -and [int]$hasPrice -gt 0) {
        Write-Host "  [OK] stock_data.price 默认单价列已就绪" -ForegroundColor Green
    } else {
        Write-Host "  [..] 补齐 stock_data.price 默认单价列..."
        Run-Mysql "ALTER TABLE $DB_NAME.stock_data ADD COLUMN price DECIMAL(10,3) NULL DEFAULT NULL AFTER specification" | Out-Null
        $chk2 = Run-Mysql "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='$DB_NAME' AND table_name='stock_data' AND column_name='price'"
        if (-not $chk2 -or [int]$chk2 -le 0) {
            throw "stock_data.price 列添加失败"
        }
        Write-Host "  [OK] stock_data.price 默认单价列已补齐" -ForegroundColor Green
    }

    # 最低库存设置分系统独立 stock_minimum_settings.stock_system（中央设置不影响分店低库存通知）
    $hasMinSys = Run-Mysql "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='$DB_NAME' AND table_name='stock_minimum_settings' AND column_name='stock_system'"
    if ($hasMinSys -and [int]$hasMinSys -gt 0) {
        Write-Host "  [OK] stock_minimum_settings.stock_system 分系统列已就绪" -ForegroundColor Green
    } else {
        Write-Host "  [..] 升级最低库存设置为分系统独立 (stock_system)..."
        Run-Mysql "ALTER TABLE $DB_NAME.stock_minimum_settings ADD COLUMN stock_system VARCHAR(20) NOT NULL DEFAULT 'central' COMMENT 'system: central/j1/j2/j3' AFTER id" | Out-Null
        Run-Mysql "ALTER TABLE $DB_NAME.stock_minimum_settings DROP INDEX IF EXISTS unique_product, ADD UNIQUE KEY unique_system_product (stock_system, product_name)" | Out-Null
        $chkMin = Run-Mysql "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='$DB_NAME' AND table_name='stock_minimum_settings' AND column_name='stock_system'"
        if (-not $chkMin -or [int]$chkMin -le 0) {
            throw "stock_minimum_settings.stock_system 列添加失败"
        }
        Write-Host "  [OK] 最低库存设置已升级为分系统独立（旧设置归入中央）" -ForegroundColor Green
    }
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
        # 端口被占用：若占用方是本系统的旧后端进程（java + inventory-backend jar），自动终止后重启
        $stale = Get-CimInstance Win32_Process -Filter "Name='java.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match 'inventory-backend.*\.jar' }
        if ($stale) {
            $stale | ForEach-Object {
                Write-Host "  [..] 检测到旧的后端进程 (PID $($_.ProcessId))，自动重启以加载最新版本..."
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 2
        }
        if (Test-PortOpen $PORT_API) {
            Write-Host "  [!!] 端口 $PORT_API 被其他程序占用，无法启动本系统后端" -ForegroundColor Red
            Wait-Enter "按回车退出"; exit 1
        }
    }
    if (-not (Test-Path $JAR)) {
        # 从 GitHub 源码包下载时没有 target/，自动下载 Release 中的 jar
        New-Item -ItemType Directory -Path (Split-Path $JAR) -Force | Out-Null
        Write-Host "  [..] 未找到后端程序，正在从 GitHub Release 下载 (约 71MB，仅首次)..."
        # --fail: HTTP 404/500 时不把错误页存成文件
        curl.exe --fail -L --progress-bar -o $JAR "https://github.com/kunzzit01/kunzz-springboot-react/releases/download/v1.0.1/inventory-backend-1.0.0.jar"
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $JAR) -or (Get-Item $JAR).Length -lt 1MB) {
            Write-Host "  [!!] jar 下载失败，请检查网络后重试" -ForegroundColor Red
            Write-Host "       也可手动下载后放入: $JAR" -ForegroundColor Yellow
            Write-Host "       https://github.com/kunzzit01/kunzz-springboot-react/releases/tag/v1.0.1" -ForegroundColor Yellow
            Wait-Enter "按回车退出"; exit 1
        }
        Write-Host "  [OK] 后端程序就绪" -ForegroundColor Green
    }
    Write-Host "  [..] 启动后端服务 (http://localhost:$PORT_API)..."
    $p = Start-Process "$JRE\bin\java.exe" `
         -ArgumentList "-Duser.timezone=GMT+8", "-jar", "`"$JAR`"" `
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
    Ensure-NewTables
    Write-Host ""
    Write-Host "  [3/3] 启动系统..."
    # AI 服务可选：首次需下载约 3.9GB（Ollama 1.4GB + 模型 2.4GB）
    $script:skipAi = ($env:KUNZZ_SKIP_AI -eq '1')
    if (-not $script:skipAi -and -not (Test-Path $OLLAMA)) {
        Write-Host ""
        Write-Host "  [AI] 首次使用 AI 助手需下载 Ollama(1.4GB) + 模型(2.4GB)，约 5-30 分钟（视网速）" -ForegroundColor Cyan
        $ans = Read-Host "       现在下载吗？(Y=下载 / S=本次跳过，AI 助手不可用)"
        if ($ans -match '^[sS]') { $script:skipAi = $true }
    }
    Ensure-Ollama
    Start-Ollama
    Ensure-AiModel
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
if ($script:ollamaPid) {
    Stop-Process -Id $script:ollamaPid -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] AI 服务已停止"
}
if ($script:backendPid) {
    Stop-Process -Id $script:backendPid -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] 后端已停止"
}
if ($script:startedMdb) {
    & "$MDB\bin\mysqladmin.exe" --ssl=0 -h 127.0.0.1 -P $PORT_DB -u root shutdown 2>$null
    Write-Host "  [OK] 数据库已停止"
}
Write-Host "  再见！"

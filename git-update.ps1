# Kunzz 系统 —— 用 Git 更新到最新代码（v1，2026-09-17）
# 用法：双击同目录的「Git更新.bat」
#
# 它做什么：
#   · 首次运行：把当前安装文件夹接入 GitHub 仓库（git init + remote + fetch + 对齐 main）
#   · 以后运行：等同于 git pull，只下载变化的部分（比每次下整包省流量）
#   · 本地若改过仓库里的文件：先把差异导出到 本地改动备份_<时间>.patch 和 更新前差异清单_<时间>.txt，
#     再对齐到最新代码——绝不静默丢弃你的改动
#   · 未跟踪的文件一律不动：runtime\、backend\data\（上传的图片）、live-credentials.json、日志等
#
# 维护提示：本文件必须保存为 UTF-8 with BOM。PowerShell 5.1 会把无 BOM 的 UTF-8 脚本
# 按系统 ANSI 代码页解码，中文会变乱码甚至直接解析失败（参见 update.ps1 的同类修复）。
$ErrorActionPreference = 'Continue'   # git 会把进度/提示写到 stderr，不能当成终止错误
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT
$REPO_URL = 'https://github.com/kunzzit01/kunzz-springboot-react.git'
$BRANCH   = 'main'

function Pause-Exit([int]$code) {
    Write-Host ""
    Write-Host "  按回车键退出..." -ForegroundColor Gray
    Read-Host
    exit $code
}

Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "    Kunzz 系统 —— Git 方式更新到最新代码" -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 0. 检查 Git ----------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  [!!] 这台电脑没有安装 Git，无法用这种方式更新。" -ForegroundColor Red
    Write-Host ""
    Write-Host "  两种解决办法（任选其一）：" -ForegroundColor Yellow
    Write-Host "   1) 安装 Git for Windows（约 60MB，一路点“下一步”即可）：" -ForegroundColor Gray
    Write-Host "      https://git-scm.com/download/win" -ForegroundColor Gray
    Write-Host "      装完后重新双击本文件（Git更新.bat）。" -ForegroundColor Gray
    Write-Host "   2) 改用离线更新包：把包里的文件复制覆盖到本文件夹（做法见包内 更新说明.txt）。" -ForegroundColor Gray
    Pause-Exit 1
}
$gitVer = (git --version) -join ''
Write-Host ("  [OK] Git 已安装：{0}" -f $gitVer) -ForegroundColor Green

# ---------- 1. 停止运行中的系统（否则 jar 被占用，文件换不掉） ----------
$listen = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
if ($listen) {
    Write-Host "  [..] 检测到系统正在运行，先停止..." -ForegroundColor Yellow
    Stop-Process -Id ($listen | Select-Object -First 1).OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# ---------- 2. 接入仓库（首次） ----------
$firstTime = -not (Test-Path (Join-Path $ROOT '.git'))
if ($firstTime) {
    Write-Host "  [1/4] 首次运行：把当前文件夹接入 GitHub 仓库..." -ForegroundColor Cyan
    git init -b $BRANCH 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # 老版本 git 不支持 init -b
        git init 2>&1 | Out-Null
        git symbolic-ref HEAD ("refs/heads/" + $BRANCH) 2>&1 | Out-Null
    }
} else {
    Write-Host "  [1/4] 检测到已经是 Git 仓库，直接更新..." -ForegroundColor Cyan
}
$remotes = @(git remote 2>$null)
if ($remotes -contains 'origin') {
    git remote set-url origin $REPO_URL 2>&1 | Out-Null
} else {
    git remote add origin $REPO_URL 2>&1 | Out-Null
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [!!] 配置远程仓库地址失败（origin）。" -ForegroundColor Red
    Pause-Exit 1
}

# ---------- 3. 拉取最新代码 ----------
Write-Host "  [2/4] 从 GitHub 下载最新代码（首次约 90~150MB；之后只下载变化部分）..." -ForegroundColor Cyan
git fetch origin $BRANCH --depth=1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [!!] 下载失败（网络问题）。本文件夹未做任何改动，请检查网络后重试。" -ForegroundColor Red
    Pause-Exit 1
}

# ---------- 防撞：本地有未推送的提交时，绝不 reset --hard ----------
# reset --hard 会把本地 $BRANCH 退到 origin/$BRANCH：本地已提交但未推送的提交会被从分支上
# 摘掉（只剩 reflog 能捞）。部署机 / 普通使用者的 $BRANCH 永远与 origin 一致，下面不会触发；
# 只有开发机上还有 task 没推送时才会中止。此检查位于任何 reset 之前，中止时未做任何改动。
$localHead  = @(git rev-parse --verify $BRANCH 2>$null)[0]
$remoteHead = @(git rev-parse --verify ("origin/" + $BRANCH) 2>$null)[0]
if ($localHead -and $remoteHead -and ($localHead -ne $remoteHead)) {
    git merge-base --is-ancestor ("origin/" + $BRANCH) $BRANCH 2>$null
    if ($LASTEXITCODE -eq 0) {
        $aheadList = @(git rev-list --count ("origin/" + $BRANCH + ".." + $BRANCH) 2>$null)
        $aheadText = if ($aheadList.Count -gt 0 -and $aheadList[0]) { $aheadList[0].ToString() } else { "若干" }
        Write-Host ""
        Write-Host ("  [!!] 本机有 {0} 个提交还没推送到 origin/{1}，已中止更新，未做任何改动。" -f $aheadText, $BRANCH) -ForegroundColor Red
        Write-Host "       继续执行「对齐到最新代码」会把这些提交从本地分支上摘掉（只剩 reflog 能捞）。" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "       正在开发的电脑：先推送 / 整合，再更新" -ForegroundColor Gray
        Write-Host ("         git fetch origin {0}" -f $BRANCH) -ForegroundColor Gray
        Write-Host ("         git pull --rebase origin {0}" -f $BRANCH) -ForegroundColor Gray
        Write-Host ("         git push origin {0}" -f $BRANCH) -ForegroundColor Gray
        Write-Host ""
        Write-Host "       确实要放弃这些提交（危险）：先 git log --oneline 记下哈希，再手动执行" -ForegroundColor Gray
        Write-Host ("         git reset --hard origin/{0}" -f $BRANCH) -ForegroundColor Gray
        Pause-Exit 1
    }
}

# ---------- 4. 备份本地改动 → 对齐到最新 ----------
# 先把索引对齐到 origin/main（不动工作区），这样就能看清本机与最新代码的差异
git reset -q --mixed ("origin/" + $BRANCH)
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [!!] 无法定位最新代码（origin/$BRANCH）。" -ForegroundColor Red
    Pause-Exit 1
}

$ts      = Get-Date -Format 'yyyyMMdd_HHmmss'
$listTxt = Join-Path $ROOT ("更新前差异清单_" + $ts + ".txt")
$patch   = Join-Path $ROOT ("本地改动备份_" + $ts + ".patch")
# 只统计「已跟踪文件」的差异：未跟踪文件（runtime\、backend\data\、日志、凭证等）
# 不会被 reset --hard 改动，不该算成差异，否则每次运行都会生成一堆无用备份
$statusLines = @(git -c core.quotepath=false status --porcelain)
$tracked   = @($statusLines | Where-Object { -not $_.StartsWith('??') })
$untracked = @($statusLines | Where-Object { $_.StartsWith('??') })

if ($tracked.Count -gt 0) {
    $tracked -join "`r`n" | Out-File -FilePath $listTxt -Encoding utf8
    # 备份可文本恢复的改动；只排除 jar 与 22MB 的数据包 database\*.sql（手写的 add_new_tables.sql 等要照常备份，否则改动会无声消失）
    $patchText = (git diff --binary -- . ':(exclude)*.jar' ':(exclude)database/*.sql') -join "`r`n"
    if ($patchText.Trim().Length -gt 0) { $patchText | Out-File -FilePath $patch -Encoding utf8 }
    Write-Host ("  [i] 本机有 {0} 个仓库内文件与最新代码不同（首次接入时旧版本文件都会算进来，属正常）：" -f $tracked.Count) -ForegroundColor Yellow
    Write-Host ("      差异清单：{0}" -f (Split-Path $listTxt -Leaf)) -ForegroundColor Gray
    if (Test-Path -LiteralPath $patch) { Write-Host ("      文本改动备份：{0}" -f (Split-Path $patch -Leaf)) -ForegroundColor Gray }
    if ($untracked.Count -gt 0) { Write-Host ("      另有 {0} 个未跟踪文件（runtime\、backend\data\、日志、凭证等），不会被改动" -f $untracked.Count) -ForegroundColor Gray }
} else {
    Write-Host "  [OK] 本机文件与仓库一致，无需备份。" -ForegroundColor Green
    if ($untracked.Count -gt 0) { Write-Host ("      （另有 {0} 个未跟踪文件，不受影响）" -f $untracked.Count) -ForegroundColor Gray }
}

Write-Host "  [3/4] 对齐到最新代码..." -ForegroundColor Cyan
git reset -q --hard ("origin/" + $BRANCH)
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [!!] 对齐最新代码失败。请把本窗口内容截图发回排查。" -ForegroundColor Red
    Pause-Exit 1
}
git branch --set-upstream-to ("origin/" + $BRANCH) $BRANCH 2>&1 | Out-Null

# ---------- 5. 校验 ----------
Write-Host "  [4/4] 校验..." -ForegroundColor Cyan
$head   = (git log -1 --format="%h  %cd" --date=short) -join ''
$jar    = Join-Path $ROOT 'backend\target\inventory-backend-1.0.0.jar'
$static = Join-Path $ROOT 'backend\static'
$nStatic = 0
if (Test-Path -LiteralPath $static) { $nStatic = @(Get-ChildItem -LiteralPath $static -Recurse -File -Force).Count }
$nJarMB = 0
if (Test-Path -LiteralPath $jar) { $nJarMB = [math]::Round((Get-Item -LiteralPath $jar).Length / 1MB, 1) }

Write-Host ("      最新提交 : {0}" -f $head) -ForegroundColor Gray
Write-Host ("      后端程序 : {0} MB" -f $nJarMB) -ForegroundColor Gray
Write-Host ("      前端页面 : {0} 个文件" -f $nStatic) -ForegroundColor Gray

if (-not (Test-Path -LiteralPath $jar) -or $nStatic -lt 90) {
    Write-Host ""
    Write-Host "  [!!] 校验不通过：关键文件缺失，请把本窗口截图发回排查。" -ForegroundColor Red
    Pause-Exit 1
}

Write-Host ""
Write-Host "  ✔ 已更新到最新代码。" -ForegroundColor Green
Write-Host "    下一步：双击「一键启动.bat」启动系统。" -ForegroundColor Gray
Write-Host "    如需同时把本地数据换成最新线上数据：双击「更新系统.bat」，" -ForegroundColor Gray
Write-Host "    问「是否用最新数据包替换本地数据库」时输入 Y（会先自动备份数据库）。" -ForegroundColor Gray
Write-Host ""
Write-Host "    以后要更新，直接再双击一次本文件（Git更新.bat）即可。" -ForegroundColor Gray
Pause-Exit 0

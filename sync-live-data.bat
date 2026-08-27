@echo off
chcp 65001 >nul
title Sync Live Data (导入线上数据到本地)
setlocal EnableDelayedExpansion

rem ============================================================
rem 一键同步线上数据到本地（用法）：
rem   双击运行后拖入 dump 文件，或命令行：sync-live-data.bat "路径\dump.sql"
rem 流程：备份 → 修复排序规则 → 重建库导入 → 清洗 → 验证 → 重启后端
rem ============================================================

set "MYSQL=C:\xampp\mysql\bin\mysql.exe"
set "MYSQLDUMP=C:\xampp\mysql\bin\mysqldump.exe"
set "ROOT=%~dp0"
set "DUMP=%~1"

if "%DUMP%"=="" (
    echo 用法: sync-live-data.bat "C:\path\to\u690174784_kunzz.sql"
    echo 或直接把这个 bat 文件拖到命令行。
    echo.
    set /p DUMP="请输入 dump 文件完整路径: "
)
if not exist "%DUMP%" (
    echo [错误] 找不到文件: %DUMP%
    pause & exit /b 1
)

rem 时间戳（备份文件名）
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i

echo.
echo ============================================================
echo  [1/6] 备份当前数据库...
echo ============================================================
"%MYSQLDUMP%" -u root u690174784_kunzz > "%ROOT%backup_before_sync_%TS%.sql" 2>nul
if errorlevel 1 ( echo [错误] 备份失败 & pause & exit /b 1 )
echo  已备份: backup_before_sync_%TS%.sql

echo.
echo ============================================================
echo  [2/6] 修复排序规则 (uca1400/0900 -> unicode_ci)...
echo ============================================================
powershell -NoProfile -Command "$c = Get-Content -Raw -Encoding UTF8 '%DUMP%'; $c = $c -replace 'utf8mb4_uca1400_ai_ci','utf8mb4_unicode_ci' -replace 'utf8mb4_0900_ai_ci','utf8mb4_unicode_ci'; Set-Content -Encoding UTF8 '%ROOT%fixed_dump.sql' $c"
if errorlevel 1 ( echo [错误] 修复失败 & pause & exit /b 1 )
echo  已生成: fixed_dump.sql

echo.
echo ============================================================
echo  [3/6] 停止后端 (若在运行)...
echo ============================================================
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | Where-Object { $_.CommandLine -like '*inventory-backend*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Output ('已停止 PID ' + $_.ProcessId) }"
timeout /t 2 /nobreak >nul

echo.
echo ============================================================
echo  [4/6] 重建数据库并导入 (约1-2分钟)...
echo ============================================================
"%MYSQL%" -u root -e "DROP DATABASE IF EXISTS u690174784_kunzz; CREATE DATABASE u690174784_kunzz CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
if errorlevel 1 ( echo [错误] 重建数据库失败 & pause & exit /b 1 )
"%MYSQL%" -u root --default-character-set=utf8mb4 u690174784_kunzz < "%ROOT%fixed_dump.sql"
if errorlevel 1 ( echo [错误] 导入失败，请检查 fixed_dump.sql & pause & exit /b 1 )

echo.
echo ============================================================
echo  [4.5/6] 补建新系统结构 (operation_logs/phone_records/stock_data.price/stock_system)...
echo ============================================================
rem 最新线上 dump 不含新系统依赖的结构，导入后必须执行补丁（幂等）：
rem  - stock_minimum_settings.stock_system（最低库存分系统独立，2026-08-27 新增；线上还是旧结构，每次都要补）
if exist "%ROOT%add_new_tables.sql" (
    "%MYSQL%" -u root --default-character-set=utf8mb4 < "%ROOT%add_new_tables.sql"
    if errorlevel 1 ( echo [警告] 结构补丁有报错，请查看上方输出 & pause & exit /b 1 )
    echo  [OK] 结构补丁已执行
) else (
    echo  [!!] 未找到 add_new_tables.sql，跳过结构补丁！最低库存分系统等结构将缺失
)

echo.
echo ============================================================
echo  [5/6] 清洗数据 (HTML实体/最低库存/gender)...
echo ============================================================
"%MYSQL%" -u root --default-character-set=utf8mb4 u690174784_kunzz < "%ROOT%sync_cleanup.sql"
if errorlevel 1 ( echo [警告] 清洗脚本有报错，请查看上方输出 & pause & exit /b 1 )

echo.
echo ============================================================
echo  [6/6] 验证...
echo ============================================================
echo  表数量 (应为 67):
"%MYSQL%" -u root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='u690174784_kunzz'"
echo.
echo  残留编码产品名 - 中央表 (应为 0):
"%MYSQL%" -u root -N -e "SELECT COUNT(*) FROM stockinout_data WHERE product_name LIKE '%%&#%%' OR product_name LIKE '%%&amp;%%'"
echo.
echo  残留编码产品名 - 全部库存表 (应为 0):
"%MYSQL%" -u root -N -e "SELECT (SELECT COUNT(*) FROM stockinout_data WHERE product_name LIKE '%%&#%%' OR product_name LIKE '%%&amp;%%') + (SELECT COUNT(*) FROM j1stockedit_data WHERE product_name LIKE '%%&#%%' OR product_name LIKE '%%&amp;%%') + (SELECT COUNT(*) FROM j2stockedit_data WHERE product_name LIKE '%%&#%%' OR product_name LIKE '%%&amp;%%') + (SELECT COUNT(*) FROM j3stockedit_data WHERE product_name LIKE '%%&#%%' OR product_name LIKE '%%&amp;%%') + (SELECT COUNT(*) FROM stock_minimum_settings WHERE product_name LIKE '%%&#%%' OR product_name LIKE '%%&amp;%%') + (SELECT COUNT(*) FROM stock_data WHERE product_name LIKE '%%&#%%' OR product_name LIKE '%%&amp;%%')"

echo.
echo ============================================================
echo  完成！正在重启后端...
echo ============================================================
start "Inventory Backend (8081)" cmd /k "cd /d %ROOT%backend && java -jar target\inventory-backend-1.0.0.jar"
echo  后端已在新窗口启动，等约 30 秒后访问 http://localhost:5174
echo.
echo  提示: demo 账号若不存在，后端启动时会自动重建 (demo@kunzz.local / demo123)
pause

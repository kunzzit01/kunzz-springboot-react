@echo off
chcp 65001 >nul
title 修复 kunzzgroup.com 访问 / Fix kunzzgroup.com cache

:: 没有管理员权限就自动提权（ipconfig /flushdns 需要管理员）
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ==========================================
echo   清理缓存并打开 kunzzgroup.com
echo   Clear cache and open kunzzgroup.com
echo ==========================================
echo.
echo  [!] 接下来会关闭所有 Chrome / Edge / Firefox 窗口
echo      All browser windows will be closed.
echo      标签页重开会自动恢复，但请先保存正在填写的内容！
echo      Save any unsaved work first!
echo.
pause

echo.
echo [1/3] 清理系统 DNS 缓存 / Flush OS DNS cache ...
ipconfig /flushdns

echo [2/3] 关闭浏览器（同时清掉浏览器自己的 DNS 缓存）
echo       Closing browsers (clears their internal DNS cache) ...
taskkill /IM chrome.exe  /F >nul 2>&1
taskkill /IM msedge.exe  /F >nul 2>&1
taskkill /IM firefox.exe /F >nul 2>&1
taskkill /IM 360se.exe   /F >nul 2>&1
taskkill /IM 360chrome.exe /F >nul 2>&1
timeout /t 2 >nul

echo [3/3] 重新打开官网 / Reopening the website ...
start https://kunzzgroup.com/

echo.
echo ==========================================
echo  完成！Done!
echo ==========================================
echo.
echo  如果页面还是旧的 / If the page still looks old:
echo    在浏览器里按一次  Ctrl + Shift + R  强制刷新
echo    Press Ctrl + Shift + R once to hard-refresh.
echo.
echo  后台登录 / Admin login :  https://kunzzgroup.com/login
echo  手机版   / Mobile      :  https://kunzzgroup.com/mobile/login
echo.
pause

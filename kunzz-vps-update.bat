@echo off
chcp 65001 >nul
title Kunzz VPS update
echo.
echo   更新 VPS：备份 -^> 拉取代码 -^> 重建后端 -^> 重启 -^> 验证
echo   会提示输入一次 root 密码（跟平时 ssh 登录一样）
echo   后端重编约 1~3 分钟，请不要关窗口
echo.
"%ProgramFiles%\Git\bin\bash.exe" "%~dp0kunzz-vps-update.sh"
if errorlevel 1 (
  echo.
  echo  [失败] 请把上面的报错发给管理员。常见原因：
  echo    - 密码输错（会显示 Permission denied）
  echo    - 连不上 187.127.125.136（网络/防火墙）
  echo    - 工作区有源码改动（脚本会停下不动，需人工确认）
  echo.
  pause
)

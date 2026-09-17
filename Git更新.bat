@echo off
rem Kunzz Inventory System - Update via Git (requires Git for Windows)
rem ASCII only on purpose: cmd.exe reads .bat bytes in the OEM code page.
chcp 65001 >nul
title Kunzz Inventory System - Git Update
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-update.ps1"

@echo off
rem Kunzz Inventory System - Backup current data (refresh data pack)
chcp 65001 >nul
title Kunzz Inventory System - Backup Data
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-data.ps1"
pause

@echo off
rem Kunzz Inventory System - Updater (no git required)
chcp 65001 >nul
title Kunzz Inventory System - Update
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"

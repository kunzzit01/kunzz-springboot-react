@echo off
rem Kunzz Inventory System - One-click launcher (no install required)
chcp 65001 >nul
title Kunzz Inventory System
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

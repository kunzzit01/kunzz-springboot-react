@echo off
chcp 65001 >nul
title Kunzz Local Test
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-test.ps1"

@echo off
chcp 65001 >nul
title QQ Bot Monitor
cd /d %~dp0

echo QQ Bot Message Monitor
echo Waiting for log file...
echo.

:loop
set MF=
for %%f in (logs\monitor*.log) do set "MF=%%f"
if not "%MF%"=="" if exist "%MF%" goto :watch
timeout /t 2 >nul
goto :loop

:watch
echo Monitoring: %MF%
echo Press Ctrl+C to close
echo ----------------------------------------
powershell -NoExit -Command "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Content '%MF%' -Wait -Tail 80 -Encoding UTF8"

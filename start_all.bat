@echo off
chcp 65001 >nul
title QQ Bot - NTQQ Engine
cd /d %~dp0

echo ============================================
echo   QQ Bot - Custom NTQQ Engine Server
echo ============================================
echo.

echo [0/3] Stopping old processes...

set PID_NODE=
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo list 2^>nul ^| find "PID:"') do set PID_NODE=%%a
if defined PID_NODE (
    echo   Found node.exe (PID: %PID_NODE%)
    taskkill /f /im node.exe >nul 2>&1
    if %errorlevel%==0 (echo   ^> node.exe terminated.) else (echo   ^> node.exe already stopped.)
) else (
    echo   No node.exe running.
)

set PID_QQ=
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq QQ.exe" /fo list 2^>nul ^| find "PID:"') do set PID_QQ=%%a
if defined PID_QQ (
    taskkill /f /im QQ.exe >nul 2>&1
    echo   ^> QQ.exe terminated.
) else (
    echo   No QQ.exe running.
)

set PID_BOOT=
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq NapCatWinBootMain.exe" /fo list 2^>nul ^| find "PID:"') do set PID_BOOT=%%a
if defined PID_BOOT (
    taskkill /f /im NapCatWinBootMain.exe >nul 2>&1
    echo   ^> NapCatWinBootMain.exe terminated.
) else (
    echo   No NapCatWinBootMain.exe running.
)

echo   All old processes cleared.
echo.

echo [1/3] Checking NTQQ engine...
set NC_FOUND=0
for /d %%d in ("%cd%\NapCat\QQ\NapCat.*.Shell") do (
    if exist "%%d\QQ.exe" if exist "%%d\NapCatWinBootMain.exe" (
        set "NC_SHELL=%%d"
        set NC_FOUND=1
    )
)
if %NC_FOUND%==0 (
    if exist "%cd%\NapCat\QQ\QQ.exe" (
        if exist "%cd%\NapCat\QQ\NapCatWinBootMain.exe" (
            set "NC_SHELL=%cd%\NapCat\QQ"
            set NC_FOUND=1
        )
    )
)
if %NC_FOUND%==0 (
    echo   [ERROR] NTQQ engine not found!
    echo   Please download NapCat.Shell from:
    echo   https://github.com/NapNeko/NapCatQQ/releases/latest
    echo   Then place the Shell folder into: %cd%\NapCat\QQ\
    pause
    exit /b 1
)
echo   Engine found at: %NC_SHELL%
echo.

echo [2/3] Opening Bot Message Monitor...
start "QQ Bot Monitor" cmd /k watch.bat
echo   Monitor window opened.
echo.

echo [3/3] Starting QQ Bot Server...
echo   Dashboard: http://localhost:3456
echo   First launch: scan QR code in the popup QQ window
echo   Later launches: auto-login
echo ============================================
echo.

node app.js
pause

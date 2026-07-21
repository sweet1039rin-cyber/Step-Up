@echo off
setlocal
cd /d "%~dp0"
title Step Up v4.7 Speed Up

echo ========================================
echo Step Up v4.7 - Speed Up
echo ========================================
echo.
echo No Python installation is required.
echo Keep this black window open while using Step Up.
echo First-time smartphone setup: run setup-smartphone-access.bat once.
echo The smartphone address will appear below.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0stepup-server.ps1"
set "STEPUP_EXIT=%ERRORLEVEL%"

echo.
if not "%STEPUP_EXIT%"=="0" (
  echo Step Up could not start. Error code: %STEPUP_EXIT%
  echo Please take a screenshot of this window.
) else (
  echo Step Up has stopped.
)
echo.
pause
endlocal

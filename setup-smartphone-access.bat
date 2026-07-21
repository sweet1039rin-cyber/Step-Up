@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Smartphone access setup needs administrator permission.
  echo A Windows confirmation window will open.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ========================================
echo Step Up - Smartphone Access Setup
echo ========================================
echo.
echo Adding a Windows Firewall rule for TCP ports 5500-5510...

netsh advfirewall firewall delete rule name="Step Up Smartphone Access" >nul 2>&1
netsh advfirewall firewall add rule name="Step Up Smartphone Access" dir=in action=allow protocol=TCP localport=5500-5510 profile=any >nul

if not "%errorlevel%"=="0" (
  echo.
  echo Firewall setup failed.
  echo Please take a screenshot of this window.
  pause
  exit /b 1
)

echo.
echo Setup completed successfully.
echo Close this window, then run start.bat.
echo.
pause
endlocal

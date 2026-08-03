@echo off
setlocal
set "PIDFILE=%LOCALAPPDATA%\SunoOriginalFinderBridge\bridge.pid"
if not exist "%PIDFILE%" (
  echo Bridge trenutno nije pokrenut.
  pause
  exit /b 0
)
set /p PID=<"%PIDFILE%"
taskkill /PID %PID% /F >nul 2>&1
echo Bridge je zaustavljen.
pause

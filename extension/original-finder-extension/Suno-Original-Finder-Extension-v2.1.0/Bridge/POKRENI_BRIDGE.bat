@echo off
setlocal
chcp 65001 >nul
set "DIR=%LOCALAPPDATA%\SunoOriginalFinderBridge"
if not exist "%DIR%\bridge_hidden.vbs" (
  echo Bridge nije instaliran. Prvo pokreni INSTALIRAJ_BRIDGE.bat
  pause
  exit /b 1
)
powershell.exe -NoProfile -Command "try { $x=Invoke-RestMethod 'http://127.0.0.1:8766/bridge/health' -TimeoutSec 2; Write-Host ('Bridge vec radi. Program online: ' + $x.program.online) -ForegroundColor Green; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  pause
  exit /b 0
)
start "" wscript.exe "%DIR%\bridge_hidden.vbs"
timeout /t 2 /nobreak >nul
powershell.exe -NoProfile -Command "try { $x=Invoke-RestMethod 'http://127.0.0.1:8766/bridge/health' -TimeoutSec 5; Write-Host ('Bridge radi. Program online: ' + $x.program.online) -ForegroundColor Green } catch { Write-Host ('Bridge nije dostupan: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }"
pause

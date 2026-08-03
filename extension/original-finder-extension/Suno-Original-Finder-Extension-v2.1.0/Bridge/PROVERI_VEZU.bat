@echo off
chcp 65001 >nul
powershell.exe -NoProfile -Command "try { $x=Invoke-RestMethod 'http://127.0.0.1:8766/api/extensions/v2/status' -TimeoutSec 15; $x | ConvertTo-Json -Depth 8 } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"
pause

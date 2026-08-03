@echo off
chcp 65001 >nul
powershell.exe -NoProfile -Command "try { $x=Invoke-RestMethod 'http://127.0.0.1:8766/api/extensions/v2/status' -TimeoutSec 20; Write-Host ('Bridge: ' + $x.bridge.version) -ForegroundColor Cyan; Write-Host ('Program online: ' + $x.program.online); Write-Host ('Program verzija: ' + $x.program.version); Write-Host ('Biblioteka: ' + $x.library.songs_total); Write-Host ('Sa audio izvorom: ' + $x.library.songs_with_audio); Write-Host ('Indeksirano: ' + $x.library.songs_indexed); Write-Host ('Poruka: ' + $x.message); if(-not $x.program.online){exit 2} } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"
pause

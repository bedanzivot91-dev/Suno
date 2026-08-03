@echo off
chcp 65001 >nul
echo ============================================================
echo  SUNO ORIGINAL FINDER 2.1 - DIJAGNOSTIKA
echo ============================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference='Stop';" ^
"try{$p=Invoke-RestMethod 'http://127.0.0.1:8765/api/health' -TimeoutSec 4; Write-Host ('[OK] Program: '+$p.app+' '+$p.version) -ForegroundColor Green}catch{Write-Host '[GRESKA] Suno Pesme Studio nije dostupan na 8765.' -ForegroundColor Red};" ^
"try{$b=Invoke-RestMethod 'http://127.0.0.1:8766/api/extensions/v2/status' -TimeoutSec 15; Write-Host ('[OK] Bridge: '+$b.bridge.version) -ForegroundColor Green; Write-Host ('Biblioteka: '+$b.library.songs_total+' | audio: '+$b.library.songs_with_audio+' | indeksirano: '+$b.library.songs_indexed); Write-Host ('Poruka: '+$b.message)}catch{Write-Host ('[GRESKA] Bridge nije spreman: '+$_.Exception.Message) -ForegroundColor Red}"
echo.
pause

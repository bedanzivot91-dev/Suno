@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  SUNO ORIGINAL FINDER 2.1 - POPRAVKA VEZE
echo ============================================================
echo.
echo 1. Instalira se lokalni Bridge 8766.
echo 2. Suno Pesme Studio se NE menja i server.py se NE patchuje.
echo 3. Posle instalacije otvorice se stranica ekstenzija.
echo.
call "%~dp0Bridge\INSTALIRAJ_BRIDGE.bat"
if errorlevel 1 exit /b 1
start "" chrome.exe "chrome://extensions/"
echo.
echo U Chrome-u ukloni staru v1 ekstenziju i ucitaj ovaj ceo v2.1 folder preko Load unpacked.
echo Ako si prepisao fajlove preko starog foldera, samo klikni Reload.
pause

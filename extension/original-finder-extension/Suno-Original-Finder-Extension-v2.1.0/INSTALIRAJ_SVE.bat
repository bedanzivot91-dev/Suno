@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  SUNO ORIGINAL FINDER 2.1 - INSTALACIJA
echo ============================================================
echo.
echo 1. Instalira se lokalni Bridge koji NE MENJA Suno Pesme Studio.
echo 2. Zatim se otvara Chrome stranica za extension-e.
echo 3. Ukloni staru v1 ekstenziju, pa ucitaj OVAJ folder.
echo.
pause
call "%~dp0Bridge\INSTALIRAJ_BRIDGE.bat"
if errorlevel 1 exit /b 1
start "" explorer.exe "%~dp0"
start "" chrome.exe "chrome://extensions/" 2>nul
if errorlevel 1 start "" msedge.exe "edge://extensions/" 2>nul
echo.
echo Sada u browseru ukloni staru verziju i klikni Load unpacked.
echo Izaberi folder:
echo %~dp0
pause

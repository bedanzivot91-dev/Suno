@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  SUNO ORIGINAL FINDER v2.1 - INSTALACIJA LOKALNOG BRIDGE-A
echo ============================================================
echo.
echo Bridge NE MENJA Suno Pesme Studio i ne patchuje server.py.
echo Program moze ostati pokrenut. Ako trazilo pita za folder,
echo izaberi glavni folder koji u sebi sadrzi folder Program.
echo.
pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Bridge.ps1"
if errorlevel 1 (
  echo.
  echo INSTALACIJA NIJE USPESNA. Procitaj gresku iznad.
  pause
  exit /b 1
)
echo.
echo Instalacija je zavrsena.
pause

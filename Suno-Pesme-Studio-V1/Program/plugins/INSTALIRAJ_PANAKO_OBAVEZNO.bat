@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Suno Pesme Studio - VERZIJA 1 - Obavezni Panako
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALIRAJ_PANAKO_OBAVEZNO.ps1"
if errorlevel 1 (
  echo.
  echo PANAKO INSTALACIJA NIJE USPELA.
  pause
  exit /b 1
)
echo.
echo PANAKO JE INSTALIRAN I TESTIRAN.
pause
exit /b 0

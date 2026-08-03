@echo off
setlocal
start "" explorer "%~dp0"
start "" msedge "edge://extensions/"
echo.
echo U Edge-u ukljuci Developer mode, klikni Load unpacked i izaberi ovaj folder:
echo %~dp0
pause

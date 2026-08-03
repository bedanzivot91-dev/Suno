@echo off
setlocal
start "" explorer "%~dp0"
start "" chrome "chrome://extensions/"
echo.
echo U Chrome-u ukljuci Developer mode, klikni Load unpacked i izaberi ovaj folder:
echo %~dp0
pause

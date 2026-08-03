$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:LOCALAPPDATA "SunoOriginalFinderBridge"
$pidFile = Join-Path $installDir "bridge.pid"
if (Test-Path -LiteralPath $pidFile) {
  $pidValue = (Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue).Trim()
  if ($pidValue -match '^\d+$') { Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue }
}
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) "Suno Original Finder Bridge.lnk"
Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300
Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Suno Original Finder Bridge je uklonjen." -ForegroundColor Green

param(
  [string]$ProgramRoot = "",
  [switch]$NoStartup
)
$ErrorActionPreference = "Stop"

function Find-PythonFromRoot([string]$Root) {
  if (-not $Root) { return $null }
  $value = $Root.Trim('"').Trim()
  $candidates = @(
    (Join-Path $value "Program\python\python.exe"),
    (Join-Path $value "python\python.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  return $null
}

function Find-PythonFromRunningProgram {
  try {
    $processes = Get-CimInstance Win32_Process | Where-Object {
      $_.ExecutablePath -and ($_.Name -match 'Suno|Pesme|Studio')
    }
    foreach ($process in $processes) {
      $folder = Split-Path -Parent $process.ExecutablePath
      for ($i = 0; $i -lt 7 -and $folder; $i++) {
        $found = Find-PythonFromRoot $folder
        if ($found) { return $found }
        $parent = Split-Path -Parent $folder
        if ($parent -eq $folder) { break }
        $folder = $parent
      }
    }
  } catch {}
  return $null
}

function Select-ProgramFolder {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Izaberi glavni folder Suno Pesme Studio programa (folder koji sadrzi Program)"
  $dialog.ShowNewFolderButton = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return "" }
  return $dialog.SelectedPath
}

function Stop-OldBridge([string]$InstallDir) {
  $pidFile = Join-Path $InstallDir "bridge.pid"
  if (Test-Path -LiteralPath $pidFile) {
    $oldPid = (Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($oldPid -match '^\d+$') {
      Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500
    }
  }
}

$pythonExe = Find-PythonFromRoot $ProgramRoot
if (-not $pythonExe) { $pythonExe = Find-PythonFromRunningProgram }
if (-not $pythonExe) {
  $selected = Select-ProgramFolder
  $pythonExe = Find-PythonFromRoot $selected
}
if (-not $pythonExe) {
  throw "Nije pronadjen Program\python\python.exe. Izaberi glavni Suno Pesme Studio folder koji sadrzi folder Program."
}

$installDir = Join-Path $env:LOCALAPPDATA "SunoOriginalFinderBridge"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Stop-OldBridge $installDir

Copy-Item -LiteralPath (Join-Path $PSScriptRoot "bridge.py") -Destination (Join-Path $installDir "bridge.py") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "bridge_config.json") -Destination (Join-Path $installDir "bridge_config.json") -Force

$scriptPath = Join-Path $installDir "bridge.py"
$startCmd = "@echo off`r`ncd /d `"$installDir`"`r`n`"$pythonExe`" `"$scriptPath`"`r`n"
[System.IO.File]::WriteAllText((Join-Path $installDir "start_bridge.cmd"), $startCmd, (New-Object System.Text.ASCIIEncoding))

$vbs = "Set shell = CreateObject(`"WScript.Shell`")`r`nshell.Run Chr(34) & `"$installDir\start_bridge.cmd`" & Chr(34), 0, False`r`n"
[System.IO.File]::WriteAllText((Join-Path $installDir "bridge_hidden.vbs"), $vbs, (New-Object System.Text.ASCIIEncoding))

$configPath = Join-Path $installDir "bridge_config.json"
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$config | Add-Member -NotePropertyName python_exe -NotePropertyValue $pythonExe -Force
$config | Add-Member -NotePropertyName installed_at -NotePropertyValue (Get-Date).ToString("o") -Force
$configJson = $config | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($configPath, $configJson, (New-Object System.Text.UTF8Encoding($false)))

if (-not $NoStartup) {
  $startup = [Environment]::GetFolderPath('Startup')
  $shortcutPath = Join-Path $startup "Suno Original Finder Bridge.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "$env:WINDIR\System32\wscript.exe"
  $shortcut.Arguments = '"' + (Join-Path $installDir "bridge_hidden.vbs") + '"'
  $shortcut.WorkingDirectory = $installDir
  $shortcut.Description = "Lokalna veza izmedju Suno Original Finder extension-a i Suno Pesme Studio"
  $shortcut.Save()
}

Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList ('"' + (Join-Path $installDir "bridge_hidden.vbs") + '"') -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8766/bridge/health" -TimeoutSec 8
  if (-not $health.ok) { throw "Bridge nije vratio ok=true." }
  if ([string]$health.bridge.version -ne "2.1.0") { throw "Na portu 8766 radi pogrešna Bridge verzija: $($health.bridge.version)" }
} catch {
  throw "Bridge je kopiran, ali nije pokrenut. Proveri $installDir\bridge.log. Detalj: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "BRIDGE v2.1.0 JE USPESNO INSTALIRAN" -ForegroundColor Green
Write-Host "Folder: $installDir"
Write-Host "Python: $pythonExe"
Write-Host "Adresa: http://127.0.0.1:8766"
Write-Host "Program online: $($health.program.online)"
Write-Host ""
Write-Host "Suno Pesme Studio mora biti pokrenut i otkljucan kada prepoznajes pesmu."

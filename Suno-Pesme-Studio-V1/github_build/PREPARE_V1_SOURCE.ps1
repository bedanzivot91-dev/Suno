param([Parameter(Mandatory=$true)][string]$V1Root)
$ErrorActionPreference='Stop'
$b64 = Join-Path $V1Root 'complete-source-b64/source.zip.b64'
if (!(Test-Path $b64)) { throw "Complete V1 source archive is missing: $b64" }
$work = Join-Path $env:TEMP ('sps-v1-source-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
try {
  $zip = Join-Path $work 'source.zip'
  [IO.File]::WriteAllBytes($zip,[Convert]::FromBase64String([IO.File]::ReadAllText($b64)))
  $hash=(Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if($hash -ne '5e0ffef29c4813f34e36a9a74c7bf3ea0a1980be95df5714a6daec265cec773a'){throw "Complete V1 source SHA256 mismatch: $hash"}
  $src=Join-Path $work 'src'
  Expand-Archive $zip -DestinationPath $src -Force

  foreach($rel in @('Program/app','Program/plugins','Program/tests','windows_build','tests')){
    $from=Join-Path $src $rel
    if(!(Test-Path $from)){throw "Complete source missing: $rel"}
    Get-ChildItem $from -Recurse -File | ForEach-Object {
      $relative=$_.FullName.Substring($from.Length).TrimStart('\\','/')
      $destRoot=Join-Path $V1Root $rel
      $dest=Join-Path $destRoot $relative
      if(!(Test-Path $dest)){
        New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
        Copy-Item $_.FullName $dest -Force
      }
    }
  }

  foreach($file in @('WINDOWS_FINAL_E2E_TEST.ps1','PANAKO_WINDOWS_E2E.ps1','PROVERI_PROGRAM.bat','VERSION.txt','LICENSE.txt','THIRD_PARTY_LICENSES.txt','PROCITAJ_PRE_INSTALACIJE.txt','COMPONENTS_MANIFEST.json')){
    $from=Join-Path $src $file
    $to=Join-Path $V1Root $file
    if((Test-Path $from) -and !(Test-Path $to)){Copy-Item $from $to -Force}
  }

  $required=@('Program/app/advanced_features.py','Program/app/audio_match.py','Program/app/audio_tools.py','Program/app/bootstrap.py','Program/app/cdp.py','Program/app/database.py','Program/app/id3.py','Program/app/music_recognition.py','Program/app/panako_engine.py','Program/app/secret_store.py','Program/app/security_lock.py','Program/app/server.py','Program/app/song_finder.py','Program/app/song_finder_calibration.py','Program/app/suno_client.py','Program/app/suno_compat.py','Program/app/system_metrics.py','Program/app/v3_features.py','Program/app/version.py','Program/app/watchdog.py','Program/app/youtube_oauth.py','Program/app/youtube_tools.py','Program/app/web/index.html','Program/app/web/app.js','Program/app/web/style.css','Program/plugins/INSTALIRAJ_PANAKO_OBAVEZNO.ps1','windows_build/setup/main.go','windows_build/uninstaller/main.go')
  foreach($requiredFile in $required){
    if(!(Test-Path (Join-Path $V1Root $requiredFile))){throw "Prepared V1 source missing: $requiredFile"}
  }
  Write-Host "V1_SELF_CONTAINED_SOURCE_OK SHA256=$hash REQUIRED=$($required.Count)"
} finally { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }

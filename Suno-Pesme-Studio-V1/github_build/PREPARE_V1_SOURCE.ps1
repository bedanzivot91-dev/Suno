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
    $to=Join-Path $V1Root $rel
    New-Item -ItemType Directory -Path $to -Force | Out-Null
    Copy-Item (Join-Path $from '*') $to -Recurse -Force
  }
  foreach($file in @('WINDOWS_FINAL_E2E_TEST.ps1','PANAKO_WINDOWS_E2E.ps1','PROVERI_PROGRAM.bat','VERSION.txt','LICENSE.txt','THIRD_PARTY_LICENSES.txt','PROCITAJ_PRE_INSTALACIJE.txt','COMPONENTS_MANIFEST.json')){
    $from=Join-Path $src $file
    if(Test-Path $from){Copy-Item $from (Join-Path $V1Root $file) -Force}
  }
  foreach($required in @('Program/app/server.py','Program/app/bootstrap.py','Program/app/database.py','Program/app/suno_client.py','Program/app/youtube_oauth.py','Program/app/song_finder.py','Program/app/web/index.html','Program/app/web/app.js','Program/app/web/style.css','Program/plugins/INSTALIRAJ_PANAKO_OBAVEZNO.ps1','windows_build/setup/main.go','windows_build/uninstaller/main.go')){
    if(!(Test-Path (Join-Path $V1Root $required))){throw "Prepared V1 source missing: $required"}
  }
  Write-Host "V1_SELF_CONTAINED_SOURCE_OK SHA256=$hash"
} finally { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }

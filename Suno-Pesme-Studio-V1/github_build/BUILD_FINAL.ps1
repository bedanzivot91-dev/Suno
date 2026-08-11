param([string]$Output = "$PSScriptRoot\..\dist")
$ErrorActionPreference='Stop'
$V1=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$prepare=Join-Path $PSScriptRoot 'PREPARE_V1_SOURCE.ps1'
$build=Join-Path $PSScriptRoot 'BUILD_COMPLETE.ps1'
if(!(Test-Path $prepare)){throw "Missing source materializer: $prepare"}
if(!(Test-Path $build)){throw "Missing Windows builder: $build"}
& $prepare -V1Root $V1
if($LASTEXITCODE -ne 0){throw "PREPARE_V1_SOURCE failed: $LASTEXITCODE"}
$required=@('advanced_features.py','audio_match.py','audio_tools.py','bootstrap.py','cdp.py','database.py','id3.py','music_recognition.py','panako_engine.py','secret_store.py','security_lock.py','server.py','song_finder.py','song_finder_calibration.py','suno_client.py','suno_compat.py','system_metrics.py','v3_features.py','version.py','watchdog.py','youtube_oauth.py','youtube_tools.py')
$app=Join-Path $V1 'Program/app'
foreach($f in $required){if(!(Test-Path (Join-Path $app $f))){throw "Self-contained V1 source missing: $f"}}

# BUILD_COMPLETE historically supports an old chunk_*.b64 source snapshot. That snapshot
# must never overwrite the current V1 tree. Hide the archive directory only while the
# legacy-compatible builder runs; the complete source has already been materialized above.
$parts=Join-Path $V1 'complete-source-b64'
$hidden=Join-Path $V1 ('complete-source-b64.build-hidden-' + [guid]::NewGuid().ToString('N'))
$partsHidden=$false
try {
  if(Test-Path $parts){
    Rename-Item -LiteralPath $parts -NewName (Split-Path $hidden -Leaf)
    $partsHidden=$true
  }
  & $build -Output $Output
  if($LASTEXITCODE -ne 0){throw "BUILD_COMPLETE failed: $LASTEXITCODE"}
} finally {
  if($partsHidden -and (Test-Path $hidden) -and !(Test-Path $parts)){
    Rename-Item -LiteralPath $hidden -NewName 'complete-source-b64'
  }
}
$zip=Join-Path $Output 'Suno-Pesme-Studio-V1-Windows.zip'
$sha=Join-Path $Output 'Suno-Pesme-Studio-V1-Windows.sha256'
if(!(Test-Path $zip) -or !(Test-Path $sha)){throw 'Final Windows ZIP or SHA file is missing.'}
Write-Host 'V1_FINAL_SELF_CONTAINED_BUILD_OK'

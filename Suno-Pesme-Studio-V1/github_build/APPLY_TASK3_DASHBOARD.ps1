param(
  [Parameter(Mandatory=$true)][string]$PackageRoot
)
$ErrorActionPreference='Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
$sourceWeb = Join-Path $repoRoot 'Suno-Pesme-Studio-V1/Program/app/web'
$web = Join-Path $PackageRoot 'Program/app/web'
$index = Join-Path $web 'index.html'
if (!(Test-Path $index)) { throw "Task3/5/10/11: index.html nije pronadjen: $index" }
New-Item -ItemType Directory -Path $web -Force | Out-Null
$overlayFiles=@('task3-dashboard.js','task3-dashboard.css','task5-readable-ui.css','task11-controls.js','task11-controls.css')
foreach($name in $overlayFiles) {
  $src = Join-Path $sourceWeb $name
  if (!(Test-Path $src)) { throw "Task3/5/10/11: izvorni fajl nedostaje: $src" }
  Copy-Item $src (Join-Path $web $name) -Force
}
$html = Get-Content $index -Raw
# Remove the old duplicate handler overlay if it is present in an older built source snapshot.
$html = $html -replace '(?m)^\s*<script[^>]+task10-controls\.js[^>]*></script>\s*',''
if ($html -notmatch 'task3-dashboard\.css') {
  $html = $html -replace '</head>', ('  <link rel="stylesheet" href="/assets/task3-dashboard.css">' + "`r`n</head>")
}
if ($html -notmatch 'task5-readable-ui\.css') {
  $html = $html -replace '</head>', ('  <link rel="stylesheet" href="/assets/task5-readable-ui.css">' + "`r`n</head>")
}
if ($html -notmatch 'task11-controls\.css') {
  $html = $html -replace '</head>', ('  <link rel="stylesheet" href="/assets/task11-controls.css">' + "`r`n</head>")
}
if ($html -notmatch 'task3-dashboard\.js') {
  $html = $html -replace '</body>', ('  <script src="/assets/task3-dashboard.js"></script>' + "`r`n</body>")
}
if ($html -notmatch 'task11-controls\.js') {
  $html = $html -replace '</body>', ('  <script src="/assets/task11-controls.js"></script>' + "`r`n</body>")
}
Set-Content $index $html -Encoding UTF8
$final = Get-Content $index -Raw
foreach($needle in @('task3-dashboard.css','task3-dashboard.js','task5-readable-ui.css','task11-controls.js','task11-controls.css')) {
  if ($final -notmatch [regex]::Escape($needle)) { throw "Task3/5/10/11: nedostaje referenca: $needle" }
}
if($final -match 'task10-controls\.js'){throw 'Task10: stari dupli handler overlay je i dalje učitan.'}
foreach($name in $overlayFiles) {
  if (!(Test-Path (Join-Path $web $name))) { throw "Task3/5/10/11: fajl nije u paketu: $name" }
}
$dashboardJs = Get-Content (Join-Path $web 'task3-dashboard.js') -Raw
foreach($apiNeedle in @('/api/status','/api/health','/api/connect/start','/api/connect/check','/api/youtube/oauth/status','/api/youtube/oauth/start','/api/youtube/oauth/refresh-channels')) {
  if ($dashboardJs -notmatch [regex]::Escape($apiNeedle)) { throw "Task3/4: nedostaje stvarna API veza: $apiNeedle" }
}
foreach($controlNeedle in @('t3SunoLogin','t3SunoCheck','t3YoutubeLogin','t3YoutubeRefresh','addEventListener')) {
  if ($dashboardJs -notmatch [regex]::Escape($controlNeedle)) { throw "Task3/4: nedostaje kontrola ili handler: $controlNeedle" }
}
$readableCss = Get-Content (Join-Path $web 'task5-readable-ui.css') -Raw
foreach($cssNeedle in @('html{font-size:17px}','body{font-size:17px','button,input,select,textarea','min-height:42px','font-size:16px')) {
  if ($readableCss -notmatch [regex]::Escape($cssNeedle)) { throw "Task5: readability pravilo nedostaje: $cssNeedle" }
}
$appJs = Get-Content (Join-Path $web 'app.js') -Raw
foreach($id in @('vlRecentPrev','vlRecentNext','vlShuffleBtn','vlRepeatBtn','sgRepeatBtn')) {
  if ($appJs -notmatch [regex]::Escape($id) -or $appJs -notmatch 'addEventListener') { throw "Task10: canonical app control missing: $id" }
}
$task11 = Get-Content (Join-Path $web 'task11-controls.js') -Raw
foreach($needle in @('brQueueSearchMenu','brQueueManageBtn','brActiveSongMenuBtn','brAutoplayOptionsBtn','brHeadphonesBtn','brLoopAButton','brLoopBButton','PITCH + SPEED','lcCatalogFilter_','vlListView','sgViewMode','sgPagePrev','sgPageNext','sgSyncRateBtn','sgTempoCycleBtn','setSinkId')) {
  if ($task11 -notmatch [regex]::Escape($needle)) { throw "Task10/11: funkcionalna popravka nedostaje: $needle" }
}
$py = Join-Path $PackageRoot 'Program/python/python.exe'
$uiAudit = Join-Path $repoRoot 'Suno-Pesme-Studio-V1/tests/UI_BUTTON_AUDIT.py'
if (!(Test-Path $py)) { throw 'Task10: embedded Python nije pronadjen za UI audit.' }
if (!(Test-Path $uiAudit)) { throw 'Task10: UI_BUTTON_AUDIT.py nije pronadjen.' }
& $py $uiAudit $web
if ($LASTEXITCODE -ne 0) { throw "Task10: UI button audit nije prosao: $LASTEXITCODE" }
Write-Host 'TASK3_TASK4_TASK5_TASK10_TASK11_WEB_PATCH_OK'

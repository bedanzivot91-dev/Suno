param(
  [Parameter(Mandatory=$true)][string]$PackageRoot
)
$ErrorActionPreference='Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
$sourceWeb = Join-Path $repoRoot 'Suno-Pesme-Studio-V1/Program/app/web'
$web = Join-Path $PackageRoot 'Program/app/web'
$index = Join-Path $web 'index.html'
if (!(Test-Path $index)) { throw "Task3/5/10: index.html nije pronadjen: $index" }
New-Item -ItemType Directory -Path $web -Force | Out-Null
foreach($name in @('task3-dashboard.js','task3-dashboard.css','task5-readable-ui.css','task10-controls.js')) {
  $src = Join-Path $sourceWeb $name
  if (!(Test-Path $src)) { throw "Task3/5/10: izvorni fajl nedostaje: $src" }
  Copy-Item $src (Join-Path $web $name) -Force
}
$html = Get-Content $index -Raw
if ($html -notmatch 'task3-dashboard\.css') {
  $cssTag = '  <link rel="stylesheet" href="/assets/task3-dashboard.css">' + "`r`n</head>"
  $html = $html -replace '</head>', $cssTag
}
if ($html -notmatch 'task5-readable-ui\.css') {
  $readableTag = '  <link rel="stylesheet" href="/assets/task5-readable-ui.css">' + "`r`n</head>"
  $html = $html -replace '</head>', $readableTag
}
if ($html -notmatch 'task3-dashboard\.js') {
  $jsTag = '  <script src="/assets/task3-dashboard.js"></script>' + "`r`n</body>"
  $html = $html -replace '</body>', $jsTag
}
if ($html -notmatch 'task10-controls\.js') {
  $controlsTag = '  <script src="/assets/task10-controls.js"></script>' + "`r`n</body>"
  $html = $html -replace '</body>', $controlsTag
}
Set-Content $index $html -Encoding UTF8
$final = Get-Content $index -Raw
foreach($needle in @('task3-dashboard.css','task3-dashboard.js','task5-readable-ui.css','task10-controls.js')) {
  if ($final -notmatch [regex]::Escape($needle)) { throw "Task3/5/10: nedostaje referenca: $needle" }
}
foreach($name in @('task3-dashboard.js','task3-dashboard.css','task5-readable-ui.css','task10-controls.js')) {
  if (!(Test-Path (Join-Path $web $name))) { throw "Task3/5/10: fajl nije u paketu: $name" }
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
$controlsJs = Get-Content (Join-Path $web 'task10-controls.js') -Raw
foreach($id in @('vlRecentPrev','vlRecentNext','vlShuffleBtn','vlRepeatBtn','sgRepeatBtn')) {
  if ($controlsJs -notmatch [regex]::Escape($id)) { throw "Task10: repaired control missing: $id" }
}
$py = Join-Path $PackageRoot 'Program/python/python.exe'
$uiAudit = Join-Path $repoRoot 'Suno-Pesme-Studio-V1/tests/UI_BUTTON_AUDIT.py'
if (!(Test-Path $py)) { throw 'Task10: embedded Python nije pronadjen za UI audit.' }
if (!(Test-Path $uiAudit)) { throw 'Task10: UI_BUTTON_AUDIT.py nije pronadjen.' }
& $py $uiAudit $web
if ($LASTEXITCODE -ne 0) { throw "Task10: UI button audit nije prosao: $LASTEXITCODE" }
Write-Host 'TASK3_TASK4_TASK5_TASK10_WEB_PATCH_OK'

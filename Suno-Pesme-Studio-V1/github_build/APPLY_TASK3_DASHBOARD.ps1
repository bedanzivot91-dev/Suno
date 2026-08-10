param(
  [Parameter(Mandatory=$true)][string]$PackageRoot
)
$ErrorActionPreference='Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
$sourceWeb = Join-Path $repoRoot 'Suno-Pesme-Studio-V1/Program/app/web'
$web = Join-Path $PackageRoot 'Program/app/web'
$index = Join-Path $web 'index.html'
if (!(Test-Path $index)) { throw "Task3/5: index.html nije pronađen: $index" }
New-Item -ItemType Directory -Path $web -Force | Out-Null
foreach($name in @('task3-dashboard.js','task3-dashboard.css','task5-readable-ui.css')) {
  $src = Join-Path $sourceWeb $name
  if (!(Test-Path $src)) { throw "Task3/5: izvorni fajl nedostaje: $src" }
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
Set-Content $index $html -Encoding UTF8
$final = Get-Content $index -Raw
foreach($needle in @('task3-dashboard.css','task3-dashboard.js','task5-readable-ui.css')) {
  if ($final -notmatch [regex]::Escape($needle)) { throw "Task3/5: nedostaje referenca: $needle" }
}
foreach($name in @('task3-dashboard.js','task3-dashboard.css','task5-readable-ui.css')) {
  if (!(Test-Path (Join-Path $web $name))) { throw "Task3/5: fajl nije u paketu: $name" }
}
Write-Host 'TASK3_TASK5_WEB_PATCH_OK'

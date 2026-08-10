param(
  [Parameter(Mandatory=$true)][string]$PackageRoot
)
$ErrorActionPreference='Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
$sourceWeb = Join-Path $repoRoot 'Suno-Pesme-Studio-V1/Program/app/web'
$web = Join-Path $PackageRoot 'Program/app/web'
$index = Join-Path $web 'index.html'
if (!(Test-Path $index)) { throw "Task3: index.html nije pronađen: $index" }
New-Item -ItemType Directory -Path $web -Force | Out-Null
foreach($name in @('task3-dashboard.js','task3-dashboard.css')) {
  $src = Join-Path $sourceWeb $name
  if (!(Test-Path $src)) { throw "Task3: izvorni fajl nedostaje: $src" }
  Copy-Item $src (Join-Path $web $name) -Force
}
$html = Get-Content $index -Raw
if ($html -notmatch 'task3-dashboard\.css') {
  $html = $html -replace '</head>', "  <link rel=\"stylesheet\" href=\"/assets/task3-dashboard.css\">`r`n</head>"
}
if ($html -notmatch 'task3-dashboard\.js') {
  $html = $html -replace '</body>', "  <script src=\"/assets/task3-dashboard.js\"></script>`r`n</body>"
}
Set-Content $index $html -Encoding UTF8
$final = Get-Content $index -Raw
if ($final -notmatch 'task3-dashboard\.css' -or $final -notmatch 'task3-dashboard\.js') { throw 'Task3: dashboard reference injection nije uspela.' }
if (!(Test-Path (Join-Path $web 'task3-dashboard.js'))) { throw 'Task3: JS nije u paketu.' }
if (!(Test-Path (Join-Path $web 'task3-dashboard.css'))) { throw 'Task3: CSS nije u paketu.' }
Write-Host 'TASK3_DASHBOARD_PATCH_OK'

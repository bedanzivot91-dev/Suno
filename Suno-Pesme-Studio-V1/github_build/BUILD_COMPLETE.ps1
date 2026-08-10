param(
    [string]$Output = "$PSScriptRoot\..\dist"
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$V1 = Join-Path $Repo 'Suno-Pesme-Studio-V1'
$Legacy = Join-Path $Repo 'extension\Suno-Pesme-Studio-v3.3.2-TEME-1-2-3-4-5'
$Work = Join-Path $Output 'work'
$Program = Join-Path $Work 'Program'
Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
New-Item $Program -ItemType Directory -Force | Out-Null
New-Item $Output -ItemType Directory -Force | Out-Null

function Download([string]$Url, [string]$Dest) {
    Write-Host "DOWNLOAD: $Url"
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Dest
    if (!(Test-Path $Dest) -or ((Get-Item $Dest).Length -le 0)) { throw "Download failed: $Url" }
}
function Assert-Sha256([string]$Path, [string]$Expected) {
    $actual = (Get-FileHash $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected.ToLowerInvariant()) { throw "SHA256 mismatch for $Path`nExpected: $Expected`nActual: $actual" }
}

Copy-Item (Join-Path $Legacy 'Program\app') $Program -Recurse -Force
Copy-Item (Join-Path $Legacy 'Program\plugins') $Program -Recurse -Force
if (Test-Path (Join-Path $Legacy 'Program\data')) { Copy-Item (Join-Path $Legacy 'Program\data') $Program -Recurse -Force }
if (Test-Path (Join-Path $V1 'Program')) { Copy-Item (Join-Path $V1 'Program\*') $Program -Recurse -Force }

$Parts = Join-Path $V1 'complete-source-b64'
if (Test-Path $Parts) {
    $Joined = Join-Path $Work 'source.tar.xz.b64'
    Get-ChildItem $Parts -Filter 'chunk_*.b64' | Sort-Object Name | Get-Content -Raw | Set-Content $Joined -NoNewline -Encoding Ascii
    $Archive = Join-Path $Work 'source.tar.xz'
    [IO.File]::WriteAllBytes($Archive, [Convert]::FromBase64String([IO.File]::ReadAllText($Joined)))
    $Hash = (Get-FileHash $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Hash -ne '66cc66a78d346af6fe7e66b4089981138b98d5ec2b4b7e9a58aa00a8cd5f5506') { throw "V1 source archive SHA256 mismatch: $Hash" }
    tar -xJf $Archive -C $Work
    if ($LASTEXITCODE -ne 0) { throw 'Unable to extract V1 source archive.' }
    $ExtractedProgram = Get-ChildItem $Work -Directory -Recurse | Where-Object { $_.Name -eq 'Program' -and (Test-Path (Join-Path $_.FullName 'app\server.py')) } | Select-Object -First 1
    if ($ExtractedProgram) { Copy-Item (Join-Path $ExtractedProgram.FullName '*') $Program -Recurse -Force }
}

$PyVersion = '3.13.14'
$PyZip = Join-Path $Work "python-$PyVersion-embed-amd64.zip"
Download "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip" $PyZip
$PythonDir = Join-Path $Program 'python'
Remove-Item $PythonDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item $PythonDir -ItemType Directory -Force | Out-Null
Expand-Archive $PyZip -DestinationPath $PythonDir -Force
$Pth = Get-ChildItem $PythonDir -Filter 'python*._pth' | Select-Object -First 1
if (!$Pth) { throw 'Python _pth file not found.' }
$Text = Get-Content $Pth.FullName -Raw
$Text = $Text -replace '#import site','import site'
if ($Text -notmatch '(?m)^\.\\Lib\\site-packages$') { $Text += "`r`n.\Lib\site-packages`r`n" }
Set-Content $Pth.FullName $Text -Encoding Ascii
$GetPip = Join-Path $Work 'get-pip.py'
Download 'https://bootstrap.pypa.io/get-pip.py' $GetPip
& (Join-Path $PythonDir 'python.exe') $GetPip --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { throw 'get-pip failed.' }
& (Join-Path $PythonDir 'python.exe') -m pip install --disable-pip-version-check --no-warn-script-location --upgrade 'pip==26.2' 'playwright==1.61.0' 'greenlet==3.5.4' 'pyee==13.0.1' 'typing_extensions==4.16.0'
if ($LASTEXITCODE -ne 0) { throw 'Python package install failed.' }

$Tools = Join-Path $Program 'tools'
New-Item $Tools -ItemType Directory -Force | Out-Null
$FFmpegDir = Join-Path $Tools 'ffmpeg'
$FFmpegZip = Join-Path $Work 'ffmpeg-release-essentials.zip'
$FFmpegSha = Join-Path $Work 'ffmpeg-release-essentials.zip.sha256'
Download 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' $FFmpegZip
Download 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256' $FFmpegSha
$shaMatch = [regex]::Match((Get-Content $FFmpegSha -Raw), '(?i)\b[a-f0-9]{64}\b')
if (!$shaMatch.Success) { throw 'FFmpeg SHA256 file has no valid hash.' }
Assert-Sha256 $FFmpegZip $shaMatch.Value
$FFExtract = Join-Path $Work 'ffmpeg-extract'
Expand-Archive $FFmpegZip -DestinationPath $FFExtract -Force
$ffmpeg = Get-ChildItem $FFExtract -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
$ffprobe = Get-ChildItem $FFExtract -Recurse -Filter 'ffprobe.exe' | Select-Object -First 1
if (!$ffmpeg -or !$ffprobe) { throw 'FFmpeg or ffprobe not found.' }
New-Item (Join-Path $FFmpegDir 'bin') -ItemType Directory -Force | Out-Null
Copy-Item $ffmpeg.FullName (Join-Path $FFmpegDir 'bin\ffmpeg.exe') -Force
Copy-Item $ffprobe.FullName (Join-Path $FFmpegDir 'bin\ffprobe.exe') -Force

$YtDir = Join-Path $Tools 'yt-dlp'
New-Item $YtDir -ItemType Directory -Force | Out-Null
$YtExe = Join-Path $YtDir 'yt-dlp.exe'
$YtSums = Join-Path $Work 'yt-dlp-SHA2-256SUMS'
Download 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe' $YtExe
Download 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/SHA2-256SUMS' $YtSums
$ytLine = Get-Content $YtSums | Where-Object { $_ -match '(?i)\byt-dlp\.exe\b' } | Select-Object -First 1
if (!$ytLine) { throw 'yt-dlp SHA256 record not found.' }
$ytMatch = [regex]::Match($ytLine, '(?i)\b[a-f0-9]{64}\b')
Assert-Sha256 $YtExe $ytMatch.Value

$DenoDir = Join-Path $Tools 'deno'
New-Item $DenoDir -ItemType Directory -Force | Out-Null
$DenoZip = Join-Path $Work 'deno-x86_64-pc-windows-msvc.zip'
$DenoSum = Join-Path $Work 'deno-x86_64-pc-windows-msvc.zip.sha256sum'
$DenoUrl = 'https://github.com/denoland/deno/releases/download/v2.8.1/deno-x86_64-pc-windows-msvc.zip'
Download $DenoUrl $DenoZip
Download ($DenoUrl + '.sha256sum') $DenoSum
$dMatch = [regex]::Match((Get-Content $DenoSum -Raw), '(?i)\b[a-f0-9]{64}\b')
if (!$dMatch.Success) { throw 'Deno SHA256 record is invalid.' }
Assert-Sha256 $DenoZip $dMatch.Value
$DenoExtract = Join-Path $Work 'deno-extract'
Expand-Archive $DenoZip -DestinationPath $DenoExtract -Force
$deno = Get-ChildItem $DenoExtract -Recurse -Filter 'deno.exe' | Select-Object -First 1
if (!$deno) { throw 'deno.exe not found.' }
Copy-Item $deno.FullName (Join-Path $DenoDir 'deno.exe') -Force

$FpDir = Join-Path $Tools 'fpcalc'
New-Item $FpDir -ItemType Directory -Force | Out-Null
$FpZip = Join-Path $Work 'chromaprint-fpcalc-1.6.1-windows-x86_64.zip'
Download 'https://github.com/acoustid/chromaprint/releases/download/v1.6.1/chromaprint-fpcalc-1.6.1-windows-x86_64.zip' $FpZip
Assert-Sha256 $FpZip '735d6182b38e9f364b84ce6f4ccd682c75e2851de89735711d6b762d12b92a4e'
$FpExtract = Join-Path $Work 'fpcalc-extract'
Expand-Archive $FpZip -DestinationPath $FpExtract -Force
$fp = Get-ChildItem $FpExtract -Recurse -Filter 'fpcalc.exe' | Select-Object -First 1
if (!$fp) { throw 'fpcalc.exe not found.' }
Copy-Item $fp.FullName (Join-Path $FpDir 'fpcalc.exe') -Force

$Launcher = Join-Path $V1 'github_build\launcher\main.go'
Push-Location (Split-Path $Launcher)
try { $env:GOOS='windows'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'; go build -trimpath -o (Join-Path $Program 'Suno Pesme Studio.exe') . }
finally { Pop-Location }

$Package = Join-Path $Work 'package'
New-Item $Package -ItemType Directory -Force | Out-Null
Copy-Item $Program (Join-Path $Package 'Program') -Recurse -Force
foreach ($f in @('VERSION.txt','LICENSE.txt','THIRD_PARTY_LICENSES.txt','PROCITAJ_PRE_INSTALACIJE.txt','PROVERI_PROGRAM.bat','PANAKO_WINDOWS_E2E.ps1','WINDOWS_FINAL_E2E_TEST.ps1','COMPONENTS_MANIFEST.json','FINAL_BUILD_VERIFICATION.json','MANIFEST_SHA256.txt','SHA256SUMS.txt')) {
    $p = Join-Path $V1 $f
    if (Test-Path $p) { Copy-Item $p $Package -Force }
}

$SetupSrc = Join-Path $V1 'windows_build\setup'
$UnSrc = Join-Path $V1 'windows_build\uninstaller'
if (-not (Test-Path $SetupSrc)) { $SetupSrc = Join-Path $Legacy 'windows_build\setup' }
if (-not (Test-Path $UnSrc)) { $UnSrc = Join-Path $Legacy 'windows_build\uninstaller' }
Push-Location $SetupSrc
try { $env:GOOS='windows'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'; go build -trimpath -o (Join-Path $Package 'INSTALIRAJ_PROGRAM.exe') . }
finally { Pop-Location }
Push-Location $UnSrc
try { $env:GOOS='windows'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'; go build -trimpath -o (Join-Path $Package 'DEINSTALIRAJ_PROGRAM.exe') . }
finally { Pop-Location }

$env:PYTHONPATH = Join-Path $Program 'app'
& (Join-Path $PythonDir 'python.exe') -m compileall -q (Join-Path $Program 'app')
if ($LASTEXITCODE -ne 0) { throw 'Python compile check failed.' }
& (Join-Path $FFmpegDir 'bin\ffmpeg.exe') -version | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw 'ffmpeg smoke failed.' }
& (Join-Path $FFmpegDir 'bin\ffprobe.exe') -version | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw 'ffprobe smoke failed.' }
& $YtExe --version
if ($LASTEXITCODE -ne 0) { throw 'yt-dlp smoke failed.' }
& (Join-Path $DenoDir 'deno.exe') --version | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw 'deno smoke failed.' }
& (Join-Path $FpDir 'fpcalc.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'fpcalc smoke failed.' }

$Required = @(
    'Program\Suno Pesme Studio.exe',
    'Program\python\python.exe',
    'Program\python\Lib\site-packages\playwright\__init__.py',
    'Program\tools\ffmpeg\bin\ffmpeg.exe',
    'Program\tools\ffmpeg\bin\ffprobe.exe',
    'Program\tools\yt-dlp\yt-dlp.exe',
    'Program\tools\deno\deno.exe',
    'Program\tools\fpcalc\fpcalc.exe',
    'INSTALIRAJ_PROGRAM.exe',
    'DEINSTALIRAJ_PROGRAM.exe'
)
foreach ($rel in $Required) {
    if (!(Test-Path (Join-Path $Package $rel))) { throw "Missing required component: $rel" }
}

$Zip = Join-Path $Output 'Suno-Pesme-Studio-V1-Windows.zip'
Remove-Item $Zip -Force -ErrorAction SilentlyContinue
Compress-Archive (Join-Path $Package '*') $Zip -CompressionLevel Optimal
$ZipHash = (Get-FileHash $Zip -Algorithm SHA256).Hash.ToLowerInvariant()
$ZipSize = (Get-Item $Zip).Length
if ($ZipSize -lt 120MB) { throw "Windows package is unexpectedly small ($ZipSize bytes). Build is incomplete." }
Set-Content (Join-Path $Output 'Suno-Pesme-Studio-V1-Windows.sha256') "$ZipHash  Suno-Pesme-Studio-V1-Windows.zip" -Encoding Ascii
Write-Host "BUILD OK: $Zip"
Write-Host "SIZE: $ZipSize"
Write-Host "SHA256: $ZipHash"

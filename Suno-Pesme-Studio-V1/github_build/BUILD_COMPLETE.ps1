param(
    [string]$Output = "$PSScriptRoot\..\dist"
)
$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$V1 = Join-Path $Repo 'Suno-Pesme-Studio-V1'
$Legacy = Join-Path $Repo 'extension\Suno-Pesme-Studio-v3.3.2-TEME-1-2-3-4-5'
$Work = Join-Path $Output 'work'
$Program = Join-Path $Work 'Program'
Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
New-Item $Program -ItemType Directory -Force | Out-Null

# Base source already versioned in this repository.
Copy-Item (Join-Path $Legacy 'Program\app') $Program -Recurse -Force
Copy-Item (Join-Path $Legacy 'Program\plugins') $Program -Recurse -Force

# V1 files always override the historical source.
if (Test-Path (Join-Path $V1 'Program')) {
    Copy-Item (Join-Path $V1 'Program\*') $Program -Recurse -Force
}

# Restore the complete V1 source archive when split archive files are present.
$Parts = Join-Path $V1 'complete-source-b64'
if (Test-Path $Parts) {
    $Joined = Join-Path $Work 'source.tar.xz.b64'
    Get-ChildItem $Parts -Filter 'chunk_*.b64' | Sort-Object Name | Get-Content -Raw | Set-Content $Joined -NoNewline -Encoding Ascii
    $Archive = Join-Path $Work 'source.tar.xz'
    [IO.File]::WriteAllBytes($Archive, [Convert]::FromBase64String([IO.File]::ReadAllText($Joined)))
    $Hash = (Get-FileHash $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Hash -ne '66cc66a78d346af6fe7e66b4089981138b98d5ec2b4b7e9a58aa00a8cd5f5506') {
        throw "V1 source archive SHA256 nije ispravan: $Hash"
    }
    tar -xJf $Archive -C $Work
    $ExtractedProgram = Get-ChildItem $Work -Directory -Recurse | Where-Object { $_.Name -eq 'Program' -and (Test-Path (Join-Path $_.FullName 'app\server.py')) } | Select-Object -First 1
    if ($ExtractedProgram) {
        Copy-Item (Join-Path $ExtractedProgram.FullName '*') $Program -Recurse -Force
    }
}

# Python embeddable runtime.
$PyVersion = '3.12.10'
$PyZip = Join-Path $Work 'python.zip'
Invoke-WebRequest "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip" -OutFile $PyZip
$PythonDir = Join-Path $Program 'python'
New-Item $PythonDir -ItemType Directory -Force | Out-Null
Expand-Archive $PyZip -DestinationPath $PythonDir -Force
$Pth = Get-ChildItem $PythonDir -Filter 'python*._pth' | Select-Object -First 1
if ($Pth) {
    $Text = Get-Content $Pth.FullName -Raw
    $Text = $Text -replace '#import site','import site'
    Set-Content $Pth.FullName $Text -Encoding Ascii
}

# Build the Windows launcher that starts bootstrap + local server.
$Launcher = Join-Path $V1 'github_build\launcher\main.go'
Push-Location (Split-Path $Launcher)
try {
    go build -trimpath -o (Join-Path $Program 'Suno Pesme Studio.exe') .
} finally { Pop-Location }

# Root package expected by setup.exe.
$Package = Join-Path $Work 'package'
New-Item $Package -ItemType Directory -Force | Out-Null
Copy-Item $Program (Join-Path $Package 'Program') -Recurse -Force
foreach ($f in @('VERSION.txt','LICENSE.txt','THIRD_PARTY_LICENSES.txt','PROCITAJ_PRE_INSTALACIJE.txt','PROVERI_PROGRAM.bat','PANAKO_WINDOWS_E2E.ps1','WINDOWS_FINAL_E2E_TEST.ps1')) {
    $p = Join-Path $V1 $f
    if (Test-Path $p) { Copy-Item $p $Package -Force }
}

# Build installer and uninstaller from repository source.
$SetupSrc = Join-Path $V1 'windows_build\setup'
$UnSrc = Join-Path $V1 'windows_build\uninstaller'
if (-not (Test-Path $SetupSrc)) { $SetupSrc = Join-Path $Legacy 'windows_build\setup' }
if (-not (Test-Path $UnSrc)) { $UnSrc = Join-Path $Legacy 'windows_build\uninstaller' }
Push-Location $SetupSrc
try { $env:GOOS='windows'; $env:GOARCH='amd64'; go build -trimpath -o (Join-Path $Package 'INSTALIRAJ_PROGRAM.exe') . } finally { Pop-Location }
Push-Location $UnSrc
try { $env:GOOS='windows'; $env:GOARCH='amd64'; go build -trimpath -o (Join-Path $Package 'DEINSTALIRAJ_PROGRAM.exe') . } finally { Pop-Location }

# Compile/test first-party Python before publishing the package.
$env:PYTHONPATH = Join-Path $Program 'app'
& (Join-Path $PythonDir 'python.exe') -m compileall -q (Join-Path $Program 'app')
if ($LASTEXITCODE -ne 0) { throw 'Python compile provera nije prošla.' }

$Zip = Join-Path $Output 'Suno-Pesme-Studio-V1-Windows.zip'
Remove-Item $Zip -Force -ErrorAction SilentlyContinue
Compress-Archive (Join-Path $Package '*') $Zip -CompressionLevel Optimal
$ZipHash = (Get-FileHash $Zip -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content (Join-Path $Output 'Suno-Pesme-Studio-V1-Windows.sha256') "$ZipHash  Suno-Pesme-Studio-V1-Windows.zip" -Encoding Ascii
Write-Host "BUILD OK: $Zip"
Write-Host "SHA256: $ZipHash"

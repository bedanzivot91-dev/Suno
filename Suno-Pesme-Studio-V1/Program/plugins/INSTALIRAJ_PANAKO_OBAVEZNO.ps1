param(
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

$PinnedTag = 'master'
$PinnedCommit = 'e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211'
$ResultPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'PANAKO_INSTALL_RESULT.json'

function Write-Result([bool]$Ok, [string]$Message, [string]$Distro = '', [string]$JarSha = '') {
    [pscustomobject]@{
        ok = $Ok
        version = '1.0.0'
        message = $Message
        distro = $Distro
        pinned_commit = $PinnedCommit
        jar_sha256 = $JarSha
        created_at = (Get-Date).ToString('o')
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ResultPath -Encoding UTF8
}

function Get-WslDistro {
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { return $null }
    $raw = & wsl.exe -l -q 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $names = @($raw | ForEach-Object { ($_ -replace "`0",'').Trim() } | Where-Object {
        $_ -and $_ -notmatch '^docker-desktop' -and $_ -notmatch '^docker-desktop-data'
    })
    if ($names.Count -eq 0) { return $null }
    $ubuntu = $names | Where-Object { $_ -match '^Ubuntu' } | Select-Object -First 1
    if ($ubuntu) { return [string]$ubuntu }
    return [string]$names[0]
}

function Wait-WslDistro([int]$Seconds = 240) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        $d = Get-WslDistro
        if ($d) { return $d }
        Start-Sleep -Seconds 4
    } while ((Get-Date) -lt $deadline)
    return $null
}

function Run-Wsl([string]$Distro, [string]$Script) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Script)
    $encoded = [Convert]::ToBase64String($bytes)
    $runner = "set -e; printf '%s' '$encoded' | base64 -d > /tmp/sps-panako-setup.sh; chmod 700 /tmp/sps-panako-setup.sh; exec bash /tmp/sps-panako-setup.sh"
    $savedErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & wsl.exe -d $Distro -u root -- bash -lc $runner 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $savedErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "WSL komanda nije uspela (ExitCode=$exitCode).`n$($output -join "`n")"
    }
    return $output
}

try {
    Write-Host '============================================================'
    Write-Host ' SUNO PESME STUDIO - VERZIJA 1 - PANAKO + OLAF SETUP'
    Write-Host '============================================================'

    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
        Write-Host 'WSL nije dostupan. Ukljucujem Windows WSL i VirtualMachinePlatform komponente...' -ForegroundColor Yellow
        $enableScript = @'
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
exit $LASTEXITCODE
'@
        $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($enableScript))
        $enable = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
            '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded
        ) -Verb RunAs -Wait -PassThru
        if ($enable.ExitCode -ne 0) {
            throw "Windows WSL komponente nisu mogle da se ukljuce (ExitCode=$($enable.ExitCode))."
        }
        Write-Result $false 'WSL komponente su ukljucene i Windows mora da se restartuje pre Ubuntu/Panako instalacije.'
        exit 3010
    }

    $distro = Get-WslDistro
    if (-not $distro) {
        Write-Host 'Nema Linux distribucije. Instaliram Ubuntu...' -ForegroundColor Yellow
        $ubuntuInstall = Start-Process -FilePath 'wsl.exe' -ArgumentList @('--install','-d','Ubuntu','--no-launch') -Verb RunAs -Wait -PassThru
        if ($ubuntuInstall.ExitCode -ne 0) {
            $ubuntuInstall = Start-Process -FilePath 'wsl.exe' -ArgumentList @('--install','-d','Ubuntu') -Verb RunAs -Wait -PassThru
        }
        $distro = Wait-WslDistro 240
        if (-not $distro) {
            Write-Result $false 'Ubuntu instalacija je pokrenuta, ali Windows zahteva restart ili prvo inicijalno pokretanje.'
            exit 3010
        }
    }

    Write-Host "Koristim WSL distribuciju: $distro"
    & wsl.exe -d $distro -u root -- bash -lc 'printf "SPS_WSL_READY\n"' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Result $false 'Ubuntu postoji, ali WSL distribucija nije mogla da se pokrene kao root.' $distro
        exit 3010
    }

    $script = @'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
export HOME=/root
cd /root

CURRENT_PHASE="bootstrap"
trap 'RC=$?; echo "SPS_PANAKO_FAIL phase=${CURRENT_PHASE} line=${LINENO} command=${BASH_COMMAND} rc=${RC}" >&2; exit ${RC}' ERR

APT_OK=0
for ATTEMPT in 1 2 3; do
  if apt-get update; then APT_OK=1; break; fi
  sleep $((ATTEMPT * 3))
done
test "$APT_OK" = "1"

apt-get install -y openjdk-17-jdk-headless ffmpeg git ca-certificates unzip
git --version
java -version
ffmpeg -version | head -n 1

CURRENT_PHASE="panako-source"
mkdir -p /root/.suno-pesme-studio
PANAKO_SRC=/root/.suno-pesme-studio/panako
PANAKO_READY=0
for ATTEMPT in 1 2 3; do
  echo "Panako source attempt ${ATTEMPT}/3..."
  rm -rf "$PANAKO_SRC"
  if ! git clone --depth 1 --single-branch --branch master https://github.com/JorenSix/Panako.git "$PANAKO_SRC"; then
    sleep $((ATTEMPT * 3)); continue
  fi
  if ! git -C "$PANAKO_SRC" fetch --depth 1 origin e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211; then
    sleep $((ATTEMPT * 3)); continue
  fi
  if ! git -C "$PANAKO_SRC" checkout --detach e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211; then
    sleep $((ATTEMPT * 3)); continue
  fi
  HEAD_FULL="$(git -C "$PANAKO_SRC" rev-parse HEAD 2>/tmp/sps-panako-head-error.txt || true)"
  if [ "$HEAD_FULL" != "e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211" ]; then
    sleep $((ATTEMPT * 3)); continue
  fi
  if grep -q "org.lmdbjava.*0.8.3-SNAPSHOT" "$PANAKO_SRC/build.gradle"; then
    sleep $((ATTEMPT * 3)); continue
  fi
  PANAKO_READY=1
  break
done
if [ "$PANAKO_READY" != "1" ]; then exit 42; fi

CURRENT_PHASE="panako-gradle"
cd "$PANAKO_SRC"
chmod +x ./gradlew
WRAPPER_PROPS=gradle/wrapper/gradle-wrapper.properties
test -f "$WRAPPER_PROPS"
sed -i 's#gradle-7\.2-bin\.zip#gradle-7.3.3-bin.zip#' "$WRAPPER_PROPS"
grep -q 'gradle-7.3.3-bin.zip' "$WRAPPER_PROPS"
if grep -q '^distributionSha256Sum=' "$WRAPPER_PROPS"; then
  sed -i 's#^distributionSha256Sum=.*#distributionSha256Sum=b586e04868a22fd817c8971330fec37e298f3242eb85c374181b12d637f80302#' "$WRAPPER_PROPS"
else
  printf '\ndistributionSha256Sum=b586e04868a22fd817c8971330fec37e298f3242eb85c374181b12d637f80302\n' >> "$WRAPPER_PROPS"
fi
grep -q '^distributionSha256Sum=b586e04868a22fd817c8971330fec37e298f3242eb85c374181b12d637f80302$' "$WRAPPER_PROPS"

GRADLE_OK=0
for ATTEMPT in 1 2 3; do
  if [ "$ATTEMPT" -eq 1 ]; then
    if ./gradlew --no-daemon shadowJar && ./gradlew --no-daemon install; then GRADLE_OK=1; break; fi
  else
    if ./gradlew --no-daemon --refresh-dependencies shadowJar && ./gradlew --no-daemon install; then GRADLE_OK=1; break; fi
  fi
  sleep $((ATTEMPT * 5))
done
if [ "$GRADLE_OK" != "1" ]; then exit 43; fi

CURRENT_PHASE="panako-runtime-verify"
test -s /root/.panako/panako.jar
command -v java >/dev/null
command -v ffmpeg >/dev/null
JAR_SHA="$(sha256sum /root/.panako/panako.jar | awk '{print $1}')"
FULL_COMMIT="$(git rev-parse HEAD)"
test "$FULL_COMMIT" = "e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211"
printf 'branch=master\ncommit=%s\nsha256=%s\n' "$FULL_COMMIT" "$JAR_SHA" > /root/.suno-pesme-studio/panako-runtime-v1.meta
java -jar /root/.panako/panako.jar -v
java -jar /root/.panako/panako.jar stats
java -jar /root/.panako/panako.jar config

CURRENT_PHASE="panako-olaf-e2e"
ROOT=/root/.suno-pesme-studio/install-e2e
rm -rf "$ROOT"
mkdir -p "$ROOT/media" "$ROOT/panako-db" "$ROOT/panako-cache" "$ROOT/olaf-db" "$ROOT/olaf-cache"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "anoisesrc=color=pink:duration=32:seed=12345" -ac 1 -ar 44100 "$ROOT/media/reference.wav"
ffmpeg -hide_banner -loglevel error -y -ss 9 -t 12 -i "$ROOT/media/reference.wav" -c:a pcm_s16le -ac 1 -ar 44100 "$ROOT/media/query.wav"
java -jar /root/.panako/panako.jar store STRATEGY=panako PANAKO_LMDB_FOLDER="$ROOT/panako-db" PANAKO_CACHE_FOLDER="$ROOT/panako-cache" "$ROOT/media/reference.wav" >/tmp/sps-install-panako-store.txt
java -jar /root/.panako/panako.jar query STRATEGY=panako PANAKO_LMDB_FOLDER="$ROOT/panako-db" PANAKO_CACHE_FOLDER="$ROOT/panako-cache" "$ROOT/media/query.wav" | tee /tmp/sps-install-panako-query.txt
grep -q "reference.wav" /tmp/sps-install-panako-query.txt
java -jar /root/.panako/panako.jar store STRATEGY=olaf OLAF_LMDB_FOLDER="$ROOT/olaf-db" OLAF_CACHE_FOLDER="$ROOT/olaf-cache" "$ROOT/media/reference.wav" >/tmp/sps-install-olaf-store.txt
java -jar /root/.panako/panako.jar query STRATEGY=olaf OLAF_LMDB_FOLDER="$ROOT/olaf-db" OLAF_CACHE_FOLDER="$ROOT/olaf-cache" "$ROOT/media/query.wav" | tee /tmp/sps-install-olaf-query.txt
grep -q "reference.wav" /tmp/sps-install-olaf-query.txt
printf '%s\n' "$JAR_SHA"
'@

    $output = Run-Wsl $distro $script
    $jarSha = (($output | Select-Object -Last 1) -as [string]).Trim()
    if ($jarSha -notmatch '^[0-9a-f]{64}$') {
        $verify = Run-Wsl $distro "sha256sum /root/.panako/panako.jar | awk '{print `$1}'"
        $jarSha = (($verify | Select-Object -Last 1) -as [string]).Trim()
    }
    Write-Result $true 'Panako + Olaf su instalirani i store/query E2E test je prosao.' $distro $jarSha
    Write-Host ''
    Write-Host 'PANAKO + OLAF: INSTALIRANI I E2E PROVERENI.' -ForegroundColor Green
    Write-Host "Distro: $distro"
    Write-Host "Commit: $PinnedCommit"
    Write-Host "JAR SHA-256: $jarSha"
    exit 0
}
catch {
    $failedDistro = ''
    if ($null -ne $distro) { $failedDistro = [string]$distro }
    Write-Result $false $_.Exception.Message $failedDistro
    Write-Host "PANAKO INSTALACIJA: FAIL - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

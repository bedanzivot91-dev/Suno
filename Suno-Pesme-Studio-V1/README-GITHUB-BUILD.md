# Suno Pesme Studio V1 — GitHub build

Ova oblast je namenjena kompletnom Windows build-u iz GitHub repozitorijuma.

`github_build/BUILD_COMPLETE.ps1` sastavlja Program, dodaje Python runtime, kompajlira Windows launcher, installer i uninstaller, proverava Python source i pravi finalni ZIP sa SHA-256 kontrolnim zbirom.

GitHub Actions workflow `.github/workflows/suno-pesme-studio-v1.yml` izvršava isti build na `windows-latest` i objavljuje `Suno-Pesme-Studio-V1-Windows.zip` kao workflow artifact.

Treće strane se ne skladište kao ogromni binarni Git blobovi: runtime koji je bezbedno moguće pribaviti iz zvaničnog izvora preuzima se tokom build-a, dok first-party source ostaje verzionisan u repozitorijumu.

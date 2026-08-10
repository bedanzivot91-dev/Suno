Pokretanje lokalnog build-a na Windowsu:

powershell -ExecutionPolicy Bypass -File .\github_build\BUILD_COMPLETE.ps1

Rezultat se pravi u `dist` i sadrži Windows ZIP i SHA-256 fajl. GitHub Actions koristi istu skriptu.

# Suno Pesme Studio — Verzija 1

Ova grana je pripremljena za aktuelnu verziju **Suno Pesme Studio 1.0.0**.

## Aktuelni paket

- Paket: `Suno-Pesme-Studio-VERZIJA-1-KOMPLETNO-PROVEREN-JAVA17-GRADLE-FIX.zip`
- Source-only snapshot: `Suno-Pesme-Studio-V1-GitHub-Source.tar.xz`
- SHA-256 source snapshot-a: `a3a752450082574f31a58b907a00dda4209cb7ebf7a7c4cbdbfff83a03ae08a3`

## Panako/Olaf ispravke

- Panako Git commit je zaključan na proverenu verziju.
- Uklonjena je stara `org.lmdbjava:lmdbjava:0.8.3-SNAPSHOT` putanja.
- Java 17 koristi kompatibilan Gradle runtime.
- Panako i Olaf `store -> query` E2E provere ostaju obavezne.
- WSL/PowerShell instalaciona putanja prijavljuje stvarni exit code.

## Važno

Ova grana je odvojena od `main` da aktuelni program ne pregazi postojeću verziju dok se upload/verifikacija ne završe.

Vendored runtime i veliki binarni fajlovi (embedded Python, FFmpeg, Deno, instalacioni EXE i slični artefakti) nisu isto što i izvorni kod i treba ih držati odvojeno od običnog Git source stabla / distribuirati kao build artefakte.

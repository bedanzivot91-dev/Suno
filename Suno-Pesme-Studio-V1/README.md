# Suno Pesme Studio V1

Ova grana čuva aktuelnu V1 razvojnu liniju programa Suno Pesme Studio.

## Aktuelni provereni paket

`Suno-Pesme-Studio-VERZIJA-1-KOMPLETNO-PROVEREN-JAVA17-GRADLE-FIX.zip`

SHA-256 paketa:

`5f6fdea9b2cf59b90a9effc1c2e028821768ea6ef8ad4e96cbaf78cceaba2bc7`

## Panako / Olaf

Aktuelna popravka koristi Java 17 uz Gradle 7.3.3 kompatibilnu putanju, proveru zavisnosti, retry build i Panako/Olaf E2E proveru. Stara `org.lmdbjava:lmdbjava:0.8.3-SNAPSHOT` putanja nije dozvoljena.

## Važno

`main` grana nije prepisana. Razvoj V1 je odvojen u `suno-pesme-studio-v1` grani da se prethodni kod ne izgubi.

Veliki Windows runtime paket sadrži ugrađene binarne komponente i nije običan source-only Git sadržaj. U ovoj grani se čuvaju source/build/test fajlovi i manifesti za V1.
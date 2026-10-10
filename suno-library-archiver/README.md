# Suno Library Archiver 🎵

Lokalni Python alat za čuvanje **zvanično preuzetih** Suno pesama. Uvozi audio i Suno ZIP arhive; pravi CSV i HTML katalog, preskače duplikate i proverava SHA-256 integritet.

**Važno:** Ovaj alat ne preuzima muziku direktno sa Suno naloga i ne zaobilazi Suno limite. Ne zahteva lozinku, kolačiće niti tokene.

## Windows

Potrebno: Python 3.10 ili noviji.

```powershell
py archiver.py --library "D:\Suno-Backup" import "$env:USERPROFILE\Downloads"
py archiver.py --library "D:\Suno-Backup" report
py archiver.py --library "D:\Suno-Backup" verify
```

## Linux / macOS

```bash
python3 archiver.py --library ~/Suno-Backup import ~/Downloads
python3 archiver.py --library ~/Suno-Backup verify
```

Podržani fajlovi: MP3, WAV, FLAC, M4A, AAC, OGG, MP4, MID i MIDI. ZIP arhive su podržane.

## Zvanični izvoz sa Suno

U Suno biblioteci označi dozvoljene pesme i koristi zvanično **Download All**, pa preuzeti ZIP ubaci u alat.

## Podaci i bezbednost

Svi podaci ostaju lokalno. Izlazna biblioteka sadrži `audio/`, `catalog.sqlite3`, `catalog.csv` i `index.html`. Nemoj objavljivati svoje pesme, lične fajlove ili baze na GitHubu.

Izvorna verzija projekta iz lokalnog arhiva; nije namenjen za automatizovano zaobilaženje kontrole preuzimanja.

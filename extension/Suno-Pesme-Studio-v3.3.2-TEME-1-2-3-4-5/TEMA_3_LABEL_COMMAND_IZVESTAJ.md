# Suno Pesme Studio — Tema 3: Label Command

## Šta je napravljeno

Tema 3 nije promena palete boja. Napravljen je zaseban raspored aplikacije prema dostavljenoj slici izdavačke komandne table:

- posebna numerisana leva navigacija;
- zasebna gornja traka sa breadcrumb prikazom, globalnom pretragom i nalogom;
- potpuno nova početna strana sa fokusom na aktivni singl;
- veliki omot pesme, metapodaci, produkcioni statusi i komande;
- katalog pesama u tabelarnom prikazu;
- desni panel sa performansama, platformama i zemljama;
- planer objava;
- status distribucije za Spotify, YouTube Music, Apple Music, Deezer i Tidal;
- poseban donji plejer u Label Command stilu;
- meni „Svi moduli“ za pristup svim stranama programa;
- poseban izgled panela, tabela, kartica, dugmadi, formi i modalnih prozora.

## Pokrivene stranice

Label Command raspored i stil primenjeni su na svih 15 postojećih stranica:

1. Početna
2. Biblioteka
3. Folderi
4. Audio obrada
5. Preuzimanje
6. Suno i uvoz
7. Traži pesmu
8. Pametna biblioteka
9. Version Lab
10. Metapodaci
11. YouTube alati
12. AI produkcija
13. Izveštaji
14. Dnevnik
15. Podešavanja

## Provera

- tri teme × 15 stranica: **45/45 uspešnih browser prikaza**;
- sve tri nezavisne školjke teme pravilno se prikazuju i međusobno skrivaju;
- nema horizontalnog probijanja na test rezoluciji 1536×960;
- JavaScript prolazi `node --check`;
- CSS parser: 1.556 pravila, 0 sintaksnih grešaka;
- HTML: 675 ID vrednosti, 0 duplikata;
- Python moduli se kompajliraju bez sintaksnih grešaka;
- stvarni lokalni server pokrenut je iz ovog paketa;
- `/api/health`, početna stranica, `style.css` i `app.js` vraćaju HTTP 200.

## Ograničenje

Windows `.exe` prozor nije moguće direktno pokrenuti u ovom Linux okruženju. Provereni su stvarni frontend fajlovi, Chromium renderovanje svih stranica, Python moduli i lokalni HTTP server. Finalnu proveru instalacije i WebView2 prozora treba uraditi na Windows računaru.

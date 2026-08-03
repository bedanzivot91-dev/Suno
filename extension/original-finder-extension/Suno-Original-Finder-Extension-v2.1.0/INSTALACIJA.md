# Instalacija Suno Original Finder 2.1

## 1. Ukloni staru verziju

U Chrome-u otvori `chrome://extensions` i ukloni **Suno Original Finder 1.0.0**. Ne koristi više folder `Program-Patch` iz stare verzije.

## 2. Pokreni program

Pokreni Suno Pesme Studio i otključaj ga PIN-om. Lokalni program treba da radi na `http://127.0.0.1:8765`.

## 3. Instaliraj Bridge

Pokreni:

`INSTALIRAJ_I_POPRAVI.bat`

Skripta:

- pronalazi ugrađeni Python iz Suno Pesme Studio programa;
- kopira Bridge u `%LOCALAPPDATA%\SunoOriginalFinderBridge`;
- pokreće ga nevidljivo na portu `8766`;
- dodaje ga u Windows Startup;
- proverava vezu sa programom;
- ne menja nijedan fajl Suno Pesme Studio programa.

Ako automatski ne pronađe program, izaberi glavni folder koji u sebi sadrži folder `Program`.

## 4. Učitaj extension

1. Otvori `chrome://extensions`.
2. Uključi **Developer mode**.
3. Klikni **Load unpacked / Učitaj raspakovano**.
4. Izaberi ceo folder `Suno-Original-Finder-Extension-v2.1.0`.
5. Proveri da ID bude `igjckdibhjehimobmpkkbebidfodebei`.

## 5. Provera

Pokreni `PROVERI_CEO_SISTEM.bat` ili otvori popup extension-a.

Ispravno stanje mora da prikaže:

- Bridge `2.1.0`;
- program online;
- verziju programa;
- broj pesama u biblioteci;
- broj pesama sa audio izvorom;
- broj indeksiranih pesama.

Ako je broj indeksiranih pesama `0`, klikni **Audio indeks**. Indeksiranje može trajati duže jer program obrađuje svaku pesmu.

## 6. Prvo prepoznavanje

1. Otvori svoj YouTube Shorts ili običan video.
2. Klikni ikonicu extension-a.
3. Klikni **Prepoznaj sada**.
4. Extension će prvo proveriti postojeće rezultate.
5. Ako nema rezultata, program preuzima audio videa i poredi ga sa indeksiranim Suno pesmama.

## Ako ne radi

### Bridge nije pokrenut

Pokreni `Bridge\POKRENI_BRIDGE.bat`.

### Program radi, ali popup kaže da nije dostupan

Proveri da je program otključan PIN-om i da se otvara na `127.0.0.1:8765`.

### Biblioteka postoji, ali indeksirano je 0

Klikni **Audio indeks**. Pesma bez lokalnog audio fajla, važećeg Suno audio linka ili ranije sačuvanog fingerprint-a ne može da bude prepoznata.

### Original nije pronađen

Mogući razlozi:

- video koristi drugi miks, jak voice-over ili muziku u pozadini;
- pesma nije indeksirana;
- Shorts je prekratak;
- zvuk je mnogo ubrzan, usporen ili promenjen;
- yt-dlp/FFmpeg nisu uspeli da preuzmu zvuk.

Otvori **Veliki panel → Dijagnostika** i pogledaj poslednje zapise programa.

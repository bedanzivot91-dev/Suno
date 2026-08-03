# Suno Original Finder 2.1

Lokalni Chromium extension za povezivanje YouTube videa i Shorts-a sa indeksiranom bibliotekom programa **Suno Pesme Studio**.

## Zašto verzija 1.0.0 nije radila kako treba

Verzija 1.0.0 je mogla da pročita `/api/health`, pa je prikazivala da je program povezan. Međutim, za pokretanje nove audio analize slala je `POST` direktno programu na port `8765`. Program odbija `POST` koji dolazi sa browser-extension origin-a. Zato se pojavljivala poruka da compatibility patch nije instaliran i original nije bio pronađen.

To je bio loš dizajn: ključna funkcija je zavisila od ručnog menjanja `server.py`.

## Kako 2.1 rešava problem

Verzija 2.1 koristi lokalni **Bridge** na `127.0.0.1:8766`:

`YouTube → extension → Bridge 8766 → Suno Pesme Studio 8765 → indeksirane pesme`

Bridge:

- ne menja `server.py`;
- ne traži compatibility patch;
- čita stvarno stanje biblioteke i audio indeksa;
- pokreće postojeće audio analize programa;
- ne prosleđuje browser `Origin` programu;
- radi samo na lokalnom računaru.

## Glavne funkcije

- automatsko prepoznavanje originalne Suno pesme na YouTube Watch i Shorts stranicama;
- prikaz naziva originala, Suno ID-a, Suno linka, audio procenta i pokrivenosti;
- automatsko pravljenje audio indeksa ako ne postoji;
- duboka analiza i ponovna analiza;
- prepoznavanje više pesama u mix videu;
- praćenje pesme koja trenutno svira u mix-u;
- ručna pretraga kompletne Suno biblioteke;
- ručno povezivanje videa i pesme;
- grupna provera povezanih YouTube kanala i Shorts videa;
- audio i coverage izveštaji;
- istorija i CSV izvoz;
- pauza, nastavak i otkazivanje aktivnog zadatka;
- čišćenje YouTube audio keša;
- pregled poslednjih logova programa;
- Street Mixtape skin na popup-u, YouTube kartici, Side Panel-u i podešavanjima.

## Zahtevi

- Suno Pesme Studio mora biti pokrenut i otključan;
- pesme moraju biti u biblioteci;
- za audio prepoznavanje mora postojati sačuvan audio fingerprint ili dostupan audio izvor;
- Bridge mora biti instaliran i pokrenut.

## Najbrža instalacija

1. Pokreni Suno Pesme Studio i otključaj ga.
2. Pokreni `INSTALIRAJ_I_POPRAVI.bat`.
3. U `chrome://extensions` ukloni staru verziju 1.0.0.
4. Klikni **Load unpacked** i izaberi ceo folder `Suno-Original-Finder-Extension-v2.1.0`.
5. Otvori popup extension-a. Mora da prikaže Bridge 2.1.0, verziju programa, broj pesama i broj indeksiranih pesama.
6. Ako je indeksirano `0`, klikni **Audio indeks**.

Detalji su u `INSTALACIJA.md`.


## Dokazi i ograničenja

- `docs/KOMPATIBILNOST-3.3.2.md` navodi tačno proverene rute iz dostavljenog programa.
- `docs/TEST-IZVESTAJ.md` odvaja automatske testove od pravog Windows end-to-end testa koji mora da se uradi na računaru korisnika.

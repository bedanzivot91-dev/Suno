# Predlog stabilnog Extension API ugovora za buduće verzije programa

Extension već radi sa trenutnim 3.x rutama. Sledeći ugovor je dodat da buduće verzije Suno Pesme Studio programa mogu da pruže brži i stabilniji pristup bez preuzimanja kompletnih lista rezultata.

## 1. Capabilities

`GET /api/extensions/v1/capabilities`

Primer odgovora:

```json
{
  "ok": true,
  "program_version": "4.0.0",
  "api_version": "1.0",
  "capabilities": {
    "lookup_originals": true,
    "analyze_video": true,
    "search_songs": true,
    "task_status": true
  }
}
```

## 2. Direktno traženje originala

`GET /api/extensions/v1/youtube/videos/{video_id}/originals`

Odgovor treba da sadrži samo rezultate za jedan video:

```json
{
  "ok": true,
  "status": "matched",
  "program_version": "4.0.0",
  "items": [
    {
      "song_id": "suno-id",
      "song_title": "Naziv originala",
      "source_url": "https://suno.com/song/...",
      "audio_score": 96.2,
      "coverage_percent": 100,
      "completeness_status": "complete",
      "confidence": "high",
      "version_type": "kratak klip / Shorts",
      "segments": []
    }
  ]
}
```

## 3. Pokretanje analize

`POST /api/extensions/v1/youtube/analyze`

Telo ostaje kompatibilno sa postojećim `POST /api/youtube/audio-analyze-url`:

```json
{
  "url": "https://www.youtube.com/shorts/VIDEO_ID",
  "song_ids": [],
  "candidate_limit": 16,
  "deep": false,
  "reuse_cache": true,
  "force": false,
  "detect_multiple": true,
  "max_songs_per_video": 6
}
```

## 4. Bezbednost

- Server mora da prihvata samo loopback hostove.
- Extension endpoint ne treba da vraća Suno/Google tokene, kolačiće ili OAuth tajne.
- API može poštovati postojeći PIN lock.
- Preporučeno je uvesti lokalni pairing token između programa i extension-a za buduću javnu distribuciju.
- Ne dozvoljavati da content script prosleđuje proizvoljne URL-ove lokalnom serveru; prihvatati samo validne YouTube adrese.

## 5. Origin i stabilni extension ID

Za lokalne browser zahteve preporučeni origin je:

`chrome-extension://igjckdibhjehimobmpkkbebidfodebei`

Program ne treba da dozvoli proizvoljan `chrome-extension://*` origin. Treba dozvoliti samo poznati stabilni ID ili budući pairing token.

Za preflight odgovor preporučena zaglavlja:

- `Access-Control-Allow-Origin` sa tačnim origin-om;
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`;
- `Access-Control-Allow-Headers: Accept, Content-Type`;
- `Access-Control-Allow-Private-Network: true` kada browser to zatraži;
- `Vary: Origin`.

## 6. Preporučene dodatne rute

Da se izbegne čitanje velikih lista u legacy režimu, buduća verzija može dodati:

- `GET /api/extensions/v1/youtube/videos/{video_id}/originals`;
- `GET /api/extensions/v1/tasks/{task_id}`;
- `POST /api/extensions/v1/youtube/channels/{channel_id}/analyze`;
- `POST /api/extensions/v1/reports/audio`;
- `POST /api/extensions/v1/reports/coverage`.

Odgovori treba da budu mali, verzionisani i bez tokena, kolačića, lokalnih putanja ili drugih tajni.

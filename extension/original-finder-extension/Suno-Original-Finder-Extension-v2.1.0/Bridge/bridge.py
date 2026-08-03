#!/usr/bin/env python3
"""Suno Original Finder Bridge v2.

Local, loopback-only adapter between a Chromium extension and Suno Pesme Studio.
It does not read the database directly and does not modify the main program.
"""
from __future__ import annotations

import json
import logging
import os
import re
import signal
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

BRIDGE_VERSION = "2.1.0"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8766
DEFAULT_PROGRAM_BASE = "http://127.0.0.1:8765"
EXTENSION_ID = "igjckdibhjehimobmpkkbebidfodebei"
ALLOWED_ORIGINS = {
    f"chrome-extension://{EXTENSION_ID}",
    f"edge-extension://{EXTENSION_ID}",
    f"extension://{EXTENSION_ID}",
}
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "bridge_config.json"
LOG_PATH = ROOT / "bridge.log"
PID_PATH = ROOT / "bridge.pid"

LOG = logging.getLogger("suno-original-bridge")
LOG.addHandler(logging.NullHandler())


def configure_logging() -> None:
    if any(not isinstance(handler, logging.NullHandler) for handler in LOG.handlers):
        return
    LOG.handlers.clear()
    LOG.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    file_handler = logging.FileHandler(LOG_PATH, encoding="utf-8")
    file_handler.setFormatter(formatter)
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    LOG.addHandler(file_handler)
    LOG.addHandler(stream_handler)
    LOG.propagate = False


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def load_config() -> dict[str, Any]:
    config: dict[str, Any] = {
        "host": DEFAULT_HOST,
        "port": DEFAULT_PORT,
        "program_base": DEFAULT_PROGRAM_BASE,
        "request_timeout_seconds": 30,
        "max_lookup_rows": 20000,
    }
    if CONFIG_PATH.exists():
        try:
            raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))
            if isinstance(raw, dict):
                config.update(raw)
        except Exception as exc:
            LOG.warning("Neispravan bridge_config.json: %s", exc)
    host = str(config.get("host") or DEFAULT_HOST).strip()
    if host not in {"127.0.0.1", "localhost", "::1"}:
        host = DEFAULT_HOST
    config["host"] = host
    config["port"] = max(1024, min(65535, int(config.get("port") or DEFAULT_PORT)))
    base = str(config.get("program_base") or DEFAULT_PROGRAM_BASE).rstrip("/")
    parsed = urllib.parse.urlparse(base)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        base = DEFAULT_PROGRAM_BASE
    config["program_base"] = base
    config["request_timeout_seconds"] = max(3, min(180, int(config.get("request_timeout_seconds") or 30)))
    config["max_lookup_rows"] = max(1000, min(50000, int(config.get("max_lookup_rows") or 20000)))
    return config


CONFIG = load_config()


class ProgramApiError(RuntimeError):
    def __init__(self, message: str, status: int = 0, payload: Any = None, code: str = "PROGRAM_API_ERROR") -> None:
        super().__init__(message)
        self.status = status
        self.payload = payload
        self.code = code


def json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")


def program_request(path: str, method: str = "GET", body: dict[str, Any] | None = None, timeout: int | None = None) -> Any:
    base = str(CONFIG["program_base"])
    url = base + (path if path.startswith("/") else "/" + path)
    data = json_bytes(body) if body is not None else None
    headers = {"Accept": "application/json", "User-Agent": f"SunoOriginalFinderBridge/{BRIDGE_VERSION}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout or int(CONFIG["request_timeout_seconds"])) as response:
            raw = response.read()
            content_type = response.headers.get("Content-Type", "")
            if "application/json" in content_type:
                return json.loads(raw.decode("utf-8")) if raw else {}
            return {"ok": True, "status": int(response.status), "text": raw.decode("utf-8", "replace")}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        payload: Any = None
        try:
            payload = json.loads(raw.decode("utf-8")) if raw else None
        except Exception:
            payload = {"message": raw.decode("utf-8", "replace")}
        message = str((payload or {}).get("message") or f"Program je vratio HTTP {exc.code}.")
        code = "PROGRAM_LOCKED" if exc.code == 423 else "PROGRAM_API_ERROR"
        raise ProgramApiError(message, int(exc.code), payload, code) from exc
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
        raise ProgramApiError("Suno Pesme Studio nije pokrenut ili ne odgovara na portu 8765.", 0, None, "PROGRAM_OFFLINE") from exc


def safe_program_call(path: str, default: Any = None, timeout: int | None = None) -> Any:
    try:
        return program_request(path, timeout=timeout)
    except ProgramApiError:
        return default


def program_locked() -> bool:
    status = safe_program_call("/api/v3/security/status", {}) or {}
    security = status.get("security") or status
    return bool(security.get("locked"))


def normalize_video_id(value: Any) -> str:
    video_id = str(value or "").strip()
    if not VIDEO_ID_RE.fullmatch(video_id):
        raise ProgramApiError("YouTube video ID nije ispravan.", 400, None, "INVALID_VIDEO_ID")
    return video_id


def canonical_video_url(video_id: str, is_short: bool = False) -> str:
    return f"https://www.youtube.com/{'shorts/' if is_short else 'watch?v='}{video_id}"


def extension_status() -> dict[str, Any]:
    try:
        health = program_request("/api/health", timeout=5)
    except ProgramApiError as exc:
        return {
            "ok": True,
            "bridge": {"version": BRIDGE_VERSION, "host": CONFIG["host"], "port": CONFIG["port"], "time": now_iso()},
            "program": {
                "online": False,
                "locked": False,
                "app": "Suno Pesme Studio",
                "version": "",
                "base": CONFIG["program_base"],
                "code": exc.code,
            },
            "library": {},
            "channels": [],
            "tools": {},
            "task": None,
            "ready": False,
            "message": str(exc),
        }
    locked = program_locked()
    result: dict[str, Any] = {
        "ok": True,
        "bridge": {"version": BRIDGE_VERSION, "host": CONFIG["host"], "port": CONFIG["port"], "time": now_iso()},
        "program": {
            "online": True,
            "locked": locked,
            "app": health.get("app") or "Suno Pesme Studio",
            "version": str(health.get("version") or ""),
            "pid": health.get("pid"),
            "base": CONFIG["program_base"],
        },
        "ready": False,
    }
    if locked:
        result["message"] = "Program je pokrenut, ali zaključan. Otključaj ga PIN-om."
        return result

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {
            "index": pool.submit(safe_program_call, "/api/song-finder/status", {}),
            "stats": pool.submit(safe_program_call, "/api/stats", {}),
            "channels": pool.submit(safe_program_call, "/api/youtube/channels", {}),
            "tools": pool.submit(safe_program_call, "/api/tools/ytdlp/status", {}),
            "task": pool.submit(safe_program_call, "/api/task", {}),
        }
        values = {name: future.result() or {} for name, future in futures.items()}

    index = values["index"]
    stats = values["stats"].get("stats") or {}
    channels = values["channels"].get("channels") or []
    tools = values["tools"]
    task = values["task"].get("task")
    songs_total = int(index.get("songs_total") or stats.get("total") or stats.get("songs") or 0)
    songs_indexed = int(index.get("songs_indexed") or 0)
    songs_with_audio = int(index.get("songs_with_audio") or 0)
    result.update({
        "library": {
            "songs_total": songs_total,
            "songs_with_audio": songs_with_audio,
            "songs_indexed": songs_indexed,
            "songs_not_indexed": int(index.get("songs_not_indexed") or max(0, songs_with_audio - songs_indexed)),
            "songs_without_any_source": int(index.get("songs_without_any_source") or 0),
            "algorithm_version": index.get("algorithm_version") or "",
            "last_indexed_at": index.get("last_indexed_at") or "",
        },
        "channels": channels,
        "tools": tools,
        "task": task,
    })
    result["ready"] = songs_total > 0 and songs_indexed > 0
    if songs_total <= 0:
        result["message"] = "Suno biblioteka je prazna."
    elif songs_with_audio <= 0:
        result["message"] = "Pesme postoje, ali nijedna nema dostupan audio izvor."
    elif songs_indexed <= 0:
        result["message"] = "Pesme nisu indeksirane. Pokreni audio indeks."
    elif songs_indexed < songs_with_audio:
        result["message"] = f"Indeks je delimičan: {songs_indexed}/{songs_with_audio} pesama."
    else:
        result["message"] = f"Spremno: {songs_indexed} indeksiranih pesama."
    return result


def _future_video_lookup(video_id: str) -> dict[str, Any] | None:
    """Use a future versioned program API when it exists.

    A 404 means the installed program is an older 3.x build, so the bridge
    transparently falls back to the existing routes below.
    """
    path = f"/api/extensions/v1/youtube/videos/{urllib.parse.quote(video_id)}/originals"
    try:
        payload = program_request(path, "GET", None, 20)
    except ProgramApiError as exc:
        if exc.status == 404:
            return None
        raise
    items = payload.get("items") or []
    if not isinstance(items, list):
        return None
    matches: list[dict[str, Any]] = []
    songs: dict[str, Any] = {}
    for raw in items:
        if not isinstance(raw, dict):
            continue
        row = dict(raw)
        row.setdefault("video_id", video_id)
        song_id = str(row.get("song_id") or "").strip()
        if song_id:
            songs[song_id] = {
                "id": song_id,
                "title": row.get("song_title") or row.get("title") or song_id,
                "source_url": row.get("source_url") or row.get("suno_url") or "",
                "audio_url": row.get("audio_url") or "",
                "youtube_url": row.get("original_url") or row.get("youtube_url") or "",
            }
        matches.append(row)
    return {
        "ok": True,
        "video_id": video_id,
        "matches": matches,
        "analyses": [],
        "songs": songs,
        "count": len({str(row.get("song_id") or "") for row in matches if row.get("song_id")}),
        "source": "program-extension-v1",
    }


def video_lookup(video_id: str) -> dict[str, Any]:
    video_id = normalize_video_id(video_id)
    future = _future_video_lookup(video_id)
    if future is not None:
        return future

    limit = int(CONFIG["max_lookup_rows"])
    encoded_id = urllib.parse.quote(video_id)
    # Current 3.x builds ignore video_id and return a bounded list. Keeping
    # the filter in the request lets a newer build optimize the same call.
    with ThreadPoolExecutor(max_workers=2) as pool:
        fm = pool.submit(program_request, f"/api/youtube/matches?video_id={encoded_id}&limit={limit}", "GET", None, 45)
        fa = pool.submit(program_request, f"/api/youtube/audio-analysis?video_id={encoded_id}&limit={limit}", "GET", None, 45)
        matches_payload = fm.result()
        analyses_payload = fa.result()
    matches = [row for row in (matches_payload.get("matches") or []) if str(row.get("video_id") or "") == video_id]
    analyses = [row for row in (analyses_payload.get("rows") or []) if str(row.get("video_id") or "") == video_id]
    song_ids = []
    for row in matches + analyses:
        song_id = str(row.get("song_id") or "")
        if song_id and song_id not in song_ids:
            song_ids.append(song_id)
    songs: dict[str, Any] = {}
    if song_ids:
        with ThreadPoolExecutor(max_workers=min(8, len(song_ids))) as pool:
            futures = {sid: pool.submit(safe_program_call, f"/api/song?id={urllib.parse.quote(sid)}", {}) for sid in song_ids[:40]}
            for sid, future in futures.items():
                payload = future.result() or {}
                if payload.get("song"):
                    songs[sid] = payload["song"]
    return {
        "ok": True,
        "video_id": video_id,
        "matches": matches,
        "analyses": analyses,
        "songs": songs,
        "count": len({str(row.get('song_id') or '') for row in matches + analyses if row.get('song_id')}),
        "source": "bridge-v2-legacy-adapter",
    }


def youtube_insights() -> dict[str, Any]:
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            "summary": pool.submit(safe_program_call, "/api/youtube/summary", {}),
            "audio": pool.submit(safe_program_call, "/api/youtube/audio-analysis?limit=1", {}),
            "coverage": pool.submit(safe_program_call, "/api/youtube/coverage", {}),
            "duplicates": pool.submit(safe_program_call, "/api/youtube/duplicate-mix-report", {}),
        }
        values = {name: future.result() or {} for name, future in futures.items()}
    return {
        "ok": True,
        "summary": values["summary"].get("summary") or {},
        "audio_summary": values["audio"].get("summary") or {},
        "coverage": values["coverage"].get("coverage") or {},
        "duplicate_mix_report": values["duplicates"].get("report") or {},
    }


def read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    try:
        length = int(handler.headers.get("Content-Length") or 0)
    except ValueError as exc:
        raise ProgramApiError("Content-Length nije ispravan.", 400, None, "BAD_REQUEST") from exc
    if length <= 0:
        return {}
    if length > 2 * 1024 * 1024:
        raise ProgramApiError("Zahtev je prevelik.", 413, None, "REQUEST_TOO_LARGE")
    raw = handler.rfile.read(length)
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise ProgramApiError("JSON zahtev nije ispravan.", 400, None, "BAD_JSON") from exc
    if not isinstance(data, dict):
        raise ProgramApiError("JSON zahtev mora biti objekat.", 400, None, "BAD_JSON")
    return data


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = f"SunoOriginalFinderBridge/{BRIDGE_VERSION}"

    def log_message(self, fmt: str, *args: Any) -> None:
        LOG.info("%s - %s", self.client_address[0], fmt % args)

    def _origin_allowed(self) -> bool:
        origin = str(self.headers.get("Origin") or "").strip()
        return not origin or origin in ALLOWED_ORIGINS or origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:")

    def _common_headers(self) -> None:
        origin = str(self.headers.get("Origin") or "").strip()
        if origin and self._origin_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")

    def _send(self, payload: Any, status: int = 200) -> None:
        raw = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._common_headers()
        self.end_headers()
        self.wfile.write(raw)

    def _send_error_payload(self, exc: Exception) -> None:
        if isinstance(exc, ProgramApiError):
            status = exc.status if 400 <= exc.status <= 599 else (503 if exc.code == "PROGRAM_OFFLINE" else 500)
            self._send({"ok": False, "message": str(exc), "code": exc.code, "program_status": exc.status, "payload": exc.payload}, status)
            return
        LOG.exception("Neobrađena bridge greška")
        self._send({"ok": False, "message": str(exc) or "Nepoznata bridge greška.", "code": "BRIDGE_ERROR"}, 500)

    def do_OPTIONS(self) -> None:
        if not self._origin_allowed():
            self._send({"ok": False, "message": "Origin nije dozvoljen.", "code": "ORIGIN_BLOCKED"}, 403)
            return
        self.send_response(204)
        self._common_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Accept, Content-Type, X-SPS-Extension-Version")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        if self.client_address[0] not in {"127.0.0.1", "::1"}:
            self._send({"ok": False, "message": "Bridge prihvata samo lokalne zahteve.", "code": "LOOPBACK_ONLY"}, 403)
            return
        if not self._origin_allowed():
            self._send({"ok": False, "message": "Origin nije dozvoljen.", "code": "ORIGIN_BLOCKED"}, 403)
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = urllib.parse.parse_qs(parsed.query)
        try:
            if path in {"/bridge/health", "/api/extensions/v2/health"}:
                try:
                    health = program_request("/api/health", timeout=3)
                    program = {"online": True, "version": health.get("version"), "app": health.get("app")}
                except ProgramApiError as exc:
                    program = {"online": False, "message": str(exc), "code": exc.code}
                self._send({"ok": True, "bridge": {"version": BRIDGE_VERSION, "pid": os.getpid(), "time": now_iso()}, "program": program})
                return
            if path == "/api/extensions/v2/status":
                self._send(extension_status())
                return
            if path == "/api/extensions/v2/index/status":
                self._send(program_request("/api/song-finder/status"))
                return
            if path == "/api/extensions/v2/task":
                self._send(program_request("/api/task"))
                return
            if path == "/api/extensions/v2/channels":
                self._send(program_request("/api/youtube/channels"))
                return
            if path == "/api/extensions/v2/library/search":
                search = str((query.get("q") or [""])[0])
                limit = max(1, min(200, int((query.get("limit") or ["80"])[0] or 80)))
                payload = program_request(f"/api/songs?search={urllib.parse.quote(search)}&sort=newest&limit={limit}")
                self._send(payload)
                return
            if path == "/api/extensions/v2/library/song":
                song_id = str((query.get("id") or [""])[0]).strip()
                if not song_id:
                    raise ProgramApiError("Suno ID nije prosleđen.", 400, None, "SONG_REQUIRED")
                self._send(program_request(f"/api/song?id={urllib.parse.quote(song_id)}"))
                return
            if path == "/api/extensions/v2/youtube/video":
                video_id = str((query.get("video_id") or [""])[0])
                self._send(video_lookup(video_id))
                return
            if path == "/api/extensions/v2/logs":
                limit = max(1, min(500, int((query.get("limit") or ["100"])[0] or 100)))
                payload = program_request("/api/logs")
                logs = payload.get("logs") or []
                self._send({"ok": True, "logs": logs[-limit:] if isinstance(logs, list) else logs})
                return
            if path == "/api/extensions/v2/youtube/insights":
                self._send(youtube_insights())
                return
            self._send({"ok": False, "message": "Bridge ruta nije pronađena.", "code": "NOT_FOUND"}, 404)
        except Exception as exc:
            self._send_error_payload(exc)

    def do_POST(self) -> None:
        if self.client_address[0] not in {"127.0.0.1", "::1"}:
            self._send({"ok": False, "message": "Bridge prihvata samo lokalne zahteve.", "code": "LOOPBACK_ONLY"}, 403)
            return
        if not self._origin_allowed():
            self._send({"ok": False, "message": "Origin nije dozvoljen.", "code": "ORIGIN_BLOCKED"}, 403)
            return
        path = urllib.parse.urlparse(self.path).path.rstrip("/") or "/"
        try:
            body = read_json_body(self)
            if path == "/api/extensions/v2/index/build":
                payload = program_request("/api/song-finder/index", "POST", {"force": bool(body.get("force"))}, 30)
                self._send(payload)
                return
            if path == "/api/extensions/v2/youtube/analyze":
                video_id = normalize_video_id(body.get("video_id"))
                request_body = {
                    "url": canonical_video_url(video_id, bool(body.get("is_short"))),
                    "song_ids": [str(x) for x in (body.get("song_ids") or []) if str(x).strip()][:200],
                    "candidate_limit": max(4, min(40, int(body.get("candidate_limit") or 20))),
                    "deep": bool(body.get("deep")),
                    "reuse_cache": body.get("reuse_cache") is not False,
                    "force": bool(body.get("force")),
                    "detect_multiple": body.get("detect_multiple") is not False,
                    "max_songs_per_video": max(1, min(20, int(body.get("max_songs_per_video") or 8))),
                }
                try:
                    payload = program_request("/api/extensions/v1/youtube/analyze", "POST", request_body, 30)
                except ProgramApiError as exc:
                    if exc.status != 404:
                        raise
                    payload = program_request("/api/youtube/audio-analyze-url", "POST", request_body, 30)
                self._send(payload)
                return
            if path == "/api/extensions/v2/youtube/manual-link":
                video_id = normalize_video_id(body.get("video_id"))
                song_id = str(body.get("song_id") or "").strip()
                if not song_id:
                    raise ProgramApiError("Suno pesma nije izabrana.", 400, None, "SONG_REQUIRED")
                payload = program_request("/api/youtube/manual-link", "POST", {"video_id": video_id, "song_id": song_id}, 30)
                self._send(payload)
                return
            if path == "/api/extensions/v2/program-task":
                kind = str(body.get("kind") or "")
                endpoints = {
                    "ownedAudio": "/api/youtube/audio-analyze-owned",
                    "shortsAudio": "/api/youtube/channel/scan-shorts",
                    "fingerprintIndex": "/api/song-finder/index",
                    "metadataScan": "/api/youtube/scan-owned",
                    "globalScan": "/api/youtube/scan-global",
                }
                endpoint = endpoints.get(kind)
                if not endpoint:
                    raise ProgramApiError("Nepoznat grupni zadatak.", 400, None, "TASK_NOT_ALLOWED")
                options = body.get("options") if isinstance(body.get("options"), dict) else {}
                if kind == "fingerprintIndex":
                    options = {"force": bool(options.get("force"))}
                payload = program_request(endpoint, "POST", options, 30)
                self._send(payload)
                return
            if path == "/api/extensions/v2/report/export":
                kind = str(body.get("kind") or "")
                endpoints = {"audio": "/api/youtube/audio-report/export", "coverage": "/api/youtube/coverage-report/export"}
                endpoint = endpoints.get(kind)
                if not endpoint:
                    raise ProgramApiError("Nepoznat izveštaj.", 400, None, "REPORT_NOT_ALLOWED")
                payload = program_request(endpoint, "POST", {}, 90)
                self._send(payload)
                return
            if path == "/api/extensions/v2/task/cancel":
                payload = program_request("/api/task/cancel", "POST", {}, 30)
                self._send(payload)
                return
            if path == "/api/extensions/v2/task/control":
                action = str(body.get("action") or "").strip().lower()
                endpoints = {
                    "pause": "/api/task/pause",
                    "resume": "/api/task/resume",
                    "cancel": "/api/task/cancel",
                }
                endpoint = endpoints.get(action)
                if not endpoint:
                    raise ProgramApiError("Dozvoljene komande su pause, resume i cancel.", 400, None, "TASK_ACTION_NOT_ALLOWED")
                payload = program_request(endpoint, "POST", {}, 30)
                if isinstance(payload, dict) and not payload.get("message"):
                    payload = {**payload, "message": action}
                self._send(payload)
                return
            if path == "/api/extensions/v2/audio-cache/cleanup":
                payload = program_request("/api/youtube/audio-cache/cleanup", "POST", {
                    "days": max(1, min(365, int(body.get("days") or 30))),
                    "gb": max(1, min(500, float(body.get("gb") or 10))),
                }, 90)
                self._send(payload)
                return
            self._send({"ok": False, "message": "Bridge ruta nije pronađena.", "code": "NOT_FOUND"}, 404)
        except Exception as exc:
            self._send_error_payload(exc)


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def run() -> int:
    configure_logging()
    host = str(CONFIG["host"])
    port = int(CONFIG["port"])
    server = ReusableThreadingHTTPServer((host, port), BridgeHandler)
    PID_PATH.write_text(str(os.getpid()), encoding="ascii")

    def stop_handler(_signum: int, _frame: Any) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop_handler)
    if hasattr(signal, "SIGINT"):
        signal.signal(signal.SIGINT, stop_handler)
    LOG.info("Suno Original Finder Bridge v%s sluša na http://%s:%s; program=%s", BRIDGE_VERSION, host, port, CONFIG["program_base"])
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        try:
            PID_PATH.unlink(missing_ok=True)
        except Exception:
            pass
        LOG.info("Bridge je zaustavljen.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except OSError as exc:
        LOG.error("Bridge nije pokrenut: %s", exc)
        raise SystemExit(2)

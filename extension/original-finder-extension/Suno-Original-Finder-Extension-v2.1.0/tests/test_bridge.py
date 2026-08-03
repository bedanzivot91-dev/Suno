from __future__ import annotations

import importlib.util
import json
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BRIDGE_FILE = ROOT / "Bridge" / "bridge.py"
spec = importlib.util.spec_from_file_location("sps_bridge_under_test", BRIDGE_FILE)
assert spec and spec.loader
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

VIDEO_ID = "dQw4w9WgXcQ"
EXT_ORIGIN = f"chrome-extension://{bridge.EXTENSION_ID}"
requests_seen: list[dict[str, Any]] = []


def send_json(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


class MockProgramHandler(BaseHTTPRequestHandler):
    def log_message(self, _fmt: str, *_args: Any) -> None:
        return

    def _record(self, body: Any = None) -> None:
        requests_seen.append({
            "method": self.command,
            "path": self.path,
            "origin": self.headers.get("Origin"),
            "user_agent": self.headers.get("User-Agent"),
            "body": body,
        })

    def do_GET(self) -> None:
        self._record()
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/extensions/v1/youtube/videos/"):
            send_json(self, {"ok": False, "message": "not found"}, 404)
        elif path == "/api/health":
            send_json(self, {"ok": True, "app": "Suno Pesme Studio", "version": "3.3.2", "pid": 123})
        elif path == "/api/v3/security/status":
            send_json(self, {"ok": True, "security": {"locked": False}})
        elif path == "/api/song-finder/status":
            send_json(self, {
                "ok": True,
                "songs_total": 3,
                "songs_with_audio": 2,
                "songs_indexed": 2,
                "songs_not_indexed": 0,
                "songs_without_any_source": 1,
                "algorithm_version": "mock-v1",
                "last_indexed_at": "2026-08-03T20:00:00+02:00",
            })
        elif path == "/api/stats":
            send_json(self, {"ok": True, "stats": {"total": 3}})
        elif path == "/api/youtube/channels":
            send_json(self, {"ok": True, "channels": [{"channel_id": "UCOWN", "title": "Nedostaješ PUNOO", "is_owned": 1}]})
        elif path == "/api/tools/ytdlp/status":
            send_json(self, {"ok": True, "ready": True, "version": "mock"})
        elif path == "/api/task":
            send_json(self, {"ok": True, "task": None})
        elif path == "/api/youtube/matches":
            send_json(self, {"ok": True, "matches": [
                {"video_id": "AAAAAAAAAAA", "song_id": "other", "score": 12},
                {"video_id": VIDEO_ID, "song_id": "song-1", "score": 88, "video_title": "Short video"},
            ]})
        elif path == "/api/youtube/audio-analysis":
            send_json(self, {"ok": True, "rows": [
                {"video_id": VIDEO_ID, "song_id": "song-1", "audio_score": 96.4, "coverage_percent": 34.0,
                 "completeness_status": "short_clip", "audio_checked_at": "2026-08-03T20:10:00+02:00"},
            ]})
        elif path == "/api/song":
            send_json(self, {"ok": True, "song": {"id": "song-1", "title": "Pravi Suno original", "source_url": "https://suno.com/song/abc"}})
        elif path == "/api/logs":
            send_json(self, {"ok": True, "logs": ["mock log"]})
        elif path == "/api/youtube/summary":
            send_json(self, {"ok": True, "summary": {"matches": 5, "channels": 1}})
        elif path == "/api/youtube/coverage":
            send_json(self, {"ok": True, "coverage": {"summary": {"missing": 2}}})
        elif path == "/api/youtube/duplicate-mix-report":
            send_json(self, {"ok": True, "report": {"duplicates": [], "mixes": []}})
        else:
            send_json(self, {"ok": False, "message": f"unknown {self.path}"}, 404)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        self._record(body)
        path = self.path.split("?", 1)[0]
        if path == "/api/extensions/v1/youtube/analyze":
            send_json(self, {"ok": False, "message": "not found"}, 404)
        elif path == "/api/youtube/audio-analyze-url":
            send_json(self, {"ok": True, "task": {"id": "audio-task", "status": "running"}})
        elif path == "/api/song-finder/index":
            send_json(self, {"ok": True, "task": {"id": "index-task", "status": "running"}})
        elif path == "/api/task/cancel":
            send_json(self, {"ok": True, "message": "cancelled", "task": {"id": "audio-task", "status": "cancelled"}})
        elif path == "/api/youtube/audio-cache/cleanup":
            send_json(self, {"ok": True, "removed": 3, "message": "cleaned"})
        elif path in {"/api/task/pause", "/api/task/resume", "/api/task/cancel"}:
            send_json(self, {"ok": True, "message": path.rsplit('/', 1)[-1], "task": {"id": "audio-task", "status": "running"}})
        elif path == "/api/youtube/audio-cache/cleanup":
            send_json(self, {"ok": True, "removed": 3, "message": "cleaned"})
        else:
            send_json(self, {"ok": False, "message": f"unknown {self.path}"}, 404)


def request_json(url: str, method: str = "GET", body: dict[str, Any] | None = None, origin: str | None = EXT_ORIGIN) -> tuple[int, dict[str, Any], Any]:
    raw = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if origin is not None:
        headers["Origin"] = origin
    request = urllib.request.Request(url, data=raw, method=method, headers=headers)
    try:
        response = urllib.request.urlopen(request, timeout=10)
    except urllib.error.HTTPError as exc:
        payload = json.loads(exc.read().decode("utf-8"))
        return exc.code, payload, exc.headers
    with response:
        payload = json.loads(response.read().decode("utf-8"))
        return response.status, payload, response.headers


def start_server(handler: type[BaseHTTPRequestHandler]) -> tuple[ThreadingHTTPServer, threading.Thread]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


program_server, _program_thread = start_server(MockProgramHandler)
bridge.CONFIG = {
    **bridge.CONFIG,
    "host": "127.0.0.1",
    "port": 0,
    "program_base": f"http://127.0.0.1:{program_server.server_port}",
    "request_timeout_seconds": 5,
    "max_lookup_rows": 20000,
}
bridge_server, _bridge_thread = start_server(bridge.BridgeHandler)
base = f"http://127.0.0.1:{bridge_server.server_port}"

try:
    status_code, status, headers = request_json(base + "/api/extensions/v2/status")
    assert status_code == 200
    assert status["ok"] is True
    assert status["program"]["online"] is True
    assert status["program"]["version"] == "3.3.2"
    assert status["library"]["songs_total"] == 3
    assert status["library"]["songs_indexed"] == 2
    assert status["ready"] is True
    assert headers.get("Access-Control-Allow-Origin") == EXT_ORIGIN

    code, lookup, _ = request_json(base + f"/api/extensions/v2/youtube/video?video_id={VIDEO_ID}")
    assert code == 200
    assert lookup["source"] == "bridge-v2-legacy-adapter"
    assert len(lookup["matches"]) == 1
    assert lookup["matches"][0]["song_id"] == "song-1"
    assert lookup["analyses"][0]["audio_score"] == 96.4
    assert lookup["songs"]["song-1"]["title"] == "Pravi Suno original"
    assert any("video_id=" + VIDEO_ID in item["path"] for item in requests_seen if item["path"].startswith("/api/youtube/matches"))

    code, analyzed, _ = request_json(base + "/api/extensions/v2/youtube/analyze", "POST", {
        "video_id": VIDEO_ID,
        "is_short": True,
        "url": "https://evil.example/ignored",
        "candidate_limit": 18,
        "deep": True,
        "detect_multiple": True,
        "max_songs_per_video": 7,
    })
    assert code == 200
    assert analyzed["task"]["id"] == "audio-task"
    forwarded = [item for item in requests_seen if item["path"] == "/api/youtube/audio-analyze-url"][-1]
    assert forwarded["origin"] is None, "Bridge must not forward browser Origin to the program"
    assert forwarded["body"]["url"] == f"https://www.youtube.com/shorts/{VIDEO_ID}"
    assert "evil.example" not in json.dumps(forwarded["body"])
    assert forwarded["body"]["candidate_limit"] == 18
    assert forwarded["body"]["deep"] is True

    code, controlled, _ = request_json(base + "/api/extensions/v2/task/control", "POST", {"action": "pause"})
    assert code == 200
    assert controlled["message"] == "pause"
    forwarded_control = [item for item in requests_seen if item["path"] == "/api/task/pause"][-1]
    assert forwarded_control["origin"] is None

    code, cleaned, _ = request_json(base + "/api/extensions/v2/audio-cache/cleanup", "POST", {"days": 30, "gb": 10})
    assert code == 200
    assert cleaned["removed"] == 3

    code, insights, _ = request_json(base + "/api/extensions/v2/youtube/insights")
    assert code == 200
    assert insights["summary"]["matches"] == 5
    assert insights["coverage"]["summary"]["missing"] == 2

    code, cancelled, _ = request_json(base + "/api/extensions/v2/task/cancel", "POST", {})
    assert code == 200
    assert cancelled["task"]["status"] == "cancelled"

    code, cleaned, _ = request_json(base + "/api/extensions/v2/audio-cache/cleanup", "POST", {"days": 30, "gb": 10})
    assert code == 200
    assert cleaned["removed"] == 3

    code, blocked, _ = request_json(base + "/api/extensions/v2/status", origin="chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    assert code == 403
    assert blocked["code"] == "ORIGIN_BLOCKED"

    code, invalid, _ = request_json(base + "/api/extensions/v2/youtube/analyze", "POST", {"video_id": "bad"})
    assert code == 400
    assert invalid["code"] == "INVALID_VIDEO_ID"

    assert all(item["origin"] is None for item in requests_seen), "No request forwarded to Suno Pesme Studio may include Origin"
    print("BRIDGE_INTEGRATION_TESTS_OK")
finally:
    bridge_server.shutdown()
    bridge_server.server_close()
    program_server.shutdown()
    program_server.server_close()

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable

from audio_tools import ffmpeg_path
from v3_features import (
    _panako_java,
    _preferred_wsl_distro,
    _run_process,
    _wsl_path,
    _wsl_run,
    ensure_panako_installed,
    now_iso,
)

ENGINES = ("panako", "olaf")
DEFAULT_BATCH_SIZE = 50
MANIFEST_VERSION = 2


def _sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _engine_root(data_dir: Path, engine: str) -> Path:
    key = str(engine or "").strip().lower()
    if key not in ENGINES:
        raise ValueError(f"Nepoznat Panako engine: {engine}")
    path = Path(data_dir).expanduser().resolve() / "panako_runtime" / key
    path.mkdir(parents=True, exist_ok=True)
    return path


def _manifest_path(data_dir: Path, engine: str) -> Path:
    return _engine_root(data_dir, engine) / "manifest.json"


def _engine_storage_paths(data_dir: Path, engine: str) -> tuple[Path, Path]:
    root = _engine_root(data_dir, engine)
    database = root / "db"
    cache = root / "cache"
    database.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    return database, cache


def _engine_config_args(root: Path, data_dir: Path, engine: str) -> list[str]:
    database, cache = _engine_storage_paths(data_dir, engine)
    database_arg = _prepare_arg(root, database)
    cache_arg = _prepare_arg(root, cache)
    if engine == "panako":
        return [f"PANAKO_LMDB_FOLDER={database_arg}", f"PANAKO_CACHE_FOLDER={cache_arg}"]
    if engine == "olaf":
        return [f"OLAF_LMDB_FOLDER={database_arg}", f"OLAF_CACHE_FOLDER={cache_arg}"]
    raise ValueError(f"Nepoznat Panako engine: {engine}")


def _load_manifest(data_dir: Path, engine: str) -> dict[str, Any]:
    path = _manifest_path(data_dir, engine)
    if not path.is_file():
        return {"engine": engine, "version": MANIFEST_VERSION, "items": {}, "updated_at": ""}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"engine": engine, "version": MANIFEST_VERSION, "items": {}, "updated_at": ""}
    if not isinstance(payload, dict):
        return {"engine": engine, "version": MANIFEST_VERSION, "items": {}, "updated_at": ""}
    if int(payload.get("version") or 0) != MANIFEST_VERSION:
        return {"engine": engine, "version": MANIFEST_VERSION, "items": {}, "updated_at": ""}
    payload.setdefault("engine", engine)
    payload["version"] = MANIFEST_VERSION
    payload.setdefault("items", {})
    return payload


def _save_manifest(data_dir: Path, engine: str, manifest: dict[str, Any]) -> None:
    manifest = dict(manifest)
    manifest["engine"] = engine
    manifest["version"] = MANIFEST_VERSION
    manifest["updated_at"] = now_iso()
    path = _manifest_path(data_dir, engine)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, path)


def _quote_shell(value: str) -> str:
    return "'" + str(value).replace("'", "'\"'\"'") + "'"


def _engine_process(root: Path, data_dir: Path, engine: str, args: list[str], *, timeout: int = 1800) -> subprocess.CompletedProcess[str]:
    status = ensure_panako_installed(root)
    engine_home = _engine_root(data_dir, engine)
    config_args = _engine_config_args(root, data_dir, engine)
    effective_args = [*args, *config_args]
    if status.get("mode") == "wsl":
        distro = str(status.get("distro") or _preferred_wsl_distro() or "")
        if not distro:
            raise RuntimeError("WSL distribucija za Panako nije pronađena.")
        wsl_home = _wsl_path(distro, engine_home)
        quoted_args = " ".join(_quote_shell(arg) for arg in effective_args)
        script = ('JAR="$(readlink -f ~/.panako/panako.jar)"; ' f"mkdir -p {_quote_shell(wsl_home)}; " f"HOME={_quote_shell(wsl_home)} java -jar \"$JAR\" {quoted_args}")
        return _wsl_run(distro, script, timeout=timeout)
    java = _panako_java()
    executable = str(status.get("executable") or "")
    if not java or not executable:
        raise RuntimeError("Panako Java runtime nije spreman.")
    env = os.environ.copy()
    env["HOME"] = str(engine_home)
    return subprocess.run([java, "-jar", executable, *effective_args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout, cwd=str(Path(executable).parent), env=env, check=False)


def _prepare_arg(root: Path, value: str | Path) -> str:
    status = ensure_panako_installed(root)
    raw = str(value)
    if raw.startswith(("http://", "https://")):
        return raw
    path = Path(raw).expanduser().resolve()
    if status.get("mode") == "wsl":
        return _wsl_path(str(status.get("distro") or ""), path)
    return str(path)


def parse_query_output(output: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in str(output or "").splitlines():
        parts = [part.strip() for part in line.split(";")]
        if len(parts) < 13 or not parts[0].isdigit():
            continue
        rows.append({"query_path": parts[2], "query_start": parts[3], "query_stop": parts[4], "match_path": parts[5], "match_id": parts[6], "match_start": parts[7], "match_stop": parts[8], "match_score": parts[9], "time_factor": parts[10], "frequency_factor": parts[11], "seconds_with_match": parts[12], "raw": line})
    return rows


def reset_engine(root: Path, data_dir: Path, engine: str) -> dict[str, Any]:
    ensure_panako_installed(root)
    target = _engine_root(data_dir, engine)
    for name in ("db", "cache"):
        child = target / name
        if child.exists():
            shutil.rmtree(child, ignore_errors=False)
    _engine_storage_paths(data_dir, engine)
    _save_manifest(data_dir, engine, {"items": {}})
    return {"engine": engine, "reset": True, "path": str(target)}


def _engine_database_has_files(data_dir: Path, engine: str) -> bool:
    database, _ = _engine_storage_paths(data_dir, engine)
    return any(path.is_file() and path.stat().st_size > 0 for path in database.rglob("*"))


def engine_stats(root: Path, data_dir: Path, engine: str) -> dict[str, Any]:
    proc = _engine_process(root, data_dir, engine, ["stats", f"STRATEGY={engine}"], timeout=180)
    if proc.returncode != 0:
        raise RuntimeError(f"{engine} stats nije uspeo:\n" + (proc.stdout or "")[-4000:])
    manifest = _load_manifest(data_dir, engine)
    return {"engine": engine, "output": proc.stdout or "", "manifest_items": len(manifest.get("items") or {}), "manifest": manifest}


def index_engine(root: Path, data_dir: Path, engine: str, references: list[dict[str, str]], *, force: bool = False, batch_size: int = DEFAULT_BATCH_SIZE) -> dict[str, Any]:
    ensure_panako_installed(root)
    if force:
        reset_engine(root, data_dir, engine)
    manifest = _load_manifest(data_dir, engine)
    items = dict(manifest.get("items") or {})
    if items and not _engine_database_has_files(data_dir, engine):
        items = {}
        manifest = {"engine": engine, "version": MANIFEST_VERSION, "items": {}, "updated_at": ""}
        _save_manifest(data_dir, engine, manifest)
    pending = []
    skipped = 0
    for ref in references:
        song_id = str(ref.get("song_id") or "").strip(); path = str(ref.get("path") or "").strip(); sha256 = str(ref.get("sha256") or "").strip()
        if not song_id or not path:
            continue
        existing = items.get(song_id) or {}
        if not force and existing.get("sha256") == sha256 and existing.get("path") == path:
            skipped += 1; continue
        pending.append({"song_id": song_id, "path": path, "sha256": sha256})
    indexed = 0; failed = []; size = max(1, min(100, int(batch_size or DEFAULT_BATCH_SIZE)))
    for offset in range(0, len(pending), size):
        batch = pending[offset:offset + size]
        prepared = [_prepare_arg(root, item["path"]) for item in batch]
        proc = _engine_process(root, data_dir, engine, ["store", f"STRATEGY={engine}", *prepared], timeout=7200)
        if proc.returncode == 0:
            for item in batch:
                items[item["song_id"]] = {"path": item["path"], "sha256": item["sha256"], "indexed_at": now_iso()}; indexed += 1
            manifest["items"] = items; _save_manifest(data_dir, engine, manifest); continue
        for item in batch:
            proc_one = _engine_process(root, data_dir, engine, ["store", f"STRATEGY={engine}", _prepare_arg(root, item["path"])], timeout=3600)
            if proc_one.returncode == 0:
                items[item["song_id"]] = {"path": item["path"], "sha256": item["sha256"], "indexed_at": now_iso()}; indexed += 1; manifest["items"] = items; _save_manifest(data_dir, engine, manifest)
            else:
                failed.append({"song_id": item["song_id"], "path": item["path"], "error": (proc_one.stdout or "")[-2000:]})
    stats = engine_stats(root, data_dir, engine)
    return {"engine": engine, "indexed": indexed, "skipped": skipped, "failed": failed, "ready": len(items), "stats": stats}


def query_engine(root: Path, data_dir: Path, engine: str, file: Path) -> dict[str, Any]:
    file = Path(file).expanduser().resolve()
    if not file.is_file():
        raise RuntimeError(f"Audio fajl za {engine} query ne postoji.")
    manifest = _load_manifest(data_dir, engine)
    if not (manifest.get("items") or {}) or not _engine_database_has_files(data_dir, engine):
        raise RuntimeError(f"{engine.upper()} baza ovog programa nije izgrađena ili pripada starom formatu. Pokreni ‘OBRIŠI I PONOVO NAPRAVI INDEKS’ da se napravi čista Verzija 1 baza.")
    proc = _engine_process(root, data_dir, engine, ["query", f"STRATEGY={engine}", _prepare_arg(root, file)], timeout=1800)
    output = proc.stdout or ""
    if proc.returncode != 0:
        raise RuntimeError(f"{engine} query nije uspeo:\n" + output[-4000:])
    rows = parse_query_output(output)
    return {"engine": engine, "file": str(file), "matched": bool(rows), "matches": rows, "output": output}


def resolve_song_id(data_dir: Path, engine: str, match_path: str) -> str:
    target = str(match_path or "").replace("\\", "/").lower(); basename = target.rsplit("/", 1)[-1]
    manifest = _load_manifest(data_dir, engine); exact = []; basename_hits = []
    for song_id, entry in (manifest.get("items") or {}).items():
        path = str((entry or {}).get("path") or "").replace("\\", "/").lower()
        if path and (target == path or target.endswith(path) or path.endswith(target)):
            exact.append(str(song_id)); continue
        if basename and path.rsplit("/", 1)[-1] == basename:
            basename_hits.append(str(song_id))
    if len(exact) == 1: return exact[0]
    if len(basename_hits) == 1: return basename_hits[0]
    stem = Path(basename).stem; match = re.match(r"^([A-Za-z0-9._-]+?)__", stem)
    if match and match.group(1) in (manifest.get("items") or {}): return match.group(1)
    return ""


def create_reference_cache(root: Path, data_dir: Path, songs: Iterable[dict[str, Any]], source_resolver) -> dict[str, Any]:
    cache = Path(data_dir).expanduser().resolve() / "panako_reference_audio"; cache.mkdir(parents=True, exist_ok=True)
    ffmpeg = ffmpeg_path()
    if not ffmpeg: raise RuntimeError("FFmpeg nije spreman za Panako referentni cache.")
    references = []; failed = []
    for song in songs:
        song_id = str(song.get("id") or "").strip()
        if not song_id: continue
        safe_id = re.sub(r"[^A-Za-z0-9._-]+", "_", song_id)[:120]; output = cache / f"{safe_id}__suno.wav"
        try:
            source, _ = source_resolver(song)
            if not source:
                failed.append({"song_id": song_id, "error": "Nema audio izvora."}); continue
            if not output.is_file() or output.stat().st_size < 4096:
                command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", str(output)]
                proc = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=900, check=False)
                if proc.returncode != 0 or not output.is_file() or output.stat().st_size < 4096:
                    raise RuntimeError((proc.stdout or "FFmpeg konverzija nije uspela.")[-2000:])
            digest = _sha256_file(output); references.append({"song_id": song_id, "path": str(output.resolve()), "sha256": digest})
        except Exception as exc:
            failed.append({"song_id": song_id, "error": str(exc)})
    return {"references": references, "failed": failed, "cache": str(cache)}


def multi_engine_index(root: Path, data_dir: Path, references: list[dict[str, str]], *, force: bool = False) -> dict[str, Any]:
    results = {engine: index_engine(root, data_dir, engine, references, force=force) for engine in ENGINES}
    return {"engines": results, "references": len(references)}


def torture_test(root: Path, data_dir: Path, reference: Path, expected_song_id: str) -> dict[str, Any]:
    reference = Path(reference).expanduser().resolve()
    if not reference.is_file(): raise RuntimeError("Torture-test referentna pesma ne postoji.")
    ffmpeg = ffmpeg_path()
    if not ffmpeg: raise RuntimeError("FFmpeg nije spreman za torture-test.")
    cases = [("clean_8s", ["-ss", "8", "-t", "8"]), ("clean_12s", ["-ss", "10", "-t", "12"]), ("aac_64k", ["-ss", "10", "-t", "12", "-c:a", "aac", "-b:a", "64k"]), ("aac_128k", ["-ss", "10", "-t", "12", "-c:a", "aac", "-b:a", "128k"]), ("speed_088", ["-ss", "10", "-t", "12", "-filter:a", "atempo=0.88"]), ("speed_093", ["-ss", "10", "-t", "12", "-filter:a", "atempo=0.93"]), ("speed_107", ["-ss", "10", "-t", "12", "-filter:a", "atempo=1.07"]), ("speed_112", ["-ss", "10", "-t", "12", "-filter:a", "atempo=1.12"]), ("pitch_up_1st", ["-ss", "10", "-t", "12", "-filter:a", "asetrate=46722.3,aresample=44100,atempo=0.943874"]), ("pitch_down_1st", ["-ss", "10", "-t", "12", "-filter:a", "asetrate=41624.7,aresample=44100,atempo=1.059463"]), ("band_limited", ["-ss", "10", "-t", "12", "-filter:a", "highpass=f=180,lowpass=f=6500"]), ("quiet", ["-ss", "10", "-t", "12", "-filter:a", "volume=0.25"])]
    results = []
    with tempfile.TemporaryDirectory(prefix="suno_torture_") as temp_dir:
        temp = Path(temp_dir)
        for name, extra in cases:
            suffix = ".m4a" if name.startswith("aac_") else ".wav"; query = temp / f"{name}{suffix}"
            command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(reference), *extra]
            if suffix == ".wav": command += ["-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le"]
            command += [str(query)]
            proc = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300, check=False)
            if proc.returncode != 0:
                results.append({"case": name, "ok": False, "error": (proc.stdout or "")[-1000:]}); continue
            engines = {}; case_ok = False
            for engine in ENGINES:
                try:
                    result = query_engine(root, data_dir, engine, query)
                    resolved = [resolve_song_id(data_dir, engine, str(item.get("match_path") or "")) for item in result.get("matches") or []]
                    hit = expected_song_id in resolved; engines[engine] = {"ok": hit, "resolved_song_ids": resolved, "matches": result.get("matches") or []}; case_ok = case_ok or hit
                except Exception as exc:
                    engines[engine] = {"ok": False, "error": str(exc)}
            results.append({"case": name, "ok": case_ok, "engines": engines})
    passed = sum(1 for item in results if item.get("ok"))
    return {"expected_song_id": expected_song_id, "reference": str(reference), "passed": passed, "total": len(results), "pass_percent": round(100.0 * passed / max(1, len(results)), 1), "cases": results, "ok": passed == len(results)}

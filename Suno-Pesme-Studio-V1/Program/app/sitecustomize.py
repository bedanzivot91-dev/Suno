from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


def _run_process(command, *, timeout=120, cwd=None, env=None, **kwargs):
    return subprocess.run(
        list(command),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        cwd=str(cwd) if cwd else None,
        env=env,
        check=False,
        creationflags=(subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0),
        **kwargs,
    )


def _preferred_wsl_distro() -> str:
    if os.name != "nt" or not shutil.which("wsl.exe"):
        return ""
    proc = subprocess.run(
        ["wsl.exe", "--list", "--quiet"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
        check=False,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    if proc.returncode != 0:
        return ""
    names = [line.replace("\x00", "").strip() for line in (proc.stdout or "").splitlines()]
    names = [name for name in names if name]
    for preferred in ("Ubuntu", "Ubuntu-24.04", "Ubuntu-22.04"):
        for name in names:
            if name.casefold() == preferred.casefold():
                return name
    for name in names:
        if "ubuntu" in name.casefold():
            return name
    return names[0] if names else ""


def _wsl_run(distro: str, script: str, *, timeout=120):
    if os.name != "nt" or not shutil.which("wsl.exe"):
        return subprocess.CompletedProcess(["wsl.exe"], 127, "WSL nije dostupan.", "")
    command = ["wsl.exe"]
    if distro:
        command += ["-d", distro]
    command += ["--", "bash", "-lc", script]
    return subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )


def _wsl_path(distro: str, value) -> str:
    raw = str(Path(value).expanduser().resolve())
    if os.name != "nt" or not shutil.which("wsl.exe"):
        return raw
    command = ["wsl.exe"]
    if distro:
        command += ["-d", distro]
    command += ["--", "wslpath", "-a", raw]
    proc = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
        check=False,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    converted = (proc.stdout or "").replace("\x00", "").strip()
    if proc.returncode != 0 or not converted:
        raise RuntimeError("WSL nije mogao da prevede Windows putanju: " + raw + "\n" + (proc.stdout or "")[-1200:])
    return converted.splitlines()[-1].strip()


def _ensure_panako_installed_fallback(v3, root):
    distro = _preferred_wsl_distro()
    if distro:
        probe = _wsl_run(distro, "test -s ~/.panako/panako.jar && echo SPS_PANAKO_OK", timeout=30)
        if probe.returncode == 0 and "SPS_PANAKO_OK" in (probe.stdout or ""):
            return {
                "ready": True,
                "mode": "wsl",
                "distro": distro,
                "executable": "~/.panako/panako.jar",
                "message": "Panako je spreman u WSL-u.",
            }
    if hasattr(v3, "panako_status"):
        status = v3.panako_status(Path(root))
        if status.get("ready"):
            return {**status, "mode": "native"}
        raise RuntimeError(str(status.get("message") or "Panako nije spreman."))
    raise RuntimeError("Panako/Olaf runtime nije spreman. Ponovo pokreni INSTALIRAJ_PROGRAM.exe.")


# panako_engine in Version 1 was written against the newer Panako/WSL helper
# surface. Older v3_features snapshots may not expose every private helper.
# Patch only missing attributes, preserving the real implementation whenever
# it exists.
try:
    import v3_features as _v3

    if not hasattr(_v3, "_run_process"):
        _v3._run_process = _run_process
    if not hasattr(_v3, "_preferred_wsl_distro"):
        _v3._preferred_wsl_distro = _preferred_wsl_distro
    if not hasattr(_v3, "_wsl_run"):
        _v3._wsl_run = _wsl_run
    if not hasattr(_v3, "_wsl_path"):
        _v3._wsl_path = _wsl_path
    if not hasattr(_v3, "ensure_panako_installed"):
        _v3.ensure_panako_installed = lambda root: _ensure_panako_installed_fallback(_v3, root)
except Exception:
    # Do not make every Python invocation unusable if v3_features itself is
    # temporarily unavailable. Normal imports will expose the real traceback.
    pass

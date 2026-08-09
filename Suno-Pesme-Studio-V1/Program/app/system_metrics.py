from __future__ import annotations

import ctypes
import os
import shutil
import threading
import time
from ctypes import wintypes
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()
_PREVIOUS_CPU: tuple[int, int] | None = None


def _filetime_to_int(value: wintypes.FILETIME) -> int:
    return (int(value.dwHighDateTime) << 32) | int(value.dwLowDateTime)


def _windows_cpu_percent() -> float | None:
    global _PREVIOUS_CPU
    idle = wintypes.FILETIME()
    kernel = wintypes.FILETIME()
    user = wintypes.FILETIME()
    if not ctypes.windll.kernel32.GetSystemTimes(
        ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)
    ):
        return None
    idle_now = _filetime_to_int(idle)
    total_now = _filetime_to_int(kernel) + _filetime_to_int(user)
    with _LOCK:
        previous = _PREVIOUS_CPU
        _PREVIOUS_CPU = (idle_now, total_now)
    if previous is None:
        return None
    idle_delta = idle_now - previous[0]
    total_delta = total_now - previous[1]
    if total_delta <= 0:
        return None
    return max(0.0, min(100.0, (1.0 - idle_delta / total_delta) * 100.0))


def _linux_cpu_percent() -> float | None:
    global _PREVIOUS_CPU
    try:
        fields = Path("/proc/stat").read_text(encoding="utf-8").splitlines()[0].split()[1:]
        values = [int(value) for value in fields]
    except (OSError, ValueError, IndexError):
        return None
    if len(values) < 4:
        return None
    idle_now = values[3] + (values[4] if len(values) > 4 else 0)
    total_now = sum(values)
    with _LOCK:
        previous = _PREVIOUS_CPU
        _PREVIOUS_CPU = (idle_now, total_now)
    if previous is None:
        return None
    idle_delta = idle_now - previous[0]
    total_delta = total_now - previous[1]
    if total_delta <= 0:
        return None
    return max(0.0, min(100.0, (1.0 - idle_delta / total_delta) * 100.0))


class _MemoryStatusEx(ctypes.Structure):
    _fields_ = [
        ("dwLength", wintypes.DWORD),
        ("dwMemoryLoad", wintypes.DWORD),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


def _memory_percent() -> float | None:
    if os.name == "nt":
        status = _MemoryStatusEx()
        status.dwLength = ctypes.sizeof(_MemoryStatusEx)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return float(status.dwMemoryLoad)
        return None
    try:
        values: dict[str, int] = {}
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            key, raw = line.split(":", 1)
            values[key] = int(raw.strip().split()[0])
        total = values.get("MemTotal", 0)
        available = values.get("MemAvailable", values.get("MemFree", 0))
        if total:
            return max(0.0, min(100.0, (1.0 - available / total) * 100.0))
    except (OSError, ValueError):
        pass
    return None


def get_system_metrics(path: Path) -> dict[str, Any]:
    cpu_reader = _windows_cpu_percent if os.name == "nt" else _linux_cpu_percent
    cpu = cpu_reader()
    if cpu is None:
        time.sleep(0.05)
        cpu = cpu_reader()
    memory = _memory_percent()
    try:
        usage = shutil.disk_usage(path)
        disk = (usage.used / usage.total * 100.0) if usage.total else None
        disk_free_gb = usage.free / (1024 ** 3)
    except OSError:
        disk = None
        disk_free_gb = None
    ram_percent = round(memory, 1) if memory is not None else None
    return {
        "cpu_percent": round(cpu, 1) if cpu is not None else None,
        "ram_percent": ram_percent,
        "memory_percent": ram_percent,
        "disk_percent": round(disk, 1) if disk is not None else None,
        "disk_free_gb": round(disk_free_gb, 1) if disk_free_gb is not None else None,
    }

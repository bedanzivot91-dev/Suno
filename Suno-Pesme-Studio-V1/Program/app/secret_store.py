from __future__ import annotations

import base64
import ctypes
import os
from ctypes import wintypes
from typing import Protocol


class SettingsStore(Protocol):
    def get_setting(self, key: str, default: str = "") -> str: ...
    def set_setting(self, key: str, value: str) -> None: ...


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi_protect(raw: bytes, description: str) -> bytes:
    if os.name != "nt":
        return raw
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    crypt32.CryptProtectData.argtypes = [
        ctypes.POINTER(_DataBlob), wintypes.LPCWSTR, ctypes.POINTER(_DataBlob),
        wintypes.LPVOID, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(_DataBlob),
    ]
    crypt32.CryptProtectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [wintypes.HLOCAL]
    kernel32.LocalFree.restype = wintypes.HLOCAL

    in_buffer = ctypes.create_string_buffer(raw)
    in_blob = _DataBlob(len(raw), ctypes.cast(in_buffer, ctypes.POINTER(ctypes.c_char)))
    out_blob = _DataBlob()
    if not crypt32.CryptProtectData(
        ctypes.byref(in_blob), description, None, None, None, 0, ctypes.byref(out_blob)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _dpapi_unprotect(raw: bytes) -> bytes:
    if os.name != "nt":
        return raw
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(_DataBlob), ctypes.POINTER(wintypes.LPWSTR), ctypes.POINTER(_DataBlob),
        wintypes.LPVOID, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(_DataBlob),
    ]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [wintypes.HLOCAL]
    kernel32.LocalFree.restype = wintypes.HLOCAL

    in_buffer = ctypes.create_string_buffer(raw)
    in_blob = _DataBlob(len(raw), ctypes.cast(in_buffer, ctypes.POINTER(ctypes.c_char)))
    out_blob = _DataBlob()
    if not crypt32.CryptUnprotectData(
        ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def set_secret(store: SettingsStore, key: str, value: str) -> None:
    value = str(value or "").strip()
    if not value:
        store.set_setting(key, "")
        return
    raw = value.encode("utf-8")
    if os.name == "nt":
        protected = _dpapi_protect(raw, f"Suno Pesme Studio: {key}")
        encoded = "dpapi:" + base64.b64encode(protected).decode("ascii")
    else:
        encoded = "plain:" + base64.b64encode(raw).decode("ascii")
    store.set_setting(key, encoded)


def get_secret(store: SettingsStore, key: str, default: str = "") -> str:
    raw = str(store.get_setting(key, "") or "")
    if not raw:
        return default
    if raw.startswith("dpapi:"):
        payload = base64.b64decode(raw[6:].encode("ascii"), validate=True)
        return _dpapi_unprotect(payload).decode("utf-8")
    if raw.startswith("plain:"):
        return base64.b64decode(raw[6:].encode("ascii"), validate=True).decode("utf-8")

    value = raw.strip()
    if value:
        set_secret(store, key, value)
    return value


def secret_is_protected(store: SettingsStore, key: str) -> bool:
    raw = str(store.get_setting(key, "") or "")
    if not raw:
        return False
    return raw.startswith("dpapi:") if os.name == "nt" else raw.startswith(("dpapi:", "plain:"))

from __future__ import annotations

import re
import sys
from pathlib import Path


def safe_print(text: str) -> None:
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    try:
        sys.stdout.write(text + "\n")
    except UnicodeEncodeError:
        sys.stdout.buffer.write((text + "\n").encode(enc, errors="backslashreplace"))
        sys.stdout.buffer.flush()


def fail(msg: str) -> None:
    safe_print(f"UI_BUTTON_AUDIT_FAIL: {msg}")
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: UI_BUTTON_AUDIT.py <Program/app/web>")
    web = Path(sys.argv[1]).resolve()
    index = web / "index.html"
    app = web / "app.js"
    task3 = web / "task3-dashboard.js"
    task10 = web / "task10-controls.js"
    for p in (index, app, task3, task10):
        if not p.is_file():
            fail(f"missing {p}")
    html = index.read_text(encoding="utf-8", errors="replace")
    js = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in sorted(web.glob("*.js")))

    matches = list(re.finditer(r"<button\b[^>]*>", html, flags=re.I | re.S))
    ids: list[str] = []
    delegated = 0
    unclassified: list[tuple[int, str, str]] = []
    delegate_attrs = (
        "data-view", "data-go", "data-br-view", "data-sm-view", "data-lc-view",
        "data-vl-view", "data-sg-view", "data-br-queue-tab",
    )
    for match in matches:
        tag = match.group(0)
        m = re.search(r'\bid=["\']([^"\']+)["\']', tag, flags=re.I)
        if m:
            ids.append(m.group(1))
            continue

        data_pairs = re.findall(r'\b(data-[\w-]+)(?:=["\']([^"\']*)["\'])?', tag, flags=re.I)
        if any(name.lower() in delegate_attrs for name, _ in data_pairs):
            delegated += 1
            continue
        if data_pairs and any((name in js) or (value and value in js) for name, value in data_pairs):
            delegated += 1
            continue

        cls = re.search(r'\bclass=["\']([^"\']+)["\']', tag, flags=re.I)
        if cls and any(c in js for c in cls.group(1).split() if len(c) >= 4):
            delegated += 1
            continue
        title = re.search(r'\btitle=["\']([^"\']+)["\']', tag, flags=re.I)
        if title and title.group(1) in js:
            delegated += 1
            continue

        line = html.count("\n", 0, match.start()) + 1
        before = html.rfind("\n", 0, match.start())
        after = html.find("\n", match.end())
        context = html[(before + 1 if before >= 0 else 0):(after if after >= 0 else match.end() + 180)]
        unclassified.append((line, re.sub(r"\s+", " ", tag)[:180], re.sub(r"\s+", " ", context)[:500]))

    duplicate_ids = sorted({x for x in ids if ids.count(x) > 1})
    if duplicate_ids:
        fail("duplicate button ids: " + ", ".join(duplicate_ids))

    missing_refs = [button_id for button_id in ids if not re.search(re.escape(button_id), js)]
    if missing_refs:
        fail("button ids without any JS reference: " + ", ".join(sorted(missing_refs)))

    required_controls = {
        "t3SunoLogin", "t3SunoCheck", "t3YoutubeLogin", "t3YoutubeRefresh", "t3RefreshAll",
        "openSunoLoginBtn", "checkSunoBtn", "vlRecentPrev", "vlRecentNext", "vlShuffleBtn",
        "vlRepeatBtn", "sgRepeatBtn",
    }
    dynamic_ids = set(re.findall(r'id=["\']([^"\']+)["\']', task3.read_text(encoding="utf-8", errors="replace")))
    absent = sorted(required_controls - set(ids) - dynamic_ids)
    if absent:
        fail("required controls absent: " + ", ".join(absent))

    safe_print(f"UI_BUTTON_AUDIT_OK buttons_with_id={len(ids)} delegated={delegated} unclassified_no_id={len(unclassified)}")
    for line, tag, context in unclassified:
        safe_print(f"UI_BUTTON_UNCLASSIFIED line={line} tag={tag} context={context}")


if __name__ == "__main__":
    main()

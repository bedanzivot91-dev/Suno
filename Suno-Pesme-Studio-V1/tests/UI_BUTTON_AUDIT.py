from __future__ import annotations

import re
import sys
from pathlib import Path


def fail(msg: str) -> None:
    print(f"UI_BUTTON_AUDIT_FAIL: {msg}")
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: UI_BUTTON_AUDIT.py <Program/app/web>")
    web = Path(sys.argv[1]).resolve()
    index = web / "index.html"
    app = web / "app.js"
    task3 = web / "task3-dashboard.js"
    for p in (index, app, task3):
        if not p.is_file():
            fail(f"missing {p}")
    html = index.read_text(encoding="utf-8", errors="replace")
    js = app.read_text(encoding="utf-8", errors="replace") + "\n" + task3.read_text(encoding="utf-8", errors="replace")

    button_tags = re.findall(r"<button\b[^>]*>", html, flags=re.I | re.S)
    ids: list[str] = []
    delegated = 0
    no_id_no_delegate: list[str] = []
    delegate_attrs = (
        "data-view=", "data-go=", "data-br-view=", "data-sm-view=", "data-lc-view=",
        "data-vl-view=", "data-sg-view=", "data-br-queue-tab=",
    )
    for tag in button_tags:
        m = re.search(r'\bid=["\']([^"\']+)["\']', tag, flags=re.I)
        if m:
            ids.append(m.group(1))
            continue
        if any(attr in tag for attr in delegate_attrs):
            delegated += 1
            continue
        # Buttons without ids can be intentionally decorative or handled by class delegation.
        cls = re.search(r'\bclass=["\']([^"\']+)["\']', tag, flags=re.I)
        if cls and any(c in js for c in cls.group(1).split() if len(c) >= 5):
            delegated += 1
            continue
        no_id_no_delegate.append(re.sub(r"\s+", " ", tag)[:180])

    duplicate_ids = sorted({x for x in ids if ids.count(x) > 1})
    if duplicate_ids:
        fail("duplicate button ids: " + ", ".join(duplicate_ids))

    missing_refs: list[str] = []
    for button_id in ids:
        # The HTML definition is not in js; every id button should be referenced by app/task3 JS.
        patterns = (
            re.escape(button_id),
            re.escape("#" + button_id),
        )
        if not any(re.search(p, js) for p in patterns):
            missing_refs.append(button_id)

    # Allow only known purely visual window controls which are aria-hidden and deliberately inert.
    allowed_inert = set()
    missing_refs = [x for x in missing_refs if x not in allowed_inert]
    if missing_refs:
        fail("button ids without any JS reference: " + ", ".join(sorted(missing_refs)))

    required_controls = {
        "t3SunoLogin", "t3SunoCheck", "t3YoutubeLogin", "t3YoutubeRefresh", "t3RefreshAll",
        "openSunoLoginBtn", "checkSunoBtn",
    }
    absent = sorted(required_controls - set(ids) - set(re.findall(r'id=["\']([^"\']+)["\']', task3)))
    if absent:
        fail("required account controls absent: " + ", ".join(absent))

    print(f"UI_BUTTON_AUDIT_OK buttons_with_id={len(ids)} delegated={delegated} unclassified_no_id={len(no_id_no_delegate)}")
    if no_id_no_delegate:
        print("UI_BUTTON_AUDIT_INFO unclassified buttons (not failure):")
        for tag in no_id_no_delegate[:20]:
            print("  " + tag)


if __name__ == "__main__":
    main()

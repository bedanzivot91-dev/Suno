from __future__ import annotations
import base64
import hashlib
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
assert manifest["manifest_version"] == 3
assert manifest["version"] == "2.1.0"
assert manifest["background"]["service_worker"]

# Verify stable Chrome extension ID derived from manifest public key.
der = base64.b64decode(manifest["key"])
digest = hashlib.sha256(der).digest()[:16]
ext_id = "".join(chr(ord("a") + (value >> 4)) + chr(ord("a") + (value & 15)) for value in digest)
assert ext_id == "igjckdibhjehimobmpkkbebidfodebei", ext_id

required = {
    manifest["background"]["service_worker"], manifest["action"]["default_popup"],
    manifest["side_panel"]["default_path"], manifest["options_page"],
    *manifest["icons"].values(), *manifest["action"]["default_icon"].values()
}
for script in manifest["content_scripts"]:
    required.update(script.get("js", []))
    required.update(script.get("css", []))
for rel in required:
    assert (ROOT / rel).is_file(), f"Nedostaje manifest fajl: {rel}"

class RefParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.refs=[]; self.inline_scripts=0
    def handle_starttag(self, tag, attrs):
        data=dict(attrs)
        if tag in {"script", "link"}:
            ref=data.get("src") or data.get("href")
            if ref: self.refs.append(ref)
            if tag == "script" and not data.get("src"): self.inline_scripts += 1

for html in ROOT.rglob("*.html"):
    parser=RefParser(); parser.feed(html.read_text(encoding="utf-8"))
    assert parser.inline_scripts == 0, f"Inline script nije dozvoljen: {html}"
    for ref in parser.refs:
        if re.match(r"^[a-z]+:", ref):
            raise AssertionError(f"Spoljni resurs u extension HTML-u: {html}: {ref}")
        assert (html.parent / ref).resolve().is_file(), f"Nedostaje HTML resurs: {html}: {ref}"

for js in ROOT.rglob("*.js"):
    subprocess.run(["node", "--check", str(js)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

# Extension package must not ship executable binaries or private keys.
for path in ROOT.rglob("*"):
    assert "__pycache__" not in path.parts, f"Privremeni Python folder u paketu: {path}"
    if path.is_file():
        assert path.suffix.lower() not in {".exe", ".dll", ".pem", ".key", ".p12", ".pfx", ".pyc"}, f"Nedozvoljen binarni/tajni fajl: {path}"

print("PACKAGE_VALIDATION_OK")

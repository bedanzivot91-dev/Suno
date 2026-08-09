import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class PanakoFullInstallPathTests(unittest.TestCase):
    def test_powershell_installer_retries_gradle_dependencies(self):
        text = (ROOT / "Program" / "plugins" / "INSTALIRAJ_PANAKO_OBAVEZNO.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("for ATTEMPT in 1 2 3", text)
        self.assertIn("--refresh-dependencies shadowJar", text)
        self.assertIn('GRADLE_OK', text)

    def test_powershell_installer_uses_deterministic_real_e2e(self):
        text = (ROOT / "Program" / "plugins" / "INSTALIRAJ_PANAKO_OBAVEZNO.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("anoisesrc=color=pink:duration=32:seed=12345", text)
        self.assertIn("STRATEGY=panako", text)
        self.assertIn("STRATEGY=olaf", text)
        self.assertGreaterEqual(text.count('grep -q "reference.wav"'), 2)

    def test_in_app_installer_has_same_panako_olaf_e2e_and_retry(self):
        text = (ROOT / "Program" / "app" / "v3_features.py").read_text(encoding="utf-8")
        self.assertIn("--refresh-dependencies shadowJar", text)
        self.assertIn("runtime-install-e2e", text)
        self.assertIn("STRATEGY=panako", text)
        self.assertIn("STRATEGY=olaf", text)
        self.assertIn('grep -q "reference.wav"', text)

if __name__ == "__main__":
    unittest.main()

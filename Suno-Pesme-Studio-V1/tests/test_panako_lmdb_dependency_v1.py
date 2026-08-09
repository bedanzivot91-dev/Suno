from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class PanakoLmdbDependencyTests(unittest.TestCase):
    def test_installer_does_not_pin_broken_joss_snapshot(self):
        text = (ROOT / "Program" / "plugins" / "INSTALIRAJ_PANAKO_OBAVEZNO.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("--branch master", text)
        self.assertIn("e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211", text)
        self.assertNotIn("--branch joss", text)
        self.assertNotIn("očekivan c2cd1cf", text)
        self.assertIn("0.8.3-SNAPSHOT", text)
        self.assertIn("grep -q", text)

    def test_runtime_installer_uses_verified_pinned_commit(self):
        text = (ROOT / "Program" / "app" / "v3_features.py").read_text(encoding="utf-8")
        self.assertIn('PANAKO_PINNED_TAG = "master"', text)
        self.assertIn("git rev-parse HEAD", text)
        self.assertIn('PANAKO_PINNED_COMMIT = "e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211"', text)
        self.assertIn("branch=master", text)
        self.assertIn("0.8.3-SNAPSHOT", text)

if __name__ == "__main__":
    unittest.main()

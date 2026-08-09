from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
CHECKSUM = "b586e04868a22fd817c8971330fec37e298f3242eb85c374181b12d637f80302"

class PanakoJavaGradleCompatTests(unittest.TestCase):
    def test_powershell_installer_uses_java17_compatible_gradle(self):
        text = (ROOT / "Program/plugins/INSTALIRAJ_PANAKO_OBAVEZNO.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("openjdk-17-jdk-headless", text)
        self.assertIn("gradle-7.3.3-bin.zip", text)
        self.assertIn(f"distributionSha256Sum={CHECKSUM}", text)
        self.assertNotIn("gradle-7.2-bin.zip' \"$WRAPPER_PROPS\"\nGRADLE_OK=0", text)

    def test_in_app_installer_uses_same_java17_compatible_gradle(self):
        text = (ROOT / "Program/app/v3_features.py").read_text(encoding="utf-8")
        self.assertIn("openjdk-17-jdk-headless", text)
        self.assertIn("gradle-7.3.3-bin.zip", text)
        self.assertIn(f"distributionSha256Sum={CHECKSUM}", text)

if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class PanakoPowerShellNativeStderrTests(unittest.TestCase):
    def _text(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding="utf-8-sig")

    def test_installer_uses_exit_code_not_native_stderr_as_failure_signal(self) -> None:
        text = self._text("Program/plugins/INSTALIRAJ_PANAKO_OBAVEZNO.ps1")
        self.assertIn("$savedErrorActionPreference = $ErrorActionPreference", text)
        self.assertIn("$ErrorActionPreference = 'Continue'", text)
        self.assertIn("$exitCode = $LASTEXITCODE", text)
        self.assertIn("if ($exitCode -ne 0)", text)
        self.assertIn("$ErrorActionPreference = $savedErrorActionPreference", text)

    def test_windows_e2e_uses_exit_code_not_native_stderr_as_failure_signal(self) -> None:
        text = self._text("PANAKO_WINDOWS_E2E.ps1")
        self.assertIn("$savedErrorActionPreference = $ErrorActionPreference", text)
        self.assertIn("$ErrorActionPreference = 'Continue'", text)
        self.assertIn("$exitCode = $LASTEXITCODE", text)
        self.assertIn("$ErrorActionPreference = $savedErrorActionPreference", text)
        self.assertIn("($exitCode -eq 0)", text)

if __name__ == "__main__":
    unittest.main()

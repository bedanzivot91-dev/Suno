from __future__ import annotations

import ast
import collections
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRST_PARTY = [ROOT / 'Program' / 'app', ROOT / 'Program' / 'plugins']

class NoShadowedTopLevelDefinitionsTests(unittest.TestCase):
    def test_first_party_modules_have_no_duplicate_top_level_definition_names(self) -> None:
        problems: list[str] = []
        for base in FIRST_PARTY:
            for path in sorted(base.glob('*.py')):
                tree = ast.parse(path.read_text(encoding='utf-8-sig'))
                names: dict[str, list[int]] = collections.defaultdict(list)
                for node in tree.body:
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                        names[node.name].append(node.lineno)
                for name, lines in names.items():
                    if len(lines) > 1:
                        problems.append(f'{path.relative_to(ROOT)}:{name}:{lines}')
        self.assertEqual([], problems)

if __name__ == '__main__':
    unittest.main()

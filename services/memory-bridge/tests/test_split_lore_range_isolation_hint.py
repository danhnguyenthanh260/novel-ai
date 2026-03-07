from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker_split_anchors import extract_deterministic_anchors  # noqa: E402


class TestSplitLoreRangeIsolationHint(unittest.TestCase):
    def test_lore_range_contains_isolation_hint(self):
        text = (
            "They opened the archive records and checked the map coordinates in the historical newspaper.\n\n"
            "Then they resumed walking."
        )
        out = extract_deterministic_anchors(text, [], len(text))
        lore = out.get("lore_ranges") or []
        self.assertTrue(lore)
        first = lore[0]
        self.assertIn("start_at", first)
        self.assertIn("end_at", first)
        self.assertIn("isolat", str(first.get("isolate_hint") or "").lower())


if __name__ == "__main__":
    unittest.main()

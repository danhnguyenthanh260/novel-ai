from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker_split_anchors import extract_deterministic_anchors  # noqa: E402


class TestSplitAnchorsExtraction(unittest.TestCase):
    def test_extract_temporal_and_location_hard_with_temporal_first_dedup(self):
        text = "That afternoon, they went to the old library to inspect records."
        out = extract_deterministic_anchors(text, [], len(text))
        hard = out.get("hard_anchors") or []
        self.assertTrue(hard)
        first = hard[0]
        self.assertEqual(first.get("type"), "TEMPORAL_HARD")
        merged = [str(x) for x in (first.get("merged_signals") or [])]
        self.assertIn("LOCATION_HARD", merged)

    def test_clean_start_guard_avoids_conjunction_head(self):
        text = "At dawn.\n\nBut he did not move. Later that day, he left."
        out = extract_deterministic_anchors(text, [], len(text))
        hard = out.get("hard_anchors") or []
        self.assertTrue(hard)
        # Ensure no hard anchor starts right before a banned conjunction.
        for item in hard:
            at = int(item.get("at") or 0)
            head = text[at : min(len(text), at + 16)].lstrip().lower()
            self.assertFalse(head.startswith("but "))


if __name__ == "__main__":
    unittest.main()

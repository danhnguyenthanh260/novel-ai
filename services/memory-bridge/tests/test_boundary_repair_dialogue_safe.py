from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker_split_boundary_helpers import (  # noqa: E402
    repair_dangling_conjunction_boundaries,
)


def _normalize(points: list[int], text_len: int) -> list[int]:
    return sorted(set(int(p) for p in points if 0 < int(p) < int(text_len)))


class TestBoundaryRepairDialogueSafe(unittest.TestCase):
    def test_dialogue_attribution_guard_keeps_boundary(self):
        text = 'Kuro said: "But I do not know." Then he left.'
        boundary = text.index('But')
        points, report = repair_dangling_conjunction_boundaries(
            text,
            [boundary],
            boundary_shift_window_chars=220,
            dialogue_attribution_guard_enabled=True,
            normalize_split_points=_normalize,
        )
        self.assertEqual(points, [boundary])
        reasons = [str(x) for x in (report.get("reasons") or [])]
        self.assertTrue(
            any(r in ("DIALOGUE_ATTRIBUTION_GUARD_HIT", "NO_ANCHOR_CANDIDATE", "NO_SAFE_CANDIDATE") for r in reasons)
        )

    def test_non_dialogue_conjunction_can_shift(self):
        text = "He looked around. The wind rose and doors shook But he stayed."
        boundary = text.index("But")
        points, report = repair_dangling_conjunction_boundaries(
            text,
            [boundary],
            boundary_shift_window_chars=220,
            dialogue_attribution_guard_enabled=True,
            normalize_split_points=_normalize,
        )
        self.assertEqual(len(points), 1)
        self.assertLessEqual(points[0], boundary)
        self.assertGreaterEqual(int(report.get("moved") or 0), 1)


if __name__ == "__main__":
    unittest.main()

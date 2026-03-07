from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker_split_boundary_helpers import deterministic_split_oversized_points  # noqa: E402


def _normalize(points: list[int], text_len: int) -> list[int]:
    return sorted(set(int(p) for p in points if 0 < int(p) < int(text_len)))


class TestOversizedDeterministicSplit(unittest.TestCase):
    def test_split_oversized_with_punctuation_anchor(self):
        text = ("A" * 2200) + ". " + ("B" * 2200)
        points, report = deterministic_split_oversized_points(
            text,
            [],
            max_chunk_chars=3000,
            max_oversized_deterministic_splits_per_chunk=2,
            oversized_split_window_chars=500,
            normalize_split_points=_normalize,
        )
        self.assertTrue(points)
        self.assertGreaterEqual(int(report.get("applied") or 0), 1)
        self.assertEqual(int(report.get("remaining_oversized") or 0), 0)

    def test_split_oversized_whitespace_fallback(self):
        text = ("A" * 2200) + " " + ("B" * 2200)
        points, report = deterministic_split_oversized_points(
            text,
            [],
            max_chunk_chars=3000,
            max_oversized_deterministic_splits_per_chunk=2,
            oversized_split_window_chars=500,
            normalize_split_points=_normalize,
        )
        self.assertTrue(points)
        self.assertGreaterEqual(int(report.get("fallback_applied") or 0), 1)
        notes = [str(x) for x in (report.get("notes") or [])]
        self.assertTrue(any("FALLBACK" in n for n in notes))


if __name__ == "__main__":
    unittest.main()

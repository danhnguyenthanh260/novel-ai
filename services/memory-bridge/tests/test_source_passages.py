from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker_source_passages import build_source_passages  # noqa: E402


class TestSourcePassages(unittest.TestCase):
    def test_passages_reconstruct_source_exactly(self):
        source = "First line\r\n\r\nSecond paragraph.\nThird line " * 500
        passages = build_source_passages(source, target_chars=500, max_chars=700)

        self.assertGreater(len(passages), 1)
        self.assertEqual("".join(item["passage_text"] for item in passages), source)
        self.assertEqual(passages[0]["start_offset"], 0)
        self.assertEqual(passages[-1]["end_offset"], len(source))
        self.assertTrue(all(len(item["passage_text"]) <= 700 for item in passages))
        for previous, current in zip(passages, passages[1:]):
            self.assertEqual(previous["end_offset"], current["start_offset"])

    def test_generated_million_word_source_is_bounded_and_lossless(self):
        source = " ".join(f"w{index % 1000}" for index in range(1_000_000))
        passages = build_source_passages(source)

        self.assertGreater(len(passages), 500)
        self.assertEqual("".join(item["passage_text"] for item in passages), source)
        self.assertTrue(all(len(item["passage_text"]) <= 7600 for item in passages))

    def test_rejects_invalid_chunk_limits(self):
        with self.assertRaisesRegex(ValueError, "INVALID_SOURCE_PASSAGE_LIMITS"):
            build_source_passages("text", target_chars=100, max_chars=50)


if __name__ == "__main__":
    unittest.main()

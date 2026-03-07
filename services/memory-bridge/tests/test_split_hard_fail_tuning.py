from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker_split_quality import quality_report  # noqa: E402


def _ends_with_terminal_punct(text: str) -> bool:
    return str(text).rstrip().endswith((".", "!", "?"))


def _never_quote_break(_text: str, _at: int) -> bool:
    return False


class TestSplitHardFailTuning(unittest.TestCase):
    def test_mid_word_hard_fail(self):
        chapter_text = "XXHelloWorldYY."
        scenes = [
            {"idx": 1, "start": 0, "end": 2},
            {"idx": 2, "start": 2, "end": 7},
            {"idx": 3, "start": 7, "end": len(chapter_text)},
        ]
        report = quality_report(
            chapter_text,
            scenes,
            600,
            2,
            0.05,
            1,
            _ends_with_terminal_punct,
            lambda _text, _at: False,
            _never_quote_break,
            20.0,
            1,
        )
        self.assertTrue(bool(report.get("hard_fail")))
        self.assertIn("MID_WORD_HARD_FAIL", list(report.get("hard_fail_reason_codes") or []))

    def test_semantic_only_does_not_hard_fail_without_combo_signal(self):
        chapter_text = "Alpha. Beta."
        scenes = [
            {"idx": 1, "start": 0, "end": 6},
            {"idx": 2, "start": 6, "end": len(chapter_text)},
        ]
        report = quality_report(
            chapter_text,
            scenes,
            600,
            2,
            0.05,
            1,
            _ends_with_terminal_punct,
            lambda _text, at: at == 6,
            _never_quote_break,
            20.0,
            1,
        )
        self.assertFalse(bool(report.get("hard_fail")))
        self.assertEqual(list(report.get("hard_fail_reason_codes") or []), [])

    def test_semantic_plus_quote_break_hard_fail(self):
        chapter_text = "Alpha. Beta."
        scenes = [
            {"idx": 1, "start": 0, "end": 6},
            {"idx": 2, "start": 6, "end": len(chapter_text)},
        ]
        report = quality_report(
            chapter_text,
            scenes,
            600,
            2,
            0.05,
            1,
            _ends_with_terminal_punct,
            lambda _text, at: at == 6,
            lambda _text, at: at == 6,
            20.0,
            1,
        )
        self.assertTrue(bool(report.get("hard_fail")))
        reason_codes = list(report.get("hard_fail_reason_codes") or [])
        self.assertIn("SEMANTIC_HARD_FAIL_COMBO", reason_codes)
        self.assertIn("SEMANTIC_COMBO_QUOTE_GUARD", reason_codes)

    def test_semantic_plus_flagged_pct_guard_hard_fail(self):
        chapter_text = "Alpha beta gamma"
        scenes = [
            {"idx": 1, "start": 0, "end": 5},
            {"idx": 2, "start": 5, "end": len(chapter_text)},
        ]
        report = quality_report(
            chapter_text,
            scenes,
            600,
            10,  # avoid mid-word gate dominating this case
            1.0,  # avoid mid-word ratio gate dominating this case
            1,
            _ends_with_terminal_punct,
            lambda _text, at: at == 5,
            _never_quote_break,
            20.0,
            1,
        )
        self.assertTrue(bool(report.get("hard_fail")))
        reason_codes = list(report.get("hard_fail_reason_codes") or [])
        self.assertIn("SEMANTIC_HARD_FAIL_COMBO", reason_codes)
        self.assertIn("SEMANTIC_COMBO_FLAGGED_GUARD", reason_codes)


if __name__ == "__main__":
    unittest.main()

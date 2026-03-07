from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Allow importing worker_split_proposal in minimal unit env without psycopg2.
if "psycopg2" not in sys.modules:
    sys.modules["psycopg2"] = SimpleNamespace(connect=lambda *args, **kwargs: None)
if "psycopg2.extras" not in sys.modules:
    sys.modules["psycopg2.extras"] = SimpleNamespace(Json=lambda x: x, RealDictCursor=object)
if "worker_common" not in sys.modules:
    sys.modules["worker_common"] = SimpleNamespace(
        call_llm_json=lambda *args, **kwargs: {},
        get_llm_timeout=lambda *_args, **_kwargs: 120,
    )

from worker_split_proposal import _strip_conflicting_anchor_kwargs  # noqa: E402


class TestSplitAnchorKwargDedup(unittest.TestCase):
    def test_strip_conflicting_anchor_kwargs_removes_duplicate_anchor_keys(self):
        raw = {
            "hard_anchor_positions": [111, 222],
            "hard_anchor_tolerance_chars": 120,
            "reprocess_note": "x",
            "other_flag": True,
        }
        cleaned = _strip_conflicting_anchor_kwargs(raw)
        self.assertNotIn("hard_anchor_positions", cleaned)
        self.assertNotIn("hard_anchor_tolerance_chars", cleaned)
        self.assertEqual(cleaned.get("reprocess_note"), "x")
        self.assertTrue(bool(cleaned.get("other_flag")))


if __name__ == "__main__":
    unittest.main()

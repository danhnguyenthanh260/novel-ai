from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "psycopg2" not in sys.modules:
    fake_psycopg2 = types.ModuleType("psycopg2")
    fake_extras = types.ModuleType("psycopg2.extras")
    setattr(fake_extras, "RealDictCursor", object)
    fake_psycopg2.extras = fake_extras  # type: ignore[attr-defined]
    sys.modules["psycopg2"] = fake_psycopg2
    sys.modules["psycopg2.extras"] = fake_extras

from worker_memory_context import _merge_unique  # noqa: E402


class TestCoreLookupPriorityHelpers(unittest.TestCase):
    def test_merge_unique_prefers_existing_order(self):
        base = [
            {"subject": "kuro", "predicate": "likes", "object": "rain"},
        ]
        incoming = [
            {"subject": "kuro", "predicate": "likes", "object": "rain"},
            {"subject": "mike", "predicate": "checks", "object": "map"},
        ]
        out = _merge_unique(base, incoming, limit=10, key_fields=["subject", "predicate", "object"])
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]["subject"], "kuro")
        self.assertEqual(out[1]["subject"], "mike")

    def test_merge_unique_respects_limit(self):
        base = [{"event_label": "A", "location": "L1"}]
        incoming = [
            {"event_label": "B", "location": "L2"},
            {"event_label": "C", "location": "L3"},
        ]
        out = _merge_unique(base, incoming, limit=2, key_fields=["event_label", "location"])
        self.assertEqual(len(out), 2)
        self.assertEqual(out[1]["event_label"], "B")


if __name__ == "__main__":
    unittest.main()

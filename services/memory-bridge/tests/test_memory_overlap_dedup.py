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

from worker_memory_context import _dedup_arc_against_recent_structured  # noqa: E402


class TestMemoryOverlapDedup(unittest.TestCase):
    def test_drops_arc_overlap_from_recent_structured(self):
        arc_memory = {
            "milestones": [
                {
                    "id": 1,
                    "summary_json": {
                        "carry_forward_hooks": ["Find Than V", "Check signal anomaly"],
                        "subplots": [{"description": "Find Than V"}, {"description": "Investigate Hollow"}],
                    },
                }
            ]
        }
        recent = {
            "chapters": [
                {"open_loops": [{"description": "Find Than V"}]},
            ]
        }
        deduped, report = _dedup_arc_against_recent_structured(arc_memory, recent)
        hooks = deduped["milestones"][0]["summary_json"]["carry_forward_hooks"]
        subplots = deduped["milestones"][0]["summary_json"]["subplots"]
        self.assertEqual(hooks, ["Check signal anomaly"])
        self.assertEqual(len(subplots), 1)
        self.assertEqual(subplots[0]["description"], "Investigate Hollow")
        self.assertGreater(report["dropped_items"], 0)

    def test_keeps_arc_when_no_recent_overlap(self):
        arc_memory = {
            "milestones": [
                {"summary_json": {"carry_forward_hooks": ["Explore north ridge"]}},
            ]
        }
        recent = {"chapters": [{"open_loops": [{"description": "Meet Tara"}]}]}
        deduped, report = _dedup_arc_against_recent_structured(arc_memory, recent)
        hooks = deduped["milestones"][0]["summary_json"]["carry_forward_hooks"]
        self.assertEqual(hooks, ["Explore north ridge"])
        self.assertEqual(report["dropped_items"], 0)


if __name__ == "__main__":
    unittest.main()


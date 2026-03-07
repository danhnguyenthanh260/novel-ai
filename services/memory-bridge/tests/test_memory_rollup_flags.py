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

from worker_memory_rollup import _validation_flags  # noqa: E402


class TestMemoryRollupValidationFlags(unittest.TestCase):
    def test_emits_allowed_flags_only(self):
        flags = _validation_flags(
            arc_milestones=[
                {"narrative_score": 0.1, "emotional_target": "cold"},
                {"narrative_score": 0.8, "emotional_target": "warm"},
                {"narrative_score": 0.5, "emotional_target": "tense"},
                {"narrative_score": 0.9, "emotional_target": "calm"},
                {"narrative_score": 0.2, "emotional_target": "rage"},
            ],
            theme_threads=[{"description": "x"}] * 20,
            lore_debt_items=[{"debt_id": "d1"}, {"debt_id": "d2"}],
            overlap_dedup_ratio=0.6,
        )
        self.assertIn("CONFLICT_DETECTED", flags)
        self.assertIn("PACING_ISSUE", flags)
        self.assertIn("CHARACTER_DRIFT", flags)
        self.assertIn("LORE_DEBT_ACCUMULATING", flags)
        self.assertIn("OVERLAP_EXCESSIVE", flags)
        self.assertEqual(len(flags), len(set(flags)))


if __name__ == "__main__":
    unittest.main()


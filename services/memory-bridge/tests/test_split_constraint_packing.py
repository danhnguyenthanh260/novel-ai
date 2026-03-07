from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import ModuleType


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "psycopg2" not in sys.modules:
    psycopg2_stub = ModuleType("psycopg2")
    extras_stub = ModuleType("psycopg2.extras")
    extras_stub.Json = lambda x: x
    extras_stub.RealDictCursor = object
    psycopg2_stub.extras = extras_stub
    sys.modules["psycopg2"] = psycopg2_stub
    sys.modules["psycopg2.extras"] = extras_stub

from worker_profile_learning import build_split_constraint_pack  # noqa: E402


class TestSplitConstraintPacking(unittest.TestCase):
    def test_dedup_and_lock_temporal_coverage_in_minimal_mode(self):
        tech_rules = """
- TEMPORAL anchor must be preserved at transitions.
- Coverage: do not miss source spans.
- coverage do not miss source spans
- Lore packaging is preferred.
"""
        active = [
            "Temporal Anchor Precision is critical",
            "temporal anchor precision is critical",
            "Avoid conjunction heads at scene start",
        ]
        out = build_split_constraint_pack(
            tech_rules_text=tech_rules,
            active_constraints=active,
            chapter_chars=14000,
            latency_window={"sample_size": 20, "p50_ms": 120000, "p75_ms": 150000},
            retry_profile_used=None,
        )
        self.assertEqual(out.get("prompt_tier_used"), "compact_first_pass")
        self.assertEqual(out.get("mode"), "minimal_long_chapter")
        self.assertLessEqual(int(out.get("prompt_chars_rule_section") or 0), 3500)
        stats = out.get("stats") or {}
        self.assertGreaterEqual(int(stats.get("raw_constraints_count") or 0), 3)
        self.assertGreaterEqual(int(stats.get("dedup_constraints_count") or 0), int(stats.get("injected_constraints_count") or 0))
        packed_text = "\n".join(out.get("active_constraints") or []) + "\n" + str(out.get("tech_rules_text") or "")
        self.assertIn("temporal", packed_text.lower())
        self.assertIn("coverage", packed_text.lower())

    def test_latency_adaptive_downgrades_pack_mode(self):
        out = build_split_constraint_pack(
            tech_rules_text="- Rule A\n- Rule B",
            active_constraints=["Rule C", "Rule D"],
            chapter_chars=6500,
            latency_window={"sample_size": 20, "p50_ms": 220000, "p75_ms": 300000},
            retry_profile_used=None,
        )
        self.assertEqual(out.get("mode"), "trimmed")
        self.assertTrue(bool(out.get("latency_adaptive_triggered")))

    def test_budget_retry_profile_forces_lighter_pack(self):
        out = build_split_constraint_pack(
            tech_rules_text="- Rule A\n- Rule B",
            active_constraints=["Rule C", "Rule D"],
            chapter_chars=7000,
            latency_window={"sample_size": 20, "p50_ms": 100000, "p75_ms": 120000},
            retry_profile_used="auto_recovery_budget",
        )
        self.assertEqual(out.get("prompt_tier_used"), "recovery_extended")
        self.assertEqual(out.get("mode"), "trimmed")

    def test_compact_tier_drops_chapter_specific_constraints(self):
        out = build_split_constraint_pack(
            tech_rules_text="- [SCENE 3] RULE: ALWAYS split at major temporal anchors",
            active_constraints=[
                "[SCENE 3] RULE: ALWAYS split at major temporal anchors",
                "Temporal Anchor Precision is critical",
            ],
            chapter_chars=6000,
            latency_window={"sample_size": 20, "p50_ms": 100000, "p75_ms": 120000},
            retry_profile_used=None,
        )
        packed = "\n".join(out.get("active_constraints") or []) + "\n" + str(out.get("tech_rules_text") or "")
        self.assertNotIn("[scene 3]", packed.lower())

    def test_multiline_rule_kept_as_block(self):
        tech_rules = (
            "- [TEMPORAL_ANCHOR_GATE] You MUST split at explicit time shift.\n"
            "  Detect cues: Eventually, That afternoon.\n"
            "  Never merge distinct time periods.\n"
            "- [OTHER] keep continuity."
        )
        out = build_split_constraint_pack(
            tech_rules_text=tech_rules,
            active_constraints=[],
            chapter_chars=6000,
            latency_window={"sample_size": 20, "p50_ms": 100000, "p75_ms": 120000},
            retry_profile_used=None,
        )
        packed = str(out.get("tech_rules_text") or "")
        self.assertIn("Detect cues: Eventually", packed)
        stats = out.get("stats") or {}
        self.assertGreaterEqual(int(stats.get("tech_blocks_raw_count") or 0), 2)

    def test_truncation_uses_marker(self):
        long_tail = "A" * 1700
        out = build_split_constraint_pack(
            tech_rules_text=f"- Rule long {long_tail}",
            active_constraints=[],
            chapter_chars=6000,
            latency_window={"sample_size": 20, "p50_ms": 100000, "p75_ms": 120000},
            retry_profile_used=None,
        )
        packed = str(out.get("tech_rules_text") or "")
        self.assertIn("[TRUNCATED]", packed)
        stats = out.get("stats") or {}
        self.assertGreaterEqual(int(stats.get("tech_blocks_truncated_count") or 0), 1)


if __name__ == "__main__":
    unittest.main()

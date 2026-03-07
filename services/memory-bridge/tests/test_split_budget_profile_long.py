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

import worker_common  # noqa: E402,F401
from worker_split_proposal import (  # noqa: E402
    _resolve_phase_budgets,
    _should_enable_one_pass_recovery,
    _should_force_budget_recovery_from_runtime,
)


class TestSplitBudgetProfileLong(unittest.TestCase):
    def test_long_chapter_budget_capped_to_canary_window(self):
        env = {
            "total_budget_sec": 180.0,
            "outline_budget_sec": 55.0,
            "primary_budget_sec": 95.0,
            "repair_budget_sec": 30.0,
        }
        budgets, profile = _resolve_phase_budgets(
            chapter_chars=13314,
            split_controls={},
            env_budgets=env,
            retry_profile_used=None,
        )
        self.assertEqual(profile, "long")
        self.assertGreaterEqual(float(budgets.get("total_budget_sec") or 0.0), 300.0)
        self.assertLessEqual(float(budgets.get("total_budget_sec") or 0.0), 360.0)

    def test_retry_recovery_budget_profile_allows_retry_only_uplift_cap(self):
        env = {
            "total_budget_sec": 180.0,
            "outline_budget_sec": 55.0,
            "primary_budget_sec": 95.0,
            "repair_budget_sec": 30.0,
        }
        budgets, profile = _resolve_phase_budgets(
            chapter_chars=14000,
            split_controls={},
            env_budgets=env,
            retry_profile_used="auto_recovery_budget",
        )
        self.assertEqual(profile, "retry_recovery")
        self.assertGreaterEqual(float(budgets.get("total_budget_sec") or 0.0), 300.0)
        self.assertLessEqual(float(budgets.get("total_budget_sec") or 0.0), 600.0)

    def test_long_high_risk_profile_uses_one_pass_recovery_budget(self):
        env = {
            "total_budget_sec": 180.0,
            "outline_budget_sec": 55.0,
            "primary_budget_sec": 95.0,
            "repair_budget_sec": 30.0,
        }
        budgets, profile = _resolve_phase_budgets(
            chapter_chars=15657,
            split_controls={},
            env_budgets=env,
            retry_profile_used=None,
            issue_hints={"SCENE_OVERDENSE": 4.8, "NARRATIVE_WEIGHT": 4.2},
            constraint_pack_mode="minimal_long_chapter",
            constraint_pack_stats={"raw_constraints_count": 5, "dedup_constraints_count": 13},
        )
        self.assertEqual(profile, "long_high_risk")
        self.assertGreaterEqual(float(budgets.get("total_budget_sec") or 0.0), 600.0)
        self.assertGreaterEqual(float(budgets.get("outline_budget_sec") or 0.0), 120.0)
        self.assertGreaterEqual(float(budgets.get("primary_budget_sec") or 0.0), 360.0)
        self.assertGreaterEqual(float(budgets.get("repair_budget_sec") or 0.0), 180.0)

    def test_long_high_risk_downgrades_to_long_when_low_risk(self):
        env = {
            "total_budget_sec": 180.0,
            "outline_budget_sec": 55.0,
            "primary_budget_sec": 95.0,
            "repair_budget_sec": 30.0,
        }
        budgets, profile = _resolve_phase_budgets(
            chapter_chars=15000,
            split_controls={},
            env_budgets=env,
            retry_profile_used=None,
            issue_hints={"SCENE_OVERDENSE": 2.0, "NARRATIVE_WEIGHT": 2.2},
            constraint_pack_mode="trimmed",
            constraint_pack_stats={"raw_constraints_count": 1, "dedup_constraints_count": 2},
        )
        self.assertEqual(profile, "long")
        self.assertGreaterEqual(float(budgets.get("total_budget_sec") or 0.0), 300.0)
        self.assertLessEqual(float(budgets.get("total_budget_sec") or 0.0), 360.0)

    def test_long_high_risk_downgrades_when_queue_pressure_high(self):
        env = {
            "total_budget_sec": 180.0,
            "outline_budget_sec": 55.0,
            "primary_budget_sec": 95.0,
            "repair_budget_sec": 30.0,
        }
        budgets, profile = _resolve_phase_budgets(
            chapter_chars=15657,
            split_controls={"queue_pressure_high": True},
            env_budgets=env,
            retry_profile_used=None,
            issue_hints={"SCENE_OVERDENSE": 4.9},
            constraint_pack_mode="full",
            constraint_pack_stats={"raw_constraints_count": 9, "dedup_constraints_count": 16},
        )
        self.assertEqual(profile, "long")
        self.assertGreaterEqual(float(budgets.get("total_budget_sec") or 0.0), 300.0)
        self.assertLessEqual(float(budgets.get("total_budget_sec") or 0.0), 360.0)

    def test_recovery_override_flag_allows_retry_only_uplift_cap(self):
        env = {
            "total_budget_sec": 180.0,
            "outline_budget_sec": 55.0,
            "primary_budget_sec": 95.0,
            "repair_budget_sec": 30.0,
        }
        budgets, profile = _resolve_phase_budgets(
            chapter_chars=14000,
            split_controls={"recovery_override": True},
            env_budgets=env,
            retry_profile_used=None,
        )
        self.assertEqual(profile, "long")
        self.assertGreaterEqual(float(budgets.get("total_budget_sec") or 0.0), 300.0)
        self.assertLessEqual(float(budgets.get("total_budget_sec") or 0.0), 600.0)

    def test_budget_guard_forces_effective_profile_when_retry_root_cause_budget(self):
        should_force = _should_force_budget_recovery_from_runtime(
            {
                "retry_profile_used": "auto_recovery_transport",
                "retry_root_cause": "BUDGET",
            },
            {},
            15657,
        )
        self.assertTrue(bool(should_force))

    def test_budget_guard_uses_runtime_budget_preempt_signal(self):
        should_force = _should_force_budget_recovery_from_runtime(
            {
                "retry_profile_used": "auto_recovery_transport",
            },
            {
                "phase_stop_reason": "PRIMARY_BUDGET_EXCEEDED",
                "stop_reason": "TIME_BUDGET_PREEMPTED",
                "degrade_reason_code": "BUDGET_DEGRADE_PATH_TAKEN",
            },
            15657,
        )
        self.assertTrue(bool(should_force))

    def test_budget_guard_does_not_force_for_short_chapter(self):
        should_force = _should_force_budget_recovery_from_runtime(
            {
                "retry_profile_used": "auto_recovery_transport",
                "retry_root_cause": "BUDGET",
            },
            {},
            4200,
        )
        self.assertFalse(bool(should_force))

    def test_budget_guard_does_not_override_budget_profile(self):
        should_force = _should_force_budget_recovery_from_runtime(
            {
                "retry_profile_used": "auto_recovery_budget",
                "retry_root_cause": "BUDGET",
            },
            {},
            15657,
        )
        self.assertFalse(bool(should_force))

    def test_one_pass_recovery_enabled_for_long_high_risk(self):
        self.assertTrue(
            _should_enable_one_pass_recovery(
                budget_profile="long_high_risk",
                controls={},
            )
        )

    def test_one_pass_recovery_can_be_disabled(self):
        self.assertFalse(
            _should_enable_one_pass_recovery(
                budget_profile="long_high_risk",
                controls={"disable_one_pass_recovery": True},
            )
        )


if __name__ == "__main__":
    unittest.main()

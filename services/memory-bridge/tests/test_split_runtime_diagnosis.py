from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Minimal stub so module import works in environments without psycopg2.
if "psycopg2" not in sys.modules:
    fake_psycopg2 = types.ModuleType("psycopg2")
    fake_extras = types.ModuleType("psycopg2.extras")
    setattr(fake_extras, "RealDictCursor", object)
    setattr(fake_extras, "Json", lambda value, **_kwargs: value)
    fake_psycopg2.extras = fake_extras  # type: ignore[attr-defined]
    sys.modules["psycopg2"] = fake_psycopg2
    sys.modules["psycopg2.extras"] = fake_extras

# Avoid worker_common <-> worker_split_proposal circular import for this focused unit test.
if "worker_common" not in sys.modules:
    fake_worker_common = types.ModuleType("worker_common")
    setattr(fake_worker_common, "call_llm_json", lambda *_args, **_kwargs: {})
    setattr(fake_worker_common, "get_llm_timeout", lambda *_args, **_kwargs: 30.0)
    sys.modules["worker_common"] = fake_worker_common

from worker_split_proposal import _runtime_diagnosis  # noqa: E402


class TestSplitRuntimeDiagnosis(unittest.TestCase):
    def test_artifact_oversized_hint(self):
        out = _runtime_diagnosis(
            phase_stop_reason="PRIMARY_DONE",
            stop_reason="",
            degrade_reason_code="",
            artifact_status="NOT_READY",
            oversized_count=3,
            rerun_reason="",
        )
        self.assertEqual(out, ("ARTIFACT", "RETRY_WITH_ARTIFACT_RECOVERY", 0.95, "RUNBOOK_SPLIT_ARTIFACT_OVERSIZED"))

    def test_artifact_coverage_gap_hint(self):
        out = _runtime_diagnosis(
            phase_stop_reason="PRIMARY_DONE",
            stop_reason="",
            degrade_reason_code="",
            artifact_status="NOT_READY",
            oversized_count=0,
            rerun_reason="",
        )
        self.assertEqual(out, ("ARTIFACT", "RETRY_WITH_ARTIFACT_RECOVERY", 0.82, "RUNBOOK_SPLIT_ARTIFACT_COVERAGE_GAP"))

    def test_outline_priority_over_artifact(self):
        out = _runtime_diagnosis(
            phase_stop_reason="OUTLINE_COVERAGE_GATE_FAIL",
            stop_reason="",
            degrade_reason_code="",
            artifact_status="NOT_READY",
            oversized_count=5,
            rerun_reason="ARTIFACT_NOT_READY",
        )
        self.assertEqual(out, ("OUTLINE", "RETRY_WITH_OUTLINE_RECOVERY", 0.92, "RUNBOOK_SPLIT_OUTLINE_COVERAGE"))

    def test_budget_priority_over_artifact(self):
        out = _runtime_diagnosis(
            phase_stop_reason="PRIMARY_BUDGET_EXCEEDED",
            stop_reason="",
            degrade_reason_code="",
            artifact_status="NOT_READY",
            oversized_count=5,
            rerun_reason="ARTIFACT_NOT_READY",
        )
        self.assertEqual(out, ("BUDGET", "RETRY_WITH_BUDGET_RECOVERY", 0.9, "RUNBOOK_SPLIT_BUDGET_PREEMPTION"))

    def test_budget_detected_from_stop_reason_and_degrade_reason(self):
        out = _runtime_diagnosis(
            phase_stop_reason="PRIMARY_DONE",
            stop_reason="TIME_BUDGET_PREEMPTED",
            degrade_reason_code="BUDGET_DEGRADE_PATH_TAKEN",
            artifact_status="NOT_READY",
            oversized_count=2,
            rerun_reason="ARTIFACT_NOT_READY",
        )
        self.assertEqual(out, ("BUDGET", "RETRY_WITH_BUDGET_RECOVERY", 0.9, "RUNBOOK_SPLIT_BUDGET_PREEMPTION"))


if __name__ == "__main__":
    unittest.main()

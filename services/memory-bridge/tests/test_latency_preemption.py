from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker_split_orchestrator import run_auto_split_attempts  # noqa: E402


def _build_scenes_from_split_points(chapter_text: str, split_points: list[int], reason_map: dict[int, str]):
    points = sorted([p for p in split_points if 0 < int(p) < len(chapter_text)])
    out = []
    start = 0
    idx = 1
    for end in points + [len(chapter_text)]:
        out.append(
            {
                "idx": idx,
                "start": int(start),
                "end": int(end),
                "reason": reason_map.get(int(end), ""),
            }
        )
        start = int(end)
        idx += 1
    return out


def _quality_report(_text: str, scenes: list[dict]):
    return {
        "hard_fail": False,
        "flagged_pct": 0.0,
        "fragmentation_score": 0.0,
        "mid_word_cut_count": 0,
        "abbrev_or_name_cut_count": 0,
        "scene_count": len(scenes),
    }


class TestLatencyPreemption(unittest.TestCase):
    def test_primary_budget_preemption_sets_stop_reason_and_recursion_skipped(self):
        chapter_text = ("A" * 2600) + " " + ("B" * 2600)

        def run_split_attempt(**_kwargs):
            scenes = [{"idx": 1, "start": 0, "end": len(chapter_text), "reason": "initial"}]
            return {
                "strategy": "S3_SEMANTIC_RESPLIT",
                "scenes": scenes,
                "autofix_report": {},
                "quality_report": _quality_report(chapter_text, scenes),
                "llm_calls_used": 1,
                "split_points": [],
                "semantic_guard_report": {},
                "targeted_window_report": {},
                "hard_fail": False,
                "skip": False,
                "next_baseline_split_points": [],
            }

        out = run_auto_split_attempts(
            ordered=["S3_SEMANTIC_RESPLIT"],
            chapter_text=chapter_text,
            split_mode="auto",
            lock_spans=[],
            llm_state={"used": 0, "max_calls": 4},
            auto_retry_enabled=True,
            self_healing_enabled=True,
            exploration_enabled=False,
            issue_hints={},
            boundary_type_hints={},
            supervisor_strategy_bias={},
            run_split_attempt=run_split_attempt,
            supervisor_decision_from_quality=lambda _q, _enforce=False: "auto_pass",
            is_hard_fail_quality=lambda _q: False,
            llm_can_run=lambda _s: True,
            rerun_reason=lambda _q, _llm, _auto: "",
            should_force_retry_by_quality_hints=lambda *_args, **_kwargs: (False, ""),
            window_rerun_splice=lambda *_args, **_kwargs: ({}, []),
            build_scenes_from_split_points=_build_scenes_from_split_points,
            quality_report=_quality_report,
            started_at=time.time() - 130.0,
            recursion_soft_deadline_sec=120.0,
            outline_budget_sec=55.0,
            primary_budget_sec=95.0,
            repair_budget_sec=30.0,
            total_budget_sec=180.0,
            outline_elapsed_sec=10.0,
            recursion_max_depth=1,
            oversized_scene_threshold_chars=3500,
        )

        runtime = out.get("split_runtime") or {}
        self.assertEqual(runtime.get("phase_stop_reason"), "PRIMARY_BUDGET_EXCEEDED")
        self.assertEqual(runtime.get("recovery_path_mode"), "explicit_profile")
        preemption = runtime.get("preemption") or {}
        self.assertTrue(bool(preemption.get("recursion_skipped")))
        self.assertTrue(bool(runtime.get("post_repair_forced_applied")))
        self.assertEqual(runtime.get("post_repair_forced_reason"), "PREEMPT_OVERSIZED_CLOSURE")
        self.assertGreaterEqual(int(runtime.get("post_repair_forced_splits") or 0), 1)
        self.assertEqual(int(runtime.get("post_repair_forced_remaining_oversized")), 0)
        phase_timing = runtime.get("phase_timing") or {}
        self.assertIn("recursion_sec", phase_timing)

    def test_recovery_override_allows_recursion_after_soft_deadline_when_budget_remaining(self):
        chapter_text = "A" * 5200

        def run_split_attempt(**_kwargs):
            scenes = [{"idx": 1, "start": 0, "end": len(chapter_text), "reason": "initial"}]
            return {
                "strategy": "S3_SEMANTIC_RESPLIT",
                "scenes": scenes,
                "autofix_report": {},
                "quality_report": _quality_report(chapter_text, scenes),
                "llm_calls_used": 1,
                "split_points": [],
                "semantic_guard_report": {},
                "targeted_window_report": {},
                "hard_fail": False,
                "skip": False,
                "next_baseline_split_points": [],
            }

        out = run_auto_split_attempts(
            ordered=["S3_SEMANTIC_RESPLIT"],
            chapter_text=chapter_text,
            split_mode="auto",
            lock_spans=[],
            llm_state={"used": 0, "max_calls": 6},
            auto_retry_enabled=True,
            self_healing_enabled=True,
            exploration_enabled=False,
            issue_hints={},
            boundary_type_hints={},
            supervisor_strategy_bias={},
            run_split_attempt=run_split_attempt,
            supervisor_decision_from_quality=lambda _q, _enforce=False: "auto_pass",
            is_hard_fail_quality=lambda _q: False,
            llm_can_run=lambda _s: True,
            rerun_reason=lambda _q, _llm, _auto: "",
            should_force_retry_by_quality_hints=lambda *_args, **_kwargs: (False, ""),
            window_rerun_splice=lambda *_args, **_kwargs: ({}, []),
            build_scenes_from_split_points=_build_scenes_from_split_points,
            quality_report=_quality_report,
            started_at=time.time() - 130.0,
            recursion_soft_deadline_sec=120.0,
            recursion_min_budget_sec=45.0,
            recovery_override=True,
            retry_profile_used="auto_recovery_budget",
            recovery_path_mode="guard_forced",
            outline_budget_sec=55.0,
            primary_budget_sec=95.0,
            repair_budget_sec=30.0,
            total_budget_sec=220.0,
            outline_elapsed_sec=10.0,
            recursion_max_depth=1,
            oversized_scene_threshold_chars=3500,
        )

        runtime = out.get("split_runtime") or {}
        self.assertEqual(runtime.get("recovery_path_mode"), "guard_forced")
        preemption = runtime.get("preemption") or {}
        self.assertFalse(bool(preemption.get("recursion_skipped")))
        self.assertEqual(runtime.get("recursion_gate_mode"), "recovery_remaining_budget")
        recovery_codes = runtime.get("recovery_reason_codes") or []
        self.assertIn("RECOVERY_RECURSION_EXECUTED", recovery_codes)

    def test_one_pass_mode_bypasses_soft_deadline_and_uses_recovery_gate(self):
        chapter_text = "A" * 5200

        def run_split_attempt(**_kwargs):
            scenes = [{"idx": 1, "start": 0, "end": len(chapter_text), "reason": "initial"}]
            return {
                "strategy": "S3_SEMANTIC_RESPLIT",
                "scenes": scenes,
                "autofix_report": {},
                "quality_report": _quality_report(chapter_text, scenes),
                "llm_calls_used": 1,
                "split_points": [],
                "semantic_guard_report": {},
                "targeted_window_report": {},
                "hard_fail": False,
                "skip": False,
                "next_baseline_split_points": [],
            }

        out = run_auto_split_attempts(
            ordered=["S3_SEMANTIC_RESPLIT"],
            chapter_text=chapter_text,
            split_mode="auto",
            lock_spans=[],
            llm_state={"used": 0, "max_calls": 6},
            auto_retry_enabled=True,
            self_healing_enabled=True,
            exploration_enabled=False,
            issue_hints={},
            boundary_type_hints={},
            supervisor_strategy_bias={},
            run_split_attempt=run_split_attempt,
            supervisor_decision_from_quality=lambda _q, _enforce=False: "auto_pass",
            is_hard_fail_quality=lambda _q: False,
            llm_can_run=lambda _s: True,
            rerun_reason=lambda _q, _llm, _auto: "",
            should_force_retry_by_quality_hints=lambda *_args, **_kwargs: (False, ""),
            window_rerun_splice=lambda *_args, **_kwargs: ({}, []),
            build_scenes_from_split_points=_build_scenes_from_split_points,
            quality_report=_quality_report,
            started_at=time.time() - 130.0,
            recursion_soft_deadline_sec=120.0,
            recursion_min_budget_sec=45.0,
            one_pass_recovery_enabled=True,
            recovery_override=False,
            retry_profile_used="",
            outline_budget_sec=55.0,
            primary_budget_sec=95.0,
            repair_budget_sec=30.0,
            total_budget_sec=220.0,
            outline_elapsed_sec=10.0,
            recursion_max_depth=1,
            oversized_scene_threshold_chars=3500,
        )

        runtime = out.get("split_runtime") or {}
        self.assertEqual(runtime.get("one_pass_gate_mode"), "recovery_remaining_budget")
        self.assertTrue(bool(runtime.get("one_pass_soft_deadline_bypassed")))
        self.assertEqual(runtime.get("recursion_gate_mode"), "recovery_remaining_budget")
        self.assertNotEqual(runtime.get("recursion_gate_decision_reason"), "SOFT_DEADLINE_EXCEEDED")

    def test_preempt_recovery_runs_repair_when_budget_remaining(self):
        chapter_text = "A" * 5200

        def run_split_attempt(**_kwargs):
            scenes = [{"idx": 1, "start": 0, "end": len(chapter_text), "reason": "initial"}]
            return {
                "strategy": "S3_SEMANTIC_RESPLIT",
                "scenes": scenes,
                "autofix_report": {},
                "quality_report": _quality_report(chapter_text, scenes),
                "llm_calls_used": 1,
                "split_points": [],
                "semantic_guard_report": {},
                "targeted_window_report": {},
                "hard_fail": False,
                "skip": False,
                "next_baseline_split_points": [],
            }

        out = run_auto_split_attempts(
            ordered=["S3_SEMANTIC_RESPLIT"],
            chapter_text=chapter_text,
            split_mode="auto",
            lock_spans=[],
            llm_state={"used": 0, "max_calls": 6},
            auto_retry_enabled=True,
            self_healing_enabled=True,
            exploration_enabled=False,
            issue_hints={},
            boundary_type_hints={},
            supervisor_strategy_bias={},
            run_split_attempt=run_split_attempt,
            supervisor_decision_from_quality=lambda _q, _enforce=False: "auto_pass",
            is_hard_fail_quality=lambda _q: False,
            llm_can_run=lambda _s: True,
            rerun_reason=lambda _q, _llm, _auto: "",
            should_force_retry_by_quality_hints=lambda *_args, **_kwargs: (False, ""),
            window_rerun_splice=lambda *_args, **_kwargs: ({}, []),
            build_scenes_from_split_points=_build_scenes_from_split_points,
            quality_report=_quality_report,
            started_at=time.time() - 130.0,
            recursion_soft_deadline_sec=120.0,
            recursion_min_budget_sec=45.0,
            recovery_override=True,
            retry_profile_used="auto_recovery_budget",
            outline_budget_sec=55.0,
            primary_budget_sec=95.0,
            repair_budget_sec=200.0,
            repair_min_budget_sec=20.0,
            total_budget_sec=220.0,
            outline_elapsed_sec=10.0,
            recursion_max_depth=1,
            oversized_scene_threshold_chars=3500,
        )

        runtime = out.get("split_runtime") or {}
        repair_summary = runtime.get("repair_summary") or {}
        self.assertTrue(bool(repair_summary.get("attempted")))
        self.assertEqual(repair_summary.get("repair_trigger_mode"), "preempt_recovery")
        self.assertGreater(float(repair_summary.get("repair_budget_remaining_sec") or 0.0), 0.0)
        recovery_codes = runtime.get("recovery_reason_codes") or []
        self.assertIn("RECOVERY_REPAIR_EXECUTED", recovery_codes)

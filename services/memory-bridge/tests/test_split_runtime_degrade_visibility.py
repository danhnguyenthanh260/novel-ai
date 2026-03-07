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
        out.append({"idx": idx, "start": int(start), "end": int(end), "reason": reason_map.get(int(end), "")})
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


def _run_split_attempt_factory(chapter_text: str):
    def _run_split_attempt(**_kwargs):
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

    return _run_split_attempt


class TestSplitRuntimeDegradeVisibility(unittest.TestCase):
    def test_budget_degrade_sets_runtime_flag(self):
        chapter_text = "A" * 5200
        out = run_auto_split_attempts(
            ordered=["S3_SEMANTIC_RESPLIT"],
            chapter_text=chapter_text,
            split_mode="auto",
            lock_spans=[],
            llm_state={"used": 0, "max_calls": 0},
            auto_retry_enabled=True,
            self_healing_enabled=True,
            exploration_enabled=False,
            issue_hints={},
            boundary_type_hints={},
            supervisor_strategy_bias={},
            run_split_attempt=_run_split_attempt_factory(chapter_text),
            supervisor_decision_from_quality=lambda _q, _enforce=False: "auto_pass",
            is_hard_fail_quality=lambda _q: False,
            llm_can_run=lambda _s: False,
            rerun_reason=lambda _q, _llm, _auto: "",
            should_force_retry_by_quality_hints=lambda *_args, **_kwargs: (False, ""),
            window_rerun_splice=lambda *_args, **_kwargs: ({}, []),
            build_scenes_from_split_points=_build_scenes_from_split_points,
            quality_report=_quality_report,
            started_at=time.time() - 260.0,
            recursion_soft_deadline_sec=120.0,
            outline_budget_sec=55.0,
            primary_budget_sec=95.0,
            repair_budget_sec=30.0,
            total_budget_sec=180.0,
            outline_elapsed_sec=10.0,
            recursion_max_depth=1,
            oversized_scene_threshold_chars=3000,
            pipeline_v2_enabled=True,
        )
        runtime = out.get("split_runtime") or {}
        self.assertTrue(bool(runtime.get("degrade_path_taken")))
        self.assertEqual(runtime.get("degrade_reason_code"), "BUDGET_DEGRADE_PATH_TAKEN")
        self.assertEqual(runtime.get("pipeline_version"), "v2")
        self.assertFalse(bool(runtime.get("post_repair_forced_applied")))

    def test_deterministic_fallback_visible_in_runtime(self):
        chapter_text = ("A" * 2600) + " " + ("B" * 2600)
        out = run_auto_split_attempts(
            ordered=["S3_SEMANTIC_RESPLIT"],
            chapter_text=chapter_text,
            split_mode="auto",
            lock_spans=[],
            llm_state={"used": 0, "max_calls": 3},
            auto_retry_enabled=True,
            self_healing_enabled=True,
            exploration_enabled=False,
            issue_hints={},
            boundary_type_hints={},
            supervisor_strategy_bias={},
            run_split_attempt=_run_split_attempt_factory(chapter_text),
            supervisor_decision_from_quality=lambda _q, _enforce=False: "auto_pass",
            is_hard_fail_quality=lambda _q: False,
            llm_can_run=lambda _s: True,
            rerun_reason=lambda _q, _llm, _auto: "",
            should_force_retry_by_quality_hints=lambda *_args, **_kwargs: (False, ""),
            window_rerun_splice=lambda *_args, **_kwargs: ({}, []),
            build_scenes_from_split_points=_build_scenes_from_split_points,
            quality_report=_quality_report,
            started_at=time.time(),
            recursion_soft_deadline_sec=120.0,
            outline_budget_sec=55.0,
            primary_budget_sec=95.0,
            repair_budget_sec=30.0,
            total_budget_sec=180.0,
            outline_elapsed_sec=1.0,
            recursion_max_depth=1,
            oversized_scene_threshold_chars=3000,
            pipeline_v2_enabled=True,
        )
        runtime = out.get("split_runtime") or {}
        self.assertTrue(bool(runtime.get("deterministic_fallback_applied")))
        notes = [str(x) for x in (runtime.get("deterministic_fallback_notes") or [])]
        self.assertTrue(any("OVERSIZED_DETERMINISTIC_SPLIT" in note for note in notes))


if __name__ == "__main__":
    unittest.main()

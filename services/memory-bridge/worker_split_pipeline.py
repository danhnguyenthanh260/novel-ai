from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional


def _quality_rank_key(quality: Dict[str, Any]) -> tuple:
    return (
        1 if bool(quality.get("hard_fail")) else 0,
        int(quality.get("mid_word_cut_count") or 0) + int(quality.get("abbrev_or_name_cut_count") or 0),
        float(quality.get("flagged_pct") or 0.0),
        float(quality.get("fragmentation_score") or 0.0),
    )


def run_split_attempt(
    *,
    strategy: str,
    chapter_text: str,
    lock_spans: List[Any],
    llm_state: Dict[str, int],
    baseline_split_points: List[int],
    split_mode: str,
    reprocess_note: Optional[str] = None,
    previous_split_contexts: Optional[List[str]] = None,
    hard_anchor_positions: Optional[List[int]] = None,
    hard_anchor_tolerance_chars: int = 200,
    extract_split_candidates: Callable[[str, str, Dict[str, int]], List[Any]],
    build_scenes_from_candidates: Callable[[str, List[Any], List[Any]], Any],
    llm_semantic_resplit_offsets: Callable[..., Any],
    refine_split_points: Callable[[str, List[int], List[Any]], List[int]],
    autofix_split_points: Callable[[str, List[int], List[Any]], Any],
    build_scenes_from_split_points: Callable[[str, List[int], Dict[int, str]], List[Dict[str, Any]]],
    window_rerun_splice: Callable[[str, List[int], List[Any], Dict[str, int]], Any],
    merge_bad_boundaries: Callable[[str, List[int]], Any],
    merge_for_fragmentation: Callable[[str, List[int]], Any],
    quality_report: Callable[[str, List[Dict[str, Any]]], Dict[str, Any]],
    is_degenerate_single_scene: Callable[[str, List[Dict[str, Any]], str], bool],
    is_hard_fail_quality: Callable[[Dict[str, Any]], bool],
    **kwargs: Any,
) -> Dict[str, Any]:
    semantic_guard_report: Dict[str, Any] = {}
    targeted_window_report: Dict[str, Any] = {}
    split_points: List[int] = []
    autofix_candidate: Dict[str, Any] = {}
    scenes_candidate: List[Dict[str, Any]] = []
    next_baseline_split_points = baseline_split_points[:]

    if strategy == "S3_SEMANTIC_RESPLIT":
        if not baseline_split_points:
            candidates = extract_split_candidates(chapter_text, "S0_BASE", llm_state)
            _, _, baseline_split_points = build_scenes_from_candidates(chapter_text, candidates, lock_spans)
            if not baseline_split_points:
                return {"skip": True}
        semantic_points, semantic_guard_report = llm_semantic_resplit_offsets(
            chapter_text, 
            baseline_split_points, 
            llm_state,
            reprocess_note=reprocess_note,
            previous_split_contexts=previous_split_contexts,
            hard_anchor_positions=hard_anchor_positions,
            hard_anchor_tolerance_chars=hard_anchor_tolerance_chars,
        )
        if not semantic_points:
            semantic_points = baseline_split_points[:]
        semantic_points = refine_split_points(chapter_text, semantic_points, lock_spans)
        semantic_points, semantic_autofix = autofix_split_points(chapter_text, semantic_points, lock_spans)
        semantic_reasons = {x: "semantic_resplit" for x in semantic_points}
        scenes_candidate = build_scenes_from_split_points(chapter_text, semantic_points, semantic_reasons)
        split_points = semantic_points
        autofix_candidate = {**semantic_autofix, "semantic_guard_report": semantic_guard_report}
    else:
        candidates = extract_split_candidates(chapter_text, strategy, llm_state)
        scenes_candidate, autofix_candidate, split_points = build_scenes_from_candidates(chapter_text, candidates, lock_spans)
        if not next_baseline_split_points:
            next_baseline_split_points = split_points[:]

    if strategy == "S1_TARGETED_WINDOW_REPAIR":
        targeted_points, targeted_window_report = window_rerun_splice(chapter_text, split_points, lock_spans, llm_state)
        if targeted_points and targeted_points != split_points:
            reasons = {int(s["end"]): str(s.get("reason") or "") for s in scenes_candidate}
            scenes_candidate = build_scenes_from_split_points(chapter_text, targeted_points, reasons)
            split_points = targeted_points
        autofix_candidate = {
            **autofix_candidate,
            "targeted_window_report": targeted_window_report,
        }

    if strategy == "S2_MERGE_FIX":
        merged_points, merged_count = merge_bad_boundaries(chapter_text, split_points)
        fragmented_points, fragmented_merge_count = merge_for_fragmentation(
            chapter_text, merged_points if merged_count > 0 else split_points
        )
        final_points = fragmented_points if fragmented_merge_count > 0 else merged_points
        final_merge_count = int(merged_count) + int(fragmented_merge_count)
        if final_merge_count > 0 and final_points != split_points:
            reasons = {int(s["end"]): str(s.get("reason") or "") for s in scenes_candidate}
            scenes_candidate = build_scenes_from_split_points(chapter_text, final_points, reasons)
            split_points = final_points
            autofix_candidate = {
                **autofix_candidate,
                "merged_by_strategy": final_merge_count,
                "merged_by_fragmentation": fragmented_merge_count,
            }

    quality_candidate = quality_report(chapter_text, scenes_candidate)
    if is_degenerate_single_scene(chapter_text, scenes_candidate, split_mode):
        quality_candidate["hard_fail"] = True
        quality_candidate["degenerate_single_scene"] = True
    # Reflect V2: one bounded self-correction pass for S3 strategic mode only.
    reflect_v2_report: Dict[str, Any] = {
        "enabled": bool(kwargs.get("reflect_v2_enabled")),
        "used": False,
        "improved": False,
        "reason": "",
    }
    if (
        strategy == "S3_SEMANTIC_RESPLIT"
        and bool(kwargs.get("reflect_v2_enabled"))
        and bool(kwargs.get("runtime_mode") == "S3_STRATEGIC")
        and bool(quality_candidate.get("hard_fail"))
    ):
        can_retry = bool(llm_state.get("used", 0) < llm_state.get("max_calls", 0))
        if can_retry:
            reflect_note = (
                f"REFLECT_V2_SELF_CORRECTION: hard_fail={bool(quality_candidate.get('hard_fail'))}; "
                f"mid_word_cut_count={int(quality_candidate.get('mid_word_cut_count') or 0)}; "
                f"abbrev_or_name_cut_count={int(quality_candidate.get('abbrev_or_name_cut_count') or 0)}; "
                f"fragmentation_score={float(quality_candidate.get('fragmentation_score') or 0.0):.4f}; "
                "adjust boundaries to remove violations while preserving narrative continuity."
            )
            second_points, second_guard_report = llm_semantic_resplit_offsets(
                chapter_text,
                split_points,
                llm_state,
                reprocess_note=reflect_note,
                previous_split_contexts=previous_split_contexts,
                hard_anchor_positions=hard_anchor_positions,
                hard_anchor_tolerance_chars=hard_anchor_tolerance_chars,
            )
            reflect_v2_report["used"] = True
            reflect_v2_report["reason"] = str(second_guard_report.get("reason") or "")
            if second_points and second_points != split_points:
                second_points = refine_split_points(chapter_text, second_points, lock_spans)
                second_points, second_autofix = autofix_split_points(chapter_text, second_points, lock_spans)
                second_reasons = {x: "reflect_v2_self_correction" for x in second_points}
                second_scenes = build_scenes_from_split_points(chapter_text, second_points, second_reasons)
                second_quality = quality_report(chapter_text, second_scenes)
                if is_degenerate_single_scene(chapter_text, second_scenes, split_mode):
                    second_quality["hard_fail"] = True
                    second_quality["degenerate_single_scene"] = True
                if _quality_rank_key(second_quality) <= _quality_rank_key(quality_candidate):
                    scenes_candidate = second_scenes
                    split_points = second_points
                    quality_candidate = second_quality
                    semantic_guard_report = second_guard_report if isinstance(second_guard_report, dict) else {}
                    autofix_candidate = {
                        **autofix_candidate,
                        **second_autofix,
                    }
                    reflect_v2_report["improved"] = True
                    reflect_v2_report["reason"] = "IMPROVED_OR_EQUAL_ACCEPTED"
        else:
            reflect_v2_report["reason"] = "LLM_BUDGET_EXCEEDED"
    if reflect_v2_report["enabled"]:
        autofix_candidate = {**autofix_candidate, "reflect_v2_report": reflect_v2_report}

    return {
        "skip": False,
        "strategy": strategy,
        "scenes": scenes_candidate,
        "autofix_report": autofix_candidate,
        "quality_report": quality_candidate,
        "llm_calls_used": int(llm_state.get("used") or 0),
        "split_points": split_points[:],
        "semantic_guard_report": semantic_guard_report if strategy == "S3_SEMANTIC_RESPLIT" else {},
        "targeted_window_report": targeted_window_report if strategy == "S1_TARGETED_WINDOW_REPAIR" else {},
        "hard_fail": is_hard_fail_quality(quality_candidate),
        "next_baseline_split_points": next_baseline_split_points,
    }

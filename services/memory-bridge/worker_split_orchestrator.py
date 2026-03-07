from __future__ import annotations

import time
import re
from typing import Any, Callable, Dict, List, Optional, Tuple
from worker_split_boundary_helpers import (
    deterministic_split_oversized_points,
    repair_dangling_conjunction_boundaries,
)


def _scene_length(scene: Dict[str, Any]) -> int:
    try:
        start = int(scene.get("start") or 0)
        end = int(scene.get("end") or 0)
    except Exception:
        return 0
    return max(0, end - start)


def _scene_text(chapter_text: str, scene: Dict[str, Any]) -> str:
    try:
        start = int(scene.get("start") or 0)
        end = int(scene.get("end") or 0)
    except Exception:
        return ""
    start = max(0, min(len(chapter_text), start))
    end = max(start, min(len(chapter_text), end))
    return chapter_text[start:end]


def _has_unclosed_quote(text: str) -> bool:
    if not text:
        return False
    # Cheap signal for dangling dialogue.
    double_quote = text.count('"') % 2 != 0
    left_curly = text.count("“")
    right_curly = text.count("”")
    curly_mismatch = left_curly != right_curly
    return bool(double_quote or curly_mismatch)


def _split_points_from_scenes(scenes: List[Dict[str, Any]]) -> List[int]:
    points: List[int] = []
    for scene in scenes[:-1]:
        try:
            end = int(scene.get("end") or 0)
        except Exception:
            continue
        if end > 0:
            points.append(end)
    return sorted(set(points))


def _scene_problem_signature(
    chapter_text: str,
    scenes: List[Dict[str, Any]],
    oversized_scene_threshold_chars: int,
) -> Dict[str, Any]:
    oversized_count = 0
    oversized_excess = 0
    unclosed_quote_count = 0
    for scene in scenes:
        ln = _scene_length(scene)
        if ln > oversized_scene_threshold_chars:
            oversized_count += 1
            oversized_excess += (ln - oversized_scene_threshold_chars)
        if _has_unclosed_quote(_scene_text(chapter_text, scene)):
            unclosed_quote_count += 1
    return {
        "oversized_count": int(oversized_count),
        "oversized_excess_chars": int(oversized_excess),
        "contains_unclosed_quote": bool(unclosed_quote_count > 0),
        "unclosed_quote_count": int(unclosed_quote_count),
    }


def _problem_score(sig: Dict[str, Any], oversized_scene_threshold_chars: int) -> float:
    return float(sig.get("oversized_excess_chars") or 0.0) + (
        float(sig.get("unclosed_quote_count") or 0.0) * float(oversized_scene_threshold_chars)
    )


def _build_reason_map(scenes: List[Dict[str, Any]]) -> Dict[int, str]:
    out: Dict[int, str] = {}
    for scene in scenes:
        try:
            end = int(scene.get("end") or 0)
        except Exception:
            continue
        if end > 0:
            out[end] = str(scene.get("reason") or "")
    return out


def _run_recursive_s3_subsplit(
    *,
    chapter_text: str,
    split_mode: str,
    scenes: List[Dict[str, Any]],
    quality: Dict[str, Any],
    llm_state: Dict[str, int],
    llm_can_run: Callable[[Dict[str, int]], bool],
    run_split_attempt: Callable[..., Dict[str, Any]],
    build_scenes_from_split_points: Callable[..., List[Dict[str, Any]]],
    quality_report: Callable[[str, List[Dict[str, Any]]], Dict[str, Any]],
    is_hard_fail_quality: Callable[[Dict[str, Any]], bool],
    oversized_scene_threshold_chars: int,
    recursion_max_depth: int,
    recursion_min_gain_pct: float,
    recursion_prefix_chars: int,
    recursion_suffix_chars: int,
    previous_split_contexts: Optional[List[str]] = None,
    outline_hint_positions: Optional[List[int]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]]:
    attempts: List[Dict[str, Any]] = []
    depth_used = 0
    current_scenes = list(scenes or [])
    current_quality = dict(quality or {})
    stop_reason = "NO_PROBLEM"

    if not current_scenes:
        return current_scenes, current_quality, attempts, {"depth_used": 0, "stop_reason": "EMPTY_SCENES"}

    for depth in range(1, max(1, recursion_max_depth) + 1):
        current_sig = _scene_problem_signature(
            chapter_text=chapter_text,
            scenes=current_scenes,
            oversized_scene_threshold_chars=oversized_scene_threshold_chars,
        )
        if int(current_sig.get("oversized_count") or 0) <= 0 and not bool(current_sig.get("contains_unclosed_quote")):
            stop_reason = "NO_PROBLEM"
            break

        base_score = _problem_score(current_sig, oversized_scene_threshold_chars)
        improved_this_depth = False
        current_points = _split_points_from_scenes(current_scenes)
        reason_map = _build_reason_map(current_scenes)

        problematic: List[Dict[str, Any]] = []
        for scene in current_scenes:
            ln = _scene_length(scene)
            txt = _scene_text(chapter_text, scene)
            if ln > oversized_scene_threshold_chars or _has_unclosed_quote(txt):
                problematic.append(scene)
        problematic.sort(key=lambda s: _scene_length(s), reverse=True)

        for scene in problematic:
            if not llm_can_run(llm_state):
                break
            start = int(scene.get("start") or 0)
            end = int(scene.get("end") or 0)
            if end <= start:
                continue
            prefix_start = max(0, start - recursion_prefix_chars)
            suffix_end = min(len(chapter_text), end + recursion_suffix_chars)
            mini_text = chapter_text[prefix_start:suffix_end]
            center_start = start - prefix_start
            center_end = center_start + (end - start)
            note = (
                "RECURSIVE_SUB_SPLIT: split only inside center span "
                f"[{center_start},{center_end}] in mini text. "
                "Use prefix/suffix as context only. Do not cut in bleed windows."
            )
            attempt = run_split_attempt(
                strategy="S3_SEMANTIC_RESPLIT",
                chapter_text=mini_text,
                lock_spans=[],
                llm_state=llm_state,
                baseline_split_points=[],
                split_mode=split_mode,
                reprocess_note=note,
                previous_split_contexts=previous_split_contexts,
            )
            if bool(attempt.get("skip")):
                continue
            mini_points = list(attempt.get("split_points") or [])
            center_points_global: List[int] = []
            for p in mini_points:
                try:
                    p_int = int(p)
                except Exception:
                    continue
                if center_start < p_int < center_end:
                    center_points_global.append(prefix_start + p_int)
            center_points_global = sorted(set(center_points_global))
            if not center_points_global and outline_hint_positions:
                for hp in outline_hint_positions:
                    if start < hp < end:
                        center_points_global.append(hp)
                center_points_global = sorted(set(center_points_global))
            if not center_points_global:
                continue

            next_points = [p for p in current_points if not (start < p < end)]
            next_points.extend(center_points_global)
            next_points = sorted(set(next_points))
            for p in center_points_global:
                reason_map[p] = f"recursive_s3_depth_{depth}"
            next_scenes = build_scenes_from_split_points(chapter_text, next_points, reason_map)
            next_quality = quality_report(chapter_text, next_scenes)
            if bool(is_hard_fail_quality(next_quality)) and not bool(is_hard_fail_quality(current_quality)):
                continue
            next_sig = _scene_problem_signature(
                chapter_text=chapter_text,
                scenes=next_scenes,
                oversized_scene_threshold_chars=oversized_scene_threshold_chars,
            )
            next_score = _problem_score(next_sig, oversized_scene_threshold_chars)
            gain = (base_score - next_score) / max(1.0, base_score)
            attempts.append(
                {
                    "strategy": f"S3_RECURSIVE_SUBSPLIT_D{depth}",
                    "scenes": next_scenes,
                    "quality_report": next_quality,
                    "llm_calls_used": int(llm_state.get("used") or 0),
                    "split_points": next_points,
                    "hard_fail": bool(is_hard_fail_quality(next_quality)),
                    "rerun_reason": "RECURSIVE_SUB_SPLIT",
                    "forced_retry_gate": False,
                    "supervisor_history_retry": False,
                    "exploration_retry": False,
                    "recursive_gain_pct": round(float(gain), 4),
                    "recursive_target_span": {"start": start, "end": end},
                }
            )
            if gain >= float(recursion_min_gain_pct):
                current_scenes = next_scenes
                current_quality = next_quality
                current_points = next_points
                base_score = next_score
                depth_used = depth
                improved_this_depth = True

        if not improved_this_depth:
            stop_reason = "GAIN_BELOW_THRESHOLD"
            break

    runtime_meta = {
        "mode": "S3_VALIDATION_RECURSIVE",
        "recursion_depth_used": int(depth_used),
        "recursion_max_depth": int(recursion_max_depth),
        "recursion_min_gain_pct": float(recursion_min_gain_pct),
        "oversized_scene_threshold_chars": int(oversized_scene_threshold_chars),
        "recursion_context_bleed_chars": {
            "prefix": int(recursion_prefix_chars),
            "suffix": int(recursion_suffix_chars),
        },
        "validation_flags": {
            "contains_unclosed_quote": bool(
                _scene_problem_signature(
                    chapter_text=chapter_text,
                    scenes=current_scenes,
                    oversized_scene_threshold_chars=oversized_scene_threshold_chars,
                ).get("contains_unclosed_quote")
            ),
        },
        "stop_reason": stop_reason,
    }
    return current_scenes, current_quality, attempts, runtime_meta


def _choose_local_cut_point(text: str, global_start: int, global_end: int, threshold: int) -> Optional[int]:
    seg = text[global_start:global_end]
    if len(seg) <= threshold:
        return None
    local_mid = len(seg) // 2
    min_local = int(len(seg) * 0.25)
    max_local = int(len(seg) * 0.75)
    # Prefer deterministic anchors before fallback punctuation midpoint.
    anchor_patterns = [
        re.compile(r"(?:\n|\r)\s*(?:Later|That (?:night|morning|afternoon|evening)|The next day|Hours later)\b", re.IGNORECASE),
        re.compile(r"(?:\n|\r)\s*(?:On the way|Back at|Meanwhile|Elsewhere)\b", re.IGNORECASE),
        re.compile(r"[”\"]\s*(?:\n|\r)"),  # dialogue closure boundary
    ]
    candidates: List[int] = []
    for pattern in anchor_patterns:
        for match in pattern.finditer(seg):
            idx = int(match.start())
            if min_local <= idx <= max_local:
                candidates.append(idx)
    if candidates:
        candidates = sorted(set(candidates), key=lambda idx: abs(idx - local_mid))
        best_local = candidates[0]
    else:
        punct_pattern = re.compile(r"[\n\r]|[.!?;:](?:\s|$)")
        best_local = None
        best_dist = 10**9
        for match in punct_pattern.finditer(seg):
            idx = int(match.start())
            if idx < min_local or idx > max_local:
                continue
            dist = abs(idx - local_mid)
            if dist < best_dist:
                best_dist = dist
                best_local = idx
    if best_local is None:
        fallback = local_mid
        if fallback <= min_local or fallback >= max_local:
            return None
        best_local = fallback
    cut = global_start + int(best_local)
    if cut <= global_start or cut >= global_end:
        return None
    return cut


def _run_lightweight_repair_pass(
    *,
    chapter_text: str,
    scenes: List[Dict[str, Any]],
    oversized_scene_threshold_chars: int,
    pipeline_v2_enabled: bool,
    boundary_shift_window_chars: int,
    oversized_split_window_chars: int,
    max_oversized_deterministic_splits_per_chunk: int,
    dialogue_attribution_guard_enabled: bool,
    build_scenes_from_split_points: Callable[..., List[Dict[str, Any]]],
    quality_report: Callable[[str, List[Dict[str, Any]]], Dict[str, Any]],
    normalize_split_points: Optional[Callable[[List[int], int], List[int]]] = None,
    hard_anchor_positions: Optional[List[int]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    current_points = _split_points_from_scenes(scenes)
    reason_map = _build_reason_map(scenes)
    safe_hard_positions: List[int] = []
    for x in (hard_anchor_positions or []):
        try:
            val = int(x)
        except Exception:
            continue
        if val > 0:
            safe_hard_positions.append(val)
    hard_anchor_positions = sorted(set(safe_hard_positions))
    anchor_preservation_applied = False

    if not pipeline_v2_enabled:
        repaired_chunks = 0
        new_points: List[int] = []
        for scene in scenes:
            ln = _scene_length(scene)
            if ln <= oversized_scene_threshold_chars:
                continue
            start = int(scene.get("start") or 0)
            end = int(scene.get("end") or 0)
            cut = _choose_local_cut_point(chapter_text, start, end, oversized_scene_threshold_chars)
            if cut is None:
                continue
            new_points.append(cut)
            reason_map[cut] = "lightweight_repair_oversized"
            repaired_chunks += 1
        merged_points = sorted(set(current_points + new_points))
        if hard_anchor_positions:
            merged_points = sorted(set(merged_points + hard_anchor_positions))
            anchor_preservation_applied = True
        if not new_points:
            return scenes, quality_report(chapter_text, scenes), {
                "attempted": True,
                "repaired_chunks": 0,
                "remaining_violations": int(sum(1 for s in scenes if _scene_length(s) > oversized_scene_threshold_chars)),
                "conjunction_report": {"attempted": False, "moved": 0, "guard_hits": 0, "reasons": []},
                "deterministic_split_report": {"attempted": False, "applied": 0, "fallback_applied": 0, "remaining_oversized": 0, "notes": []},
                "deterministic_fallback_applied": False,
                "deterministic_notes": [],
                "anchor_preservation_applied": bool(anchor_preservation_applied),
            }
        next_scenes = build_scenes_from_split_points(chapter_text, merged_points, reason_map)
        next_quality = quality_report(chapter_text, next_scenes)
        remaining = int(sum(1 for s in next_scenes if _scene_length(s) > oversized_scene_threshold_chars))
        return next_scenes, next_quality, {
            "attempted": True,
            "repaired_chunks": int(repaired_chunks),
            "remaining_violations": int(remaining),
            "conjunction_report": {"attempted": False, "moved": 0, "guard_hits": 0, "reasons": []},
            "deterministic_split_report": {"attempted": False, "applied": 0, "fallback_applied": 0, "remaining_oversized": remaining, "notes": []},
            "deterministic_fallback_applied": False,
            "deterministic_notes": [],
            "anchor_preservation_applied": bool(anchor_preservation_applied),
        }

    # Phase 1.5a: dialogue-safe conjunction boundary cleanup.
    conjunction_points, conjunction_report = repair_dangling_conjunction_boundaries(
        chapter_text,
        current_points,
        boundary_shift_window_chars=boundary_shift_window_chars,
        dialogue_attribution_guard_enabled=dialogue_attribution_guard_enabled,
        normalize_split_points=normalize_split_points,
    )
    current_points = conjunction_points

    # Phase 1.5b: deterministic oversized split near midpoint anchors.
    oversized_points, oversized_report = deterministic_split_oversized_points(
        chapter_text,
        current_points,
        max_chunk_chars=oversized_scene_threshold_chars,
        max_oversized_deterministic_splits_per_chunk=max_oversized_deterministic_splits_per_chunk,
        oversized_split_window_chars=oversized_split_window_chars,
        normalize_split_points=normalize_split_points,
    )
    merged_points = sorted(set(oversized_points))
    if hard_anchor_positions:
        merged_points = sorted(set(merged_points + hard_anchor_positions))
        anchor_preservation_applied = True
    for point in merged_points:
        if point not in reason_map:
            reason_map[point] = "lightweight_repair_oversized"

    if merged_points == _split_points_from_scenes(scenes):
        remaining_violations = int(sum(1 for s in scenes if _scene_length(s) > oversized_scene_threshold_chars))
        return scenes, quality_report(chapter_text, scenes), {
            "attempted": True,
            "repaired_chunks": 0,
            "remaining_violations": remaining_violations,
            "conjunction_report": conjunction_report,
            "deterministic_split_report": oversized_report,
            "deterministic_fallback_applied": bool(int(oversized_report.get("applied") or 0) > 0),
            "deterministic_notes": list(oversized_report.get("notes") or []),
            "anchor_preservation_applied": bool(anchor_preservation_applied),
        }

    next_scenes = build_scenes_from_split_points(chapter_text, merged_points, reason_map)
    next_quality = quality_report(chapter_text, next_scenes)
    remaining = int(sum(1 for s in next_scenes if _scene_length(s) > oversized_scene_threshold_chars))
    return next_scenes, next_quality, {
        "attempted": True,
        "repaired_chunks": int(oversized_report.get("applied") or 0),
        "remaining_violations": int(remaining),
        "conjunction_report": conjunction_report,
        "deterministic_split_report": oversized_report,
        "deterministic_fallback_applied": bool(int(oversized_report.get("applied") or 0) > 0),
        "deterministic_notes": list(oversized_report.get("notes") or []),
        "anchor_preservation_applied": bool(anchor_preservation_applied),
    }


def _run_forced_oversized_post_repair(
    *,
    chapter_text: str,
    scenes: List[Dict[str, Any]],
    oversized_scene_threshold_chars: int,
    oversized_split_window_chars: int,
    max_oversized_deterministic_splits_per_chunk: int,
    build_scenes_from_split_points: Callable[..., List[Dict[str, Any]]],
    quality_report: Callable[[str, List[Dict[str, Any]]], Dict[str, Any]],
    normalize_split_points: Optional[Callable[[List[int], int], List[int]]] = None,
    hard_anchor_positions: Optional[List[int]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    current_points = _split_points_from_scenes(scenes)
    reason_map = _build_reason_map(scenes)
    safe_hard_positions: List[int] = []
    for x in (hard_anchor_positions or []):
        try:
            val = int(x)
        except Exception:
            continue
        if val > 0:
            safe_hard_positions.append(val)
    hard_anchor_positions = sorted(set(safe_hard_positions))

    oversized_points, oversized_report = deterministic_split_oversized_points(
        chapter_text,
        current_points,
        max_chunk_chars=oversized_scene_threshold_chars,
        max_oversized_deterministic_splits_per_chunk=max_oversized_deterministic_splits_per_chunk,
        oversized_split_window_chars=oversized_split_window_chars,
        normalize_split_points=normalize_split_points,
    )
    merged_points = sorted(set(oversized_points))
    if hard_anchor_positions:
        merged_points = sorted(set(merged_points + hard_anchor_positions))
    for point in merged_points:
        if point not in reason_map:
            reason_map[point] = "forced_post_repair_oversized"
    if merged_points == current_points:
        remaining_violations = int(sum(1 for s in scenes if _scene_length(s) > oversized_scene_threshold_chars))
        return scenes, quality_report(chapter_text, scenes), {
            "attempted": True,
            "repaired_chunks": 0,
            "remaining_violations": remaining_violations,
            "deterministic_split_report": oversized_report,
            "deterministic_fallback_applied": bool(int(oversized_report.get("applied") or 0) > 0),
            "deterministic_notes": list(oversized_report.get("notes") or []),
        }
    next_scenes = build_scenes_from_split_points(chapter_text, merged_points, reason_map)
    next_quality = quality_report(chapter_text, next_scenes)
    remaining = int(sum(1 for s in next_scenes if _scene_length(s) > oversized_scene_threshold_chars))
    return next_scenes, next_quality, {
        "attempted": True,
        "repaired_chunks": int(oversized_report.get("applied") or 0),
        "remaining_violations": int(remaining),
        "deterministic_split_report": oversized_report,
        "deterministic_fallback_applied": bool(int(oversized_report.get("applied") or 0) > 0),
        "deterministic_notes": list(oversized_report.get("notes") or []),
    }


def run_auto_split_attempts(
    *,
    ordered: List[str],
    chapter_text: str,
    split_mode: str,
    lock_spans: List[Any],
    llm_state: Dict[str, int],
    auto_retry_enabled: bool,
    self_healing_enabled: bool,
    exploration_enabled: bool,
    issue_hints: Dict[str, float],
    boundary_type_hints: Dict[str, float],
    supervisor_strategy_bias: Dict[str, float],
    run_split_attempt: Callable[..., Dict[str, Any]],
    supervisor_decision_from_quality: Callable[[Dict[str, Any], bool], str],
    is_hard_fail_quality: Callable[[Dict[str, Any]], bool],
    llm_can_run: Callable[[Dict[str, int]], bool],
    rerun_reason: Callable[[Dict[str, Any], bool, bool], str],
    should_force_retry_by_quality_hints: Callable[..., Any],
    window_rerun_splice: Callable[..., Any],
    build_scenes_from_split_points: Callable[..., List[Dict[str, Any]]],
    quality_report: Callable[[str, List[Dict[str, Any]]], Dict[str, Any]],
    normalize_split_points: Optional[Callable[[List[int], int], List[int]]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    if normalize_split_points is None:
        def normalize_split_points(points: List[int], text_len: int) -> List[int]:  # type: ignore[redef]
            return sorted(set(int(p) for p in points if 0 < int(p) < int(text_len)))

    attempts: List[Dict[str, Any]] = []
    if not self_healing_enabled:
        ordered = ["S0_BASE"]
    elif not auto_retry_enabled:
        ordered = ordered[:1]

    # RFC lock: never run legacy S1/S2 fallback paths.
    ordered = [s for s in ordered if s in ("S3_SEMANTIC_RESPLIT", "S0_BASE")]
    if not ordered:
        ordered = ["S3_SEMANTIC_RESPLIT", "S0_BASE"]
    max_attempts = len(ordered)
    baseline_split_points: List[int] = []
    exploration_used = False

    for attempt_index, strategy in enumerate(ordered[:max_attempts]):
        attempt = run_split_attempt(
            strategy=strategy,
            chapter_text=chapter_text,
            lock_spans=lock_spans,
            llm_state=llm_state,
            baseline_split_points=baseline_split_points,
            split_mode=split_mode,
            **kwargs,
        )
        if bool(attempt.get("skip")):
            continue
        baseline_split_points = list(attempt.get("next_baseline_split_points") or baseline_split_points)
        attempts.append(
            {
                "strategy": str(attempt.get("strategy") or strategy),
                "scenes": attempt.get("scenes") or [],
                "autofix_report": attempt.get("autofix_report") or {},
                "quality_report": attempt.get("quality_report") or {},
                "llm_calls_used": int(attempt.get("llm_calls_used") or int(llm_state.get("used") or 0)),
                "split_points": list(attempt.get("split_points") or []),
                "semantic_guard_report": attempt.get("semantic_guard_report") or {},
                "targeted_window_report": attempt.get("targeted_window_report") or {},
                "hard_fail": bool(attempt.get("hard_fail")),
            }
        )

        quality_candidate = attempts[-1]["quality_report"]
        decision_candidate = supervisor_decision_from_quality(quality_candidate, False)
        hard_fail_now = is_hard_fail_quality(quality_candidate)
        llm_remaining = llm_can_run(llm_state)
        reason = rerun_reason(quality_candidate, llm_remaining, auto_retry_enabled)
        force_retry, forced_reason = should_force_retry_by_quality_hints(
            quality_candidate,
            issue_hints=issue_hints,
            boundary_type_hints=boundary_type_hints,
            auto_retry_enabled=auto_retry_enabled,
            llm_remaining=llm_remaining,
            attempt_index=attempt_index,
        )
        if force_retry:
            reason = forced_reason
        supervisor_force_retry = (
            attempt_index == 0
            and auto_retry_enabled
            and llm_remaining
            and float(supervisor_strategy_bias.get(strategy) or 0.0) >= 1.5
            and decision_candidate != "auto_pass"
        )
        if supervisor_force_retry:
            reason = "SUPERVISOR_HISTORY_RETRY"

        attempts[-1]["rerun_reason"] = reason
        attempts[-1]["forced_retry_gate"] = bool(force_retry)
        attempts[-1]["supervisor_history_retry"] = bool(supervisor_force_retry)

        if hard_fail_now and auto_retry_enabled and llm_remaining:
            continue
        if force_retry:
            continue
        if supervisor_force_retry:
            continue
        if decision_candidate == "auto_pass" and exploration_enabled and attempt_index == 0 and llm_remaining:
            attempts[-1]["rerun_reason"] = "EXPLORATION_RETRY"
            attempts[-1]["exploration_retry"] = True
            exploration_used = True
            continue
        if decision_candidate == "auto_pass":
            break

    if not attempts:
        return {
            "attempts": [],
            "chosen_strategy": ordered[0] if ordered else "S0_BASE",
            "scenes": [],
            "autofix_report": {},
            "quality": {"hard_fail": True, "skip_all": True},
            "retry_used": False,
            "window_rerun_report": {},
            "exploration_used": False,
            "strategy_switched": False,
        }

    best = attempts[0]
    for item in attempts[1:]:
        qa = item["quality_report"]
        qb = best["quality_report"]
        key_a = (
            1 if bool(qa.get("hard_fail")) else 0,
            int(qa.get("mid_word_cut_count") or 0) + int(qa.get("abbrev_or_name_cut_count") or 0),
            float(qa.get("flagged_pct") or 0.0),
            float(qa.get("fragmentation_score") or 0.0),
        )
        key_b = (
            1 if bool(qb.get("hard_fail")) else 0,
            int(qb.get("mid_word_cut_count") or 0) + int(qb.get("abbrev_or_name_cut_count") or 0),
            float(qb.get("flagged_pct") or 0.0),
            float(qb.get("fragmentation_score") or 0.0),
        )
        if key_a < key_b:
            best = item

    chosen_strategy = str(best.get("strategy") or "S0_BASE")
    scenes = best.get("scenes") or []
    autofix_report = best.get("autofix_report") or {}
    quality = best.get("quality_report") or {}
    decision = supervisor_decision_from_quality(quality, False)
    retry_used = len(attempts) > 1

    window_rerun_report: Dict[str, Any] = {}
    oversized_scene_threshold_chars = int(kwargs.get("oversized_scene_threshold_chars") or 3500)
    recursion_prefix_chars = int(kwargs.get("recursion_prefix_chars") or 650)
    recursion_suffix_chars = int(kwargs.get("recursion_suffix_chars") or 650)
    started_at = float(kwargs.get("started_at") or time.time())
    recursion_soft_deadline_sec = float(kwargs.get("recursion_soft_deadline_sec") or 120.0)
    recursion_min_budget_sec = float(kwargs.get("recursion_min_budget_sec") or 45.0)
    repair_min_budget_sec = float(kwargs.get("repair_min_budget_sec") or 20.0)
    retry_profile_used = str(kwargs.get("retry_profile_used") or "").strip()
    recovery_path_mode = str(kwargs.get("recovery_path_mode") or "explicit_profile").strip() or "explicit_profile"
    recovery_override = bool(kwargs.get("recovery_override"))
    one_pass_recovery_enabled = bool(kwargs.get("one_pass_recovery_enabled"))
    _default_max_depth = 3 if one_pass_recovery_enabled else 1
    _default_min_gain = 0.05 if one_pass_recovery_enabled else 0.15
    recursion_max_depth = int(kwargs.get("recursion_max_depth") or _default_max_depth)
    recursion_min_gain_pct = float(kwargs.get("recursion_min_gain_pct") or _default_min_gain)
    allow_recovery_recursion = bool(
        recovery_override
        or retry_profile_used == "auto_recovery_budget"
        or one_pass_recovery_enabled
    )
    recursive_attempts: List[Dict[str, Any]] = []
    repair_summary: Dict[str, Any] = {"attempted": False, "repaired_chunks": 0, "remaining_violations": 0}
    degrade_path_taken = False
    degrade_reason_code: Optional[str] = None
    recovery_reason_codes: List[str] = []
    deterministic_fallback_applied = False
    deterministic_fallback_notes: List[str] = []
    pipeline_v2_enabled = bool(kwargs.get("pipeline_v2_enabled"))
    phase_budget = {
        "outline_budget_sec": float(kwargs.get("outline_budget_sec") or 55.0),
        "primary_budget_sec": float(kwargs.get("primary_budget_sec") or 95.0),
        "repair_budget_sec": float(kwargs.get("repair_budget_sec") or 30.0),
        "total_budget_sec": float(kwargs.get("total_budget_sec") or 180.0),
    }
    phase_timing = {
        "outline_sec": round(float(kwargs.get("outline_elapsed_sec") or 0.0), 2),
        "primary_sec": 0.0,
        "recursion_sec": 0.0,
        "repair_sec": 0.0,
        "total_sec": 0.0,
    }
    phase_stop_reason = "DONE"
    split_runtime: Dict[str, Any] = {
        "mode": "S3_VALIDATION_RECURSIVE",
        "pipeline_version": "v2" if pipeline_v2_enabled else "v1",
        "degrade_path_taken": False,
        "degrade_reason_code": None,
        "deterministic_fallback_applied": False,
        "deterministic_fallback_notes": [],
        "recursion_depth_used": 0,
        "recursion_max_depth": recursion_max_depth,
        "recursion_min_gain_pct": recursion_min_gain_pct,
        "oversized_scene_threshold_chars": oversized_scene_threshold_chars,
        "recursion_context_bleed_chars": {"prefix": recursion_prefix_chars, "suffix": recursion_suffix_chars},
        "validation_flags": {"contains_unclosed_quote": False},
        "preemption": {
            "started_at": int(started_at),
            "recursion_soft_deadline_sec": recursion_soft_deadline_sec,
            "recursion_skipped": False,
            "elapsed_sec_before_recursion": 0.0,
        },
        "recursion_gate_mode": "strict_soft_deadline",
        "recursion_gate_decision_reason": "",
        "phase_budget": phase_budget,
        "phase_timing": phase_timing,
        "phase_stop_reason": phase_stop_reason,
        "repair_summary": repair_summary,
        "post_repair_forced_applied": False,
        "post_repair_forced_reason": None,
        "post_repair_forced_splits": 0,
        "post_repair_forced_remaining_oversized": 0,
        "one_pass_gate_mode": "recovery_remaining_budget" if one_pass_recovery_enabled else "strict_soft_deadline",
        "one_pass_soft_deadline_bypassed": False,
        "anchor_guard_active": False,
        "anchor_guard_clamped_count": 0,
        "recovery_path_mode": recovery_path_mode,
    }
    elapsed_after_primary = max(0.0, time.time() - started_at)
    phase_timing["primary_sec"] = round(max(0.0, elapsed_after_primary - phase_timing["outline_sec"]), 2)
    if phase_timing["outline_sec"] > float(phase_budget.get("outline_budget_sec") or 55.0):
        phase_stop_reason = "OUTLINE_BUDGET_EXCEEDED"
    elif elapsed_after_primary > float(phase_budget.get("primary_budget_sec") or 95.0):
        phase_stop_reason = "PRIMARY_BUDGET_EXCEEDED"
    needs_recursion = False
    current_sig = _scene_problem_signature(chapter_text, scenes, oversized_scene_threshold_chars)
    if int(current_sig.get("oversized_count") or 0) > 0 or bool(current_sig.get("contains_unclosed_quote")):
        needs_recursion = True

    elapsed_before_recursion = max(0.0, time.time() - started_at)
    split_runtime["preemption"]["elapsed_sec_before_recursion"] = round(elapsed_before_recursion, 2)
    if one_pass_recovery_enabled and elapsed_before_recursion > recursion_soft_deadline_sec:
        split_runtime["one_pass_soft_deadline_bypassed"] = True
    
    total_budget = float(phase_budget.get("total_budget_sec") or 180.0)
    remaining_total_sec = max(0.0, total_budget - elapsed_before_recursion)
    if allow_recovery_recursion:
        split_runtime["recursion_gate_mode"] = "recovery_remaining_budget"
        can_enter_recursion = (
            needs_recursion
            and llm_can_run(llm_state)
            and remaining_total_sec >= recursion_min_budget_sec
        )
        split_runtime["recursion_gate_decision_reason"] = (
            "RECOVERY_OVERRIDE_ENABLED"
            if can_enter_recursion
            else f"RECOVERY_NOT_ENOUGH_BUDGET:{round(remaining_total_sec,2)}<{round(recursion_min_budget_sec,2)}"
        )
    else:
        split_runtime["recursion_gate_mode"] = "strict_soft_deadline"
        if pipeline_v2_enabled:
            can_enter_recursion = (
                needs_recursion
                and llm_can_run(llm_state)
                and elapsed_before_recursion <= (total_budget + 60.0)
            )
            split_runtime["recursion_gate_decision_reason"] = (
                "PIPELINE_V2_TOTAL_BUDGET_GATE" if can_enter_recursion else "PIPELINE_V2_TOTAL_BUDGET_EXCEEDED"
            )
        else:
            can_enter_recursion = (
                needs_recursion
                and llm_can_run(llm_state)
                and elapsed_before_recursion <= recursion_soft_deadline_sec
            )
            split_runtime["recursion_gate_decision_reason"] = (
                "SOFT_DEADLINE_OK" if can_enter_recursion else "SOFT_DEADLINE_EXCEEDED"
            )
    if phase_stop_reason == "PRIMARY_BUDGET_EXCEEDED" and elapsed_before_recursion > total_budget:
        can_enter_recursion = False
        split_runtime["recursion_gate_decision_reason"] = "PRIMARY_EXCEEDED_TOTAL_BUDGET"
    elif phase_stop_reason == "OUTLINE_BUDGET_EXCEEDED":
        can_enter_recursion = False
        split_runtime["recursion_gate_decision_reason"] = "OUTLINE_BUDGET_EXCEEDED"
    if needs_recursion and not can_enter_recursion:
        split_runtime["preemption"]["recursion_skipped"] = True
        split_runtime["stop_reason"] = "TIME_BUDGET_PREEMPTED"
        degrade_path_taken = True
        degrade_reason_code = "BUDGET_DEGRADE_PATH_TAKEN"
        if allow_recovery_recursion:
            recovery_reason_codes.append("RECOVERY_PATH_NOT_ENOUGH_BUDGET")
        if phase_stop_reason == "DONE":
            phase_stop_reason = "PRIMARY_BUDGET_EXCEEDED"
    if can_enter_recursion:
        recursion_started = time.time()
        if allow_recovery_recursion:
            recovery_reason_codes.append("RECOVERY_RECURSION_EXECUTED")
        scenes, quality, recursive_attempts, recursive_runtime = _run_recursive_s3_subsplit(
            chapter_text=chapter_text,
            split_mode=split_mode,
            scenes=scenes,
            quality=quality,
            llm_state=llm_state,
            llm_can_run=llm_can_run,
            run_split_attempt=run_split_attempt,
            build_scenes_from_split_points=build_scenes_from_split_points,
            quality_report=quality_report,
            is_hard_fail_quality=is_hard_fail_quality,
            oversized_scene_threshold_chars=oversized_scene_threshold_chars,
            recursion_max_depth=recursion_max_depth,
            recursion_min_gain_pct=recursion_min_gain_pct,
            recursion_prefix_chars=recursion_prefix_chars,
            recursion_suffix_chars=recursion_suffix_chars,
            previous_split_contexts=kwargs.get("previous_split_contexts"),
            outline_hint_positions=[int(x) for x in (kwargs.get("outline_hint_positions") or []) if isinstance(x, (int, float)) or str(x).isdigit()],
        )
        if isinstance(recursive_runtime, dict):
            # Update the stop reason from recursion if it stopped early
            if recursive_runtime.get("stop_reason") != "NO_PROBLEM":
                split_runtime["stop_reason"] = recursive_runtime.get("stop_reason")
            split_runtime.update({k: v for k, v in recursive_runtime.items() if k not in ("stop_reason", "preemption")})
        phase_timing["recursion_sec"] = round(max(0.0, time.time() - recursion_started), 2)
        if recursive_attempts:
            attempts.extend(recursive_attempts)
            chosen_strategy = "S3_RECURSIVE_SUBSPLIT"

    safe_hard_positions = []
    for x in (kwargs.get("hard_anchor_positions") or []):
        try:
            val = int(x)
        except Exception:
            continue
        if val > 0:
            safe_hard_positions.append(val)
    hard_anchor_positions = sorted(set(safe_hard_positions))
    if hard_anchor_positions:
        split_runtime["anchor_guard_active"] = True
    # Latency-first lightweight repair pass: only for oversized chunks and only if repair budget remains.
    pre_repair_elapsed = max(0.0, time.time() - started_at)
    repair_budget_deadline = float(phase_budget.get("repair_budget_sec") or 30.0)
    repair_budget_remaining_sec = max(0.0, repair_budget_deadline - pre_repair_elapsed)
    current_sig_post = _scene_problem_signature(chapter_text, scenes, oversized_scene_threshold_chars)
    repair_allowed_reasons = {"DONE", "PRIMARY_BUDGET_EXCEEDED", "TIME_BUDGET_PREEMPTED"}
    repair_trigger_mode = "normal_done" if phase_stop_reason == "DONE" else "preempt_recovery"
    if (
        phase_stop_reason in repair_allowed_reasons
        and int(current_sig_post.get("oversized_count") or 0) > 0
        and repair_budget_remaining_sec >= repair_min_budget_sec
    ):
        repair_start = time.time()
        scenes, quality, repair_summary = _run_lightweight_repair_pass(
            chapter_text=chapter_text,
            scenes=scenes,
            oversized_scene_threshold_chars=oversized_scene_threshold_chars,
            pipeline_v2_enabled=pipeline_v2_enabled,
            boundary_shift_window_chars=int(kwargs.get("boundary_shift_window_chars") or 220),
            oversized_split_window_chars=int(kwargs.get("oversized_split_window_chars") or 420),
            max_oversized_deterministic_splits_per_chunk=int(
                kwargs.get("max_oversized_deterministic_splits_per_chunk") or 2
            ),
            dialogue_attribution_guard_enabled=bool(kwargs.get("dialogue_attribution_guard_enabled", True)),
            build_scenes_from_split_points=build_scenes_from_split_points,
            quality_report=quality_report,
            normalize_split_points=normalize_split_points,
            hard_anchor_positions=hard_anchor_positions,
        )
        deterministic_fallback_applied = bool(repair_summary.get("deterministic_fallback_applied"))
        deterministic_fallback_notes = [str(x) for x in (repair_summary.get("deterministic_notes") or []) if str(x)]
        phase_timing["repair_sec"] = round(max(0.0, time.time() - repair_start), 2)
        repair_summary["repair_trigger_mode"] = repair_trigger_mode
        repair_summary["repair_budget_remaining_sec"] = round(repair_budget_remaining_sec, 2)
        if repair_trigger_mode == "preempt_recovery":
            recovery_reason_codes.append("RECOVERY_REPAIR_EXECUTED")
        if int(repair_summary.get("remaining_violations") or 0) > 0:
            phase_stop_reason = "REPAIR_BUDGET_EXCEEDED"
            if not degrade_reason_code:
                degrade_reason_code = "BUDGET_DEGRADE_PATH_TAKEN"
            degrade_path_taken = True
    elif int(current_sig_post.get("oversized_count") or 0) == 0 and phase_stop_reason == "DONE":
        phase_stop_reason = "QUALITY_EARLY_EXIT"
    elif int(current_sig_post.get("oversized_count") or 0) > 0 and pre_repair_elapsed > repair_budget_deadline:
        degrade_path_taken = True
        if not degrade_reason_code:
            degrade_reason_code = "BUDGET_DEGRADE_PATH_TAKEN"
    elif (
        int(current_sig_post.get("oversized_count") or 0) > 0
        and phase_stop_reason in repair_allowed_reasons
        and repair_budget_remaining_sec < repair_min_budget_sec
    ):
        degrade_path_taken = True
        if not degrade_reason_code:
            degrade_reason_code = "BUDGET_DEGRADE_PATH_TAKEN"
        recovery_reason_codes.append("RECOVERY_PATH_NOT_ENOUGH_BUDGET")
        repair_summary["repair_trigger_mode"] = repair_trigger_mode
        repair_summary["repair_budget_remaining_sec"] = round(repair_budget_remaining_sec, 2)

    # Forced deterministic post-repair closure for preempted oversized outputs.
    # This pass is budget-safe (no LLM) and runs near end of pipeline to reduce
    # avoidable NEEDS_RETRY loops when only oversized chunks remain.
    post_repair_forced_applied = False
    post_repair_forced_reason: Optional[str] = None
    post_repair_forced_splits = 0
    post_repair_forced_remaining_oversized = int(current_sig_post.get("oversized_count") or 0)
    post_repair_forced_min_wallclock_sec = float(kwargs.get("post_repair_forced_min_wallclock_sec") or 3.0)
    current_sig_tail = _scene_problem_signature(chapter_text, scenes, oversized_scene_threshold_chars)
    tail_remaining_total_sec = max(0.0, float(phase_budget.get("total_budget_sec") or 180.0) - max(0.0, time.time() - started_at))
    should_run_forced_post = (
        int(current_sig_tail.get("oversized_count") or 0) > 0
        and tail_remaining_total_sec >= post_repair_forced_min_wallclock_sec
    )
    if should_run_forced_post:
        post_repair_forced_reason = "PREEMPT_OVERSIZED_CLOSURE"
        forced_start = time.time()
        scenes, quality, forced_summary = _run_forced_oversized_post_repair(
            chapter_text=chapter_text,
            scenes=scenes,
            oversized_scene_threshold_chars=oversized_scene_threshold_chars,
            oversized_split_window_chars=int(kwargs.get("oversized_split_window_chars") or 420),
            max_oversized_deterministic_splits_per_chunk=int(
                kwargs.get("max_oversized_deterministic_splits_per_chunk") or 2
            ),
            build_scenes_from_split_points=build_scenes_from_split_points,
            quality_report=quality_report,
            normalize_split_points=normalize_split_points,
            hard_anchor_positions=hard_anchor_positions,
        )
        post_repair_forced_applied = bool(forced_summary.get("attempted"))
        post_repair_forced_splits = int(forced_summary.get("repaired_chunks") or 0)
        post_repair_forced_remaining_oversized = int(forced_summary.get("remaining_violations") or 0)
        deterministic_fallback_applied = bool(
            deterministic_fallback_applied or forced_summary.get("deterministic_fallback_applied")
        )
        deterministic_fallback_notes = list(
            dict.fromkeys(
                deterministic_fallback_notes
                + [str(x) for x in (forced_summary.get("deterministic_notes") or []) if str(x)]
            )
        )
        # Preserve existing repair summary semantics but annotate forced closure.
        repair_summary["post_repair_forced_applied"] = bool(post_repair_forced_applied)
        repair_summary["post_repair_forced_splits"] = int(post_repair_forced_splits)
        repair_summary["post_repair_forced_remaining_oversized"] = int(post_repair_forced_remaining_oversized)
        phase_timing["repair_sec"] = round(float(phase_timing.get("repair_sec") or 0.0) + max(0.0, time.time() - forced_start), 2)
        if int(post_repair_forced_remaining_oversized or 0) <= 0 and phase_stop_reason == "REPAIR_BUDGET_EXCEEDED":
            phase_stop_reason = "DONE"

    strategy_switched = bool(attempts and chosen_strategy != str(attempts[0].get("strategy") or ""))
    phase_timing["total_sec"] = round(max(0.0, time.time() - started_at), 2)
    split_runtime["phase_budget"] = phase_budget
    split_runtime["phase_timing"] = phase_timing
    split_runtime["phase_stop_reason"] = phase_stop_reason
    split_runtime["repair_summary"] = repair_summary
    split_runtime["post_repair_forced_applied"] = bool(post_repair_forced_applied)
    split_runtime["post_repair_forced_reason"] = post_repair_forced_reason
    split_runtime["post_repair_forced_splits"] = int(post_repair_forced_splits)
    split_runtime["post_repair_forced_remaining_oversized"] = int(post_repair_forced_remaining_oversized)
    split_runtime["degrade_path_taken"] = bool(degrade_path_taken)
    split_runtime["degrade_reason_code"] = degrade_reason_code
    split_runtime["deterministic_fallback_applied"] = bool(deterministic_fallback_applied)
    split_runtime["deterministic_fallback_notes"] = deterministic_fallback_notes
    split_runtime["anchor_guard_clamped_count"] = int(
        (
            (best.get("semantic_guard_report") if isinstance(best.get("semantic_guard_report"), dict) else {})
            .get("anchor_guard_clamped_count")
            or 0
        )
    )
    split_runtime["recovery_reason_codes"] = list(dict.fromkeys(recovery_reason_codes))
    return {
        "attempts": attempts,
        "chosen_strategy": chosen_strategy,
        "scenes": scenes,
        "autofix_report": autofix_report,
        "quality": quality,
        "retry_used": retry_used,
        "window_rerun_report": window_rerun_report,
        "exploration_used": exploration_used,
        "strategy_switched": strategy_switched,
        "split_runtime": split_runtime,
    }

from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional, Tuple


def extract_split_candidates(
    chapter_text: str,
    strategy: str,
    llm_state: Dict[str, int],
    *,
    split_chunk_target: int,
    split_chunk_overlap: int,
    chunk_text,
    llm_can_run,
    llm_consume_call,
    llm_boundaries_for_chunk,
    heuristic_boundaries,
    hard_anchor_specs: Optional[List[Dict[str, Any]]] = None,
    soft_anchor_specs: Optional[List[Dict[str, Any]]] = None,
    lore_ranges: Optional[List[Dict[str, Any]]] = None,
) -> List[Tuple[int, str]]:
    strict = strategy in ("S1_STRICT_BOUNDARY", "S1_TARGETED_WINDOW_REPAIR")
    chunks = chunk_text(chapter_text, split_chunk_target, split_chunk_overlap)
    candidates: List[Tuple[int, str]] = []
    hard_anchor_specs = hard_anchor_specs or []
    soft_anchor_specs = soft_anchor_specs or []
    lore_ranges = lore_ranges or []
    for chunk_index, (chunk_start, chunk_body) in enumerate(chunks):
        local: List[Tuple[int, str]] = []
        if strategy in ("S0_BASE", "S1_STRICT_BOUNDARY", "S1_TARGETED_WINDOW_REPAIR") and llm_can_run(llm_state):
            llm_consume_call(llm_state)
            local = llm_boundaries_for_chunk(
                chunk_body,
                strict=strict,
                chunk_index=chunk_index,
                chunk_start=chunk_start,
                hard_anchor_specs=hard_anchor_specs,
                soft_anchor_specs=soft_anchor_specs,
                lore_ranges=lore_ranges,
            )
        if not local:
            local = heuristic_boundaries(chunk_body)
        chunk_len = len(chunk_body)
        chunk_end = chunk_start + chunk_len
        for item in hard_anchor_specs:
            try:
                at = int(item.get("at") or 0)
            except Exception:
                continue
            if chunk_start < at < chunk_end:
                local.append((at - chunk_start, f"anchor:{str(item.get('type') or 'HARD')}"))
        for item in soft_anchor_specs:
            try:
                at = int(item.get("at") or 0)
            except Exception:
                continue
            if chunk_start < at < chunk_end:
                local.append((at - chunk_start, f"anchor:{str(item.get('type') or 'SOFT')}"))
        for item in lore_ranges:
            try:
                start_at = int(item.get("start_at") or 0)
                end_at = int(item.get("end_at") or 0)
            except Exception:
                continue
            if end_at <= chunk_start or start_at >= chunk_end:
                continue
            mid = (max(start_at, chunk_start) + min(end_at, chunk_end)) // 2
            if chunk_start < mid < chunk_end:
                local.append((mid - chunk_start, "anchor:LORE_SOFT_RANGE"))
        for at, reason in local:
            safe_at = min(max(1, int(at)), max(1, chunk_len - 1))
            candidates.append((chunk_start + safe_at, reason))
    if not candidates:
        candidates = heuristic_boundaries(chapter_text)
    if strategy == "S2_MERGE_FIX":
        for at, reason in heuristic_boundaries(chapter_text):
            candidates.append((at, f"merge_fix:{reason}"))
    return candidates


def build_scenes_from_split_points(
    chapter_text: str,
    split_points: List[int],
    reasons_by_boundary: Dict[int, str],
    *,
    scene_title_summary,
    reason_for_scene,
) -> List[Dict[str, Any]]:
    points = [0, *split_points, len(chapter_text)]
    scenes: List[Dict[str, Any]] = []
    for idx in range(1, len(points)):
        start = points[idx - 1]
        end = points[idx]
        if end <= start:
            continue
        scene_text = chapter_text[start:end].strip()
        if not scene_text:
            continue
        title, summary = scene_title_summary(scene_text, idx)
        scenes.append(
            {
                "idx": idx,
                "start": start,
                "end": end,
                "title": title,
                "summary": summary,
                "reason": reason_for_scene(end, reasons_by_boundary, idx),
                "scene_text_sha256": hashlib.sha256(scene_text.encode("utf-8")).hexdigest(),
            }
        )
    if not scenes:
        title, summary = scene_title_summary(chapter_text, 1)
        scenes = [
            {
                "idx": 1,
                "start": 0,
                "end": len(chapter_text),
                "title": title,
                "summary": summary,
                "reason": "fallback single scene",
                "scene_text_sha256": hashlib.sha256(chapter_text.strip().encode("utf-8")).hexdigest(),
            }
        ]
    return scenes


def merge_bad_boundaries(
    chapter_text: str,
    split_points: List[int],
    *,
    boundary_issue_score,
    normalize_split_points,
) -> Tuple[List[int], int]:
    if len(split_points) <= 1:
        return split_points, 0
    candidates: List[Tuple[int, int]] = []
    for idx, at in enumerate(split_points):
        score = boundary_issue_score(chapter_text, at)
        left_char = chapter_text[at - 1 : at] if at > 0 else ""
        right_char = chapter_text[at : at + 1] if at < len(chapter_text) else ""
        if re.match(r"[A-Za-z]", left_char or "") and re.match(r"[A-Za-z]", right_char or ""):
            score += 6
        candidates.append((idx, score))
    candidates.sort(key=lambda x: x[1], reverse=True)
    removed = 0
    keep = set(range(len(split_points)))
    for idx, score in candidates:
        if removed >= 2:
            break
        if score < 7:
            break
        if idx in keep:
            keep.remove(idx)
            removed += 1
    if removed == 0:
        return split_points, 0
    new_points = [p for i, p in enumerate(split_points) if i in keep]
    return normalize_split_points(new_points, len(chapter_text)), removed


def merge_for_fragmentation(
    chapter_text: str,
    split_points: List[int],
    max_removals: int = 3,
    *,
    split_fragment_short_chars: int,
    boundary_issue_score,
    normalize_split_points,
) -> Tuple[List[int], int]:
    points = normalize_split_points(split_points, len(chapter_text))
    if len(points) <= 1:
        return points, 0
    removed = 0
    keep = set(range(len(points)))
    while removed < max_removals:
        active_points = [p for i, p in enumerate(points) if i in keep]
        edges = [0, *active_points, len(chapter_text)]
        if len(edges) <= 2:
            break
        scene_lengths = [edges[i + 1] - edges[i] for i in range(len(edges) - 1)]
        short_idxs = [i for i, n in enumerate(scene_lengths) if n < split_fragment_short_chars]
        if not short_idxs:
            break
        target_scene_idx = min(short_idxs, key=lambda i: scene_lengths[i])
        boundary_choices: List[Tuple[int, int]] = []
        if target_scene_idx - 1 >= 0:
            at = active_points[target_scene_idx - 1]
            boundary_choices.append((target_scene_idx - 1, boundary_issue_score(chapter_text, at)))
        if target_scene_idx < len(active_points):
            at = active_points[target_scene_idx]
            boundary_choices.append((target_scene_idx, boundary_issue_score(chapter_text, at)))
        if not boundary_choices:
            break
        drop_active_idx = max(boundary_choices, key=lambda x: x[1])[0]
        active_to_orig = [i for i in range(len(points)) if i in keep]
        if drop_active_idx < 0 or drop_active_idx >= len(active_to_orig):
            break
        drop_orig_idx = active_to_orig[drop_active_idx]
        if drop_orig_idx in keep:
            keep.remove(drop_orig_idx)
            removed += 1
        else:
            break
    out = [p for i, p in enumerate(points) if i in keep]
    return normalize_split_points(out, len(chapter_text)), removed


def best_window_boundary(
    chapter_text: str,
    current_at: int,
    window_left: int,
    window_right: int,
    local_candidates: List[Tuple[int, str]],
    *,
    boundary_issue_score,
) -> int:
    best = current_at
    best_score = boundary_issue_score(chapter_text, current_at)
    best_dist = 10**9
    for local_at, _ in local_candidates:
        cand = window_left + int(local_at)
        if cand <= window_left or cand >= window_right:
            continue
        score = boundary_issue_score(chapter_text, cand)
        dist = abs(cand - current_at)
        if score < best_score or (score == best_score and dist < best_dist):
            best = cand
            best_score = score
            best_dist = dist
    return best


def force_abbrev_boundary_move(
    chapter_text: str,
    current_at: int,
    prev_edge: int,
    next_edge: int,
    window_left: int,
    window_right: int,
    *,
    split_min_scene_chars: int,
    is_abbrev_or_name_split_at,
    nearby_natural_boundaries,
    boundary_issue_score,
) -> int:
    if not is_abbrev_or_name_split_at(chapter_text, current_at):
        return current_at
    candidates = nearby_natural_boundaries(chapter_text, current_at, 360)
    best = current_at
    best_score = boundary_issue_score(chapter_text, current_at)
    best_forward_dist = 10**9
    for pos, _ in candidates:
        if pos <= window_left or pos >= window_right:
            continue
        if pos - prev_edge < split_min_scene_chars or next_edge - pos < split_min_scene_chars:
            continue
        if is_abbrev_or_name_split_at(chapter_text, pos):
            continue
        score = boundary_issue_score(chapter_text, pos)
        forward_dist = pos - current_at if pos >= current_at else 10**8 + (current_at - pos)
        if score < best_score or (score == best_score and forward_dist < best_forward_dist):
            best = pos
            best_score = score
            best_forward_dist = forward_dist
    return best


def window_rerun_splice(
    chapter_text: str,
    split_points: List[int],
    lock_spans: List[Tuple[int, int]],
    llm_state: Dict[str, int],
    *,
    split_min_scene_chars: int,
    normalize_split_points,
    boundary_issue_score,
    llm_can_run,
    llm_consume_call,
    llm_boundaries_for_chunk,
    heuristic_boundaries,
    best_window_boundary,
    refine_boundary,
    force_abbrev_boundary_move,
) -> Tuple[List[int], Dict[str, Any]]:
    points = normalize_split_points(split_points, len(chapter_text))
    report: Dict[str, Any] = {"windows": 0, "moved": 0, "llm_calls_used": 0}
    if not points:
        return points, report

    llm_before = int(llm_state.get("used") or 0)
    edges = [0, *points, len(chapter_text)]
    updated = points[:]
    for i, at in enumerate(points):
        base_score = boundary_issue_score(chapter_text, at)
        if base_score < 7:
            continue
        prev_edge = edges[i]
        next_edge = edges[i + 2]
        left = max(prev_edge + split_min_scene_chars, at - 1300)
        right = min(next_edge - split_min_scene_chars, at + 1300)
        if right - left < 300:
            continue
        window_text = chapter_text[left:right]
        local_candidates: List[Tuple[int, str]] = []
        if llm_can_run(llm_state):
            llm_consume_call(llm_state)
            local_candidates = llm_boundaries_for_chunk(window_text, strict=True)
        if not local_candidates:
            local_candidates = heuristic_boundaries(window_text)
        report["windows"] = int(report["windows"]) + 1
        if not local_candidates:
            continue
        best = best_window_boundary(chapter_text, at, left, right, local_candidates)
        best = refine_boundary(chapter_text, best, lock_spans)
        best_score = boundary_issue_score(chapter_text, best)
        if best_score + 1 < base_score:
            updated[i] = best
            report["moved"] = int(report["moved"]) + 1
            continue
        forced = force_abbrev_boundary_move(
            chapter_text,
            at,
            prev_edge,
            next_edge,
            left,
            right,
        )
        if forced != at:
            forced_score = boundary_issue_score(chapter_text, forced)
            if forced_score < base_score:
                updated[i] = forced
                report["moved"] = int(report["moved"]) + 1

    report["llm_calls_used"] = int(llm_state.get("used") or 0) - llm_before
    return normalize_split_points(updated, len(chapter_text)), report


def build_scenes_from_candidates(
    chapter_text: str,
    candidates: List[Tuple[int, str]],
    lock_spans: List[Tuple[int, int]],
    *,
    normalize_boundaries,
    refine_split_points,
    autofix_split_points,
    build_scenes_from_split_points,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], List[int]]:
    boundaries = normalize_boundaries(chapter_text, len(chapter_text), candidates, lock_spans)
    split_points = [at for at, _ in boundaries]
    split_points = refine_split_points(chapter_text, split_points, lock_spans)
    split_points, autofix_report = autofix_split_points(chapter_text, split_points, lock_spans)
    reasons_by_boundary = {at: reason for at, reason in boundaries}
    scenes = build_scenes_from_split_points(chapter_text, split_points, reasons_by_boundary)
    return scenes, autofix_report, split_points


_DANGLING_CONJUNCTION_RE = re.compile(
    r"^[\"'“”‘’\(\[\s]*(And|But|Because|Or|So|Then|Yet)\b",
    flags=re.IGNORECASE,
)
_DIALOGUE_ATTRIBUTION_VERBS = (
    "said",
    "asked",
    "whispered",
    "replied",
    "murmured",
    "shouted",
    "yelled",
)


def _is_inside_double_quote(text: str, pos: int) -> bool:
    left = text[: max(0, int(pos))]
    straight = left.count('"') % 2 != 0
    curly = left.count("“") > left.count("”")
    return bool(straight or curly)


def _find_dialogue_attribution_anchor(
    chapter_text: str,
    candidate_at: int,
    conjunction_at: int,
    attribution_verbs: Tuple[str, ...],
) -> bool:
    left = max(0, int(conjunction_at) - 120)
    right = min(len(chapter_text), int(conjunction_at) + 20)
    window = chapter_text[left:right]
    verb_alt = "|".join(re.escape(v) for v in attribution_verbs if v)
    if not verb_alt:
        return False
    pattern = re.compile(
        rf"\b[A-Z][A-Za-z0-9_\-]{{0,40}}\s+(?:{verb_alt})\s*:\s*[\"“]",
        flags=re.IGNORECASE,
    )
    for match in pattern.finditer(window):
        m_start = left + int(match.start())
        m_end = left + int(match.end())
        if m_start < int(conjunction_at) and int(candidate_at) <= m_end:
            return True
    return False


def _has_dialogue_attribution_nearby(
    chapter_text: str,
    conjunction_at: int,
    attribution_verbs: Tuple[str, ...],
) -> bool:
    left = max(0, int(conjunction_at) - 120)
    snippet = chapter_text[left : int(conjunction_at) + 8]
    verb_alt = "|".join(re.escape(v) for v in attribution_verbs if v)
    if not verb_alt:
        return False
    pattern = re.compile(
        rf"\b[A-Z][A-Za-z0-9_\-]{{0,40}}\s+(?:{verb_alt})\s*:\s*[\"“]\s*$",
        flags=re.IGNORECASE,
    )
    return bool(pattern.search(snippet))


def _candidate_sentence_anchors(
    chapter_text: str,
    at: int,
    prev_edge: int,
    window_chars: int,
) -> List[int]:
    left_bound = max(int(prev_edge) + 1, int(at) - max(40, int(window_chars)))
    right_bound = max(left_bound, int(at) - 1)
    if right_bound <= left_bound:
        return []
    window = chapter_text[left_bound : right_bound + 1]
    out: List[int] = []
    for match in re.finditer(r"[.!?;:](?:\s+|\Z)", window):
        out.append(left_bound + int(match.end()))
    return sorted(set(x for x in out if left_bound < x < int(at)), reverse=True)


def repair_dangling_conjunction_boundary(
    chapter_text: str,
    current_at: int,
    prev_edge: int,
    next_edge: int,
    *,
    boundary_shift_window_chars: int,
    dialogue_attribution_guard_enabled: bool = True,
    attribution_verbs: Optional[Tuple[str, ...]] = None,
) -> Tuple[int, Dict[str, Any]]:
    report: Dict[str, Any] = {
        "changed": False,
        "reason": "NO_CHANGE",
        "old_at": int(current_at),
        "new_at": int(current_at),
    }
    at = int(current_at)
    if at <= int(prev_edge) or at >= int(next_edge):
        report["reason"] = "OUT_OF_RANGE"
        return at, report
    right = chapter_text[at : min(len(chapter_text), at + 96)]
    conj_match = _DANGLING_CONJUNCTION_RE.match(right.lstrip())
    if not conj_match:
        report["reason"] = "NOT_DANGLING_CONJUNCTION"
        return at, report
    local_start = len(right) - len(right.lstrip())
    conjunction_at = at + int(local_start)
    anchors = _candidate_sentence_anchors(
        chapter_text,
        at,
        prev_edge,
        boundary_shift_window_chars,
    )
    if not anchors:
        report["reason"] = "NO_ANCHOR_CANDIDATE"
        return at, report

    inside_quote_now = _is_inside_double_quote(chapter_text, conjunction_at)
    verbs = attribution_verbs if attribution_verbs else _DIALOGUE_ATTRIBUTION_VERBS
    if dialogue_attribution_guard_enabled and _has_dialogue_attribution_nearby(chapter_text, conjunction_at, verbs):
        report["reason"] = "DIALOGUE_ATTRIBUTION_GUARD_HIT"
        return at, report
    for candidate in anchors:
        if candidate <= int(prev_edge) or candidate >= int(next_edge):
            continue
        if inside_quote_now and not _is_inside_double_quote(chapter_text, candidate):
            continue
        if (
            dialogue_attribution_guard_enabled
            and _find_dialogue_attribution_anchor(chapter_text, candidate, conjunction_at, verbs)
        ):
            report["reason"] = "DIALOGUE_ATTRIBUTION_GUARD_HIT"
            return at, report
        report["changed"] = True
        report["reason"] = "SHIFTED_TO_SENTENCE_ANCHOR"
        report["new_at"] = int(candidate)
        return int(candidate), report

    report["reason"] = "NO_SAFE_CANDIDATE"
    return at, report


def repair_dangling_conjunction_boundaries(
    chapter_text: str,
    split_points: List[int],
    *,
    boundary_shift_window_chars: int,
    dialogue_attribution_guard_enabled: bool = True,
    normalize_split_points,
) -> Tuple[List[int], Dict[str, Any]]:
    points = sorted(set(int(x) for x in split_points if isinstance(x, int) or str(x).isdigit()))
    if not points:
        return [], {"attempted": True, "moved": 0, "guard_hits": 0, "reasons": []}
    edges = [0, *points, len(chapter_text)]
    out = points[:]
    moved = 0
    guard_hits = 0
    reasons: List[str] = []
    for i, at in enumerate(points):
        prev_edge = edges[i]
        next_edge = edges[i + 2]
        cand, rep = repair_dangling_conjunction_boundary(
            chapter_text,
            at,
            prev_edge,
            next_edge,
            boundary_shift_window_chars=boundary_shift_window_chars,
            dialogue_attribution_guard_enabled=dialogue_attribution_guard_enabled,
        )
        reasons.append(str(rep.get("reason") or ""))
        if str(rep.get("reason") or "") == "DIALOGUE_ATTRIBUTION_GUARD_HIT":
            guard_hits += 1
        if cand != at:
            out[i] = int(cand)
            moved += 1
    normalized = normalize_split_points(out, len(chapter_text))
    return normalized, {
        "attempted": True,
        "moved": int(moved),
        "guard_hits": int(guard_hits),
        "reasons": reasons,
    }


def _choose_deterministic_midpoint_cut(
    chapter_text: str,
    start: int,
    end: int,
    *,
    oversized_split_window_chars: int,
) -> Tuple[Optional[int], str]:
    if end - start <= 2:
        return None, "TOO_SHORT"
    mid = int((start + end) / 2)
    left = max(start + 1, mid - max(60, int(oversized_split_window_chars)))
    right = min(end - 1, mid + max(60, int(oversized_split_window_chars)))
    if right <= left:
        return None, "INVALID_WINDOW"
    segment = chapter_text[left : right + 1]

    punct_candidates: List[int] = []
    for match in re.finditer(r"[.!?;:](?:\s+|\Z)", segment):
        punct_candidates.append(left + int(match.end()))
    if punct_candidates:
        best = min(punct_candidates, key=lambda p: abs(p - mid))
        if start < best < end:
            return int(best), "PUNCT"

    ws_candidates: List[int] = []
    for match in re.finditer(r"\s+", segment):
        ws_candidates.append(left + int(match.start()))
    if ws_candidates:
        best_ws = min(ws_candidates, key=lambda p: abs(p - mid))
        if start < best_ws < end:
            return int(best_ws), "WHITESPACE_FALLBACK"
    return None, "NO_CANDIDATE"


def deterministic_split_oversized_points(
    chapter_text: str,
    split_points: List[int],
    *,
    max_chunk_chars: int,
    max_oversized_deterministic_splits_per_chunk: int,
    oversized_split_window_chars: int,
    normalize_split_points,
) -> Tuple[List[int], Dict[str, Any]]:
    points = normalize_split_points(split_points, len(chapter_text))
    report: Dict[str, Any] = {
        "attempted": True,
        "applied": 0,
        "fallback_applied": 0,
        "remaining_oversized": 0,
        "notes": [],
    }
    if not points and len(chapter_text) <= int(max_chunk_chars):
        return points, report

    current = points[:]
    for _ in range(max(1, int(max_oversized_deterministic_splits_per_chunk))):
        edges = [0, *current, len(chapter_text)]
        oversized = [(edges[i], edges[i + 1]) for i in range(len(edges) - 1) if (edges[i + 1] - edges[i]) > int(max_chunk_chars)]
        if not oversized:
            break
        changed = False
        new_points: List[int] = []
        for start, end in oversized:
            cut, mode = _choose_deterministic_midpoint_cut(
                chapter_text,
                start,
                end,
                oversized_split_window_chars=oversized_split_window_chars,
            )
            if cut is None:
                report["notes"].append(f"OVERSIZED_DETERMINISTIC_SPLIT_SKIPPED:{start}:{end}:{mode}")
                continue
            new_points.append(int(cut))
            report["applied"] = int(report.get("applied") or 0) + 1
            if mode == "WHITESPACE_FALLBACK":
                report["fallback_applied"] = int(report.get("fallback_applied") or 0) + 1
                report["notes"].append("OVERSIZED_DETERMINISTIC_SPLIT_FALLBACK")
            else:
                report["notes"].append("OVERSIZED_DETERMINISTIC_SPLIT_APPLIED")
            changed = True
        if not changed:
            break
        current = normalize_split_points(current + new_points, len(chapter_text))

    final_edges = [0, *current, len(chapter_text)]
    report["remaining_oversized"] = int(
        sum(1 for i in range(len(final_edges) - 1) if (final_edges[i + 1] - final_edges[i]) > int(max_chunk_chars))
    )
    return current, report

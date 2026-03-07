from __future__ import annotations

import hashlib
from typing import Any, Dict, Tuple


def max_hint_score(values: Dict[str, float]) -> float:
    if not isinstance(values, dict) or not values:
        return 0.0
    best = 0.0
    for v in values.values():
        try:
            best = max(best, float(v))
        except Exception:
            continue
    return best


def max_positive_hint_score(values: Dict[str, float]) -> float:
    if not isinstance(values, dict) or not values:
        return 0.0
    best = 0.0
    for v in values.values():
        try:
            n = float(v)
        except Exception:
            continue
        if n > best:
            best = n
    return best


def has_strong_hints(issue_hints: Dict[str, float], boundary_type_hints: Dict[str, float], threshold: float) -> bool:
    return max(max_positive_hint_score(issue_hints), max_positive_hint_score(boundary_type_hints)) >= float(threshold)


def stable_exploration_roll(chapter_id: str, chapter_text: str) -> float:
    key = f"{chapter_id}:{len(chapter_text)}:{hashlib.sha256(chapter_text.encode('utf-8')).hexdigest()[:16]}"
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    bucket = int(digest[:8], 16)
    return float(bucket) / float(0xFFFFFFFF)


def quality_self_signal(quality: Dict[str, Any]) -> float:
    flagged_pct = max(0.0, float(quality.get("flagged_pct") or 0.0))
    frag_score = max(0.0, float(quality.get("fragmentation_score") or 0.0))
    hard_flags = max(
        0.0,
        float(quality.get("mid_word_cut_count") or 0.0) + float(quality.get("abbrev_or_name_cut_count") or 0.0),
    )
    score = 1.0
    score -= min(0.55, flagged_pct / 100.0 * 0.9)
    score -= min(0.30, frag_score / 100.0 * 0.5)
    score -= min(0.25, hard_flags * 0.08)
    if bool(quality.get("hard_fail")):
        score -= 0.25
    return max(0.05, min(1.0, score))


def should_force_retry_by_quality_hints(
    quality: Dict[str, Any],
    issue_hints: Dict[str, float],
    boundary_type_hints: Dict[str, float],
    auto_retry_enabled: bool,
    llm_remaining: bool,
    attempt_index: int,
    force_retry_fragmentation_threshold: float,
    force_retry_fragmentation_with_hints_threshold: float,
    force_retry_hint_min: float,
) -> Tuple[bool, str]:
    if not auto_retry_enabled or not llm_remaining:
        return False, ""
    if attempt_index > 0:
        return False, ""

    frag = float(quality.get("fragmentation_score") or 0.0)
    quote_break_count = int(quality.get("quote_continuity_break_count") or 0)
    abbrev_cut_count = int(quality.get("abbrev_or_name_cut_count") or 0)
    mid_word_cut_count = int(quality.get("mid_word_cut_count") or 0)
    issue_hint_max = max_hint_score(issue_hints)
    boundary_hint_max = max_hint_score(boundary_type_hints)
    strong_hints = max(issue_hint_max, boundary_hint_max) >= float(force_retry_hint_min)
    boundary_damage = quote_break_count > 0 or abbrev_cut_count > 0 or mid_word_cut_count > 0

    if frag >= float(force_retry_fragmentation_threshold):
        return True, "FORCED_RETRY_FRAGMENTATION"
    if frag >= float(force_retry_fragmentation_with_hints_threshold) and strong_hints:
        return True, "FORCED_RETRY_FRAGMENTATION_WITH_HINTS"
    if boundary_damage and strong_hints:
        return True, "FORCED_RETRY_BOUNDARY_HINTS"
    return False, ""

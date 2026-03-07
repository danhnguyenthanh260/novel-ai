from __future__ import annotations

import re
from typing import Any, Callable, Dict, List

SEMANTIC_FLAGGED_PCT_GUARD_DEFAULT = 20.0
SEMANTIC_QUOTE_BREAK_GUARD_DEFAULT = 1


def scene_flags(scene_text: str, ends_with_terminal_punct: Callable[[str], bool]) -> List[str]:
    text = scene_text.strip()
    if not text:
        return ["EMPTY_SCENE"]
    flags: List[str] = []
    if re.match(r"^[a-z]", text):
        flags.append("STARTS_LOWERCASE")
    if re.match(r"^[,.;:!?]", text):
        flags.append("STARTS_WITH_PUNCT")
    if not ends_with_terminal_punct(text):
        flags.append("ENDS_WITHOUT_TERMINAL_PUNCT")
    if re.search(r"[A-Za-z]{2,}$", text[-12:]):
        flags.append("TAIL_LOOKS_CONTINUED")
    return flags


def has_mid_word_cut(chapter_text: str, start: int, end: int) -> bool:
    if start <= 0 or end >= len(chapter_text):
        return False
    left_char = chapter_text[start - 1 : start]
    right_char = chapter_text[start : start + 1]
    if re.match(r"[A-Za-z]", left_char or "") and re.match(r"[A-Za-z]", right_char or ""):
        return True
    left_char_end = chapter_text[end - 1 : end]
    right_char_end = chapter_text[end : end + 1]
    if re.match(r"[A-Za-z]", left_char_end or "") and re.match(r"[A-Za-z]", right_char_end or ""):
        return True
    return False


def has_abbrev_or_name_cut(
    chapter_text: str, start: int, end: int, is_abbrev_or_name_split_at: Callable[[str, int], bool]
) -> bool:
    return is_abbrev_or_name_split_at(chapter_text, start) or is_abbrev_or_name_split_at(chapter_text, end)


def has_quote_continuity_break(
    chapter_text: str, start: int, end: int, is_quote_continuity_break_at: Callable[[str, int], bool]
) -> bool:
    return is_quote_continuity_break_at(chapter_text, start) or is_quote_continuity_break_at(chapter_text, end)


def starts_with_conjunction_continued(scene_text: str, ends_with_terminal_punct: Callable[[str], bool]) -> bool:
    t = scene_text.strip()
    if not t:
        return False
    return bool(re.match(r"^(And|But|Or|So|Because|Then|Yet)\b", t)) and not ends_with_terminal_punct(t)


def derive_hard_fail_signals(
    quality: Dict[str, Any],
    *,
    mid_word_count_threshold: int,
    mid_word_ratio_threshold: float,
    semantic_count_threshold: int,
    semantic_flagged_pct_guard: float = SEMANTIC_FLAGGED_PCT_GUARD_DEFAULT,
    semantic_quote_break_guard: int = SEMANTIC_QUOTE_BREAK_GUARD_DEFAULT,
) -> Dict[str, Any]:
    mid_word_cut_count = int(quality.get("mid_word_cut_count") or 0)
    abbrev_or_name_cut_count = int(quality.get("abbrev_or_name_cut_count") or 0)
    quote_continuity_break_count = int(quality.get("quote_continuity_break_count") or 0)
    flagged_pct = float(quality.get("flagged_pct") or 0.0)
    non_semantic_flagged_pct = float(quality.get("non_semantic_flagged_pct") or 0.0)
    scene_total = int(quality.get("scene_total") or 0)
    mid_word_ratio = (float(mid_word_cut_count) / float(max(1, scene_total))) if scene_total > 0 else 0.0

    mid_word_hard_fail = (
        mid_word_cut_count >= int(mid_word_count_threshold)
        or mid_word_ratio >= float(mid_word_ratio_threshold)
    )
    semantic_hard_fail_legacy = abbrev_or_name_cut_count >= int(semantic_count_threshold)
    semantic_hard_fail_combo = (
        semantic_hard_fail_legacy
        and (
            mid_word_hard_fail
            or quote_continuity_break_count >= int(semantic_quote_break_guard)
            or non_semantic_flagged_pct >= float(semantic_flagged_pct_guard)
        )
    )
    hard_fail = bool(mid_word_hard_fail or semantic_hard_fail_combo)
    return {
        "scene_total": scene_total,
        "mid_word_cut_count": mid_word_cut_count,
        "mid_word_ratio": round(mid_word_ratio, 6),
        "abbrev_or_name_cut_count": abbrev_or_name_cut_count,
        "quote_continuity_break_count": quote_continuity_break_count,
        "flagged_pct": round(flagged_pct, 4),
        "non_semantic_flagged_pct": round(non_semantic_flagged_pct, 4),
        "mid_word_hard_fail": bool(mid_word_hard_fail),
        "semantic_hard_fail_legacy": bool(semantic_hard_fail_legacy),
        "semantic_hard_fail_combo": bool(semantic_hard_fail_combo),
        "semantic_combo_quote_guard_hit": bool(quote_continuity_break_count >= int(semantic_quote_break_guard)),
        "semantic_combo_flagged_guard_hit": bool(non_semantic_flagged_pct >= float(semantic_flagged_pct_guard)),
        "hard_fail": hard_fail,
    }


def derive_hard_fail_reason_codes(signals: Dict[str, Any]) -> List[str]:
    out: List[str] = []
    if bool(signals.get("mid_word_hard_fail")):
        out.append("MID_WORD_HARD_FAIL")
    if bool(signals.get("semantic_hard_fail_combo")):
        out.append("SEMANTIC_HARD_FAIL_COMBO")
        if bool(signals.get("semantic_combo_quote_guard_hit")):
            out.append("SEMANTIC_COMBO_QUOTE_GUARD")
        if bool(signals.get("semantic_combo_flagged_guard_hit")):
            out.append("SEMANTIC_COMBO_FLAGGED_GUARD")
    return out


def quality_report(
    chapter_text: str,
    scenes: List[Dict[str, Any]],
    split_fragment_short_chars: int,
    split_hard_fail_mid_word_count: int,
    split_hard_fail_mid_word_ratio: float,
    split_hard_fail_semantic_count: int,
    ends_with_terminal_punct: Callable[[str], bool],
    is_abbrev_or_name_split_at: Callable[[str, int], bool],
    is_quote_continuity_break_at: Callable[[str, int], bool],
    split_hard_fail_semantic_flagged_pct_guard: float = SEMANTIC_FLAGGED_PCT_GUARD_DEFAULT,
    split_hard_fail_semantic_quote_break_guard: int = SEMANTIC_QUOTE_BREAK_GUARD_DEFAULT,
) -> Dict[str, Any]:
    red = 0
    total = 0
    mid_word_cut_count = 0
    abbrev_or_name_cut_count = 0
    quote_continuity_break_count = 0
    conjunction_head_continued_count = 0
    non_semantic_flagged_scene_count = 0
    scene_lengths: List[int] = []
    scene_reports: List[Dict[str, Any]] = []
    for s in scenes:
        start = int(s.get("start") or 0)
        end = int(s.get("end") or 0)
        if end <= start:
            continue
        chunk = chapter_text[start:end]
        scene_lengths.append(len(chunk))
        flags = scene_flags(chunk, ends_with_terminal_punct)
        if has_mid_word_cut(chapter_text, start, end):
            flags.append("MID_WORD_CUT")
            mid_word_cut_count += 1
        if has_abbrev_or_name_cut(chapter_text, start, end, is_abbrev_or_name_split_at):
            flags.append("ABBREV_OR_NAME_CUT")
            abbrev_or_name_cut_count += 1
        if has_quote_continuity_break(chapter_text, start, end, is_quote_continuity_break_at):
            flags.append("QUOTE_CONTINUITY_BREAK")
            quote_continuity_break_count += 1
        if starts_with_conjunction_continued(chunk, ends_with_terminal_punct):
            flags.append("CONJUNCTION_HEAD_CONTINUED")
            conjunction_head_continued_count += 1
        non_semantic_flags = [flag for flag in flags if flag != "ABBREV_OR_NAME_CUT"]
        total += 1
        if flags:
            red += 1
        if non_semantic_flags:
            non_semantic_flagged_scene_count += 1
        scene_reports.append({"idx": int(s.get("idx") or 0), "flags": flags})
    pct = (red * 100.0 / total) if total else 0.0
    non_semantic_flagged_pct = (non_semantic_flagged_scene_count * 100.0 / total) if total else 0.0
    short_scene_count = sum(1 for n in scene_lengths if n < split_fragment_short_chars)
    short_scene_ratio = (float(short_scene_count) / float(max(1, total))) if total else 0.0
    mean_len = (float(sum(scene_lengths)) / float(max(1, total))) if total else 0.0
    variance = (
        sum((float(n) - mean_len) ** 2 for n in scene_lengths) / float(max(1, total))
        if total
        else 0.0
    )
    std_len = variance ** 0.5
    length_cv = (std_len / mean_len) if mean_len > 1 else 0.0
    density_per_1k = (float(total) / (float(max(1, len(chapter_text))) / 1000.0)) if chapter_text else 0.0
    density_term = max(0.0, min(1.0, (density_per_1k - 0.9) / 1.2))
    cv_term = max(0.0, min(1.0, length_cv / 1.2))
    fragmentation_score = 100.0 * ((short_scene_ratio * 0.55) + (cv_term * 0.20) + (density_term * 0.25))
    soft_diagnostics = {
        "STRUCTURAL_BEAT_CLEANSE_WARN": bool(conjunction_head_continued_count > 0),
        "TEMPORAL_ANCHOR_PRECISION_WARN": bool(quote_continuity_break_count > 0),
        "LORE_SNAPSHOT_PACKAGING_WARN": bool(
            (abbrev_or_name_cut_count > 0) and (float(pct) >= SEMANTIC_FLAGGED_PCT_GUARD_DEFAULT)
        ),
    }
    signals = derive_hard_fail_signals(
        {
            "scene_total": total,
            "mid_word_cut_count": mid_word_cut_count,
            "abbrev_or_name_cut_count": abbrev_or_name_cut_count,
            "quote_continuity_break_count": quote_continuity_break_count,
            "flagged_pct": pct,
            "non_semantic_flagged_pct": non_semantic_flagged_pct,
        },
        mid_word_count_threshold=split_hard_fail_mid_word_count,
        mid_word_ratio_threshold=split_hard_fail_mid_word_ratio,
        semantic_count_threshold=split_hard_fail_semantic_count,
        semantic_flagged_pct_guard=split_hard_fail_semantic_flagged_pct_guard,
        semantic_quote_break_guard=split_hard_fail_semantic_quote_break_guard,
    )
    hard_fail = bool(signals.get("hard_fail"))
    hard_fail_reason_codes = derive_hard_fail_reason_codes(signals)
    return {
        "scene_total": total,
        "scene_flagged": red,
        "flagged_pct": round(pct, 2),
        "non_semantic_flagged_pct": round(non_semantic_flagged_pct, 2),
        "mid_word_cut_count": mid_word_cut_count,
        "abbrev_or_name_cut_count": abbrev_or_name_cut_count,
        "quote_continuity_break_count": quote_continuity_break_count,
        "conjunction_head_continued_count": conjunction_head_continued_count,
        "short_scene_count": short_scene_count,
        "short_scene_ratio": round(short_scene_ratio, 4),
        "scene_density_per_1k": round(density_per_1k, 4),
        "length_cv": round(length_cv, 4),
        "fragmentation_score": round(fragmentation_score, 2),
        "hard_fail": hard_fail,
        "hard_fail_reason_codes": hard_fail_reason_codes,
        "hard_fail_signals": {**signals, **soft_diagnostics},
        "scene_reports": scene_reports[:50],
    }


def mid_word_cut_ratio(quality: Dict[str, Any]) -> float:
    total = int(quality.get("scene_total") or 0)
    if total <= 0:
        return 0.0
    mid_count = int(quality.get("mid_word_cut_count") or 0)
    return float(mid_count) / float(total)


def is_mid_word_hard_fail(quality: Dict[str, Any], mid_word_count_threshold: int, mid_word_ratio_threshold: float) -> bool:
    mid_count = int(quality.get("mid_word_cut_count") or 0)
    return mid_count >= mid_word_count_threshold or mid_word_cut_ratio(quality) >= mid_word_ratio_threshold


def is_semantic_hard_fail(
    quality: Dict[str, Any],
    semantic_count_threshold: int,
    semantic_flagged_pct_guard: float = SEMANTIC_FLAGGED_PCT_GUARD_DEFAULT,
    semantic_quote_break_guard: int = SEMANTIC_QUOTE_BREAK_GUARD_DEFAULT,
) -> bool:
    semantic_count = int(quality.get("abbrev_or_name_cut_count") or 0)
    if semantic_count < semantic_count_threshold:
        return False
    quote_count = int(quality.get("quote_continuity_break_count") or 0)
    non_semantic_flagged_pct = float(quality.get("non_semantic_flagged_pct") or quality.get("flagged_pct") or 0.0)
    mid_word_count = int(quality.get("mid_word_cut_count") or 0)
    return bool(
        mid_word_count > 0
        or quote_count >= int(semantic_quote_break_guard)
        or non_semantic_flagged_pct >= float(semantic_flagged_pct_guard)
    )


def quality_signature(quality: Dict[str, Any]) -> str:
    mid_ratio = mid_word_cut_ratio(quality)
    flagged_pct = float(quality.get("flagged_pct") or 0.0)
    frag_score = float(quality.get("fragmentation_score") or 0.0)
    if int(quality.get("abbrev_or_name_cut_count") or 0) >= 2:
        return "ABBREV_OR_NAME_CUT>2"
    if int(quality.get("quote_continuity_break_count") or 0) >= 2:
        return "QUOTE_CONTINUITY_BREAK>2"
    if frag_score >= 70.0:
        return "FRAGMENTATION>70"
    if frag_score >= 55.0:
        return "FRAGMENTATION>55"
    if mid_ratio >= 0.20:
        return "MID_WORD_CUT>20%"
    if mid_ratio >= 0.10:
        return "MID_WORD_CUT>10%"
    if flagged_pct >= 30.0:
        return "FLAGGED_PCT>30%"
    if flagged_pct >= 15.0:
        return "FLAGGED_PCT>15%"
    return "LOW_RISK"


def supervisor_decision_from_quality(
    quality: Dict[str, Any],
    enforce_mid_word_gate: bool,
    split_fragment_score_retry_threshold: float,
    mid_word_count_threshold: int,
    mid_word_ratio_threshold: float,
    semantic_count_threshold: int,
    semantic_flagged_pct_guard: float = SEMANTIC_FLAGGED_PCT_GUARD_DEFAULT,
    semantic_quote_break_guard: int = SEMANTIC_QUOTE_BREAK_GUARD_DEFAULT,
) -> str:
    # Any hard-fail signal (including degenerate single-scene) must block auto-pass.
    signals = derive_hard_fail_signals(
        quality,
        mid_word_count_threshold=mid_word_count_threshold,
        mid_word_ratio_threshold=mid_word_ratio_threshold,
        semantic_count_threshold=semantic_count_threshold,
        semantic_flagged_pct_guard=semantic_flagged_pct_guard,
        semantic_quote_break_guard=semantic_quote_break_guard,
    )
    if bool(signals.get("hard_fail")):
        return "manual_review"
    if enforce_mid_word_gate and bool(signals.get("mid_word_hard_fail")):
        return "manual_review"
    try:
        pct = float(quality.get("flagged_pct") or 0.0)
    except Exception:
        pct = 0.0
    if pct < 10.0:
        frag = float(quality.get("fragmentation_score") or 0.0)
        if frag >= split_fragment_score_retry_threshold:
            return "auto_retry_once"
        return "auto_pass"
    if pct <= 30.0:
        return "auto_retry_once"
    return "manual_review"


def is_hard_fail_quality(
    quality: Dict[str, Any],
    mid_word_count_threshold: int,
    mid_word_ratio_threshold: float,
    semantic_count_threshold: int,
    semantic_flagged_pct_guard: float = SEMANTIC_FLAGGED_PCT_GUARD_DEFAULT,
    semantic_quote_break_guard: int = SEMANTIC_QUOTE_BREAK_GUARD_DEFAULT,
) -> bool:
    signals = derive_hard_fail_signals(
        quality,
        mid_word_count_threshold=mid_word_count_threshold,
        mid_word_ratio_threshold=mid_word_ratio_threshold,
        semantic_count_threshold=semantic_count_threshold,
        semantic_flagged_pct_guard=semantic_flagged_pct_guard,
        semantic_quote_break_guard=semantic_quote_break_guard,
    )
    return bool(signals.get("hard_fail"))


def rerun_reason(
    quality: Dict[str, Any],
    llm_remaining: bool,
    auto_retry_enabled: bool,
    split_fragment_score_retry_threshold: float,
    mid_word_count_threshold: int,
    mid_word_ratio_threshold: float,
    semantic_count_threshold: int,
    semantic_flagged_pct_guard: float = SEMANTIC_FLAGGED_PCT_GUARD_DEFAULT,
    semantic_quote_break_guard: int = SEMANTIC_QUOTE_BREAK_GUARD_DEFAULT,
) -> str:
    if not auto_retry_enabled:
        return "AUTO_RETRY_DISABLED"
    if is_hard_fail_quality(
        quality,
        mid_word_count_threshold,
        mid_word_ratio_threshold,
        semantic_count_threshold,
        semantic_flagged_pct_guard,
        semantic_quote_break_guard,
    ):
        return "HARD_FAIL_RETRY" if llm_remaining else "HARD_FAIL_NO_BUDGET"
    frag = float(quality.get("fragmentation_score") or 0.0)
    if frag >= split_fragment_score_retry_threshold:
        return "FRAGMENTATION_RETRY" if llm_remaining else "FRAGMENTATION_NO_BUDGET"
    pct = float(quality.get("flagged_pct") or 0.0)
    if pct > 10.0:
        return "SOFT_FAIL_RETRY" if llm_remaining else "SOFT_FAIL_NO_BUDGET"
    return "QUALITY_OK"

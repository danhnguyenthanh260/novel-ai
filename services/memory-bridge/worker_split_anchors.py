from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import worker_constants as C


_TEMPORAL_PATTERNS = [
    re.compile(r"\bThat afternoon\b", re.IGNORECASE),
    re.compile(r"\bEventually\b", re.IGNORECASE),
    re.compile(r"\bThe next day\b", re.IGNORECASE),
    re.compile(r"\bLater that day\b", re.IGNORECASE),
    re.compile(r"\bThat (?:night|morning|evening)\b", re.IGNORECASE),
    re.compile(r"\bHours later\b", re.IGNORECASE),
]

_LOCATION_PATTERNS = [
    re.compile(
        r"\b(?:went to|arrived at|entered|inside|outside|back at|headed to|moved to)\b",
        re.IGNORECASE,
    ),
]

_STRUCTURAL_PATTERNS = [
    re.compile(r"\n{2,}"),
    re.compile(r"^[ \t]*---[ \t]*$", re.MULTILINE),
]

_LORE_PATTERNS = [
    re.compile(
        r"\b(?:archive|records?|newspaper|map|coordinates?|database|historical|spec(?:ification)?s?|protocol)\b",
        re.IGNORECASE,
    ),
]

_CLEAN_START_BLACKLIST = re.compile(r"^(?:and|but|so|because|\.\.\.)\b", re.IGNORECASE)


def _is_inside_double_quote(text: str, pos: int) -> bool:
    left = text[: max(0, int(pos))]
    straight = left.count('"') % 2 != 0
    curly_open = left.count("“")
    curly_close = left.count("”")
    return bool(straight or (curly_open > curly_close))


def _nearest_sentence_break(text: str, start_pos: int, max_window: int) -> Optional[int]:
    right = min(len(text), int(start_pos) + max(40, int(max_window)))
    if right <= start_pos:
        return None
    seg = text[start_pos:right]
    m = re.search(r"[.!?;:](?:\s+|\n|$)", seg)
    if not m:
        return None
    return int(start_pos) + int(m.end())


def _smart_snap(text: str, at: int, window: int) -> int:
    if not text:
        return 0
    at = max(0, min(len(text), int(at)))
    left = max(0, at - max(40, int(window)))
    right = min(len(text), at + max(40, int(window)))
    if right <= left:
        return at
    seg = text[left:right]
    candidates: List[Tuple[int, int]] = []

    for m in re.finditer(r"\n{2,}", seg):
        candidates.append((left + int(m.start()), 0))
    for m in re.finditer(r"\n", seg):
        candidates.append((left + int(m.start()), 1))
    for m in re.finditer(r"[.!?;:](?:\s+|$)", seg):
        candidates.append((left + int(m.end()), 2))
    if not candidates:
        return at
    candidates.sort(key=lambda x: (x[1], abs(x[0] - at)))
    best = int(candidates[0][0])
    return max(0, min(len(text), best))


def _apply_clean_start_guard(text: str, at: int) -> Tuple[int, Optional[str]]:
    if not text:
        return at, None
    at = max(0, min(len(text), int(at)))
    tail = text[at : min(len(text), at + 32)].lstrip()
    if not _CLEAN_START_BLACKLIST.match(tail):
        return at, None
    shifted = _nearest_sentence_break(text, at, C.SPLIT_ANCHOR_CLEAN_START_WINDOW_CHARS)
    if shifted is None:
        return at, "CLEAN_START_SHIFT_NO_SENTENCE_BREAK"
    if C.SPLIT_ANCHOR_DIALOGUE_GUARD_ENABLED and _is_inside_double_quote(text, at) and not _is_inside_double_quote(
        text, shifted
    ):
        return at, "CLEAN_START_SHIFT_SKIPPED_DIALOGUE_GUARD"
    return shifted, "CLEAN_START_SHIFT_APPLIED"


def _append_anchor(
    out: List[Dict[str, Any]],
    *,
    anchor_type: str,
    at: int,
    trigger_text: str,
    source: str,
    tolerance_chars: int,
) -> None:
    out.append(
        {
            "id": f"a{len(out) + 1:03d}",
            "at": int(at),
            "type": str(anchor_type),
            "trigger_text": str(trigger_text)[:180],
            "source": str(source),
            "tolerance_chars": int(max(40, tolerance_chars)),
            "merged_signals": [],
        }
    )


def _find_temporal_hard(text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for pat in _TEMPORAL_PATTERNS:
        for m in pat.finditer(text):
            _append_anchor(
                out,
                anchor_type="TEMPORAL_HARD",
                at=m.start(),
                trigger_text=m.group(0),
                source="regex_temporal",
                tolerance_chars=C.SPLIT_HARD_ANCHOR_TOLERANCE_CHARS,
            )
    return out


def _find_location_hard(text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for pat in _LOCATION_PATTERNS:
        for m in pat.finditer(text):
            _append_anchor(
                out,
                anchor_type="LOCATION_HARD",
                at=m.start(),
                trigger_text=m.group(0),
                source="regex_location",
                tolerance_chars=C.SPLIT_HARD_ANCHOR_TOLERANCE_CHARS,
            )
    return out


def _find_structural_soft(text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for pat in _STRUCTURAL_PATTERNS:
        for m in pat.finditer(text):
            _append_anchor(
                out,
                anchor_type="STRUCTURAL_SOFT",
                at=m.start(),
                trigger_text=str(m.group(0)).strip() or "structural_break",
                source="regex_structural",
                tolerance_chars=max(80, int(C.SPLIT_HARD_ANCHOR_TOLERANCE_CHARS // 2)),
            )
    return out


def _find_lore_ranges(text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for pat in _LORE_PATTERNS:
        for m in pat.finditer(text):
            start = max(0, m.start() - 220)
            end = min(len(text), m.end() + 220)
            left_break = text.rfind("\n\n", 0, m.start())
            if left_break != -1:
                start = max(0, left_break + 2)
            right_break = text.find("\n\n", m.end())
            if right_break != -1:
                end = min(len(text), right_break)
            if end - start < 80:
                continue
            out.append(
                {
                    "id": f"l{len(out) + 1:03d}",
                    "start_at": int(start),
                    "end_at": int(end),
                    "cue_text": str(m.group(0))[:120],
                    "isolate_hint": "Prefer isolating this lore-heavy block if it does not break active narrative continuity.",
                }
            )
    # Dedup by coarse span bins.
    dedup: List[Dict[str, Any]] = []
    seen = set()
    for item in out:
        key = (int(item["start_at"]) // 120, int(item["end_at"]) // 120)
        if key in seen:
            continue
        seen.add(key)
        dedup.append(item)
    return dedup[: max(0, int(C.SPLIT_ANCHOR_MAX_PER_CHAPTER // 2))]


def _priority(anchor_type: str) -> int:
    t = str(anchor_type or "")
    if t == "TEMPORAL_HARD":
        return 0
    if t == "LOCATION_HARD":
        return 1
    if t == "STRUCTURAL_SOFT":
        return 2
    return 3


def _dedup_anchors(anchors: List[Dict[str, Any]], text: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    notes: List[str] = []
    sorted_in = sorted(
        anchors,
        key=lambda a: (
            int(a.get("at") or 0),
            _priority(str(a.get("type") or "")),
        ),
    )
    out: List[Dict[str, Any]] = []
    win = max(40, int(C.SPLIT_ANCHOR_DEDUP_WINDOW_CHARS))
    for item in sorted_in:
        at = int(item.get("at") or 0)
        at = _smart_snap(text, at, C.SPLIT_ANCHOR_SNAP_WINDOW_CHARS)
        at, clean_note = _apply_clean_start_guard(text, at)
        if clean_note:
            notes.append(clean_note)
        item["at"] = at
        merged = False
        for idx, existing in enumerate(out):
            eat = int(existing.get("at") or 0)
            if abs(eat - at) > win:
                continue
            ep = _priority(str(existing.get("type") or ""))
            ip = _priority(str(item.get("type") or ""))
            if ip < ep:
                item["merged_signals"] = list(existing.get("merged_signals") or []) + [existing.get("type")]
                out[idx] = item
            else:
                merged_signals = list(existing.get("merged_signals") or [])
                merged_signals.append(item.get("type"))
                existing["merged_signals"] = merged_signals
                out[idx] = existing
            merged = True
            break
        if not merged:
            out.append(item)
    out.sort(key=lambda x: int(x.get("at") or 0))
    return out[: max(1, int(C.SPLIT_ANCHOR_MAX_PER_CHAPTER))], notes


def extract_deterministic_anchors(
    chapter_text: str,
    outline_beats: List[Dict[str, Any]],
    chapter_chars: int,
) -> Dict[str, Any]:
    text = str(chapter_text or "")
    if not text:
        return {
            "hard_anchors": [],
            "soft_anchors": [],
            "lore_ranges": [],
            "stats": {"total": 0, "hard_count": 0, "soft_count": 0, "lore_range_count": 0, "by_type": {}},
            "debug_notes": [],
        }

    hard = _find_temporal_hard(text) + _find_location_hard(text)
    soft = _find_structural_soft(text)
    hard, hard_notes = _dedup_anchors(hard, text)
    soft, soft_notes = _dedup_anchors(soft, text)
    lore_ranges = _find_lore_ranges(text)

    # Clamp anchors to chapter bounds and keep safe margins.
    min_edge = max(1, int(C.SPLIT_MIN_SCENE_CHARS))
    max_edge = max(min_edge + 1, int(chapter_chars) - min_edge)
    for item in hard + soft:
        item["at"] = max(min_edge, min(max_edge, int(item.get("at") or 0)))
    for idx, item in enumerate(hard, start=1):
        item["id"] = f"h{idx:03d}"
    for idx, item in enumerate(soft, start=1):
        item["id"] = f"s{idx:03d}"

    by_type: Dict[str, int] = {}
    for item in hard + soft:
        t = str(item.get("type") or "UNKNOWN")
        by_type[t] = int(by_type.get(t) or 0) + 1

    return {
        "hard_anchors": hard,
        "soft_anchors": soft,
        "lore_ranges": lore_ranges,
        "stats": {
            "total": int(len(hard) + len(soft)),
            "hard_count": int(len(hard)),
            "soft_count": int(len(soft)),
            "lore_range_count": int(len(lore_ranges)),
            "by_type": by_type,
        },
        "debug_notes": hard_notes + soft_notes,
        "outline_beats_count": int(len(outline_beats or [])),
    }

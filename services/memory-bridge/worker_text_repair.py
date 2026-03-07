from __future__ import annotations

import re
from typing import Any, Dict, Set, Tuple, List


def repair_chapter_text(raw_text: str, broken_word_suffixes: Set[str]) -> Tuple[str, Dict[str, Any]]:
    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    report: Dict[str, Any] = {
        "line_endings_normalized": raw_text.count("\r"),
        "hyphen_joins": 0,
        "word_joins_blankline": 0,
        "blankline_collapses": 0,
        "space_normalized_lines": 0,
    }

    text, n = re.subn(r"([A-Za-z])-\n([a-z])", r"\1\2", text)
    report["hyphen_joins"] = int(n)

    total_word_joins = 0
    merged = True
    while merged:
        merged = False
        out_parts: List[str] = []
        last = 0
        for m in re.finditer(r"([A-Za-z]{2,})\n{2,}([a-z]{2,})", text):
            left_token = m.group(1)
            right_token = m.group(2)
            right_short = right_token.lower()
            should_join = (
                len(right_short) <= 4
                or right_short in broken_word_suffixes
                or (len(left_token) <= 3 and len(right_short) <= 5)
            )
            if not should_join:
                continue
            out_parts.append(text[last : m.start(1)])
            out_parts.append(left_token + right_token)
            last = m.end(2)
            total_word_joins += 1
            merged = True
        if merged:
            out_parts.append(text[last:])
            text = "".join(out_parts)
    report["word_joins_blankline"] = total_word_joins

    lines = text.split("\n")
    cleaned_lines: List[str] = []
    changed_lines = 0
    for line in lines:
        line2 = re.sub(r"[ \t]+$", "", line)
        if line2 != line:
            changed_lines += 1
        cleaned_lines.append(line2)
    text = "\n".join(cleaned_lines)
    report["space_normalized_lines"] = changed_lines

    text, collapsed = re.subn(r"\n{3,}", "\n\n", text)
    report["blankline_collapses"] = int(collapsed)

    report["raw_chars"] = len(raw_text)
    report["repaired_chars"] = len(text)
    report["changed"] = bool(raw_text != text)
    return text.strip(), report


def split_lock_spans(text: str) -> List[Tuple[int, int]]:
    spans: List[Tuple[int, int]] = []
    for m in re.finditer(r"\[\[LOCK\]\]([\s\S]*?)\[\[/LOCK\]\]", text, flags=re.IGNORECASE):
        spans.append((m.start(), m.end()))
    return spans


def in_locked_span(pos: int, spans: List[Tuple[int, int]]) -> bool:
    for start, end in spans:
        if start < pos < end:
            return True
    return False

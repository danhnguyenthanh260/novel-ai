"""Built-in and custom rule checks for chapter text validation.

Used by worker_chapter_validate.py before each CHAPTER_VALIDATE task runs.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List


# ---------------------------------------------------------------------------
# Warning item structure
# ---------------------------------------------------------------------------

def make_warning(
    code: str,
    severity: str,
    note: str,
    char_offset: int | None = None,
    context_excerpt: str | None = None,
) -> Dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "location": {
            "char_offset": char_offset,
            "context_excerpt": context_excerpt,
        },
        "note": note,
    }


# ---------------------------------------------------------------------------
# Built-in checks
# ---------------------------------------------------------------------------

def _excerpt(text: str, offset: int, radius: int = 60) -> str:
    start = max(0, offset - radius)
    end = min(len(text), offset + radius)
    fragment = text[start:end]
    return fragment.replace("\n", "↵")


def check_line_break_density(text: str) -> List[Dict[str, Any]]:
    """Warn if paragraph density looks off (no line breaks = wall of text)."""
    warnings = []
    total_chars = len(text)
    if total_chars < 200:
        return []
    newline_count = text.count("\n")
    ratio = newline_count / total_chars
    if ratio < 0.005:
        warnings.append(make_warning(
            code="LINE_BREAK_SPARSE",
            severity="warning",
            note=f"Very few line breaks ({newline_count} in {total_chars} chars). Possible formatting issue.",
        ))
    return warnings


def check_encoding_artifacts(text: str) -> List[Dict[str, Any]]:
    """Detect common encoding artifact patterns."""
    warnings = []
    patterns = [
        (r"â€™|â€œ|â€\x9d|Ã¢|Â©|Ã©", "ENCODING_ARTIFACT", "Possible encoding error (UTF-8 mojibake detected)."),
        (r"\x00", "NULL_BYTE", "Null byte found in text."),
        (r"[\ufffd]", "REPLACEMENT_CHAR", "Replacement character (U+FFFD) found — likely encoding corruption."),
    ]
    for pattern, code, note in patterns:
        m = re.search(pattern, text)
        if m:
            warnings.append(make_warning(
                code=code,
                severity="error",
                note=note,
                char_offset=m.start(),
                context_excerpt=_excerpt(text, m.start()),
            ))
    return warnings


def check_unclosed_quotes(text: str) -> List[Dict[str, Any]]:
    """Simple heuristic: count opening vs closing dialogue quotes."""
    warnings = []
    # Vietnamese/common dialogue: «»「」""''
    pairs = [('\u201c', '\u201d'), ('\u2018', '\u2019'), ('\u00ab', '\u00bb'), ('\u300c', '\u300d')]
    for open_q, close_q in pairs:
        opens = text.count(open_q)
        closes = text.count(close_q)
        if opens != closes:
            first_open = text.find(open_q)
            warnings.append(make_warning(
                code="QUOTE_IMBALANCE",
                severity="warning",
                note=f"Mismatched quotes: {opens}x '{open_q}' vs {closes}x '{close_q}'.",
                char_offset=first_open if first_open >= 0 else None,
                context_excerpt=_excerpt(text, first_open) if first_open >= 0 else None,
            ))
    return warnings


def check_chapter_truncation(text: str) -> List[Dict[str, Any]]:
    """Detect potential truncation at end of chapter."""
    warnings = []
    stripped = text.rstrip()
    if not stripped:
        return warnings
    last_char = stripped[-1]
    # If the last character is NOT a sentence-ending punctuation, might be truncated
    terminal_puncts = set('.!?…\u201d\u2019\u00bb\u300d\u3002')
    if last_char not in terminal_puncts:
        offset = len(stripped) - 1
        warnings.append(make_warning(
            code="POSSIBLE_TRUNCATION",
            severity="warning",
            note=f"Chapter may be truncated — last character is '{last_char}', not terminal punctuation.",
            char_offset=offset,
            context_excerpt=_excerpt(text, offset),
        ))
    return warnings


def check_metadata_bleed(text: str) -> List[Dict[str, Any]]:
    """Detect common patterns where metadata leaked into story text."""
    warnings = []
    meta_patterns = [
        (r"(?i)^chapter\s+\d+", "METADATA_BLEED", "Possible chapter header inside story body."),
        (r"(?i)\bword count\s*:\s*\d+", "METADATA_BLEED", "Word count metadata inside text."),
        (r"(?i)\btranslat(ed|or)\s+by\b", "METADATA_BLEED", "Translator credit inside story body."),
        (r"\[\s*TN\s*:", "METADATA_BLEED", "Translator note inside story body."),
        (r"\[\s*PR\s*:", "METADATA_BLEED", "Proofreader note inside story body."),
    ]
    for pattern, code, note in meta_patterns:
        m = re.search(pattern, text, re.MULTILINE)
        if m:
            warnings.append(make_warning(
                code=code,
                severity="warning",
                note=note,
                char_offset=m.start(),
                context_excerpt=_excerpt(text, m.start()),
            ))
    return warnings


def run_builtin_checks(text: str) -> List[Dict[str, Any]]:
    """Run all built-in checks and return a combined list of warnings."""
    warnings: List[Dict[str, Any]] = []
    warnings.extend(check_encoding_artifacts(text))
    warnings.extend(check_line_break_density(text))
    warnings.extend(check_unclosed_quotes(text))
    warnings.extend(check_chapter_truncation(text))
    warnings.extend(check_metadata_bleed(text))
    return warnings


# ---------------------------------------------------------------------------
# Custom rules (user-defined, loaded from DB)
# ---------------------------------------------------------------------------

def load_custom_rules(conn, story_id: int, chapter_id: str | None = None) -> List[Dict[str, Any]]:
    """Load active custom validation rules for this story (+ chapter-specific)."""
    cur = conn.cursor()
    try:
        cur.execute(
            """SELECT id, pattern, description, severity
               FROM public.validate_rule_feedback
               WHERE story_id = %s
                 AND active = true
                 AND (chapter_id IS NULL OR chapter_id = %s)
               ORDER BY id""",
            (story_id, chapter_id),
        )
        rows = cur.fetchall()
        return [
            {"id": r[0], "pattern": r[1], "description": r[2], "severity": r[3]}
            for r in rows
        ]
    except Exception:
        return []
    finally:
        cur.close()


def run_custom_rules(text: str, rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Run user-defined regex rules against text."""
    warnings: List[Dict[str, Any]] = []
    for rule in rules:
        pattern = rule.get("pattern") or ""
        if not pattern:
            continue
        try:
            m = re.search(pattern, text, re.MULTILINE | re.IGNORECASE)
            if m:
                warnings.append(make_warning(
                    code="CUSTOM_RULE_MATCH",
                    severity=rule.get("severity") or "warning",
                    note=f"Custom rule matched: {rule.get('description') or pattern!r}",
                    char_offset=m.start(),
                    context_excerpt=_excerpt(text, m.start()),
                ))
        except re.error:
            # Invalid regex — skip silently
            warnings.append(make_warning(
                code="CUSTOM_RULE_INVALID_REGEX",
                severity="info",
                note=f"Custom rule has invalid regex: {pattern!r}",
            ))
    return warnings

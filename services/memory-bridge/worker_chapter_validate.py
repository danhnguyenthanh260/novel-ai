"""Chapter validation worker — runs before split to catch data issues.

Combines built-in heuristic checks + LLM analysis.
Result is stored in the ingest_task result_json.
Job stays at AWAITING_DATA_APPROVAL until human approves/rejects.
"""

from __future__ import annotations

import json
import textwrap
from typing import Any, Dict, List, Optional

from worker_chapter_validate_rules import (
    run_builtin_checks,
    run_custom_rules,
    load_custom_rules,
)
from worker_common import call_llm_json
from worker_runtime_config import get_llm_timeout


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

_LLM_SYSTEM = textwrap.dedent("""\
    You are a quality control assistant for a fiction digitization pipeline.
    Your job is to analyze a chapter of fiction text and identify data issues
    that would make it unsuitable for processing — NOT story critique.

    Focus only on DATA problems:
    - Truncated or incomplete chapters
    - Metadata, translator notes, or headers mixed into the story body
    - Encoding corruption or gibberish characters
    - Missing large sections (e.g., sudden topic jump or abrupt scene cut)
    - Non-story content inserted (ads, URLs, page numbers, etc.)

    Respond with JSON only:
    {
      "has_issues": true | false,
      "issues": [
        {"code": "SHORT_CODE", "severity": "error|warning|info", "note": "brief explanation", "char_offset": null}
      ],
      "summary": "One sentence summary of findings, or null if no issues."
    }

    If the text looks clean and complete, respond with has_issues=false and empty issues array.
""")

_LLM_MAX_PREVIEW = 3000  # chars to send to LLM (head + tail)


def _build_llm_preview(text: str) -> str:
    """Send head + tail of text to LLM to avoid huge token counts."""
    half = _LLM_MAX_PREVIEW // 2
    if len(text) <= _LLM_MAX_PREVIEW:
        return text
    head = text[:half]
    tail = text[-half:]
    omitted = len(text) - _LLM_MAX_PREVIEW
    return f"{head}\n\n[... {omitted} characters omitted ...]\n\n{tail}"


def _run_llm_analysis(text: str) -> Dict[str, Any]:
    """Call LLM to analyze chapter for data issues. Returns partial warnings_report."""
    preview = _build_llm_preview(text)
    messages = [
        {"role": "system", "content": _LLM_SYSTEM},
        {"role": "user", "content": f"Chapter text:\n\n{preview}"},
    ]
    result = call_llm_json(
        messages,
        max_tokens=512,
        temperature=0.1,
        timeout_sec=get_llm_timeout("chapter_validate"),
    )
    return result if isinstance(result, dict) else {}


# ---------------------------------------------------------------------------
# Main validate function
# ---------------------------------------------------------------------------

def validate_chapter(
    conn,
    story_id: int,
    chapter_text: str,
    chapter_id: Optional[str] = None,
    *,
    run_llm: bool = True,
) -> Dict[str, Any]:
    """Run all validation checks and return a warnings_report dict.

    warnings_report schema:
    {
      "ok": bool,
      "warning_count": int,
      "error_count": int,
      "warnings": [...],       # from builtin + custom rules
      "custom_matches": [...],  # from custom rules only
      "llm_analysis": str | null,
      "llm_issues": [...],     # from LLM
    }
    """
    # 1. Built-in checks
    builtin_warnings: List[Dict[str, Any]] = run_builtin_checks(chapter_text)

    # 2. Custom rules from DB
    custom_rules = load_custom_rules(conn, story_id, chapter_id)
    custom_matches: List[Dict[str, Any]] = run_custom_rules(chapter_text, custom_rules)

    # 3. LLM analysis
    llm_issues: List[Dict[str, Any]] = []
    llm_summary: Optional[str] = None
    if run_llm:
        llm_result = _run_llm_analysis(chapter_text)
        llm_summary = llm_result.get("summary") if isinstance(llm_result.get("summary"), str) else None
        raw_issues = llm_result.get("issues")
        if isinstance(raw_issues, list):
            for issue in raw_issues:
                if not isinstance(issue, dict):
                    continue
                llm_issues.append({
                    "code": str(issue.get("code") or "LLM_ISSUE"),
                    "severity": str(issue.get("severity") or "warning"),
                    "location": {
                        "char_offset": issue.get("char_offset"),
                        "context_excerpt": None,
                    },
                    "note": str(issue.get("note") or ""),
                })

    # 4. Aggregate
    all_warnings = builtin_warnings + custom_matches + llm_issues
    error_count = sum(1 for w in all_warnings if w.get("severity") == "error")
    warning_count = sum(1 for w in all_warnings if w.get("severity") == "warning")

    return {
        "ok": error_count == 0,
        "warning_count": warning_count,
        "error_count": error_count,
        "warnings": builtin_warnings + llm_issues,
        "custom_matches": custom_matches,
        "llm_analysis": llm_summary,
        "llm_issues": llm_issues,
    }

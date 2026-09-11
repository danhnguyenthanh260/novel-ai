from __future__ import annotations

import hashlib
from typing import Any, Dict, List


def _sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _choose_end(text: str, start: int, target_chars: int, max_chars: int) -> int:
    hard_end = min(len(text), start + max_chars)
    if hard_end >= len(text):
        return len(text)

    search_start = min(hard_end, start + max(1, target_chars // 2))
    for marker in ("\n\n", "\n", ". ", "! ", "? ", " "):
        idx = text.rfind(marker, search_start, hard_end)
        if idx >= search_start:
            return idx + len(marker)
    return hard_end


def build_source_passages(
    text: str,
    *,
    target_chars: int = 6000,
    max_chars: int = 7600,
) -> List[Dict[str, Any]]:
    """Split immutable source into bounded, contiguous, exactly traceable slices."""
    if target_chars <= 0 or max_chars <= 0 or target_chars > max_chars:
        raise ValueError("INVALID_SOURCE_PASSAGE_LIMITS")
    if not text:
        return []

    passages: List[Dict[str, Any]] = []
    start = 0
    while start < len(text):
        end = _choose_end(text, start, target_chars, max_chars)
        if end <= start:
            end = min(len(text), start + max_chars)
        passage_text = text[start:end]
        passages.append(
            {
                "passage_no": len(passages) + 1,
                "start_offset": start,
                "end_offset": end,
                "passage_text": passage_text,
                "passage_text_sha256": _sha256_hex(passage_text),
            }
        )
        start = end
    return passages


def replace_source_passages(
    conn,
    *,
    story_id: int,
    source_doc_id: str,
    chapter_id: str | None,
    source_doc_sha256: str,
    source_text: str,
) -> int:
    passages = build_source_passages(source_text)
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM public.source_doc_passage WHERE story_id = %s AND source_doc_id = %s::uuid",
            (story_id, source_doc_id),
        )
        cur.executemany(
            """
            INSERT INTO public.source_doc_passage
              (story_id, source_doc_id, chapter_id, passage_no, start_offset, end_offset,
               passage_text, passage_text_sha256, source_doc_sha256)
            VALUES
              (%s, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    story_id,
                    source_doc_id,
                    chapter_id,
                    passage["passage_no"],
                    passage["start_offset"],
                    passage["end_offset"],
                    passage["passage_text"],
                    passage["passage_text_sha256"],
                    source_doc_sha256,
                )
                for passage in passages
            ],
        )
    finally:
        cur.close()
    return len(passages)

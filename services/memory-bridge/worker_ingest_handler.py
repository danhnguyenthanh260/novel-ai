from __future__ import annotations

import hashlib
from typing import Any, Dict

from psycopg2.extras import Json, RealDictCursor

from worker_common import parse_jsonb, repair_chapter_text
from worker_ingest_repo import load_source_doc_text


def _normalize_line_endings(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _fan_in_set_awaiting_chapter_approval(conn, *, job_id: int, story_id: int) -> None:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT id, status, config_json
            FROM public.ingest_job
            WHERE id = %s AND story_id = %s
            FOR UPDATE
            """,
            (job_id, story_id),
        )
        job = cur.fetchone()
        if not job:
            return

        cur.execute(
            """
            SELECT count(*)::int AS pending_count
            FROM public.ingest_task
            WHERE job_id = %s
              AND task_type = 'CHAPTER_INGEST'
              AND status <> 'DONE'
            """,
            (job_id,),
        )
        pending_count = int((cur.fetchone() or {}).get("pending_count") or 0)
        if pending_count > 0:
            cur.execute(
                """
                UPDATE public.ingest_job
                SET status = 'RUNNING',
                    completed_tasks = (
                      SELECT count(*) FROM public.ingest_task
                      WHERE job_id = %s AND status = 'DONE'
                    ),
                    updated_at = now()
                WHERE id = %s
                """,
                (job_id, job_id),
            )
            return

        cur.execute(
            """
            UPDATE public.ingest_job
            SET status = CASE
                  WHEN status IN ('CANCELLED', 'REJECTED', 'FAILED', 'DONE') THEN status
                  ELSE 'AWAITING_DATA_APPROVAL'
                END,
                completed_tasks = (
                  SELECT count(*) FROM public.ingest_task
                  WHERE job_id = %s AND status = 'DONE'
                ),
                updated_at = now()
            WHERE id = %s
            """,
            (job_id, job_id),
        )
    finally:
        cur.close()


def process_chapter_ingest_task(conn, task: Dict[str, Any]) -> None:
    payload = parse_jsonb(task.get("payload_json"))
    source_doc_id = str(payload.get("source_doc_id") or "").strip()
    if not source_doc_id:
        raise ValueError("CHAPTER_INGEST_SOURCE_DOC_ID_REQUIRED")

    story_id = int(task.get("story_id") or 0)
    job_id = int(task.get("job_id") or 0)
    source_text = load_source_doc_text(conn, story_id, source_doc_id)
    if not isinstance(source_text, str) or not source_text.strip():
        raise ValueError("CHAPTER_INGEST_SOURCE_DOC_EMPTY")

    normalized = _normalize_line_endings(source_text)
    repaired, repair_report = repair_chapter_text(normalized)
    stable_text = repaired if isinstance(repaired, str) else normalized
    stable_sha = _sha256_hex(stable_text)

    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.source_doc
            SET raw_text = %s,
                raw_text_sha256 = %s,
                char_len = char_length(%s),
                is_stable = false,
                version = version + 1
            WHERE story_id = %s
              AND id::text = %s
            """,
            (stable_text, stable_sha, stable_text, story_id, source_doc_id),
        )
        if cur.rowcount == 0:
            raise ValueError("CHAPTER_INGEST_SOURCE_DOC_NOT_FOUND")

        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'DONE',
                error = NULL,
                result_json = %s::jsonb,
                updated_at = now()
            WHERE id = %s
            """,
            (
                Json(
                    {
                        "source_doc_id": source_doc_id,
                        "source_doc_sha256": stable_sha,
                        "chapter_text_raw_chars": len(source_text),
                        "chapter_text_stable_chars": len(stable_text),
                        "repair_report": repair_report if isinstance(repair_report, dict) else {},
                        "normalization_applied": True,
                        "is_stable": False,
                        "awaiting_chapter_approval": True,
                    }
                ),
                int(task["id"]),
            ),
        )
    finally:
        cur.close()

    _fan_in_set_awaiting_chapter_approval(
        conn,
        job_id=job_id,
        story_id=story_id,
    )

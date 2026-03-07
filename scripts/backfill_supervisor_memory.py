#!/usr/bin/env python3
"""Backfill supervisor_memory for chapters processed before tracking was added.

Modes:
  1. Auto-detect (default): Find chapters with >= 2 CHAPTER_SPLIT_LLM tasks
     where the latest task was approved. These were reprocessed historically.
     Stamps them SUCCESS_AFTER_REPROCESS.

  2. Manual: Pass --story-id + --chapter-ids to force-stamp specific chapters.
     Use --label to override (default: SUCCESS_AFTER_REPROCESS).

  3. Dry-run: Pass --dry-run to preview without writing.

Examples:
  # Auto-detect for story 42
  python3 backfill_supervisor_memory.py --story-id 42

  # Manual stamp specific chapters
  python3 backfill_supervisor_memory.py --story-id 42 --chapter-ids ch01 ch02 ch03

  # Preview only
  python3 backfill_supervisor_memory.py --story-id 42 --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.dirname(__file__) + "/../services/memory-bridge")
import worker_constants as C


VALID_LABELS = {"SUCCESS_NO_REPROCESS", "SUCCESS_AFTER_REPROCESS", "FAILED_PATTERN"}


def get_conn(dsn: str):
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    return conn


def auto_detect_chapters(cur, story_id: int) -> list[dict]:
    """Find chapters with multi-task history where latest task was approved."""
    cur.execute(
        """
        WITH chapter_tasks AS (
            SELECT
                t.id AS task_id,
                t.result_json->>'chapter_id' AS chapter_id,
                t.result_json->>'strategy_selected' AS strategy_selected,
                (t.result_json->>'quality_self_signal')::numeric AS quality_self_signal,
                t.result_json->>'supervisor_decision' AS supervisor_decision,
                t.human_outcome,
                t.job_id,
                t.created_at,
                ROW_NUMBER() OVER (
                    PARTITION BY t.result_json->>'chapter_id'
                    ORDER BY t.created_at DESC
                ) AS rn,
                COUNT(*) OVER (
                    PARTITION BY t.result_json->>'chapter_id'
                ) AS total_tasks
            FROM public.ingest_task t
            WHERE t.story_id = %s
              AND t.task_type = 'CHAPTER_SPLIT_LLM'
              AND t.result_json->>'chapter_id' IS NOT NULL
        )
        SELECT
            ct.task_id,
            ct.chapter_id,
            ct.strategy_selected,
            ct.quality_self_signal,
            ct.supervisor_decision,
            ct.human_outcome,
            ct.job_id,
            ct.total_tasks
        FROM chapter_tasks ct
        LEFT JOIN public.supervisor_memory sm
            ON sm.story_id = %s AND sm.chapter_task_id = ct.task_id
        WHERE ct.rn = 1
          AND ct.total_tasks >= 2
          AND ct.human_outcome = 'APPROVED_HUMAN'
          AND sm.id IS NULL
        ORDER BY ct.chapter_id
        """,
        (story_id, story_id),
    )
    return [dict(r) for r in cur.fetchall()]


def get_chapters_by_ids(cur, story_id: int, chapter_ids: list[str]) -> list[dict]:
    """Get latest approved split task for specific chapter IDs."""
    cur.execute(
        """
        WITH chapter_tasks AS (
            SELECT
                t.id AS task_id,
                t.result_json->>'chapter_id' AS chapter_id,
                t.result_json->>'strategy_selected' AS strategy_selected,
                (t.result_json->>'quality_self_signal')::numeric AS quality_self_signal,
                t.result_json->>'supervisor_decision' AS supervisor_decision,
                t.human_outcome,
                t.job_id,
                ROW_NUMBER() OVER (
                    PARTITION BY t.result_json->>'chapter_id'
                    ORDER BY t.created_at DESC
                ) AS rn
            FROM public.ingest_task t
            WHERE t.story_id = %s
              AND t.task_type = 'CHAPTER_SPLIT_LLM'
              AND t.result_json->>'chapter_id' = ANY(%s)
        )
        SELECT
            ct.task_id,
            ct.chapter_id,
            ct.strategy_selected,
            ct.quality_self_signal,
            ct.supervisor_decision,
            ct.human_outcome,
            ct.job_id
        FROM chapter_tasks ct
        WHERE ct.rn = 1
        ORDER BY ct.chapter_id
        """,
        (story_id, chapter_ids),
    )
    return [dict(r) for r in cur.fetchall()]


def stamp_supervisor_memory(
    cur,
    story_id: int,
    task: dict,
    label: str,
    dry_run: bool,
) -> str:
    """Insert or update supervisor_memory for a task. Returns action taken."""
    cur.execute(
        "SELECT id, label FROM public.supervisor_memory WHERE story_id = %s AND chapter_task_id = %s",
        (story_id, task["task_id"]),
    )
    existing = cur.fetchone()

    if existing:
        existing_id, existing_label = existing
        if existing_label == label:
            return f"SKIP (already {label})"
        if dry_run:
            return f"DRY-RUN would UPDATE {existing_label} → {label}"
        cur.execute(
            """UPDATE public.supervisor_memory
               SET label = %s, updated_at = now()
               WHERE id = %s""",
            (label, existing_id),
        )
        return f"UPDATED {existing_label} → {label}"

    if dry_run:
        return f"DRY-RUN would INSERT {label}"

    cur.execute(
        """INSERT INTO public.supervisor_memory
             (story_id, job_id, chapter_task_id, chapter_id, label,
              strategy_selected, supervisor_decision, human_outcome,
              quality_self_signal, is_reprocess, signals_json, created_at, updated_at)
           VALUES
             (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '{}'::jsonb, now(), now())
           ON CONFLICT (story_id, chapter_task_id) DO UPDATE
             SET label = EXCLUDED.label, updated_at = now()""",
        (
            story_id,
            task.get("job_id"),
            task["task_id"],
            task["chapter_id"],
            label,
            task.get("strategy_selected"),
            task.get("supervisor_decision"),
            task.get("human_outcome"),
            task.get("quality_self_signal"),
            label == "SUCCESS_AFTER_REPROCESS",
        ),
    )
    return f"INSERTED {label}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Backfill supervisor_memory for historical chapters")
    ap.add_argument("--story-id", type=int, required=True, help="Story ID to backfill")
    ap.add_argument("--chapter-ids", nargs="*", help="Specific chapter IDs (manual mode)")
    ap.add_argument(
        "--label",
        default="SUCCESS_AFTER_REPROCESS",
        choices=sorted(VALID_LABELS),
        help="Label to stamp (default: SUCCESS_AFTER_REPROCESS)",
    )
    ap.add_argument("--dry-run", action="store_true", help="Preview only, no writes")
    ap.add_argument("--dsn", default=os.getenv("DB_DSN", os.getenv("DATABASE_URL", C.DEFAULT_DSN)))
    args = ap.parse_args()

    conn = get_conn(args.dsn)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        if args.chapter_ids:
            print(f"[backfill] Manual mode: story={args.story_id} chapters={args.chapter_ids}")
            tasks = get_chapters_by_ids(cur, args.story_id, args.chapter_ids)
        else:
            print(f"[backfill] Auto-detect mode: story={args.story_id}")
            tasks = auto_detect_chapters(cur, args.story_id)

        if not tasks:
            print("[backfill] No chapters found to backfill.")
            return 0

        print(f"[backfill] Found {len(tasks)} chapters to process:")
        stamped = 0
        skipped = 0
        for task in tasks:
            action = stamp_supervisor_memory(cur, args.story_id, task, args.label, args.dry_run)
            chapter_id = task.get("chapter_id") or "?"
            strategy = task.get("strategy_selected") or "?"
            total = task.get("total_tasks", "?")
            print(f"  {chapter_id:20s} | task={task['task_id']} | strategy={strategy:25s} | tasks={total} | {action}")
            if "SKIP" in action:
                skipped += 1
            else:
                stamped += 1

        if not args.dry_run:
            conn.commit()
            print(f"\n[backfill] Done. stamped={stamped} skipped={skipped}")
        else:
            conn.rollback()
            print(f"\n[backfill] Dry-run complete. Would stamp={stamped} skip={skipped}")
        return 0

    except Exception as e:
        conn.rollback()
        print(f"[backfill] ERROR: {e}", file=sys.stderr)
        return 1
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())

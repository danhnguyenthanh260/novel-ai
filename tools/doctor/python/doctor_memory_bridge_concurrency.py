#!/usr/bin/env python3

from __future__ import annotations

import os
import subprocess
import sys
from typing import List, Tuple

import psycopg2
from psycopg2.extras import Json


DEFAULT_DSN = "postgresql://novel:novelpass@localhost:5433/novel"
STORY_SLUG = os.getenv("DOCTOR_STORY_SLUG", "doctor_worker_concurrency")


def _connect(dsn: str):
    return psycopg2.connect(dsn)


def _must(cond: bool, msg: str):
    if not cond:
        raise RuntimeError(msg)


def _create_job_fixture(dsn: str) -> Tuple[int, int]:
    conn = _connect(dsn)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.story_series(slug, title, status)
                VALUES (%s, %s, 'ACTIVE')
                ON CONFLICT (slug) DO NOTHING
                """,
                (STORY_SLUG, f"Doctor {STORY_SLUG}"),
            )
            cur.execute("SELECT id FROM public.story_series WHERE slug = %s", (STORY_SLUG,))
            story_id = int(cur.fetchone()[0])

            cur.execute(
                """
                INSERT INTO public.ingest_job
                  (story_id, created_by, mode, status, config_json, total_tasks, completed_tasks)
                VALUES
                  (%s, 'doctor_memory_bridge_concurrency', 'AUTO_LOCK', 'PENDING', '{}'::jsonb, 8, 0)
                RETURNING id
                """,
                (story_id,),
            )
            job_id = int(cur.fetchone()[0])

            for i in range(1, 9):
                payload = {
                    "chapter_no": 410 + i,
                    "chapter_text": f"## Scene 1\nAlpha {i}\n## Scene 2\nBeta {i}",
                }
                cur.execute(
                    """
                    INSERT INTO public.ingest_task
                      (job_id, story_id, unit_type, source_path, seq_no, status, attempts, payload_json)
                    VALUES
                      (%s, %s, 'chapter', %s, %s, 'PENDING', 0, %s::jsonb)
                    """,
                    (job_id, story_id, f"chapter_{410 + i}.txt", i, Json(payload)),
                )
        conn.commit()
        return story_id, job_id
    finally:
        conn.close()


def _run_workers(dsn: str) -> None:
    py = sys.executable
    worker_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "..",
        "services",
        "memory-bridge",
        "memory_bridge_worker.py",
    )
    cmd = [py, worker_path, "--dsn", dsn, "--once", "--max-tasks", "200"]

    p1 = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p2 = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    out1, err1 = p1.communicate(timeout=90)
    out2, err2 = p2.communicate(timeout=90)

    if p1.returncode != 0 or p2.returncode != 0:
        raise RuntimeError(
            f"worker failed rc1={p1.returncode} rc2={p2.returncode}\n---out1---\n{out1}\n---err1---\n{err1}\n---out2---\n{out2}\n---err2---\n{err2}"
        )


def _verify_and_cleanup(dsn: str, story_id: int, job_id: int) -> None:
    conn = _connect(dsn)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status, total_tasks, completed_tasks FROM public.ingest_job WHERE id = %s", (job_id,))
            row = cur.fetchone()
            _must(row is not None, "ingest_job missing")
            status, total_tasks, completed_tasks = row
            _must(status == "DONE", f"expected DONE, got {status}")
            _must(int(total_tasks) == 24, f"expected total_tasks=24, got {total_tasks}")
            _must(int(completed_tasks) == 24, f"expected completed_tasks=24, got {completed_tasks}")

            cur.execute(
                """
                SELECT status, count(*)::int
                FROM public.ingest_task
                WHERE job_id = %s
                GROUP BY status
                """,
                (job_id,),
            )
            by_status = {s: int(n) for s, n in cur.fetchall()}
            _must(by_status.get("DONE", 0) == 24, f"expected DONE tasks=24, got {by_status}")
            _must(by_status.get("FAILED", 0) == 0, f"expected FAILED tasks=0, got {by_status}")

            cur.execute(
                """
                SELECT count(*)::int
                FROM public.narrative_scene
                WHERE story_id = %s
                  AND chapter_id LIKE 'ch4%%'
                """,
                (story_id,),
            )
            scene_count = int(cur.fetchone()[0])
            _must(scene_count >= 16, f"expected scene_count>=16, got {scene_count}")

            cur.execute(
                """
                DELETE FROM public.review_request
                WHERE job_id = %s
                """,
                (job_id,),
            )
            cur.execute(
                """
                DELETE FROM public.story_canon_fact
                WHERE story_id = %s
                  AND source_ref LIKE %s
                """,
                (story_id, f"ingest:{job_id}:%"),
            )
            cur.execute(
                """
                DELETE FROM public.timeline_event
                WHERE story_id = %s
                  AND event_key LIKE %s
                """,
                (story_id, f"ingest_job_{job_id}_task_%"),
            )
            cur.execute(
                """
                DELETE FROM public.narrative_scene_version
                WHERE story_id = %s
                  AND summary LIKE 'ingest scene ch4%%'
                """,
                (story_id,),
            )
            cur.execute(
                """
                DELETE FROM public.narrative_scene
                WHERE story_id = %s
                  AND chapter_id LIKE 'ch4%%'
                """,
                (story_id,),
            )
            cur.execute("DELETE FROM public.ingest_job WHERE id = %s", (job_id,))
        conn.commit()
    finally:
        conn.close()


def main() -> int:
    dsn = os.getenv("DB_DSN", os.getenv("DATABASE_URL", DEFAULT_DSN))
    story_id, job_id = _create_job_fixture(dsn)
    _run_workers(dsn)
    _verify_and_cleanup(dsn, story_id, job_id)
    print("[doctor-memory-bridge-concurrency] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

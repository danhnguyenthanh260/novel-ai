#!/usr/bin/env python3

from __future__ import annotations

import os
import subprocess
import sys

import psycopg2
from psycopg2.extras import Json


DEFAULT_DSN = "postgresql://novel:novelpass@localhost:5433/novel"
STORY_SLUG = os.getenv("DOCTOR_STORY_SLUG", "doctor_worker")


def _connect(dsn: str):
    return psycopg2.connect(dsn)


def _must(cond: bool, msg: str):
    if not cond:
        raise RuntimeError(msg)


def main() -> int:
    dsn = os.getenv("DB_DSN", os.getenv("DATABASE_URL", DEFAULT_DSN))
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
                  (%s, 'doctor_memory_bridge_worker', 'AUTO_LOCK', 'PENDING', '{}'::jsonb, 1, 0)
                RETURNING id
                """,
                (story_id,),
            )
            job_id = int(cur.fetchone()[0])

            chapter_payload = {
                "chapter_no": 301,
                "chapter_text": "## Scene 1\nA bridge wakes at dusk.\n## Scene 2\nIts memory rejects liars.",
            }
            cur.execute(
                """
                INSERT INTO public.ingest_task
                  (job_id, story_id, unit_type, source_path, seq_no, status, attempts, payload_json)
                VALUES
                  (%s, %s, 'chapter', %s, 1, 'PENDING', 0, %s::jsonb)
                """,
                (job_id, story_id, "chapter_301.txt", Json(chapter_payload)),
            )
        conn.commit()
    finally:
        conn.close()

    worker = subprocess.run(
        [
            sys.executable,
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "..",
                "services",
                "memory-bridge",
                "memory_bridge_worker.py",
            ),
            "--dsn",
            dsn,
            "--once",
            "--max-tasks",
            "20",
        ],
        check=False,
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": os.getcwd()},
    )
    # Ensure logs directory exists and write worker stdout/stderr for debugging
    try:
        log_dir = os.path.join(os.getcwd(), "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "worker_debug.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write("\n=== doctor run: worker output start ===\n")
            f.write("CMD: " + " ".join(worker.args if hasattr(worker, 'args') else []) + "\n")
            f.write("RETURNCODE: %s\n" % getattr(worker, "returncode", "?"))
            if getattr(worker, "stdout", None):
                f.write("--- STDOUT ---\n")
                f.write(worker.stdout)
            if getattr(worker, "stderr", None):
                f.write("--- STDERR ---\n")
                f.write(worker.stderr)
            f.write("=== doctor run: worker output end ===\n")
    except Exception:
        # best-effort logging; don't fail the doctor runner
        pass
    if worker.returncode != 0:
        print(worker.stdout)
        print(worker.stderr, file=sys.stderr)
        raise RuntimeError("worker execution failed")

    verify = _connect(dsn)
    verify.autocommit = False
    try:
        with verify.cursor() as cur:
            cur.execute("SELECT id FROM public.story_series WHERE slug = %s", (STORY_SLUG,))
            story_id = int(cur.fetchone()[0])

            cur.execute(
                """
                SELECT id, status, total_tasks, completed_tasks
                FROM public.ingest_job
                WHERE created_by = 'doctor_memory_bridge_worker'
                ORDER BY id DESC
                LIMIT 1
                """
            )
            row = cur.fetchone()
            _must(row is not None, "ingest_job missing")
            job_id = int(row[0])
            job_status = row[1]
            total_tasks = int(row[2])
            completed_tasks = int(row[3])
            _must(job_status == "DONE", f"expected job DONE but got {job_status}")
            _must(total_tasks == 3, f"expected total_tasks=3 but got {total_tasks}")
            _must(completed_tasks == 3, f"expected completed_tasks=3 but got {completed_tasks}")

            cur.execute(
                """
                SELECT count(*)::int
                FROM public.ingest_task
                WHERE job_id = %s AND status = 'DONE'
                """,
                (job_id,),
            )
            done_tasks = int(cur.fetchone()[0])
            _must(done_tasks >= 3, f"expected >=3 done tasks but got {done_tasks}")

            cur.execute(
                """
                SELECT count(*)::int
                FROM public.narrative_scene
                WHERE story_id = %s AND workunit_id LIKE 'ch301_s%%'
                """,
                (story_id,),
            )
            scenes = int(cur.fetchone()[0])
            _must(scenes == 2, f"expected 2 scenes but got {scenes}")

            cur.execute(
                """
                SELECT count(*)::int
                FROM public.story_canon_fact
                WHERE story_id = %s AND source_ref LIKE %s
                """,
                (story_id, f"ingest:{job_id}:%"),
            )
            canon_rows = int(cur.fetchone()[0])
            _must(canon_rows >= 2, f"expected canon rows >=2 but got {canon_rows}")

            cur.execute(
                """
                DELETE FROM public.review_request WHERE job_id = %s
                """,
                (job_id,),
            )
            cur.execute(
                """
                DELETE FROM public.story_canon_fact
                WHERE story_id = %s AND source_ref LIKE %s
                """,
                (story_id, f"ingest:{job_id}:%"),
            )
            cur.execute(
                """
                DELETE FROM public.timeline_event
                WHERE story_id = %s AND event_key LIKE %s
                """,
                (story_id, f"ingest_job_{job_id}_task_%"),
            )
            cur.execute(
                """
                DELETE FROM public.narrative_scene_version
                WHERE story_id = %s AND summary LIKE 'ingest scene ch301_s%%'
                """,
                (story_id,),
            )
            cur.execute(
                """
                DELETE FROM public.narrative_scene
                WHERE story_id = %s AND workunit_id LIKE 'ch301_s%%'
                """,
                (story_id,),
            )
            cur.execute("DELETE FROM public.ingest_job WHERE id = %s", (job_id,))
        verify.commit()
    finally:
        verify.close()

    print("[doctor-memory-bridge-worker] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

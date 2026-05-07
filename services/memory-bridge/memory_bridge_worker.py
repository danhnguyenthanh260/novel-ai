#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any, Dict

import psycopg2

from worker_common import (
    load_cached_split_result,
    load_review_policy,
    process_memory_enrich_task,
    mark_memory_task_failed,
)
from worker_ingest_repo import (
    claim_next_memory_task,
    claim_next_agent_janitor_task,
    claim_next_task,
    is_job_cancelled,
    mark_agent_janitor_task_failed,
    mark_task_failed,
    insert_agent_run_trace,
    insert_agent_feedback_loop,
    insert_pipeline_node_event,
)
from worker_agent_janitor import process_agent_janitor_task
from worker_ingest_handler import process_chapter_ingest_task
from worker_task_handlers import (
    process_chapter_split_task,
    process_chapter_task,
    process_chapter_validate_task,
    process_scene_create_task,
    process_scene_task,
    process_split_profile_correction_task,
    process_writing_analysis_task,
    process_memory_rollup_task,
    process_writing_planning_task,
    process_writing_prose_task,
    process_writing_continuity_task,
    process_writing_supervisor_task,
    process_chapter_write_v3_task,
    process_chapter_ledger_task,
    process_memory_rollup_v3_task,
    process_narrative_start_task,
    process_narrative_stylist_task,
    process_narrative_critic_task,
    process_narrative_refine_task,
    process_narrative_finalize_task,
)

CHAPTER_WRITE_V3_GUARD_PREFIX = "CHAPTER_WRITE_V3_GUARDRAIL_BLOCK:"
LEGACY_NARRATIVE_TASK_TYPES = {
    "NARRATIVE_START",
    "NARRATIVE_STYLIST",
    "NARRATIVE_CRITIC",
    "NARRATIVE_REFINE",
    "NARRATIVE_FINALIZE",
}

def _parse_chapter_write_v3_guard_error(error_text: str) -> Dict[str, Any] | None:
    if not error_text.startswith(CHAPTER_WRITE_V3_GUARD_PREFIX):
        return None
    raw = error_text[len(CHAPTER_WRITE_V3_GUARD_PREFIX):]
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {
            "error_code": "CHAPTER_WRITE_V3_GUARDRAIL_BLOCK",
            "guard_fail_reasons": [part for part in raw.split("|") if part],
        }
    return parsed if isinstance(parsed, dict) else None

def _legacy_narrative_dispatch_enabled() -> bool:
    return str(os.getenv("NARRATIVE_LEGACY_DISPATCH_ENABLED") or "").strip().lower() in {"1", "true", "yes", "on"}

def _process_legacy_narrative_task(conn, task: Dict[str, Any], task_type: str) -> None:
    if not _legacy_narrative_dispatch_enabled():
        raise ValueError(
            f"LEGACY_NARRATIVE_DISPATCH_RETIRED:{task_type}:"
            "set NARRATIVE_LEGACY_DISPATCH_ENABLED=1 to drain compatibility jobs"
        )
    if task_type == "NARRATIVE_START":
        process_narrative_start_task(conn, task)
    elif task_type == "NARRATIVE_STYLIST":
        process_narrative_stylist_task(conn, task)
    elif task_type == "NARRATIVE_CRITIC":
        process_narrative_critic_task(conn, task)
    elif task_type == "NARRATIVE_REFINE":
        process_narrative_refine_task(conn, task)
    elif task_type == "NARRATIVE_FINALIZE":
        process_narrative_finalize_task(conn, task)
    else:
        raise ValueError(f"UNSUPPORTED_LEGACY_NARRATIVE_TASK:{task_type}")
from worker_constants import DEFAULT_DSN


def run_worker(
    dsn: str,
    poll_interval_sec: float,
    max_tasks: int,
    once: bool,
) -> int:
    lane = os.getenv("WORKER_FLOW_LANE", "all").lower()
    runtime_dir = os.path.join(os.getcwd(), ".runtime")
    if not os.path.exists(runtime_dir):
        try:
            os.makedirs(runtime_dir, exist_ok=True)
        except Exception:
            pass

    lock_file_path = os.path.join(runtime_dir, f"worker_{lane}.lock")
    lock_file = None

    # Singleton check via file lock (fcntl is available on WSL/Linux)
    try:
        import fcntl
        lock_file = open(lock_file_path, "w")
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(f"[worker] Acquired lock for lane='{lane}' at {lock_file_path}", flush=True)
    except (ImportError, IOError, BlockingIOError):
        print(f"[worker] FATAL: Could not acquire lock for lane='{lane}'. Another instance is likely running.", file=sys.stderr, flush=True)
        if lock_file:
            lock_file.close()
        return 1

    processed = 0
    conn = None
    pending_db_fail: Dict[str, Any] | None = None
    claimed_task: Dict[str, Any] | None = None

    print(f"[worker] Started with PID {os.getpid()}, lane={lane}, poll={poll_interval_sec}s", flush=True)

    try:
        while True:
            try:
                if conn is None:
                    conn = psycopg2.connect(dsn)
                    conn.autocommit = False
                    print("[worker] DB connected.", flush=True)
                    if pending_db_fail is not None:
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                        try:
                            mark_task_failed(
                                conn,
                                int(pending_db_fail["task_id"]),
                                int(pending_db_fail["job_id"]),
                                str(pending_db_fail["error"]),
                                int(pending_db_fail["attempts"]),
                                duration_sec=pending_db_fail.get("duration_sec"),
                            )
                            conn.commit()
                            print(
                                f"[worker] deferred-fail task={pending_db_fail['task_id']} job={pending_db_fail['job_id']} err={pending_db_fail['error']}",
                                file=sys.stderr,
                                flush=True,
                            )
                            pending_db_fail = None
                        except Exception as deferred_err:
                            try:
                                conn.rollback()
                            except Exception:
                                pass
                            print(
                                f"[worker] deferred-fail retry pending task={pending_db_fail['task_id']} err={deferred_err}",
                                file=sys.stderr,
                                flush=True,
                            )
                            raise deferred_err

                task = claim_next_task(conn)
                claimed_task = task
                if task is None:
                    claimed_task = None
                    memory_task = claim_next_memory_task(conn)
                    if memory_task is None:
                        janitor_task = claim_next_agent_janitor_task(conn)
                        if janitor_task is None:
                            if once:
                                break
                            time.sleep(poll_interval_sec)
                            continue
                        try:
                            process_agent_janitor_task(conn, janitor_task)
                            conn.commit()
                            processed += 1
                            print(
                                f"[worker] done janitor task={janitor_task['id']} job={janitor_task['job_id']}",
                                flush=True,
                            )
                        except psycopg2.Error as err:
                            raise err
                        except Exception as err:
                            try:
                                conn.rollback()
                                mark_agent_janitor_task_failed(conn, int(janitor_task["id"]), str(err)[:3000])
                                conn.commit()
                            except Exception:
                                pass
                            print(
                                f"[worker] failed janitor task={janitor_task['id']} job={janitor_task.get('job_id')} err={err}",
                                file=sys.stderr,
                                flush=True,
                            )
                        if max_tasks > 0 and processed >= max_tasks:
                            break
                        continue
                    try:
                        process_memory_enrich_task(conn, memory_task)
                        conn.commit()
                        processed += 1
                        print(
                            f"[worker] done memory_enrich task={memory_task['id']} "
                            f"scene={memory_task['scene_id']} version={memory_task['scene_version_id']}",
                            flush=True,
                        )
                    except psycopg2.Error as err:
                        raise err
                    except Exception as err:
                        try:
                            conn.rollback()
                            mark_memory_task_failed(conn, int(memory_task["id"]), str(err)[:3000])
                            conn.commit()
                        except Exception:
                            pass
                        print(f"[worker] failed memory_enrich task={memory_task['id']} err={err}", file=sys.stderr, flush=True)

                    if max_tasks > 0 and processed >= max_tasks:
                        break
                    continue

                if is_job_cancelled(conn, int(task["job_id"])):
                    try:
                        try:
                            mark_task_failed(conn, int(task["id"]), int(task["job_id"]), "JOB_CANCELLED_BY_USER", int(task.get("attempts") or 0))
                        except ValueError:
                            pass # Stale lock allowed to fail quietly
                        conn.commit()
                    except psycopg2.Error as err:
                        raise err
                    except Exception:
                        conn.rollback()
                    continue

                try:
                    task_start_time = time.time()
                    task_type = str(task.get("task_type") or "")
                    if task_type == "CHAPTER_INGEST":
                        process_chapter_ingest_task(conn, task)
                    elif task_type == "CHAPTER_SPLIT_LLM":
                        process_chapter_split_task(conn, task)
                    elif task_type == "SCENE_CREATE":
                        process_scene_create_task(conn, task)
                    elif task_type == "SPLIT_PROFILE_CORRECTION":
                        process_split_profile_correction_task(conn, task)
                    elif task_type == "CHAPTER_VALIDATE":
                        process_chapter_validate_task(conn, task)
                    elif task_type == "WRITING_ANALYSIS":
                        process_writing_analysis_task(conn, task)
                    elif task_type == "MEMORY_ROLLUP":
                        process_memory_rollup_task(conn, task)
                    elif task_type == "WRITING_PLANNING":
                        process_writing_planning_task(conn, task)
                    elif task_type == "WRITING_PROSE":
                        process_writing_prose_task(conn, task)
                    elif task_type == "WRITING_CONTINUITY":
                        process_writing_continuity_task(conn, task)
                    elif task_type == "WRITING_SUPERVISOR":
                        process_writing_supervisor_task(conn, task)
                    elif task_type == "CHAPTER_WRITE_V3":
                        process_chapter_write_v3_task(conn, task)
                    elif task_type == 'CHAPTER_LEDGER_EXTRACT':
                        process_chapter_ledger_task(conn, task)
                    elif task_type == 'MEMORY_ROLLUP_V3':
                        process_memory_rollup_v3_task(conn, task)
                    elif task_type in LEGACY_NARRATIVE_TASK_TYPES:
                        _process_legacy_narrative_task(conn, task, task_type)
                    elif task["unit_type"] == "chapter":
                        process_chapter_task(conn, task)
                    elif task["unit_type"] == "scene":
                        process_scene_task(conn, task)
                    else:
                        raise ValueError(f"UNSUPPORTED_TASK:{task_type}:{task['unit_type']}")
                    insert_pipeline_node_event(
                        conn,
                        story_id=int(task.get("story_id") or 0),
                        job_id=int(task.get("job_id") or 0),
                        task_id=int(task.get("id") or 0),
                        task_type=task_type,
                        payload_json=task.get("payload_json"),
                        status="DONE",
                        message="Task completed",
                    )
                    conn.commit()
                    processed += 1
                    print(
                        f"[worker] done task={task['id']} job={task['job_id']} type={task_type or task['unit_type']} attempts={task.get('attempts', 1)}",
                        flush=True,
                    )
                except psycopg2.Error as err:
                    task_duration = time.time() - task_start_time if 'task_start_time' in locals() else None
                    db_fail_error = f"FAILED_DB:{err.__class__.__name__}:{str(err)[:2800]}"
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                    try:
                        try:
                            mark_task_failed(
                                conn,
                                int(task["id"]),
                                int(task["job_id"]),
                                db_fail_error,
                                int(task.get("attempts") or 0),
                                duration_sec=task_duration,
                            )
                        except ValueError:
                            pass
                        conn.commit()
                        print(
                            f"[worker] failed task={task['id']} job={task['job_id']} type={task.get('task_type') or task.get('unit_type')} err={db_fail_error}",
                            file=sys.stderr,
                            flush=True,
                        )
                        claimed_task = None
                        continue
                    except Exception:
                        pending_db_fail = {
                            "task_id": int(task["id"]),
                            "job_id": int(task["job_id"]),
                            "attempts": int(task.get("attempts") or 0),
                            "error": db_fail_error,
                            "duration_sec": task_duration,
                        }
                        raise err
                except Exception as err:
                    task_duration = time.time() - task_start_time if 'task_start_time' in locals() else None
                    try:
                        conn.rollback()
                        task_type = str(task.get("task_type") or "")
                        if task_type.startswith("NARRATIVE_"):
                            insert_agent_run_trace(
                                conn,
                                task=task,
                                agent_name=task_type,
                                status="FAILED",
                                input_payload=task.get("payload_json"),
                                output_payload=None,
                                error_code=str(err)[:3000],
                                quality_json={"error": str(err)[:3000]},
                            )
                            payload_raw = task.get("payload_json")
                            payload = payload_raw if isinstance(payload_raw, dict) else {}
                            chapter_id = str(
                                payload.get("chapter_id")
                                or (payload.get("job_config") or {}).get("chapter_id")
                                or ""
                            ) or None
                            insert_agent_feedback_loop(
                                conn,
                                story_id=int(task.get("story_id") or 0),
                                chapter_id=chapter_id,
                                agent_name=task_type,
                                run_trace_id=None,
                                feedback_source="SYSTEM",
                                feedback_type="FIX",
                                feedback_text=f"{task_type} failed: {str(err)[:1000]}",
                                weight=2.0,
                            )
                        elif task_type == "CHAPTER_WRITE_V3":
                            guard_payload = _parse_chapter_write_v3_guard_error(str(err))
                            if guard_payload:
                                cur = conn.cursor()
                                try:
                                    cur.execute(
                                        """
                                        UPDATE public.ingest_task
                                        SET result_json = %s::jsonb
                                        WHERE id = %s
                                        """,
                                        (json.dumps(guard_payload, ensure_ascii=True), int(task["id"])),
                                    )
                                finally:
                                    cur.close()
                                insert_agent_run_trace(
                                    conn,
                                    task=task,
                                    agent_name="CHAPTER_WRITE_V3",
                                    status="FAILED",
                                    input_payload=task.get("payload_json"),
                                    output_payload=guard_payload,
                                    error_code=str(err)[:3000],
                                    quality_json={
                                        "source": "chapter_write_v3_guard",
                                        "v3_guard": (
                                            (guard_payload.get("metadata") or {}).get("v3_guard")
                                            if isinstance(guard_payload.get("metadata"), dict)
                                            else {}
                                        ),
                                    },
                                )
                        elif task_type == "CHAPTER_SPLIT_LLM":
                            for agent_name in ("SPLITTER", "SPLIT_CRITIC", "SUPERVISOR"):
                                insert_agent_run_trace(
                                    conn,
                                    task=task,
                                    agent_name=agent_name,
                                    status="FAILED",
                                    input_payload=task.get("payload_json"),
                                    output_payload=None,
                                    error_code=str(err)[:3000],
                                    quality_json={"error": str(err)[:3000], "source": "worker_exception"},
                                )
                        try:
                            mark_task_failed(conn, int(task["id"]), int(task["job_id"]), str(err)[:3000], int(task.get("attempts") or 0), duration_sec=task_duration)
                        except ValueError:
                            pass # stale lock
                        insert_pipeline_node_event(
                            conn,
                            story_id=int(task.get("story_id") or 0),
                            job_id=int(task.get("job_id") or 0),
                            task_id=int(task.get("id") or 0),
                            task_type=task_type,
                            payload_json=task.get("payload_json"),
                            status="FAILED",
                            message="Task failed",
                            error_code=str(err)[:500],
                            payload_extra={"error": str(err)[:3000]},
                        )
                        conn.commit()
                    except Exception:
                        pass
                    print(
                        f"[worker] failed task={task['id']} job={task['job_id']} type={task_type or task['unit_type']} attempts={task.get('attempts', 1)} err={err}",
                        file=sys.stderr,
                        flush=True,
                    )
                finally:
                    claimed_task = None

                if max_tasks > 0 and processed >= max_tasks:
                    break
                if once and task is not None and max_tasks == 0:
                    continue

            except psycopg2.Error as e:
                if claimed_task is not None and pending_db_fail is None:
                    pending_db_fail = {
                        "task_id": int(claimed_task.get("id") or 0),
                        "job_id": int(claimed_task.get("job_id") or 0),
                        "attempts": int(claimed_task.get("attempts") or 0),
                        "error": f"FAILED_DB:{e.__class__.__name__}:{str(e)[:2800]}",
                        "duration_sec": None,
                    }
                claimed_task = None
                print(
                    f"[worker] DB error ({e.__class__.__name__}): {e}. Reconnecting in 5s...",
                    file=sys.stderr,
                    flush=True,
                )
                if conn is not None:
                    try:
                        conn.close()
                    except Exception:
                        pass
                conn = None
                time.sleep(5)
                continue

        print(f"[worker] stop processed={processed}", flush=True)
        return 0
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def main() -> int:
    ap = argparse.ArgumentParser(description="Memory Bridge worker skeleton")
    ap.add_argument("--dsn", default=os.getenv("DB_DSN", os.getenv("DATABASE_URL", DEFAULT_DSN)))
    ap.add_argument("--poll-interval-sec", type=float, default=float(os.getenv("WORKER_POLL_INTERVAL_SEC", "1.0")))
    ap.add_argument("--max-tasks", type=int, default=int(os.getenv("WORKER_MAX_TASKS", "0")))
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()

    return run_worker(
        dsn=args.dsn,
        poll_interval_sec=args.poll_interval_sec,
        max_tasks=args.max_tasks,
        once=args.once,
    )


if __name__ == "__main__":
    raise SystemExit(main())

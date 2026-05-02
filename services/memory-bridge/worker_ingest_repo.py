from __future__ import annotations

import hashlib
import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
from psycopg2.extras import Json, RealDictCursor

CLAIMABLE_JOB_STATUSES = (
    "PENDING",
    "RUNNING",
    "SPLIT_DRAFT",
    "APPROVED",
)

AWAIT_BACKGROUND_JOB_STATUSES = (
    "AWAIT_APPROVAL",
    "AWAITING_DATA_APPROVAL",
)

AWAIT_BACKGROUND_TASK_TYPES = (
    "CHAPTER_INGEST",
    "SPLIT_PROFILE_CORRECTION",
    "CHAPTER_VALIDATE",
)

SPLIT_TASK_TYPES = (
    "CHAPTER_INGEST",
    "CHAPTER_SPLIT_LLM",
    "SCENE_CREATE",
    "SPLIT_PROFILE_CORRECTION",
    "CHAPTER_VALIDATE",
)

ANALYSIS_TASK_TYPES = (
    "WRITING_ANALYSIS",
    "MEMORY_ROLLUP",
)

WRITING_TASK_TYPES = (
    "WRITING_PLANNING",
    "WRITING_PROSE",
    "WRITING_CONTINUITY",
    "WRITING_SUPERVISOR",
    "CHAPTER_WRITE_V3",
    "CHAPTER_LEDGER_EXTRACT",
    "MEMORY_ROLLUP_V3",
    "NARRATIVE_START",
    "NARRATIVE_STYLIST",
    "NARRATIVE_CRITIC",
    "NARRATIVE_REFINE",
    "NARRATIVE_FINALIZE",
)

def _env_int(name: str, default: int, min_value: int = 1, max_value: int = 86400) -> int:
    raw = str(os.getenv(name, str(default)) or str(default)).strip()
    try:
        value = int(raw)
    except Exception:
        value = default
    if value < min_value:
        return min_value
    if value > max_value:
        return max_value
    return value


def _stale_timeout_sec_for_task(task_type: str) -> int:
    task = str(task_type or "").strip().upper()
    if task == "WRITING_ANALYSIS":
        base = _env_int("LLM_TIMEOUT_WRITING_ANALYSIS", 300, min_value=30, max_value=3600)
        multiplier = _env_int("ANALYSIS_STALE_TIMEOUT_MULTIPLIER", 2, min_value=1, max_value=12)
        return max(60, base * multiplier)
    if task == "MEMORY_ROLLUP":
        base = _env_int("LLM_TIMEOUT_WRITING_ANALYSIS", 300, min_value=30, max_value=3600)
        multiplier = _env_int("MEMORY_ROLLUP_STALE_TIMEOUT_MULTIPLIER", 3, min_value=1, max_value=12)
        return max(120, base * multiplier)
    if task == "CHAPTER_SPLIT_LLM":
        return _env_int("WORKER_SPLIT_STALE_TIMEOUT_SEC", 3600, min_value=60, max_value=86400)
    return _env_int("WORKER_DEFAULT_STALE_TIMEOUT_SEC", 1200, min_value=60, max_value=86400)


def _mark_stale_running_tasks(conn, lane: str) -> int:
    """
    Reliability guard:
    mark orphan/stale RUNNING tasks as FAILED with explicit stale marker.
    """
    lane_key = str(lane or "all").strip().lower()
    if lane_key not in ("all", "split", "analysis", "writing"):
        lane_key = "all"

    if lane_key == "analysis":
        task_types = list(ANALYSIS_TASK_TYPES)
    elif lane_key == "split":
        task_types = list(SPLIT_TASK_TYPES)
    elif lane_key == "writing":
        task_types = list(WRITING_TASK_TYPES)
    else:
        task_types = list(ANALYSIS_TASK_TYPES) + list(SPLIT_TASK_TYPES) + list(WRITING_TASK_TYPES)
    task_types = sorted(set(task_types))
    if not task_types:
        return 0

    cur = conn.cursor(cursor_factory=RealDictCursor)
    total = 0
    affected_jobs: set[int] = set()
    try:
        for task_type in task_types:
            stale_sec = _stale_timeout_sec_for_task(task_type)
            cur.execute(
                """
                UPDATE public.ingest_task
                SET status = 'FAILED',
                    error = %s,
                    updated_at = now()
                WHERE status = 'RUNNING'
                  AND task_type = %s
                  AND updated_at < (now() - make_interval(secs => %s))
                RETURNING id, job_id
                """,
                (
                    f"FAILED_STALE:{task_type}:age_gt_{stale_sec}s",
                    task_type,
                    int(stale_sec),
                ),
            )
            rows = cur.fetchall() or []
            if rows:
                total += len(rows)
                for row in rows:
                    try:
                        affected_jobs.add(int(row.get("job_id")))
                    except Exception:
                        continue
        if total > 0:
            for job_id in affected_jobs:
                refresh_job_status(conn, int(job_id))
    finally:
        cur.close()
    return int(total)


def _agent_trace_debug_enabled() -> bool:
    raw = str(os.getenv("AGENT_TRACE_DEBUG", "1")).strip().lower()
    return raw not in ("0", "false", "off", "no")


def _debug_log(msg: str) -> None:
    if _agent_trace_debug_enabled():
        print(msg, file=sys.stderr, flush=True)


def _env_text(name: str, default: str, max_len: int = 64) -> str:
    raw = str(os.getenv(name, default) or default).strip()
    if not raw:
        raw = default
    return raw[:max_len]


def _default_frozen_at_utc() -> str:
    import datetime as _dt
    return _dt.datetime.now(_dt.timezone.utc).isoformat()

def _as_payload_dict(payload_raw: Any) -> Dict[str, Any]:
    if isinstance(payload_raw, dict):
        return payload_raw
    if isinstance(payload_raw, str):
        text = payload_raw.strip()
        if not text:
            return {}
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}

def _infer_flow_type(task_type: str, payload_raw: Any) -> Optional[str]:
    task = str(task_type or "").strip().upper()
    payload = _as_payload_dict(payload_raw)
    if task in ("WRITING_ANALYSIS", "MEMORY_ROLLUP"):
        return "WRITING_ANALYSIS"
    if task in ("WRITING_PLANNING", "WRITING_PROSE", "WRITING_CONTINUITY", "WRITING_SUPERVISOR"):
        return "AUTOWRITE"
    if task in ("CHAPTER_WRITE_V3", "CHAPTER_LEDGER_EXTRACT", "MEMORY_ROLLUP_V3"):
        return "AUTOWRITE"
    if task.startswith("NARRATIVE_"):
        return "AUTOWRITE"
    if task == "SPLIT_PROFILE_CORRECTION":
        return "REPROCESS_SPLIT"
    if task in ("CHAPTER_INGEST", "CHAPTER_SPLIT_LLM", "SCENE_CREATE", "CHAPTER_VALIDATE"):
        if payload.get("reprocess_reason_code"):
            return "REPROCESS_SPLIT"
        return "INGEST_SPLIT"
    return None


def load_source_doc_text(conn, story_id: int, source_doc_id: str) -> Optional[str]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT raw_text
            FROM public.source_doc
            WHERE id = %s::uuid AND story_id = %s
            LIMIT 1
            """,
            (source_doc_id, story_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        text = row.get("raw_text")
        return str(text) if isinstance(text, str) else None
    finally:
        cur.close()

def insert_pipeline_node_event(
    conn,
    *,
    story_id: int,
    job_id: int,
    task_id: Optional[int],
    task_type: str,
    payload_json: Any,
    status: str,
    message: Optional[str] = None,
    error_code: Optional[str] = None,
    payload_extra: Optional[Dict[str, Any]] = None,
) -> Optional[int]:
    cur = conn.cursor()
    try:
        flow_type = _infer_flow_type(task_type, payload_json)
        if flow_type is None:
            return None
        node_key = str(task_type or "").strip().upper() or "UNKNOWN"
        event_payload = {
            "task_type": node_key,
            "task_id": task_id,
            "error_code": error_code,
        }
        if payload_extra:
            event_payload.update(payload_extra)
        cur.execute(
            """
            INSERT INTO public.pipeline_node_event
              (story_id, job_id, task_id, flow_type, node_key, status, message, error_code, payload_json)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            RETURNING id
            """,
            (
                int(story_id),
                int(job_id),
                task_id,
                flow_type,
                node_key,
                str(status or "PENDING"),
                (message[:1000] if isinstance(message, str) else None),
                (error_code[:500] if isinstance(error_code, str) else None),
                json.dumps(event_payload),
            ),
        )
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else None
    except Exception as err:
        _debug_log(
            f"[pipeline_node_event][error] story_id={story_id} job_id={job_id} "
            f"task_id={task_id} task_type={task_type} status={status} err={err}"
        )
        return None
    finally:
        cur.close()


def load_chapter_text_basis_from_split_task(
    conn,
    story_id: int,
    job_id: int,
    chapter_task_id: int,
    parse_jsonb,
) -> Optional[str]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT result_json
            FROM public.ingest_task
            WHERE id = %s
              AND job_id = %s
              AND story_id = %s
              AND task_type = 'CHAPTER_SPLIT_LLM'
            LIMIT 1
            """,
            (chapter_task_id, job_id, story_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        result = parse_jsonb(row.get("result_json"))
        text_basis = str(result.get("chapter_text_basis") or "").strip()
        if text_basis:
            return text_basis
        text_fallback = str(result.get("chapter_text") or "").strip()
        if text_fallback:
            return text_fallback
        return None
    finally:
        cur.close()


def load_review_policy(conn, job_id: int, parse_jsonb) -> Dict[str, float]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT config_json FROM public.ingest_job WHERE id = %s LIMIT 1", (job_id,))
        row = cur.fetchone() or {}
        config = parse_jsonb(row.get("config_json"))
        policy = config.get("review_gate_policy")
        if not isinstance(policy, dict):
            policy = {}

        def _num(key: str, default: float) -> float:
            raw = policy.get(key)
            if isinstance(raw, (int, float)):
                return float(raw)
            if isinstance(raw, str):
                try:
                    return float(raw)
                except Exception:
                    return default
            return default

        return {
            "min_confidence": _num("min_confidence", 0.62),
            "min_new_entities": _num("min_new_entities", 5),
            "min_major_events": _num("min_major_events", 2),
        }
    finally:
        cur.close()


def count_new_facts(conn, story_id: int, facts: List[Tuple[str, str]]) -> int:
    if not facts:
        return 0
    cur = conn.cursor()
    new_count = 0
    try:
        for category, content in facts:
            cur.execute(
                """
                SELECT 1
                FROM public.story_canon_fact
                WHERE story_id = %s
                  AND category = %s
                  AND lower(trim(content)) = lower(trim(%s))
                LIMIT 1
                """,
                (story_id, category, content),
            )
            if cur.fetchone() is None:
                new_count += 1
        return new_count
    finally:
        cur.close()


def set_scene_status(conn, story_id: int, scene_id: int, status: str) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.narrative_scene
            SET status = %s, updated_at = now()
            WHERE id = %s AND story_id = %s
            """,
            (status, scene_id, story_id),
        )
    finally:
        cur.close()


def claim_next_task(conn) -> Optional[Dict[str, Any]]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        lane_raw = str(os.getenv("WORKER_FLOW_LANE", "all") or "all").strip().lower()
        lane = lane_raw if lane_raw in ("all", "split", "analysis", "writing") else "all"
        cur.execute("BEGIN")
        _mark_stale_running_tasks(conn, lane)
        cur.execute(
            """
            SELECT
              t.id,
              t.job_id,
              t.story_id,
              t.task_type,
              t.unit_type,
              t.source_path,
              t.seq_no,
              t.status,
              t.attempts,
              t.idempotency_key,
              t.payload_json,
              t.result_json,
              j.mode AS job_mode,
              j.created_by AS created_by,
              j.ingest_run_id::text AS ingest_run_id
            FROM public.ingest_task t
            JOIN public.ingest_job j ON j.id = t.job_id
            WHERE t.status IN ('PENDING', 'READY')
              AND (
                j.status = ANY(%s)
                OR (
                  j.status = ANY(%s)
                  AND t.task_type = ANY(%s)
                )
              )
              AND (
                %s = 'all'
                OR (%s = 'split' AND t.task_type = ANY(%s))
                OR (%s = 'analysis' AND t.task_type = ANY(%s))
                OR (%s = 'writing' AND t.task_type = ANY(%s))
              )
              AND t.available_at <= NOW()
            ORDER BY t.available_at ASC, t.id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """,
            (
                list(CLAIMABLE_JOB_STATUSES),
                list(AWAIT_BACKGROUND_JOB_STATUSES),
                list(AWAIT_BACKGROUND_TASK_TYPES),
                lane,
                lane, list(SPLIT_TASK_TYPES),
                lane, list(ANALYSIS_TASK_TYPES),
                lane, list(WRITING_TASK_TYPES),
            ),
        )
        task = cur.fetchone()
        if task is None:
            cur.execute("COMMIT")
            return None

        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'RUNNING', attempts = attempts + 1, error = NULL, updated_at = now()
            WHERE id = %s
            """,
            (task["id"],),
        )
        insert_pipeline_node_event(
            conn,
            story_id=int(task["story_id"]),
            job_id=int(task["job_id"]),
            task_id=int(task["id"]),
            task_type=str(task.get("task_type") or ""),
            payload_json=task.get("payload_json"),
            status="RUNNING",
            message="Task claimed by worker",
        )
        cur.execute(
            """
            UPDATE public.ingest_job
            SET status = CASE WHEN status = 'PENDING' THEN 'RUNNING' ELSE status END,
                updated_at = now()
            WHERE id = %s
            """,
            (task["job_id"],),
        )
        cur.execute("COMMIT")
        task["attempts"] = int(task["attempts"] or 0) + 1
        return dict(task)
    except Exception:
        cur.execute("ROLLBACK")
        raise
    finally:
        cur.close()


def refresh_job_status(conn, job_id: int) -> None:
    cur = conn.cursor()
    try:
        cur.execute("SELECT status FROM public.ingest_job WHERE id = %s LIMIT 1", (job_id,))
        job_row = cur.fetchone()
        current_status = str(job_row[0]) if job_row and job_row[0] is not None else ""
        if current_status in ("CANCELLED", "REJECTED"):
            cur.execute(
                """
                UPDATE public.ingest_job
                SET completed_tasks = (
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
            SELECT
              count(*) FILTER (WHERE status = 'FAILED') AS failed_count,
              count(*) FILTER (WHERE status = 'WAIT_REVIEW') AS wait_review_count,
              count(*) FILTER (WHERE status IN ('PENDING', 'READY', 'RUNNING')) AS active_count,
              count(*) FILTER (WHERE status = 'DONE') AS done_count,
              count(*) AS total_count
            FROM public.ingest_task
            WHERE job_id = %s
            """,
            (job_id,),
        )
        row = cur.fetchone()
        failed = int(row[0] or 0)
        wait_review = int(row[1] or 0)
        active = int(row[2] or 0)
        done = int(row[3] or 0)
        total = int(row[4] or 0)

        if failed > 0:
            status = "FAILED"
        elif total > 0 and done == total:
            status = "DONE"
        elif wait_review > 0 and active == 0:
            status = "RUNNING"
        else:
            status = "RUNNING"

        cur.execute(
            """
            UPDATE public.ingest_job
            SET status = %s,
                completed_tasks = %s,
                updated_at = now()
            WHERE id = %s
            """,
            (status, done, job_id),
        )
        if status == "DONE" and current_status != "DONE":
            try:
                cur.execute(
                    """
                    INSERT INTO public.agent_janitor_task (story_id, job_id, chapter_id, status, payload_json, available_at)
                    SELECT
                      j.story_id,
                      j.id,
                      COALESCE(
                        MAX(
                          CASE
                            WHEN t.payload_json ? 'chapter_id' THEN t.payload_json->>'chapter_id'
                            WHEN (t.payload_json->'job_config') ? 'chapter_id' THEN t.payload_json->'job_config'->>'chapter_id'
                            ELSE NULL
                          END
                        ),
                        NULL
                      ),
                      'READY',
                      jsonb_build_object('source', 'job_done_hook'),
                      now()
                    FROM public.ingest_job j
                    LEFT JOIN public.ingest_task t ON t.job_id = j.id
                    WHERE j.id = %s
                    GROUP BY j.id, j.story_id
                    ON CONFLICT (job_id) DO NOTHING
                    """,
                    (job_id,),
                )
            except Exception as err:
                _debug_log(f"[janitor][enqueue][error] job_id={job_id} err={err}")
    finally:
        cur.close()


def next_seq_start(conn, job_id: int) -> int:
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = %s",
            (job_id,),
        )
        return int(cur.fetchone()[0])
    finally:
        cur.close()


def insert_scene_with_version(
    conn,
    story_id: int,
    workunit_id: str,
    chapter_id: str,
    scene_idx: int,
    scene_text: str,
    job_mode: str,
    ingest_run_id: Optional[str] = None,
    scene_title: Optional[str] = None,
    is_verified: bool = False,
) -> Tuple[int, int]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            INSERT INTO public.narrative_scene
              (story_id, workunit_id, chapter_id, idx, title, status, draft_text, ingest_run_id, is_verified)
            VALUES
              (%s, %s, %s, %s, %s, 'DRAFTING', '', %s, %s)
            ON CONFLICT (story_id, workunit_id)
            DO UPDATE SET
              chapter_id = EXCLUDED.chapter_id,
              title = COALESCE(EXCLUDED.title, public.narrative_scene.title),
              idx = EXCLUDED.idx,
              ingest_run_id = COALESCE(EXCLUDED.ingest_run_id, public.narrative_scene.ingest_run_id),
              is_verified = EXCLUDED.is_verified,
              updated_at = now()
            RETURNING id
            """,
            (story_id, workunit_id, chapter_id, scene_idx, scene_title, ingest_run_id, is_verified),
        )
        scene_id = int(cur.fetchone()["id"])

        cur.execute(
            """
            SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no
            FROM public.narrative_scene_version
            WHERE story_id = %s AND scene_id = %s
            """,
            (story_id, scene_id),
        )
        next_no = int(cur.fetchone()["next_no"])

        cur.execute(
            """
            INSERT INTO public.narrative_scene_version
              (story_id, scene_id, version_no, kind, text_content, summary, ingest_run_id)
            VALUES
              (%s, %s, %s, 'draft', %s, %s, %s)
            RETURNING id
            """,
            (story_id, scene_id, next_no, scene_text, f"ingest scene {workunit_id}", ingest_run_id),
        )
        version_id = int(cur.fetchone()["id"])

        next_status = "LOCKED" if (job_mode == "AUTO_LOCK" or is_verified) else "DRAFTED"
        cur.execute(
            """
            UPDATE public.narrative_scene
            SET current_version_id = %s,
                status = %s,
                is_verified = %s,
                updated_at = now()
            WHERE id = %s
            """,
            (version_id, next_status, (is_verified or job_mode == "AUTO_LOCK"), scene_id),
        )

        # [DATA HYGIENE] Invalidate snapshots if we are verifying a new scene version
        if is_verified or job_mode == "AUTO_LOCK":
            cur.execute(
                """
                UPDATE public.narrative_scene_state
                SET is_stale = true
                WHERE story_id = %s AND scene_id = %s
                """,
                (story_id, scene_id),
            )

        return scene_id, version_id
    finally:
        cur.close()


def mark_task_done(conn, task_id: int, job_id: int, attempts: int) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'DONE', error = NULL, updated_at = now()
            WHERE id = %s AND attempts = %s
            """,
            (task_id, attempts),
        )
        if cur.rowcount == 0:
            raise ValueError(f"Optimistic lock failed for task {task_id}: expected attempts={attempts}")
        refresh_job_status(conn, job_id)
    finally:
        cur.close()


def mark_task_wait_review(conn, task_id: int, job_id: int, attempts: int) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'WAIT_REVIEW', updated_at = now()
            WHERE id = %s AND attempts = %s
            """,
            (task_id, attempts),
        )
        if cur.rowcount == 0:
            raise ValueError(f"Optimistic lock failed for task {task_id}: expected attempts={attempts}")
        refresh_job_status(conn, job_id)
    finally:
        cur.close()


def mark_task_failed(conn, task_id: int, job_id: int, err: str, attempts: int, duration_sec: Optional[float] = None) -> None:
    cur = conn.cursor()
    try:
        if duration_sec is not None:
            cur.execute(
                """
                UPDATE public.ingest_task
                SET status = 'FAILED', 
                    error = %s, 
                    updated_at = now(),
                    result_json = jsonb_set(
                        COALESCE(result_json, '{}'::jsonb),
                        '{split_runtime}',
                        jsonb_set(
                            COALESCE(result_json->'split_runtime', '{}'::jsonb),
                            '{duration_sec}',
                            to_jsonb(%s::numeric)
                        )
                    )
                WHERE id = %s AND attempts = %s
                """,
                (err[:3000], duration_sec, task_id, attempts),
            )
        else:
            cur.execute(
                """
                UPDATE public.ingest_task
                SET status = 'FAILED', error = %s, updated_at = now()
                WHERE id = %s AND attempts = %s
                """,
                (err[:3000], task_id, attempts),
            )
        if cur.rowcount == 0:
            raise ValueError(f"Optimistic lock failed for task {task_id}: expected attempts={attempts}")
        refresh_job_status(conn, job_id)
    finally:
        cur.close()


def _safe_json_payload(value: Any) -> Any:
    if value is None:
        return {}
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw[:4000]}
    return {"raw": str(value)[:4000]}


def _stable_hash_payload(value: Any) -> str:
    safe = _safe_json_payload(value)
    text = json.dumps(safe, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def insert_agent_run_trace(
    conn,
    *,
    task: Dict[str, Any],
    agent_name: str,
    status: str,
    input_payload: Any,
    output_payload: Any = None,
    prompt_version_id: Optional[int] = None,
    model_name: Optional[str] = None,
    latency_ms: Optional[int] = None,
    token_in: Optional[int] = None,
    token_out: Optional[int] = None,
    error_code: Optional[str] = None,
    quality_json: Optional[Dict[str, Any]] = None,
    context_snapshot_id: Optional[int] = None,
    strategy_profile_version_id: Optional[int] = None,
    agent_profile_id: Optional[int] = None,
    equipment_snapshot_json: Optional[Dict[str, Any]] = None,
    rationale_summary: Optional[str] = None,
    taxonomy_version: Optional[str] = None,
    rule_pack_version: Optional[str] = None,
    version_pair_valid: Optional[bool] = None,
    token_key: Optional[str] = None,
    detection_mode: Optional[str] = None,
    enforcement_mode: Optional[str] = None,
    original_detection_mode: Optional[str] = None,
    original_enforcement_mode: Optional[str] = None,
    current_detection_mode: Optional[str] = None,
    current_enforcement_mode: Optional[str] = None,
    freeze_window_id: Optional[str] = None,
    frozen_at: Optional[str] = None,
) -> Optional[int]:
    """
    Best-effort run trace insert. This function must never crash worker flow.
    """
    cur = conn.cursor()
    try:
        payload = _safe_json_payload(task.get("payload_json"))
        chapter_id = str(
            payload.get("chapter_id")
            or (payload.get("job_config") or {}).get("chapter_id")
            or ""
        ) or None

        in_hash = _stable_hash_payload(input_payload)
        out_hash = _stable_hash_payload(output_payload) if output_payload is not None else None
        taxonomy_version_value = (taxonomy_version or _env_text("AGENT_TAXONOMY_VERSION", "v1.0", 32))
        rule_pack_version_value = (rule_pack_version or _env_text("AGENT_RULE_PACK_VERSION", "rp1.0", 32))
        version_pair_valid_value = True if version_pair_valid is None else bool(version_pair_valid)
        token_key_value = (token_key or None)
        detection_mode_value = (detection_mode or None)
        enforcement_mode_value = (enforcement_mode or None)
        original_detection_mode_value = (original_detection_mode or detection_mode_value)
        original_enforcement_mode_value = (original_enforcement_mode or enforcement_mode_value)
        current_detection_mode_value = (current_detection_mode or detection_mode_value)
        current_enforcement_mode_value = (current_enforcement_mode or enforcement_mode_value)
        frozen_at_value = (frozen_at or _default_frozen_at_utc())
        freeze_window_id_value = (freeze_window_id or _env_text("AGENT_FREEZE_WINDOW_ID", frozen_at_value[:10], 64))

        params_v2 = (
            int(task.get("job_id") or 0) or None,
            int(task.get("id") or 0) or None,
            int(task.get("story_id") or 0),
            chapter_id,
            agent_name,
            prompt_version_id,
            model_name,
            in_hash,
            out_hash,
            latency_ms,
            token_in,
            token_out,
            status,
            (error_code or None),
            json.dumps(quality_json or {}),
            context_snapshot_id,
            strategy_profile_version_id,
            agent_profile_id,
            json.dumps(equipment_snapshot_json or {}),
            (rationale_summary[:2000] if isinstance(rationale_summary, str) and rationale_summary else None),
            taxonomy_version_value,
            rule_pack_version_value,
            version_pair_valid_value,
            token_key_value,
            detection_mode_value,
            enforcement_mode_value,
            original_detection_mode_value,
            original_enforcement_mode_value,
            current_detection_mode_value,
            current_enforcement_mode_value,
            freeze_window_id_value,
            frozen_at_value,
        )
        params_legacy = (
            int(task.get("job_id") or 0) or None,
            int(task.get("id") or 0) or None,
            int(task.get("story_id") or 0),
            chapter_id,
            agent_name,
            prompt_version_id,
            model_name,
            in_hash,
            out_hash,
            latency_ms,
            token_in,
            token_out,
            status,
            (error_code or None),
            json.dumps(quality_json or {}),
            context_snapshot_id,
            strategy_profile_version_id,
            agent_profile_id,
            json.dumps(equipment_snapshot_json or {}),
            (rationale_summary[:2000] if isinstance(rationale_summary, str) and rationale_summary else None),
        )
        try:
            cur.execute(
                """
                INSERT INTO public.agent_run_trace
                  (job_id, task_id, story_id, chapter_id, agent_name, prompt_version_id, model_name,
                   input_hash, output_hash, latency_ms, token_in, token_out, status, error_code,
                   quality_json, context_snapshot_id, strategy_profile_version_id, agent_profile_id, equipment_snapshot_json, rationale_summary,
                   taxonomy_version, rule_pack_version, version_pair_valid, token_key, detection_mode, enforcement_mode,
                   original_detection_mode, original_enforcement_mode, current_detection_mode, current_enforcement_mode,
                   freeze_window_id, frozen_at)
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s,
                   %s, %s, %s, %s, %s, %s, %s,
                   %s::jsonb, %s, %s, %s, %s::jsonb, %s,
                   %s, %s, %s, %s, %s, %s,
                   %s, %s, %s, %s,
                   %s, %s::timestamptz)
                RETURNING id
                """,
                params_v2,
            )
        except psycopg2.Error as err:
            # Backward compatible path for older schemas.
            if str(getattr(err, "pgcode", "") or "") != "42703":
                raise
            try:
                cur.execute(
                    """
                    INSERT INTO public.agent_run_trace
                      (job_id, task_id, story_id, chapter_id, agent_name, prompt_version_id, model_name,
                       input_hash, output_hash, latency_ms, token_in, token_out, status, error_code,
                       quality_json, context_snapshot_id, strategy_profile_version_id, agent_profile_id, equipment_snapshot_json, rationale_summary)
                    VALUES
                      (%s, %s, %s, %s, %s, %s, %s,
                       %s, %s, %s, %s, %s, %s, %s,
                       %s::jsonb, %s, %s, %s, %s::jsonb, %s)
                    RETURNING id
                    """,
                    params_legacy,
                )
            except psycopg2.Error as err2:
                if str(getattr(err2, "pgcode", "") or "") != "42703":
                    raise
                cur.execute(
                    """
                    INSERT INTO public.agent_run_trace
                      (job_id, task_id, story_id, chapter_id, agent_name, prompt_version_id, model_name,
                       input_hash, output_hash, latency_ms, token_in, token_out, status, error_code,
                       quality_json, context_snapshot_id, rationale_summary)
                    VALUES
                      (%s, %s, %s, %s, %s, %s, %s,
                       %s, %s, %s, %s, %s, %s, %s,
                       %s::jsonb, %s, %s)
                    RETURNING id
                    """,
                    params_legacy[:16] + (params_legacy[-1],),
                )
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else None
    except Exception as err:
        # Non-blocking telemetry path by design.
        _debug_log(
            f"[agent_trace][insert_agent_run_trace][error] "
            f"agent={agent_name} task_id={task.get('id')} story_id={task.get('story_id')} err={err}"
        )
        return None
    finally:
        cur.close()


def insert_agent_prompt_hydration_trace(
    conn,
    *,
    run_trace_id: Optional[int],
    task: Dict[str, Any],
    agent_name: str,
    prompt_version_id: Optional[int],
    context_snapshot_id: Optional[int],
    hydration_inputs_json: Optional[Dict[str, Any]] = None,
    hydration_render_steps_json: Optional[Dict[str, Any]] = None,
    hydration_output_hash: Optional[str] = None,
    hydration_output_text: Optional[str] = None,
    llm_request_meta_json: Optional[Dict[str, Any]] = None,
    tokens_prompt_base: Optional[int] = None,
    tokens_rules_injected: Optional[int] = None,
    tokens_memory_injected: Optional[int] = None,
    tokens_feedback_injected: Optional[int] = None,
    tokens_truncated: Optional[int] = None,
    force_commit: bool = False,
    force_commit_dsn: Optional[str] = None,
) -> Optional[int]:
    """
    Best-effort hydrated prompt trace insert.
    Must never break worker execution path.
    """
    payload = _safe_json_payload(task.get("payload_json"))
    chapter_id = str(
        payload.get("chapter_id")
        or (payload.get("job_config") or {}).get("chapter_id")
        or ""
    ) or None
    story_id = int(task.get("story_id") or 0) or None
    if not story_id:
        return None

    final_hash = hydration_output_hash
    if not final_hash and isinstance(hydration_output_text, str):
        final_hash = hashlib.sha256(hydration_output_text.encode("utf-8")).hexdigest()

    include_prompt_text = str(os.getenv("AGENT_TRACE_STORE_PROMPT_TEXT", "1")).strip().lower() not in (
        "0",
        "false",
        "off",
        "no",
    )
    prompt_text_value = hydration_output_text if include_prompt_text else None

    insert_params = (
        run_trace_id,
        story_id,
        chapter_id,
        int(task.get("id") or 0) or None,
        str(task.get("task_type") or ""),
        str(agent_name),
        prompt_version_id,
        context_snapshot_id,
        json.dumps(hydration_inputs_json or {}),
        json.dumps(hydration_render_steps_json or {}),
        final_hash,
        prompt_text_value,
        json.dumps(llm_request_meta_json or {}),
        tokens_prompt_base,
        tokens_rules_injected,
        tokens_memory_injected,
        tokens_feedback_injected,
        tokens_truncated,
    )

    def _insert_with_connection(target_conn) -> Optional[int]:
        cur = target_conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO public.agent_prompt_hydration_trace
                  (run_trace_id, story_id, chapter_id, task_id, task_type, agent_name,
                   prompt_version_id, context_snapshot_id,
                   hydration_inputs_json, hydration_render_steps_json,
                   hydration_output_hash, hydration_output_text, llm_request_meta_json,
                   tokens_prompt_base, tokens_rules_injected, tokens_memory_injected,
                   tokens_feedback_injected, tokens_truncated)
                VALUES
                  (%s, %s, %s, %s, %s, %s,
                   %s, %s,
                   %s::jsonb, %s::jsonb,
                   %s, %s, %s::jsonb,
                   %s, %s, %s, %s, %s)
                RETURNING id
                """,
                insert_params,
            )
            row = cur.fetchone()
            return int(row[0]) if row and row[0] is not None else None
        finally:
            cur.close()

    # Force-commit path (separate short-lived connection) so RUNNING tasks expose PRE_LLM trace immediately.
    if bool(force_commit):
        dsn = str(force_commit_dsn or os.getenv("DATABASE_URL") or "").strip()
        if dsn:
            tmp_conn = None
            try:
                tmp_conn = psycopg2.connect(dsn)
                tmp_conn.autocommit = True
                row_id = _insert_with_connection(tmp_conn)
                if row_id is not None:
                    return row_id
            except psycopg2.Error as err:
                if str(getattr(err, "pgcode", "") or "") not in ("42P01", "42703"):
                    _debug_log(
                        f"[agent_trace][force_commit_fallback][error] "
                        f"agent={agent_name} task_id={task.get('id')} story_id={task.get('story_id')} err={err}"
                    )
            except Exception as err:
                _debug_log(
                    f"[agent_trace][force_commit_fallback][error] "
                    f"agent={agent_name} task_id={task.get('id')} story_id={task.get('story_id')} err={err}"
                )
            finally:
                if tmp_conn is not None:
                    try:
                        tmp_conn.close()
                    except Exception:
                        pass

    try:
        return _insert_with_connection(conn)
    except psycopg2.Error as err:
        # Backward-compatible: migration may not be applied yet.
        if str(getattr(err, "pgcode", "") or "") in ("42P01", "42703"):
            return None
        _debug_log(
            f"[agent_trace][insert_agent_prompt_hydration_trace][error] "
            f"agent={agent_name} task_id={task.get('id')} story_id={task.get('story_id')} err={err}"
        )
        return None
    except Exception as err:
        _debug_log(
            f"[agent_trace][insert_agent_prompt_hydration_trace][error] "
            f"agent={agent_name} task_id={task.get('id')} story_id={task.get('story_id')} err={err}"
        )
        return None
    finally:
        pass


def insert_truth_conflict_registry_event(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
    agent_name: str,
    conflict_id: str,
    losing_rule_ref: str,
    winning_rule_ref: str,
    resolution_mode: str = "HIERARCHY",
    resolution_reason: str = "",
    payload_json: Optional[Dict[str, Any]] = None,
    job_id: Optional[int] = None,
    task_id: Optional[int] = None,
    run_trace_id: Optional[int] = None,
    context_snapshot_id: Optional[int] = None,
) -> Optional[int]:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO public.truth_conflict_registry
              (story_id, chapter_id, agent_name, job_id, task_id, run_trace_id, context_snapshot_id,
               conflict_id, losing_rule_ref, winning_rule_ref, resolution_mode, resolution_reason, payload_json)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s,
               %s, %s, %s, %s, %s, %s::jsonb)
            RETURNING id
            """,
            (
                int(story_id),
                chapter_id,
                str(agent_name or "SPLITTER"),
                job_id,
                task_id,
                run_trace_id,
                context_snapshot_id,
                str(conflict_id or "unknown_conflict"),
                str(losing_rule_ref or "unknown_loser"),
                str(winning_rule_ref or "unknown_winner"),
                str(resolution_mode or "HIERARCHY"),
                str(resolution_reason or "")[:2000],
                json.dumps(payload_json or {}),
            ),
        )
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else None
    except psycopg2.Error as err:
        if str(getattr(err, "pgcode", "") or "") in ("42P01", "42703"):
            return None
        _debug_log(
            f"[truth_conflict][insert][error] story_id={story_id} chapter_id={chapter_id} "
            f"conflict_id={conflict_id} err={err}"
        )
        return None
    except Exception as err:
        _debug_log(
            f"[truth_conflict][insert][error] story_id={story_id} chapter_id={chapter_id} "
            f"conflict_id={conflict_id} err={err}"
        )
        return None
    finally:
        cur.close()


def insert_shadow_run_pair(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
    agent_name: str,
    job_id: Optional[int] = None,
    task_id: Optional[int] = None,
    active_run_trace_id: Optional[int] = None,
    shadow_run_trace_id: Optional[int] = None,
    context_snapshot_id: Optional[int] = None,
    active_prompt_version_id: Optional[int] = None,
    shadow_prompt_version_id: Optional[int] = None,
    pair_status: str = "PLANNED",
    compare_json: Optional[Dict[str, Any]] = None,
) -> Optional[int]:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO public.shadow_run_pair
              (story_id, chapter_id, job_id, task_id, agent_name,
               active_run_trace_id, shadow_run_trace_id, context_snapshot_id,
               active_prompt_version_id, shadow_prompt_version_id, pair_status, compare_json, updated_at)
            VALUES
              (%s, %s, %s, %s, %s,
               %s, %s, %s,
               %s, %s, %s, %s::jsonb, now())
            RETURNING id
            """,
            (
                int(story_id),
                chapter_id,
                job_id,
                task_id,
                str(agent_name or "SPLITTER"),
                active_run_trace_id,
                shadow_run_trace_id,
                context_snapshot_id,
                active_prompt_version_id,
                shadow_prompt_version_id,
                str(pair_status or "PLANNED"),
                json.dumps(compare_json or {}),
            ),
        )
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else None
    except psycopg2.Error as err:
        if str(getattr(err, "pgcode", "") or "") in ("42P01", "42703"):
            return None
        _debug_log(
            f"[shadow_pair][insert][error] story_id={story_id} chapter_id={chapter_id} "
            f"agent={agent_name} task_id={task_id} err={err}"
        )
        return None
    except Exception as err:
        _debug_log(
            f"[shadow_pair][insert][error] story_id={story_id} chapter_id={chapter_id} "
            f"agent={agent_name} task_id={task_id} err={err}"
        )
        return None
    finally:
        cur.close()


def update_shadow_run_pair(
    conn,
    *,
    pair_id: int,
    pair_status: Optional[str] = None,
    shadow_run_trace_id: Optional[int] = None,
    compare_json: Optional[Dict[str, Any]] = None,
) -> bool:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.shadow_run_pair
            SET
              pair_status = COALESCE(%s, pair_status),
              shadow_run_trace_id = COALESCE(%s, shadow_run_trace_id),
              compare_json = COALESCE(%s::jsonb, compare_json),
              updated_at = now()
            WHERE id = %s
            """,
            (
                pair_status,
                shadow_run_trace_id,
                (json.dumps(compare_json) if compare_json is not None else None),
                int(pair_id),
            ),
        )
        return int(cur.rowcount or 0) > 0
    except psycopg2.Error as err:
        if str(getattr(err, "pgcode", "") or "") in ("42P01", "42703"):
            return False
        _debug_log(f"[shadow_pair][update][error] pair_id={pair_id} err={err}")
        return False
    except Exception as err:
        _debug_log(f"[shadow_pair][update][error] pair_id={pair_id} err={err}")
        return False
    finally:
        cur.close()


def insert_agent_memory_vector(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
    agent_name: str,
    source_run_trace_id: Optional[int],
    memory_type: str,
    memory_text: str,
    embedding: Optional[List[float]] = None,
    score: float = 0.0,
    tags: Optional[Dict[str, Any]] = None,
) -> Optional[int]:
    cur = conn.cursor()
    try:
        safe_text = str(memory_text or "").strip()
        if not safe_text:
            return None
        emb = [float(x) for x in (embedding or []) if isinstance(x, (int, float))]
        if len(emb) > 1024:
            emb = emb[:1024]
        cur.execute(
            """
            INSERT INTO public.agent_memory_vector
              (story_id, chapter_id, agent_name, source_run_trace_id, memory_type, memory_text, embedding_json, score, tags)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb)
            RETURNING id
            """,
            (
                int(story_id),
                chapter_id,
                str(agent_name),
                source_run_trace_id,
                str(memory_type),
                safe_text[:12000],
                json.dumps(emb),
                float(score),
                json.dumps(tags or {}),
            ),
        )
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else None
    except Exception as err:
        _debug_log(
            f"[agent_trace][insert_agent_context_snapshot][error] story_id={story_id} chapter_id={chapter_id} err={err}"
        )
        return None
    finally:
        cur.close()


def insert_agent_feedback_loop(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
    agent_name: str,
    run_trace_id: Optional[int],
    feedback_source: str,
    feedback_type: str,
    feedback_text: str,
    weight: float = 1.0,
    created_by: str = "worker",
) -> Optional[int]:
    cur = conn.cursor()
    try:
        text = str(feedback_text or "").strip()
        if not text:
            return None
        cur.execute(
            """
            INSERT INTO public.agent_feedback_loop
              (story_id, chapter_id, agent_name, run_trace_id, feedback_source, feedback_type, feedback_text, weight, status, created_by)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s, %s, 'ACTIVE', %s)
            RETURNING id
            """,
            (
                int(story_id),
                chapter_id,
                str(agent_name),
                run_trace_id,
                str(feedback_source),
                str(feedback_type),
                text[:4000],
                float(weight),
                str(created_by or "worker"),
            ),
        )
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else None
    except Exception as err:
        _debug_log(
            f"[agent_trace][insert_agent_memory_vector][error] story_id={story_id} agent={agent_name} chapter_id={chapter_id} err={err}"
        )
        return None
    finally:
        cur.close()


def insert_agent_context_snapshot(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
    snapshot_payload: Any,
) -> Optional[int]:
    """
    Best-effort snapshot insert for reproducibility.
    """
    cur = conn.cursor()
    try:
        payload = _safe_json_payload(snapshot_payload)
        payload_text = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        payload_hash = hashlib.sha256(payload_text.encode("utf-8")).hexdigest()
        cur.execute(
            """
            INSERT INTO public.agent_context_snapshot
              (story_id, chapter_id, snapshot_json, snapshot_hash)
            VALUES
              (%s, %s, %s::jsonb, %s)
            RETURNING id
            """,
            (story_id, chapter_id, payload_text, payload_hash),
        )
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else None
    except Exception as err:
        _debug_log(
            f"[agent_trace][insert_agent_feedback_loop][error] story_id={story_id} agent={agent_name} chapter_id={chapter_id} err={err}"
        )
        return None
    finally:
        cur.close()


def resolve_active_agent_prompt(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
    agent_name: str,
    task_id: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Resolve prompt by scope priority with canary experiment support:
    - If running experiment matches, assign baseline/candidate deterministically.
    - Else fallback to ACTIVE prompt by scope priority.
    Returns None when no active prompt is found or table is unavailable.
    """
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # 1) Canary experiment path (chapter -> story -> global).
        cur.execute(
            """
            WITH exp_candidates AS (
              SELECT
                e.id AS experiment_id,
                e.scope,
                e.story_id,
                e.chapter_id,
                e.baseline_version_id,
                e.candidate_version_id,
                e.traffic_percent,
                e.start_at,
                CASE e.scope
                  WHEN 'chapter' THEN 1
                  WHEN 'story' THEN 2
                  WHEN 'global' THEN 3
                  ELSE 9
                END AS scope_priority
              FROM public.agent_prompt_experiment e
              WHERE e.agent_name = %s
                AND e.status = 'RUNNING'
                AND (
                  (e.scope = 'chapter' AND e.story_id = %s AND e.chapter_id = %s)
                  OR (e.scope = 'story' AND e.story_id = %s)
                  OR (e.scope = 'global' AND e.story_id IS NULL)
                )
            )
            SELECT
              experiment_id,
              scope,
              baseline_version_id,
              candidate_version_id,
              traffic_percent
            FROM exp_candidates
            ORDER BY scope_priority ASC, start_at DESC, experiment_id DESC
            LIMIT 1
            """,
            (agent_name, story_id, chapter_id, story_id),
        )
        exp = cur.fetchone()
        if exp:
            key = f"{story_id}:{chapter_id or ''}:{int(task_id or 0)}:{agent_name}"
            bucket = int(hashlib.sha256(key.encode("utf-8")).hexdigest(), 16) % 100
            use_candidate = bucket < int(exp.get("traffic_percent") or 0)
            chosen_version_id = int(exp["candidate_version_id"] if use_candidate else exp["baseline_version_id"])

            cur.execute(
                """
                SELECT
                  apv.id AS version_id,
                  app.scope,
                  apv.system_prompt,
                  apv.developer_prompt,
                  apv.output_contract_json,
                  apv.guardrail_json
                FROM public.agent_prompt_version apv
                JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
                WHERE apv.id = %s
                LIMIT 1
                """,
                (chosen_version_id,),
            )
            picked = cur.fetchone()
            if picked:
                out = dict(picked)
                out["experiment_id"] = int(exp["experiment_id"])
                out["assignment"] = "CANDIDATE" if use_candidate else "BASELINE"
                out["traffic_percent"] = int(exp.get("traffic_percent") or 0)
                return out

        # 2) Active fallback path.
        cur.execute(
            """
            WITH candidates AS (
              SELECT
                apv.id AS version_id,
                app.scope,
                apv.system_prompt,
                apv.developer_prompt,
                apv.output_contract_json,
                apv.guardrail_json,
                apv.created_at,
                CASE app.scope
                  WHEN 'chapter' THEN 1
                  WHEN 'story' THEN 2
                  WHEN 'global' THEN 3
                  ELSE 9
                END AS scope_priority
              FROM public.agent_prompt_profile app
              JOIN public.agent_prompt_version apv
                ON apv.profile_id = app.id
              WHERE app.agent_name = %s
                AND app.status = 'ACTIVE'
                AND apv.status = 'ACTIVE'
                AND (
                  (app.scope = 'chapter' AND app.story_id = %s AND app.chapter_id = %s)
                  OR (app.scope = 'story' AND app.story_id = %s)
                  OR (app.scope = 'global' AND app.story_id IS NULL)
                )
            )
            SELECT
              version_id,
              scope,
              system_prompt,
              developer_prompt,
              output_contract_json,
              guardrail_json
            FROM candidates
            ORDER BY scope_priority ASC, created_at DESC, version_id DESC
            LIMIT 1
            """,
            (agent_name, story_id, chapter_id, story_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        out = dict(row)
        out["experiment_id"] = None
        out["assignment"] = "ACTIVE"
        out["traffic_percent"] = None
        return out
    except Exception:
        # Non-blocking: if schema not ready or query fails, fallback to code prompts.
        return None
    finally:
        cur.close()


def load_agent_prompt_version_by_id(conn, version_id: int) -> Optional[Dict[str, Any]]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT
              apv.id AS version_id,
              app.scope,
              apv.system_prompt,
              apv.developer_prompt,
              apv.output_contract_json,
              apv.guardrail_json
            FROM public.agent_prompt_version apv
            JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
            WHERE apv.id = %s
            LIMIT 1
            """,
            (int(version_id),),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    except Exception:
        return None
    finally:
        cur.close()


def resolve_agent_profile_runtime(conn, *, story_id: int, agent_name: str) -> Dict[str, Any]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT id, species_name, nick_name, base_dna_id, experience_pts, level, is_sealed
            FROM public.agent_profiles
            WHERE species_name = %s
            ORDER BY level DESC, experience_pts DESC, id DESC
            LIMIT 1
            """,
            (str(agent_name),),
        )
        profile = cur.fetchone()
        if not profile:
            return {"profile": None, "slots": []}
        profile_id = int(profile["id"])
        cur.execute(
            """
            SELECT id, slot_type, artifact_ref_type, artifact_id, stats_mod
            FROM public.agent_equipment_slots
            WHERE agent_profile_id = %s
              AND story_id = %s
              AND is_active = true
            ORDER BY updated_at DESC, id DESC
            """,
            (profile_id, int(story_id)),
        )
        slots = cur.fetchall() or []
        return {"profile": dict(profile), "slots": [dict(x) for x in slots]}
    except Exception:
        return {"profile": None, "slots": []}
    finally:
        cur.close()


def load_memory_text_by_id(conn, memory_id: int) -> Optional[str]:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT memory_text
            FROM public.agent_memory_vector
            WHERE id = %s
            LIMIT 1
            """,
            (int(memory_id),),
        )
        row = cur.fetchone()
        if not row:
            return None
        text = row[0]
        return str(text).strip() if isinstance(text, str) else None
    except Exception:
        return None
    finally:
        cur.close()


def is_job_cancelled(conn, job_id: int) -> bool:
    cur = conn.cursor()
    try:
        cur.execute("SELECT status FROM public.ingest_job WHERE id = %s LIMIT 1", (job_id,))
        row = cur.fetchone()
        return bool(row and row[0] in ("CANCELLED", "REJECTED"))
    finally:
        cur.close()


def claim_next_memory_task(conn) -> Optional[Dict[str, Any]]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("BEGIN")
        cur.execute(
            """
            SELECT id, story_id, scene_id, scene_version_id, algo_version, status, retry_count
            FROM public.memory_enrich_task
            WHERE status = 'READY'
              AND available_at <= NOW()
            ORDER BY available_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        )
        task = cur.fetchone()
        if task is None:
            cur.execute("COMMIT")
            return None

        cur.execute(
            """
            UPDATE public.memory_enrich_task
            SET status = 'RUNNING',
                last_error = NULL,
                updated_at = now()
            WHERE id = %s
            """,
            (int(task["id"]),),
        )
        cur.execute("COMMIT")
        return dict(task)
    except Exception:
        cur.execute("ROLLBACK")
        raise
    finally:
        cur.close()


def claim_next_agent_janitor_task(conn) -> Optional[Dict[str, Any]]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("BEGIN")
        cur.execute(
            """
            SELECT id, story_id, job_id, chapter_id, payload_json, retry_count
            FROM public.agent_janitor_task
            WHERE status = 'READY'
              AND available_at <= NOW()
            ORDER BY available_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        )
        task = cur.fetchone()
        if task is None:
            cur.execute("COMMIT")
            return None
        cur.execute(
            """
            UPDATE public.agent_janitor_task
            SET status = 'RUNNING',
                last_error = NULL,
                updated_at = now()
            WHERE id = %s
            """,
            (int(task["id"]),),
        )
        cur.execute("COMMIT")
        return dict(task)
    except Exception:
        cur.execute("ROLLBACK")
        raise
    finally:
        cur.close()


def mark_agent_janitor_task_done(conn, task_id: int) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.agent_janitor_task
            SET status = 'DONE',
                last_error = NULL,
                updated_at = now()
            WHERE id = %s
            """,
            (task_id,),
        )
    finally:
        cur.close()


def mark_agent_janitor_task_failed(conn, task_id: int, err: str, max_retries: int = 3) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.agent_janitor_task
            SET retry_count = retry_count + 1,
                status = CASE WHEN retry_count + 1 >= %s THEN 'FAILED' ELSE 'READY' END,
                available_at = CASE WHEN retry_count + 1 >= %s THEN available_at ELSE (now() + interval '60 seconds') END,
                last_error = %s,
                updated_at = now()
            WHERE id = %s
            """,
            (max_retries, max_retries, err[:3000], task_id),
        )
    finally:
        cur.close()


def load_scene_version_text(conn, story_id: int, scene_id: int, scene_version_id: int) -> Optional[str]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT v.text_content
            FROM public.narrative_scene_version v
            JOIN public.narrative_scene s ON s.id = v.scene_id
            WHERE v.id = %s
              AND v.scene_id = %s
              AND v.story_id = %s
              AND s.story_id = %s
            LIMIT 1
            """,
            (scene_version_id, scene_id, story_id, story_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        text = row.get("text_content")
        if not isinstance(text, str):
            return None
        return text
    finally:
        cur.close()


def save_memory_pack(
    conn,
    story_id: int,
    scene_id: int,
    scene_version_id: int,
    algo_version: str,
    pack: Dict[str, Any],
) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            DELETE FROM public.canon_fact
            WHERE story_id = %s
              AND scene_id = %s
              AND scene_version_id = %s
              AND algo_version = %s
            """,
            (story_id, scene_id, scene_version_id, algo_version),
        )
        cur.execute(
            """
            DELETE FROM public.timeline_anchor
            WHERE story_id = %s
              AND scene_id = %s
              AND scene_version_id = %s
              AND algo_version = %s
            """,
            (story_id, scene_id, scene_version_id, algo_version),
        )

        for fact in pack.get("facts", []):
            cur.execute(
                """
                INSERT INTO public.canon_fact
                  (story_id, scene_id, scene_version_id, algo_version, subject, predicate, object, confidence, tags, source_trace)
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (scene_version_id, algo_version, subject, predicate, object)
                DO UPDATE SET
                  confidence = EXCLUDED.confidence,
                  tags = EXCLUDED.tags,
                  source_trace = EXCLUDED.source_trace
                """,
                (
                    story_id,
                    scene_id,
                    scene_version_id,
                    algo_version,
                    str(fact.get("subject") or ""),
                    str(fact.get("predicate") or ""),
                    str(fact.get("object") or ""),
                    float(fact.get("confidence") or 0),
                    fact.get("tags") or [],
                    Json(fact.get("source_trace") or {}),
                ),
            )

        for event in pack.get("timeline", []):
            cur.execute(
                """
                INSERT INTO public.timeline_anchor
                  (story_id, scene_id, scene_version_id, algo_version, event_label, relative_time, absolute_time, location, participants, source_trace)
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (scene_version_id, algo_version, event_label)
                DO UPDATE SET
                  relative_time = EXCLUDED.relative_time,
                  absolute_time = EXCLUDED.absolute_time,
                  location = EXCLUDED.location,
                  participants = EXCLUDED.participants,
                  source_trace = EXCLUDED.source_trace
                """,
                (
                    story_id,
                    scene_id,
                    scene_version_id,
                    algo_version,
                    str(event.get("event_label") or ""),
                    event.get("relative_time"),
                    event.get("absolute_time"),
                    event.get("location"),
                    event.get("participants") or [],
                    Json(event.get("source_trace") or {}),
                ),
            )

        style = pack.get("style") or {}
        cur.execute(
            """
            INSERT INTO public.style_profile_scene
              (story_id, scene_id, scene_version_id, algo_version,
               sentence_complexity, dialogue_ratio, metaphor_density,
               sensory_sight, sensory_sound, sensory_touch, sensory_smell, sensory_taste)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (scene_version_id, algo_version)
            DO UPDATE SET
              sentence_complexity = EXCLUDED.sentence_complexity,
              dialogue_ratio = EXCLUDED.dialogue_ratio,
              metaphor_density = EXCLUDED.metaphor_density,
              sensory_sight = EXCLUDED.sensory_sight,
              sensory_sound = EXCLUDED.sensory_sound,
              sensory_touch = EXCLUDED.sensory_touch,
              sensory_smell = EXCLUDED.sensory_smell,
              sensory_taste = EXCLUDED.sensory_taste
            """,
            (
                story_id,
                scene_id,
                scene_version_id,
                algo_version,
                float(style.get("sentence_complexity") or 0),
                float(style.get("dialogue_ratio") or 0),
                float(style.get("metaphor_density") or 0),
                float(style.get("sensory_sight") or 0),
                float(style.get("sensory_sound") or 0),
                float(style.get("sensory_touch") or 0),
                float(style.get("sensory_smell") or 0),
                float(style.get("sensory_taste") or 0),
            ),
        )
    finally:
        cur.close()


def mark_memory_task_done(conn, task_id: int) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.memory_enrich_task
            SET status = 'DONE',
                last_error = NULL,
                updated_at = now()
            WHERE id = %s
            """,
            (task_id,),
        )
    finally:
        cur.close()


def mark_memory_task_failed(conn, task_id: int, err: str, max_retries: int) -> None:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            UPDATE public.memory_enrich_task
            SET retry_count = retry_count + 1,
                status = CASE WHEN retry_count + 1 >= %s THEN 'FAILED' ELSE 'READY' END,
                last_error = %s,
                updated_at = now()
            WHERE id = %s
            RETURNING retry_count, status
            """,
            (max_retries, err[:3000], task_id),
        )
        cur.fetchone()
    finally:
        cur.close()


def ensure_task_idempotency_key(
    conn,
    task_id: int,
    story_id: int,
    chapter_text: str,
    runtime_mode: Optional[str],
    context_hash: Optional[str],
    existing_key: Optional[str],
) -> str:
    key = (existing_key or "").strip()
    if key:
        return key
    mode = (runtime_mode or "").strip().upper() or "DEFAULT"
    ctx = (context_hash or "").strip() or "noctx"
    digest = hashlib.sha256(f"{story_id}:split_v2:{mode}:{ctx}:{chapter_text}".encode("utf-8")).hexdigest()
    key = f"split_v2:{digest}"
    cur = conn.cursor()
    try:
        try:
            cur.execute(
                """
                UPDATE public.ingest_task
                SET idempotency_key = %s, updated_at = now()
                WHERE id = %s
                """,
                (key, task_id),
            )
        except psycopg2.Error:
            fallback_key = f"{key}:task:{task_id}"
            cur.execute(
                """
                UPDATE public.ingest_task
                SET idempotency_key = %s, updated_at = now()
                WHERE id = %s
                """,
                (fallback_key, task_id),
            )
            key = fallback_key
    finally:
        cur.close()
    return key


def load_cached_split_result(conn, story_id: int, task_id: int, idempotency_key: str, parse_jsonb) -> Optional[Dict[str, Any]]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT result_json
            FROM public.ingest_task
            WHERE story_id = %s
              AND task_type = 'CHAPTER_SPLIT_LLM'
              AND idempotency_key = %s
              AND status = 'DONE'
              AND id <> %s
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """,
            (story_id, idempotency_key, task_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        parsed = parse_jsonb(row.get("result_json"))
        if isinstance(parsed.get("scenes"), list) and parsed["scenes"]:
            return parsed
        return None
    finally:
        cur.close()


def apply_split_result(conn, task: Dict[str, Any], result: Dict[str, Any]) -> None:
    cur = conn.cursor()
    try:
        task_id = int(task["id"])
        attempts = int(task.get("attempts") or 0)
        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'DONE',
                error = NULL,
                result_json = %s::jsonb,
                updated_at = now()
            WHERE id = %s AND attempts = %s
            """,
            (Json(result), task_id, attempts),
        )
        if cur.rowcount == 0:
            raise ValueError(f"Optimistic lock failed for task {task_id}: expected attempts={attempts}")

        is_system_replay = str(task.get("created_by") or "") == "system_replay"

        if is_system_replay:
            # Auto-learning from replay: Insert into supervisor_memory
            strategy = result.get("strategy_selected")
            decision = result.get("supervisor_decision")
            signal = result.get("quality_self_signal")
            chapter_id = result.get("chapter_id") or "ch00"
            
            # If we are replaying, we assume the outcome is targeted success (AUTO-APPROVED)
            cur.execute(
                """
                INSERT INTO public.supervisor_memory
                  (story_id, job_id, chapter_task_id, chapter_id, label, strategy_selected,
                   supervisor_decision, human_outcome, quality_self_signal, is_reprocess,
                   signals_json, created_at, updated_at)
                VALUES
                  (%s, %s, %s, %s, 'SUCCESS_AFTER_REPROCESS', %s, %s, 'APPROVED_AUTO', %s, true, '{}'::jsonb, now(), now())
                ON CONFLICT (story_id, chapter_task_id) DO UPDATE
                  SET label = EXCLUDED.label,
                      human_outcome = EXCLUDED.human_outcome,
                      updated_at = now()
                """,
                (
                    int(task["story_id"]),
                    int(task["job_id"]),
                    int(task["id"]),
                    chapter_id,
                    strategy,
                    decision,
                    signal,
                ),
            )

        cur.execute(
            """
            UPDATE public.ingest_job
            SET status = CASE
                  WHEN status = 'CANCELLED' THEN 'CANCELLED'
                  WHEN status = 'REJECTED' THEN 'REJECTED'
                  WHEN EXISTS (
                    SELECT 1
                    FROM public.ingest_task t2
                    WHERE t2.job_id = %s
                      AND t2.task_type = 'CHAPTER_SPLIT_LLM'
                      AND t2.status IN ('PENDING', 'READY', 'RUNNING')
                  ) THEN 'RUNNING'
                  WHEN %s = true THEN 'DONE'
                  ELSE 'AWAIT_APPROVAL'
                END,
                split_draft_json = CASE
                  WHEN status IN ('CANCELLED', 'REJECTED') THEN split_draft_json
                  ELSE %s::jsonb
                END,
                completed_tasks = (
                  SELECT count(*) FROM public.ingest_task
                  WHERE job_id = %s AND status = 'DONE'
                ),
                updated_at = now()
            WHERE id = %s
            """,
            (int(task["job_id"]), is_system_replay, Json(result), int(task["job_id"]), int(task["job_id"])),
        )
    finally:
        cur.close()

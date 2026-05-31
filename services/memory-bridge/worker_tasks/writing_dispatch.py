from __future__ import annotations

import json
import re
import sys
from typing import Any, Dict

from psycopg2.extras import Json

from worker_common import parse_jsonb, chapter_no_from_source_path, build_chapter_id
from worker_ingest_repo import (
    insert_agent_context_snapshot,
    insert_agent_prompt_hydration_trace,
    insert_agent_run_trace,
    mark_task_done,
    mark_task_wait_review,
)

def process_memory_rollup_task(conn, task: Dict[str, Any]) -> None:
    import json as _json

    payload = parse_jsonb(task.get("payload_json"))
    story_id = int(task["story_id"])
    created_by = str(task.get("created_by") or "system").strip() or "system"
    from worker_memory_rollup import run_memory_rollup_v4
    result = run_memory_rollup_v4(
        conn,
        story_id=story_id,
        payload=payload,
        created_by=created_by,
    )
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'DONE',
                updated_at = now(),
                error = NULL,
                result_json = %s::jsonb
            WHERE id = %s
            """,
            (_json.dumps(result), int(task["id"])),
        )
    finally:
        cur.close()

def process_writing_planning_task(conn, task: Dict[str, Any]) -> None:
    from worker_writing_planning import generate_beat_map
    from worker_ingest_repo import mark_task_wait_review
    from worker_memory_context import build_planning_context_v5
    import json as _json

    payload = parse_jsonb(task.get("payload_json"))
    story_id = int(task["story_id"])
    analysis_result = payload.get("analysis_result")
    instructions = str(payload.get("instructions") or "Plan scenes for a new chapter.").strip()
    chapter_no = payload.get("chapter_no") or payload.get("seq_no")
    chapter_id = str(payload.get("chapter_id") or (analysis_result or {}).get("chapter_id") or "").strip() or None
    memory_context = build_planning_context_v5(
        conn,
        story_id,
        chapter_id,
        instructions,
    )
    truth_context_pack = analysis_result.get("truth_context_pack_v1") if isinstance(analysis_result, dict) and isinstance(analysis_result.get("truth_context_pack_v1"), dict) else {}
    plan = generate_beat_map(
        conn,
        story_id,
        analysis_result,
        instructions,
        chapter_no=chapter_no,
        chapter_id=chapter_id,
        memory_context=memory_context,
        truth_context_pack=truth_context_pack,
    )

    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.ingest_task
            SET result_json = %s::jsonb,
                updated_at = now()
            WHERE id = %s
            """,
            (_json.dumps(plan), int(task["id"]))
        )
    finally:
        cur.close()

    # Move to WAIT_REVIEW for the Interactive Planning Chat
    mark_task_wait_review(conn, int(task["id"]), int(task["job_id"]), int(task.get("attempts") or 0))

def process_writing_prose_task(conn, task: Dict[str, Any]) -> None:
    from worker_writing_prose import process_prose_generation
    from worker_constants import SPLIT_MAX_CHARS
    import json as _json

    payload = parse_jsonb(task.get("payload_json"))
    story_id = int(task["story_id"])
    scene_id = int(payload.get("scene_id") or 0)
    beat = payload.get("beat") or {}
    instructions = str(payload.get("instructions") or "Write prose for this scene.").strip()
    chapter_no = payload.get("chapter_no") or payload.get("seq_no")
    chapter_id = str(payload.get("chapter_id") or "").strip() or None
    truth_context_pack = payload.get("truth_context_pack_v1") if isinstance(payload.get("truth_context_pack_v1"), dict) else {}

    prose_result = process_prose_generation(
        conn,
        story_id,
        scene_id,
        beat,
        instructions,
        chapter_no=chapter_no,
        chapter_id=chapter_id,
        truth_context_pack=truth_context_pack,
    )
    if isinstance(prose_result, dict):
        prose_text = str(prose_result.get("prose") or "").strip()
        if not prose_text:
            prose_text = str(prose_result).strip()
    else:
        prose_text = str(prose_result or "").strip()
        prose_result = {"prose": prose_text}

    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'DONE',
                updated_at = now(),
                result_json = %s::jsonb
            WHERE id = %s
            """,
            (_json.dumps({**prose_result, "prose": prose_text}), int(task["id"]))
        )
    finally:
        cur.close()

def process_writing_continuity_task(conn, task: Dict[str, Any]) -> None:
    from worker_writing_continuity import extract_state_delta, merge_delta_to_snapshot, save_scene_state
    from worker_writing_prose import load_previous_snapshot
    import json as _json

    payload = parse_jsonb(task.get("payload_json"))
    story_id = int(task["story_id"])
    scene_id = int(payload.get("scene_id") or 0)
    scene_version_id = int(payload.get("scene_version_id") or 0)
    prose = str(payload.get("prose") or "").strip()
    algo_version = str(payload.get("algo_version") or "v1")
    continuity_retry_count = int(payload.get("continuity_retry_count") or 0)

    prev_snapshot = load_previous_snapshot(conn, story_id, scene_id) if scene_id > 0 else {}
    delta_result = extract_state_delta(conn, prose, prev_snapshot)

    delta = delta_result.get("delta") or {}
    logic_flags = delta_result.get("logic_flags") or []
    high_severity = any(str((f or {}).get("severity") or "").strip().lower() in ("high", "critical", "error") for f in logic_flags if isinstance(f, dict))

    snapshot_saved = False
    if scene_id > 0 and scene_version_id > 0:
        new_snapshot = merge_delta_to_snapshot(prev_snapshot, delta)
        save_scene_state(conn, story_id, scene_id, scene_version_id, new_snapshot, algo_version, validation_errors=logic_flags)
        snapshot_saved = True

    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'DONE',
                updated_at = now(),
                result_json = %s::jsonb
            WHERE id = %s
            """,
            (_json.dumps({
                "delta": delta,
                "logic_flags": logic_flags,
                "snapshot_saved": snapshot_saved,
                "continuity_severity": "high" if high_severity else "normal",
                "continuity_retry_count": continuity_retry_count,
            }), int(task["id"]))
        )
    finally:
        cur.close()

def process_writing_supervisor_task(conn, task: Dict[str, Any]) -> None:
    from worker_writing_supervisor import supervise_prose
    import json as _json

    payload = parse_jsonb(task.get("payload_json"))
    story_id = int(task["story_id"])
    prose = str(payload.get("prose") or "").strip()
    target_wc = int(payload.get("target_word_count") or 3000)
    instructions = str(payload.get("instructions") or "Polish the final chapter.").strip()
    continuity_flags = payload.get("continuity_flags") or []
    chapter_no = payload.get("chapter_no") or payload.get("seq_no")

    result = supervise_prose(conn, story_id, prose, target_wc, instructions, continuity_flags=continuity_flags, chapter_no=chapter_no)

    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'DONE',
                updated_at = now(),
                result_json = %s::jsonb
            WHERE id = %s
            """,
            (_json.dumps(result), int(task["id"]))
        )
    finally:
        cur.close()

def _save_v3_task_result(conn, task: Dict[str, Any], result: Dict[str, Any]) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE public.ingest_task
            SET result_json = %s::jsonb
            WHERE id = %s
            """,
            (Json(result), int(task["id"]))
        )
    finally:
        cur.close()

def process_chapter_write_v3_task(conn, task: Dict[str, Any]) -> None:
    from worker_chapter_writer import generate_chapter_v3
    payload = task.get("payload_json") or {}
    story_id = int(task.get("story_id") or 0)
    chapter_id = payload.get("chapter_id")
    chapter_goal = payload.get("chapter_goal")
    working_set = payload.get("working_set")
    style_options = payload.get("style_options")
    writing_context = payload.get("writing_context")
    writing_context_preflight = payload.get("writing_context_preflight")
    writing_context_debug = payload.get("writing_context_debug")

    if not story_id or not chapter_id or not working_set:
        raise ValueError("MISSING_REQUIRED_V3_PAYLOAD_FIELDS")

    # Generate Prose
    llm_response = generate_chapter_v3(
        conn,
        story_id,
        chapter_id,
        working_set,
        chapter_goal,
        style_options,
        writing_context,
        writing_context_preflight,
        writing_context_debug,
        task,
    )

    prose = llm_response.get("prose")
    guard = (
        llm_response.get("metadata", {}).get("v3_guard", {})
        if isinstance(llm_response.get("metadata"), dict)
        else {}
    )
    if guard.get("status") == "blocked":
        raise RuntimeError(
            "CHAPTER_WRITE_V3_GUARDRAIL_BLOCK:"
            + json.dumps(
                {
                    "error_code": "CHAPTER_WRITE_V3_GUARDRAIL_BLOCK",
                    "guard_fail_reasons": guard.get("fail_reasons") or [],
                    "guard_status": guard.get("status"),
                    "metadata": llm_response.get("metadata") if isinstance(llm_response.get("metadata"), dict) else {},
                    "scene_markers": llm_response.get("scene_markers") if isinstance(llm_response.get("scene_markers"), list) else [],
                },
                ensure_ascii=True,
            )
        )
    if not prose:
        raise RuntimeError("LLM_PROSE_GENERATION_FAILED")

    cur = conn.cursor()
    try:
        # Save to chapter_draft
        cur.execute(
            """
            INSERT INTO public.chapter_draft (story_id, chapter_id, full_text, status, metadata_json)
            VALUES (%s, %s, %s, 'DRAFT', %s)
            ON CONFLICT (story_id, chapter_id)
            DO UPDATE SET
                full_text = EXCLUDED.full_text,
                status = 'DRAFT',
                metadata_json = EXCLUDED.metadata_json,
                updated_at = now()
            """,
            (story_id, chapter_id, prose, Json(llm_response))
        )

        cur.execute(
            """
            UPDATE public.ingest_task
            SET result_json = %s::jsonb
            WHERE id = %s
            """,
            (Json(llm_response), int(task["id"]))
        )
        mark_task_done(
            conn,
            int(task["id"]),
            int(task["job_id"]),
            int(task.get("attempts") or 0),
        )
    finally:
        cur.close()
def process_chapter_ledger_task(conn, task: Dict[str, Any]) -> None:
    from worker_chapter_ledger_extractor import extract_ledger
    from worker_chapter_auditor import audit_chapter

    payload = task.get("payload_json") or {}
    story_id = int(task.get("story_id") or 0)
    chapter_id = payload.get("chapter_id")
    chapter_goal = payload.get("chapter_goal")
    working_set = payload.get("working_set")

    # 1. Load prose from chapter_draft
    cur = conn.cursor()
    prose = None
    try:
        cur.execute(
            "SELECT full_text FROM public.chapter_draft WHERE story_id = %s AND chapter_id = %s",
            (story_id, chapter_id)
        )
        row = cur.fetchone()
        if row:
            prose = row[0]
    finally:
        cur.close()

    if not prose:
        raise ValueError("PROSE_NOT_FOUND_FOR_LEDGER_EXTRACTION")

    # 2. Extract Ledger
    ledger_data = extract_ledger(prose, working_set, chapter_goal)

    # 3. Audit Chapter
    audit_issues = audit_chapter(prose, working_set, chapter_goal)

    cur = conn.cursor()
    try:
        # Save Ledger
        cur.execute(
            """
            INSERT INTO public.chapter_ledger
            (story_id, chapter_id, added_facts, modified_states, resolved_loops, unresolved_loops, metadata_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (story_id, chapter_id)
            DO UPDATE SET
                added_facts = EXCLUDED.added_facts,
                modified_states = EXCLUDED.modified_states,
                resolved_loops = EXCLUDED.resolved_loops,
                unresolved_loops = EXCLUDED.unresolved_loops,
                metadata_json = EXCLUDED.metadata_json,
                is_stale = false,
                stale_reason = NULL,
                updated_at = now()
            """,
            (
                story_id,
                chapter_id,
                Json(ledger_data.get("added_facts", [])),
                Json(ledger_data.get("modified_states", [])),
                Json(ledger_data.get("resolved_loops", [])),
                Json(ledger_data.get("unresolved_loops", [])),
                Json(ledger_data.get("metadata", {}))
            )
        )

        # Save Continuity Issues
        for issue in audit_issues:
            raw_severity = str(issue.get("severity") or "LOW").upper()
            severity = {
                "CRITICAL": "CRITICAL",
                "MAJOR": "HIGH",
                "HIGH": "HIGH",
                "MEDIUM": "MEDIUM",
                "MINOR": "LOW",
                "LOW": "LOW",
            }.get(raw_severity, "LOW")
            cur.execute(
                """
                INSERT INTO public.chapter_continuity_issue
                (story_id, chapter_id, issue_type, severity, description, payload, auto_patch_available, patch_suggestion)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    story_id,
                    chapter_id,
                    issue.get("issue_code") or issue.get("issue_type") or "UNKNOWN",
                    severity,
                    issue.get("message") or issue.get("description") or "",
                    Json({
                        "location": issue.get("location", {}),
                        "raw_issue": issue,
                    }),
                    issue.get("auto_patch_available", False),
                    issue.get("patch_suggestion"),
                )
            )

        cur.execute(
            """
            UPDATE public.ingest_task
            SET result_json = %s::jsonb
            WHERE id = %s
            """,
            (Json({"ledger": ledger_data, "issues_count": len(audit_issues)}), int(task["id"]))
        )
        mark_task_done(
            conn,
            int(task["id"]),
            int(task["job_id"]),
            int(task.get("attempts") or 0),
        )
    finally:
        cur.close()
def process_memory_rollup_v3_task(conn, task: Dict[str, Any]) -> None:
    from worker_memory_rollup_v3 import run_memory_rollup_v3
    payload = task.get("payload_json") or {}
    story_id = int(task.get("story_id") or 0)
    chapter_id = payload.get("chapter_id")

    if not story_id or not chapter_id:
        raise ValueError("MISSING_REQUIRED_V3_ROLLUP_FIELDS")

    # Run Rollup
    result = run_memory_rollup_v3(conn, story_id, chapter_id)

    if result.get("status") == "OK":
        _save_v3_task_result(conn, task, result)
        mark_task_done(
            conn,
            int(task["id"]),
            int(task["job_id"]),
            int(task.get("attempts") or 0),
        )
    else:
        # If skipped, we still mark as done but with info
        _save_v3_task_result(conn, task, result)
        mark_task_done(
            conn,
            int(task["id"]),
            int(task["job_id"]),
            int(task.get("attempts") or 0),
        )

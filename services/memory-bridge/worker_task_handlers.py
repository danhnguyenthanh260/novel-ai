from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Any, Dict

from psycopg2.extras import Json

from worker_common import (
    parse_jsonb,
    parse_split_controls,
    chapter_no_from_source_path,
    split_scenes,
    repair_chapter_text,
    split_lock_spans,
    in_locked_span,
    chunk_text,
    coerce_boundaries,
    parse_json_text,
    call_llm_json,
    llm_can_run,
    llm_consume_call,
    llm_boundaries_for_chunk,
    heuristic_boundaries,
    nearby_natural_boundaries,
    ends_with_terminal_punct,
    starts_with_lower_or_punct,
    is_abbrev_or_name_split_at,
    is_quote_continuity_break_at,
    boundary_penalty,
    boundary_issue_score,
    refine_boundary,
    refine_split_points,
    normalize_split_points,
    llm_semantic_resplit_offsets,
    best_boundary_candidate,
    autofix_split_points,
    snap_boundary,
    normalize_boundaries,
    scene_title_summary,
    chapter_title_from_text,
    build_chapter_id,
    build_workunit_id,
    build_manual_split_proposal,
    build_split_proposal,
    load_cached_split_result,
    load_review_policy,
)

from worker_ingest_repo import (
    load_source_doc_text,
    ensure_task_idempotency_key,
    apply_split_result,
    next_seq_start,
    insert_scene_with_version,
    mark_task_done,
    mark_task_wait_review,
    set_scene_status,
    count_new_facts,
    load_chapter_text_basis_from_split_task,
    insert_agent_context_snapshot,
    insert_agent_run_trace,
    insert_agent_prompt_hydration_trace,
    insert_truth_conflict_registry_event,
    insert_shadow_run_pair,
    update_shadow_run_pair,
    resolve_active_agent_prompt,
    load_agent_prompt_version_by_id,
)

from worker_narrative_handlers import (
    process_narrative_start_task,
    process_narrative_stylist_task,
    process_narrative_critic_task,
    process_narrative_refine_task,
    process_narrative_finalize_task,
)

from worker_constants import SPLIT_MAX_CHARS

# some other helpers come from memory pack
from worker_memory_pack import (
    extract_entities,
    extract_timeline_events,
    compute_confidence,
)

HISTORIAN_PROJECTION_STATIC_LIMIT = max(20, min(1000, int(str(os.getenv("HISTORIAN_NEO4J_PROJECTION_STATIC_LIMIT", "200")).strip() or "200")))


def _http_post_json(url: str, payload: Dict[str, Any], timeout_sec: int = 20) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=True).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=max(2, int(timeout_sec))) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    parsed = json.loads(raw) if raw else {}
    return parsed if isinstance(parsed, dict) else {}


def _sync_neo4j_projection(story_id: int, static_facts: list[Dict[str, Any]]) -> Dict[str, Any]:
    enabled = str(os.getenv("HISTORIAN_NEO4J_ENABLED", "0")).strip().lower() in ("1", "true", "yes", "on")
    base = str(os.getenv("HISTORIAN_MCP_BASE_URL", "")).strip().rstrip("/")
    if not enabled:
        return {"status": "disabled", "reason": "HISTORIAN_NEO4J_ENABLED_OFF"}
    if not base:
        return {"status": "disabled", "reason": "HISTORIAN_MCP_BASE_URL_MISSING"}
    payload = {
        "story_id": int(story_id),
        "facts": static_facts[:HISTORIAN_PROJECTION_STATIC_LIMIT],
    }
    try:
        res = _http_post_json(f"{base}/v1/historian/neo4j-upsert", payload, timeout_sec=25)
        if not bool(res.get("ok")):
            return {
                "status": "error",
                "error": str(res.get("error") or "NEO4J_UPSERT_FAILED")[:240],
                "upserted": int(res.get("upserted") or 0),
                "skipped": int(res.get("skipped") or 0),
            }
        return {
            "status": "ok",
            "upserted": int(res.get("upserted") or 0),
            "skipped": int(res.get("skipped") or 0),
            "relation_types": res.get("relation_types") if isinstance(res.get("relation_types"), dict) else {},
        }
    except (urllib.error.URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as err:
        return {"status": "error", "error": str(err)[:240], "upserted": 0, "skipped": 0}


def _shadow_no_write_snapshot(conn, *, story_id: int, chapter_id: str | None) -> Dict[str, int]:
    """
    Capture lightweight counters that must remain unchanged for shadow runs.
    Best-effort only: return empty dict on query issues.
    """
    cur = conn.cursor()
    try:
        snapshot: Dict[str, int] = {}
        try:
            cur.execute(
                "SELECT count(*) FROM public.split_strategy_profile WHERE story_id = %s",
                (story_id,),
            )
            row = cur.fetchone()
            snapshot["split_strategy_profile"] = int(row[0] or 0) if row else 0
        except Exception:
            snapshot["split_strategy_profile"] = -1
        try:
            cur.execute(
                "SELECT count(*) FROM public.split_feedback WHERE story_id = %s",
                (story_id,),
            )
            row = cur.fetchone()
            snapshot["split_feedback"] = int(row[0] or 0) if row else 0
        except Exception:
            snapshot["split_feedback"] = -1
        if chapter_id:
            try:
                cur.execute(
                    """
                    SELECT count(*) FROM public.truth_conflict_registry
                    WHERE story_id = %s AND chapter_id = %s
                    """,
                    (story_id, chapter_id),
                )
                row = cur.fetchone()
                snapshot["truth_conflict_registry"] = int(row[0] or 0) if row else 0
            except Exception:
                snapshot["truth_conflict_registry"] = -1
        return snapshot
    finally:
        cur.close()


def _idempotency_context_hash_hint(split_controls: Dict[str, Any]) -> str:
    context_window = split_controls.get("context_window") if isinstance(split_controls.get("context_window"), dict) else {}
    payload = {
        "runtime_mode": str(split_controls.get("runtime_mode") or "").strip().upper() or "DEFAULT",
        "context_pack_version": str(split_controls.get("context_pack_version") or "").strip() or "context_pack_v1",
        "preference_rule_version": str(split_controls.get("preference_rule_version") or "").strip() or "pref_rule_v1",
        "story_summary": str(context_window.get("story_summary") or "").strip()[:1200],
        "arc_context": str(context_window.get("arc_context") or "").strip()[:1200],
        "approved_context_ids": [
            str(x).strip()[:120]
            for x in (context_window.get("approved_context_ids") if isinstance(context_window.get("approved_context_ids"), list) else [])
            if str(x).strip()
        ][:20],
        "golden_chapter_ids": [
            str(x).strip()[:120]
            for x in (context_window.get("golden_chapter_ids") if isinstance(context_window.get("golden_chapter_ids"), list) else [])
            if str(x).strip()
        ][:20],
        "pacing_metadata": context_window.get("pacing_metadata") if isinstance(context_window.get("pacing_metadata"), dict) else {},
    }
    canonical = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

def _trace_split_agents(conn, task: Dict[str, Any], payload: Dict[str, Any], proposal: Dict[str, Any], source: str) -> Dict[str, Any]:
    chapter_id = str(proposal.get("chapter_id") or payload.get("chapter_id") or "") or None
    strategy_selected = str(proposal.get("strategy_selected") or "manual")
    scenes = proposal.get("scenes") or []
    quality = proposal.get("quality_report") or {}
    split_points = [s.get("end") for s in scenes[:-1] if isinstance(s, dict)]
    strategy_profile = proposal.get("strategy_profile") if isinstance(proposal.get("strategy_profile"), dict) else {}
    strategy_profile_version_id = int(strategy_profile.get("chapter_profile_version") or 0) or None
    controls = proposal.get("split_controls") if isinstance(proposal.get("split_controls"), dict) else {}
    splitter_prompt_version_id = None
    try:
        splitter_prompt_version_id = int(controls.get("_resolved_splitter_prompt_version_id") or 0) or None
    except Exception:
        splitter_prompt_version_id = None

    snapshot_id = insert_agent_context_snapshot(
        conn,
        story_id=int(task["story_id"]),
        chapter_id=chapter_id,
        snapshot_payload={
            "source": source,
            "task_id": int(task["id"]),
            "split_mode": proposal.get("split_mode") or payload.get("split_mode"),
            "strategy_selected": strategy_selected,
            "learning_mode": proposal.get("learning_mode") or "normal",
            "learning_applied": bool(proposal.get("learning_applied")),
            "profile_decay_factor": proposal.get("profile_decay_factor"),
            "profile_reset_scope": proposal.get("profile_reset_scope"),
            "profile_reset_applied": proposal.get("profile_reset_applied") or {},
            "strategy_attempts": proposal.get("strategy_attempts") or [],
            "split_controls": proposal.get("split_controls") or payload.get("split_controls") or {},
        },
    )

    splitter_run_trace_id = insert_agent_run_trace(
        conn,
        task=task,
        agent_name="SPLITTER",
        status="DONE",
        input_payload={
            "split_mode": proposal.get("split_mode") or payload.get("split_mode"),
            "chapter_text_chars": int(proposal.get("chapter_text_raw_chars") or 0),
            "forced_strategy": (proposal.get("split_controls") or {}).get("forced_strategy") if isinstance(proposal.get("split_controls"), dict) else None,
            "learning_mode": proposal.get("learning_mode") or "normal",
            "profile_decay_factor": proposal.get("profile_decay_factor"),
            "profile_reset_scope": proposal.get("profile_reset_scope"),
            "source": source,
        },
        output_payload={
            "strategy_selected": strategy_selected,
            "split_points": split_points,
            "scenes_count": len(scenes),
            "llm_calls_used": proposal.get("llm_calls_used"),
            "learning_applied": bool(proposal.get("learning_applied")),
            "learning_lr": proposal.get("learning_lr") or {},
            "profile_reset_applied": proposal.get("profile_reset_applied") or {},
        },
        prompt_version_id=splitter_prompt_version_id,
        context_snapshot_id=snapshot_id,
        strategy_profile_version_id=strategy_profile_version_id,
        quality_json={
            "strategy_selected": strategy_selected,
            "hard_fail": bool(proposal.get("hard_fail")),
            "llm_calls_used": proposal.get("llm_calls_used"),
            "learning_mode": proposal.get("learning_mode") or "normal",
            "learning_applied": bool(proposal.get("learning_applied")),
            "learning_lr": proposal.get("learning_lr") or {},
            "profile_decay_factor": proposal.get("profile_decay_factor"),
            "profile_reset_scope": proposal.get("profile_reset_scope"),
            "profile_reset_applied": proposal.get("profile_reset_applied") or {},
            "truth_resolution": proposal.get("truth_resolution") or {},
            "source": source,
        },
    )
    critic_run_trace_id = insert_agent_run_trace(
        conn,
        task=task,
        agent_name="SPLIT_CRITIC",
        status="DONE",
        input_payload={
            "split_points": split_points,
            "scenes_count": len(scenes),
            "source": source,
        },
        output_payload=quality,
        context_snapshot_id=snapshot_id,
        strategy_profile_version_id=strategy_profile_version_id,
        quality_json=quality,
    )

    supervisor_run_trace_id = insert_agent_run_trace(
        conn,
        task=task,
        agent_name="SUPERVISOR",
        status="DONE",
        input_payload={"quality_report": quality, "source": source},
        output_payload={
            "supervisor_decision": proposal.get("supervisor_decision"),
            "rerun_reason": proposal.get("rerun_reason"),
            "supervisor_retry_used": proposal.get("supervisor_retry_used"),
        },
        context_snapshot_id=snapshot_id,
        strategy_profile_version_id=strategy_profile_version_id,
        quality_json={
            "supervisor_decision": proposal.get("supervisor_decision"),
            "rerun_reason": proposal.get("rerun_reason"),
            "supervisor_retry_used": bool(proposal.get("supervisor_retry_used")),
            "source": source,
        },
    )
    splitter_prompt_text = None
    try:
        splitter_prompt_text = str(controls.get("_resolved_splitter_system_prompt") or "").strip() or None
    except Exception:
        splitter_prompt_text = None
    insert_agent_prompt_hydration_trace(
        conn,
        run_trace_id=splitter_run_trace_id,
        task=task,
        agent_name="SPLITTER",
        prompt_version_id=splitter_prompt_version_id,
        context_snapshot_id=snapshot_id,
        hydration_inputs_json={
            "source": source,
            "split_mode": proposal.get("split_mode") or payload.get("split_mode"),
            "strategy_selected": strategy_selected,
            "effective_forced_strategy": proposal.get("effective_forced_strategy"),
            "truth_resolution": proposal.get("truth_resolution") or {},
        },
        hydration_render_steps_json={
            "render_plan": ["system_prompt_override_or_active_prompt", "chapter_text_chunks", "rules_constraints"],
            "execution_mode": "SPLIT_BOUNDARY_LLM",
            "chunk_prompt_trace": proposal.get("split_prompt_trace_chunks") or [],
        },
        hydration_output_text=splitter_prompt_text,
        llm_request_meta_json={
            "source": source,
            "llm_calls_used": proposal.get("llm_calls_used"),
            "trace_phase": "POST_LLM",
            "trace_status": "RESPONSE_READY",
            "trace_attempt": 1,
            "trace_source": "split",
        },
    )
    insert_agent_prompt_hydration_trace(
        conn,
        run_trace_id=critic_run_trace_id,
        task=task,
        agent_name="SPLIT_CRITIC",
        prompt_version_id=None,
        context_snapshot_id=snapshot_id,
        hydration_inputs_json={
            "source": source,
            "quality_report": quality,
            "scenes_count": len(scenes),
        },
        hydration_render_steps_json={
            "render_plan": ["quality_report", "rule_based_scoring"],
            "execution_mode": "RULE_BASED_NO_LLM",
        },
        hydration_output_text="RULE_BASED_SPLIT_CRITIC",
        llm_request_meta_json={
            "source": source,
            "llm_used": False,
        },
    )
    insert_agent_prompt_hydration_trace(
        conn,
        run_trace_id=supervisor_run_trace_id,
        task=task,
        agent_name="SUPERVISOR",
        prompt_version_id=None,
        context_snapshot_id=snapshot_id,
        hydration_inputs_json={
            "source": source,
            "quality_report": quality,
            "supervisor_decision": proposal.get("supervisor_decision"),
            "rerun_reason": proposal.get("rerun_reason"),
        },
        hydration_render_steps_json={
            "render_plan": ["quality_report", "decision_policy_thresholds"],
            "execution_mode": "RULE_BASED_NO_LLM",
        },
        hydration_output_text="RULE_BASED_SUPERVISOR",
        llm_request_meta_json={
            "source": source,
            "llm_used": False,
        },
    )
    return {
        "splitter_run_trace_id": splitter_run_trace_id,
        "critic_run_trace_id": critic_run_trace_id,
        "supervisor_run_trace_id": supervisor_run_trace_id,
        "context_snapshot_id": snapshot_id,
    }


def _safe_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        v = float(value)
        return v if v == v else None
    if isinstance(value, str):
        try:
            v = float(value)
            return v if v == v else None
        except Exception:
            return None
    return None


def _run_shadow_split_runtime(
    conn,
    *,
    task: Dict[str, Any],
    chapter_text: str,
    chapter_no: int | None,
    repair_report: Dict[str, Any],
    split_controls: Dict[str, Any],
    split_mode: str,
    reprocess_note: str,
    previous_split_contexts: list[str],
    active_proposal: Dict[str, Any],
    active_splitter_run_trace_id: int | None,
    context_snapshot_id: int | None,
) -> None:
    shadow_enabled = str(os.getenv("AGENT_SHADOW_ENABLED", "0")).strip().lower() in ("1", "true", "yes", "on")
    if not shadow_enabled:
        return

    shadow_prompt_raw = split_controls.get("shadow_prompt_version_id")
    try:
        shadow_prompt_version_id = int(shadow_prompt_raw) if shadow_prompt_raw is not None else 0
    except Exception:
        shadow_prompt_version_id = 0
    if shadow_prompt_version_id <= 0:
        return

    chapter_id = str(active_proposal.get("chapter_id") or "") or None
    active_prompt_version_id = None
    try:
        resolved_prompt = resolve_active_agent_prompt(
            conn,
            story_id=int(task["story_id"]),
            chapter_id=chapter_id,
            agent_name="SPLITTER",
            task_id=int(task["id"]),
        ) or {}
        active_prompt_version_id = int(resolved_prompt.get("version_id") or 0) or None
    except Exception:
        active_prompt_version_id = None

    pair_id = insert_shadow_run_pair(
        conn,
        story_id=int(task["story_id"]),
        chapter_id=chapter_id,
        agent_name="SPLITTER",
        job_id=int(task["job_id"]),
        task_id=int(task["id"]),
        active_run_trace_id=active_splitter_run_trace_id,
        context_snapshot_id=context_snapshot_id,
        active_prompt_version_id=active_prompt_version_id,
        shadow_prompt_version_id=shadow_prompt_version_id,
        pair_status="PLANNED",
        compare_json={"mode": "RUNTIME_SAVEPOINT", "prompt_override_supported": False},
    )
    if not pair_id:
        return

    if split_mode != "auto":
        update_shadow_run_pair(
            conn,
            pair_id=pair_id,
            pair_status="FAILED",
            compare_json={
                "mode": "RUNTIME_SAVEPOINT",
                "prompt_override_supported": False,
                "reason": "SHADOW_AUTO_MODE_ONLY",
            },
        )
        return

    cur = conn.cursor()
    savepoint_name = f"shadow_sp_{int(task['id'])}"
    shadow_run_trace_id = None
    try:
        pre_snapshot = _shadow_no_write_snapshot(
            conn,
            story_id=int(task["story_id"]),
            chapter_id=chapter_id,
        )
        cur.execute(f"SAVEPOINT {savepoint_name}")
        shadow_controls = dict(split_controls)
        shadow_controls["allow_learning"] = False
        shadow_controls["shadow_runtime"] = True
        shadow_controls["shadow_prompt_version_id"] = shadow_prompt_version_id
        prompt_override_supported = False
        shadow_prompt = load_agent_prompt_version_by_id(conn, shadow_prompt_version_id) or {}
        shadow_system_prompt = str(shadow_prompt.get("system_prompt") or "").strip()
        if shadow_system_prompt:
            shadow_controls["_resolved_splitter_system_prompt"] = shadow_system_prompt
            shadow_controls["_resolved_splitter_prompt_version_id"] = shadow_prompt_version_id
            prompt_override_supported = True
        shadow_proposal = build_split_proposal(
            conn,
            chapter_text,
            chapter_no,
            int(task["story_id"]),
            repair_report,
            shadow_controls,
            split_mode,
            reprocess_note=reprocess_note,
            previous_split_contexts=previous_split_contexts,
        )
        cur.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
        cur.execute(f"RELEASE SAVEPOINT {savepoint_name}")
        post_snapshot = _shadow_no_write_snapshot(
            conn,
            story_id=int(task["story_id"]),
            chapter_id=chapter_id,
        )
        no_write_invariant_ok = pre_snapshot == post_snapshot

        active_quality = active_proposal.get("quality_report") if isinstance(active_proposal.get("quality_report"), dict) else {}
        shadow_quality = shadow_proposal.get("quality_report") if isinstance(shadow_proposal.get("quality_report"), dict) else {}
        active_llm_calls = int(active_proposal.get("llm_calls_used") or 0)
        shadow_llm_calls = int(shadow_proposal.get("llm_calls_used") or 0)
        active_scenes = active_proposal.get("scenes") if isinstance(active_proposal.get("scenes"), list) else []
        shadow_scenes = shadow_proposal.get("scenes") if isinstance(shadow_proposal.get("scenes"), list) else []

        shadow_run_trace_id = insert_agent_run_trace(
            conn,
            task=task,
            agent_name="SPLITTER_SHADOW",
            status="DONE",
            input_payload={
                "split_mode": split_mode,
                "shadow_prompt_version_id": shadow_prompt_version_id,
                "shadow_runtime": True,
            },
            output_payload={
                "strategy_selected": shadow_proposal.get("strategy_selected"),
                "scenes_count": len(shadow_scenes),
                "llm_calls_used": shadow_llm_calls,
            },
            prompt_version_id=shadow_prompt_version_id,
            context_snapshot_id=context_snapshot_id,
            quality_json={
                **shadow_quality,
                "shadow_runtime": True,
                "prompt_override_supported": prompt_override_supported,
            },
        )

        active_flagged = _safe_float(active_quality.get("flagged_pct"))
        shadow_flagged = _safe_float(shadow_quality.get("flagged_pct"))
        compare_json = {
            "mode": "RUNTIME_SAVEPOINT",
            "prompt_override_supported": prompt_override_supported,
            "no_write_invariant_ok": no_write_invariant_ok,
            "no_write_snapshot_before": pre_snapshot,
            "no_write_snapshot_after": post_snapshot,
            "active_strategy_selected": active_proposal.get("strategy_selected"),
            "shadow_strategy_selected": shadow_proposal.get("strategy_selected"),
            "active_llm_calls_used": active_llm_calls,
            "shadow_llm_calls_used": shadow_llm_calls,
            "delta_llm_calls_used": shadow_llm_calls - active_llm_calls,
            "active_scene_count": len(active_scenes),
            "shadow_scene_count": len(shadow_scenes),
            "delta_scene_count": len(shadow_scenes) - len(active_scenes),
            "active_hard_fail": bool(active_quality.get("hard_fail")),
            "shadow_hard_fail": bool(shadow_quality.get("hard_fail")),
            "active_flagged_pct": active_flagged,
            "shadow_flagged_pct": shadow_flagged,
            "delta_flagged_pct": (shadow_flagged - active_flagged) if (shadow_flagged is not None and active_flagged is not None) else None,
        }
        update_shadow_run_pair(
            conn,
            pair_id=pair_id,
            pair_status="COMPARED" if no_write_invariant_ok else "FAILED",
            shadow_run_trace_id=shadow_run_trace_id,
            compare_json=compare_json,
        )
    except Exception as err:
        try:
            cur.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
            cur.execute(f"RELEASE SAVEPOINT {savepoint_name}")
        except Exception as err:
            print(f"[writing_analysis] snapshot persistence skipped: {err}", file=sys.stderr, flush=True)
        shadow_run_trace_id = insert_agent_run_trace(
            conn,
            task=task,
            agent_name="SPLITTER_SHADOW",
            status="FAILED",
            input_payload={
                "split_mode": split_mode,
                "shadow_prompt_version_id": shadow_prompt_version_id,
                "shadow_runtime": True,
            },
            output_payload=None,
            prompt_version_id=shadow_prompt_version_id,
            context_snapshot_id=context_snapshot_id,
            error_code=str(err)[:3000],
            quality_json={
                "shadow_runtime": True,
                "prompt_override_supported": False,
                "error": str(err)[:3000],
            },
        )
        update_shadow_run_pair(
            conn,
            pair_id=pair_id,
            pair_status="FAILED",
            shadow_run_trace_id=shadow_run_trace_id,
            compare_json={
                "mode": "RUNTIME_SAVEPOINT",
                "prompt_override_supported": False,
                "error": str(err)[:3000],
            },
        )
    finally:
        cur.close()


def process_chapter_split_task(conn, task: Dict[str, Any]) -> None:
    payload = parse_jsonb(task.get("payload_json"))
    split_mode = str(payload.get("split_mode") or "manual").lower()
    if split_mode not in ("manual", "auto"):
        split_mode = "manual"
    split_controls = parse_split_controls(payload.get("split_controls"))
    source_doc_id = str(payload.get("source_doc_id") or "").strip()
    chapter_text_raw = ""
    if source_doc_id:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT is_stable
                FROM public.source_doc
                WHERE story_id = %s AND id::text = %s
                LIMIT 1
                """,
                (int(task["story_id"]), source_doc_id),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("SOURCE_DOC_NOT_FOUND")
            if not bool(row[0]):
                raise ValueError("SOURCE_DOC_NOT_STABLE")
        finally:
            cur.close()
        source_text = load_source_doc_text(conn, int(task["story_id"]), source_doc_id)
        chapter_text_raw = str(source_text or "").strip()
    if not chapter_text_raw:
        chapter_text_raw = str(payload.get("chapter_text") or "").strip()
    chapter_no_raw = payload.get("chapter_no")
    chapter_no = int(chapter_no_raw) if isinstance(chapter_no_raw, int) else chapter_no_from_source_path(task["source_path"] or "")
    if not chapter_text_raw:
        raise ValueError("CHAPTER_TEXT_EMPTY")
    if len(chapter_text_raw) > SPLIT_MAX_CHARS:
        raise ValueError(f"CHAPTER_TOO_LARGE:{len(chapter_text_raw)}>{SPLIT_MAX_CHARS}")

    chapter_text, repair_report = repair_chapter_text(chapter_text_raw)
    if not chapter_text:
        raise ValueError("CHAPTER_TEXT_REPAIRED_EMPTY")
    chapter_id_for_prompt = str(payload.get("chapter_id") or build_chapter_id(chapter_no))
    try:
        splitter_prompt = resolve_active_agent_prompt(
            conn,
            story_id=int(task["story_id"]),
            chapter_id=chapter_id_for_prompt,
            agent_name="SPLITTER",
            task_id=int(task["id"]),
        ) or {}
        splitter_system_prompt = str(splitter_prompt.get("system_prompt") or "").strip()
        if splitter_system_prompt:
            split_controls["_resolved_splitter_system_prompt"] = splitter_system_prompt
        splitter_prompt_version_id = int(splitter_prompt.get("version_id") or 0) or None
        if splitter_prompt_version_id:
            split_controls["_resolved_splitter_prompt_version_id"] = splitter_prompt_version_id
    except Exception:
        pass

    idempotency_key = ensure_task_idempotency_key(
        conn=conn,
        task_id=int(task["id"]),
        story_id=int(task["story_id"]),
        chapter_text=chapter_text,
        runtime_mode=str(split_controls.get("runtime_mode") or "").strip().upper() or None,
        context_hash=_idempotency_context_hash_hint(split_controls),
        existing_key=str(task.get("idempotency_key") or ""),
    )

    # Skip cache when a specific strategy is explicitly forced â€” different strategy must re-run.
    _skip_cache = bool(split_controls.get("forced_strategy"))
    cached = None if _skip_cache else load_cached_split_result(
        conn=conn,
        story_id=int(task["story_id"]),
        task_id=int(task["id"]),
        idempotency_key=idempotency_key,
    )
    if cached:
        cached_payload = parse_jsonb(cached.get("result_json"))
        if isinstance(cached_payload, dict) and cached_payload:
            _trace_split_agents(conn, task, payload, cached_payload, source="cache")
        apply_split_result(conn, task, cached)
        return

    reprocess_note = str(payload.get("reprocess_note") or "").strip()
    previous_split_contexts = payload.get("previous_split_contexts")
    if not isinstance(previous_split_contexts, list):
        previous_split_contexts = []
    pre_split_prompt_text = str(split_controls.get("_resolved_splitter_system_prompt") or "").strip()
    if not pre_split_prompt_text:
        pre_split_prompt_text = "SPLITTER_SYSTEM_PROMPT_UNAVAILABLE_PRE_LLM"
    pre_split_prompt_hash = hashlib.sha256(pre_split_prompt_text.encode("utf-8")).hexdigest()
    try:
        pre_split_prompt_version_id = int(split_controls.get("_resolved_splitter_prompt_version_id") or 0) or None
    except Exception:
        pre_split_prompt_version_id = None
    insert_agent_prompt_hydration_trace(
        conn,
        run_trace_id=None,
        task=task,
        agent_name="SPLITTER",
        prompt_version_id=pre_split_prompt_version_id,
        context_snapshot_id=None,
        hydration_inputs_json={
            "split_mode": split_mode,
            "chapter_id": chapter_id_for_prompt,
            "chapter_text_chars": len(chapter_text),
            "effective_forced_strategy": split_controls.get("forced_strategy"),
        },
        hydration_render_steps_json={
            "trace_phase": "PRE_LLM",
            "trace_status": "PENDING_RESPONSE",
            "trace_attempt": 1,
            "trace_source": "split",
        },
        hydration_output_hash=pre_split_prompt_hash,
        hydration_output_text=pre_split_prompt_text,
        llm_request_meta_json={
            "trace_phase": "PRE_LLM",
            "trace_status": "PENDING_RESPONSE",
            "trace_attempt": 1,
            "trace_source": "split",
            "split_mode": split_mode,
            "chapter_text_chars": len(chapter_text),
            "prompt_chars": len(pre_split_prompt_text),
            "prompt_tokens_est": max(1, int(len(pre_split_prompt_text) / 4)),
        },
        force_commit=True,
    )

    try:
        if split_mode == "manual":
            proposal = build_manual_split_proposal(
                chapter_text,
                chapter_no,
                repair_report,
                reprocess_note=reprocess_note,
                previous_split_contexts=previous_split_contexts,
            )
        else:
            proposal = build_split_proposal(
                conn,
                chapter_text,
                chapter_no,
                int(task["story_id"]),
                repair_report,
                split_controls,
                split_mode,
                reprocess_note=reprocess_note,
                previous_split_contexts=previous_split_contexts,
            )
    except Exception as err:
        err_text = str(err)[:3000]
        err_upper = err_text.upper()
        if "OUTLINE_COVERAGE_FAIL" in err_upper:
            rerun_reason = "OUTLINE_COVERAGE_FAIL"
        elif (
            "MULTIPLE VALUES FOR KEYWORD ARGUMENT 'HARD_ANCHOR_POSITIONS'" in err_upper
            or "MULTIPLE VALUES FOR KEYWORD ARGUMENT \"HARD_ANCHOR_POSITIONS\"" in err_upper
        ):
            rerun_reason = "SPLIT_ANCHOR_KWARG_CONFLICT"
        else:
            rerun_reason = "SPLIT_PROPOSAL_BUILD_FAIL"
        failed_proposal = {
            "chapter_id": chapter_id_for_prompt,
            "chapter_no": chapter_no,
            "split_controls": split_controls,
            "split_mode": split_mode,
            "source_path": str(task.get("source_path") or ""),
            "quality_report": {"hard_fail": True, "error": err_text},
            "scenes": [],
            "split_prompt_trace_chunks": [],
            "supervisor_decision": "retry_required",
            "rerun_reason": rerun_reason,
            "operational_state": "NEEDS_RETRY",
            "operational_state_reason": rerun_reason,
            "reason_codes": [rerun_reason],
        }
        try:
            _trace_split_agents(conn, task, payload, failed_proposal, source="fresh_failed")
        except Exception as trace_err:
            print(
                f"[splitter][trace_failed_proposal][warn] task_id={int(task.get('id') or 0)} err={str(trace_err)[:500]}",
                file=sys.stderr,
                flush=True,
            )
        raise

    truth_resolution = proposal.get("truth_resolution") if isinstance(proposal.get("truth_resolution"), dict) else {}
    truth_conflicts = truth_resolution.get("conflicts") if isinstance(truth_resolution.get("conflicts"), list) else []
    for item in truth_conflicts:
        if not isinstance(item, dict):
            continue
        insert_truth_conflict_registry_event(
            conn,
            story_id=int(task["story_id"]),
            chapter_id=str(proposal.get("chapter_id") or "") or None,
            agent_name="SPLITTER",
            job_id=int(task["job_id"]),
            task_id=int(task["id"]),
            conflict_id=str(item.get("conflict_id") or "unknown_conflict"),
            losing_rule_ref=str(item.get("losing_rule_ref") or "unknown_loser"),
            winning_rule_ref=str(item.get("winning_rule_ref") or "unknown_winner"),
            resolution_mode=str(item.get("resolution_mode") or "HIERARCHY"),
            resolution_reason=str(item.get("resolution_reason") or ""),
            payload_json={
                "strategy": item.get("strategy"),
                "priority_matrix_version": truth_resolution.get("priority_matrix_version"),
                "banned_strategies": truth_resolution.get("banned_strategies") or [],
                "strategy_order_used": proposal.get("strategy_order_used") or [],
                "effective_forced_strategy": proposal.get("effective_forced_strategy"),
            },
        )
    if source_doc_id:
        proposal["source_doc_id"] = source_doc_id
    source_doc_sha256 = str(payload.get("source_doc_sha256") or "").strip()
    if source_doc_sha256:
        proposal["source_doc_sha256"] = source_doc_sha256
    source_type = str(payload.get("source_type") or "").strip()
    if source_type:
        proposal["source_type"] = source_type
    source_role = str(payload.get("source_role") or "").strip()
    if source_role:
        proposal["source_role"] = source_role
    proposal["chapter_text_raw_chars"] = len(chapter_text_raw)
    proposal["source_path"] = str(task.get("source_path") or "")
    proposal["split_mode"] = split_mode
    proposal["split_controls"] = split_controls
    # Attach concrete split task id into analysis chunk artifact and surface gate status.
    aca = proposal.get("analysis_chunk_artifact") if isinstance(proposal.get("analysis_chunk_artifact"), dict) else {}
    if aca:
        source_obj = aca.get("source") if isinstance(aca.get("source"), dict) else {}
        source_obj["split_task_id"] = int(task["id"])
        aca["source"] = source_obj
        status = str(aca.get("status") or "NOT_READY")
        if status != "READY_FOR_ANALYSIS":
            diagnostics = aca.get("diagnostics") if isinstance(aca.get("diagnostics"), dict) else {}
            violations = aca.get("violations") if isinstance(aca.get("violations"), list) else []
            oversized_count = int(diagnostics.get("oversized_count") or 0)
            has_outline_gate = any(str(v).strip().upper() == "OUTLINE_COVERAGE_GATE_FAIL" for v in violations)
            has_no_chunks = any(str(v).strip().upper() == "NO_CHUNKS" for v in violations)
            if oversized_count > 0:
                artifact_reason_code = "ARTIFACT_NOT_READY_CHUNK_OVERSIZED"
            elif has_no_chunks:
                artifact_reason_code = "ARTIFACT_NOT_READY_NO_CHUNKS"
            elif has_outline_gate:
                artifact_reason_code = "ARTIFACT_NOT_READY_OUTLINE_COVERAGE"
            else:
                artifact_reason_code = "ANALYSIS_CHUNK_ARTIFACT_NOT_READY"
            proposal["hard_fail"] = True
            proposal["supervisor_decision"] = "retry_required"
            proposal["rerun_reason"] = artifact_reason_code
            proposal["operational_state"] = "NEEDS_RETRY"
            proposal["operational_state_reason"] = proposal.get("rerun_reason") or "ANALYSIS_CHUNK_ARTIFACT_NOT_READY"
            existing_reason_codes = (
                [str(x).strip() for x in proposal.get("reason_codes")]
                if isinstance(proposal.get("reason_codes"), list)
                else []
            )
            existing_reason_codes = [x for x in existing_reason_codes if x]
            if artifact_reason_code not in existing_reason_codes:
                existing_reason_codes.append(artifact_reason_code)
            proposal["reason_codes"] = existing_reason_codes
        else:
            proposal["operational_state"] = "READY_FOR_ANALYSIS"
            proposal["operational_state_reason"] = "ARTIFACT_READY"
        proposal["analysis_chunk_artifact"] = aca
    trace_refs = _trace_split_agents(conn, task, payload, proposal, source="fresh")
    _run_shadow_split_runtime(
        conn,
        task=task,
        chapter_text=chapter_text,
        chapter_no=chapter_no,
        repair_report=repair_report or {},
        split_controls=split_controls,
        split_mode=split_mode,
        reprocess_note=reprocess_note,
        previous_split_contexts=previous_split_contexts,
        active_proposal=proposal,
        active_splitter_run_trace_id=trace_refs.get("splitter_run_trace_id"),
        context_snapshot_id=trace_refs.get("context_snapshot_id"),
    )
    apply_split_result(conn, task, proposal)


def process_chapter_task(conn, task: Dict[str, Any]) -> None:
    payload = parse_jsonb(task.get("payload_json"))
    chapter_text = str(payload.get("chapter_text") or "").strip()
    chapter_no_raw = payload.get("chapter_no")
    chapter_no = int(chapter_no_raw) if isinstance(chapter_no_raw, int) else chapter_no_from_source_path(task["source_path"] or "")
    if not chapter_text:
        raise ValueError("CHAPTER_TEXT_EMPTY")

    scenes = split_scenes(chapter_text)
    if not scenes:
        raise ValueError("CHAPTER_SCENE_SPLIT_EMPTY")

    seq_start = next_seq_start(conn, int(task["job_id"]))
    chapter_id = build_chapter_id(chapter_no)

    for i, scene_text in enumerate(scenes, start=1):
        workunit_id = build_workunit_id(chapter_no, i, int(task["seq_no"]))
        scene_id, scene_version_id = insert_scene_with_version(
            conn=conn,
            story_id=int(task["story_id"]),
            workunit_id=workunit_id,
            chapter_id=chapter_id,
            scene_idx=i,
            scene_text=scene_text,
            job_mode=str(task["job_mode"]),
            ingest_run_id=str(task.get("ingest_run_id") or "") or None,
        )

        scene_payload = {
            "scene_id": scene_id,
            "scene_version_id": scene_version_id,
            "workunit_id": workunit_id,
            "chapter_no": chapter_no,
            "scene_index": i,
            "scene_text": scene_text,
        }

        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO public.ingest_task
                  (job_id, story_id, unit_type, source_path, seq_no, status, attempts, task_type, payload_json)
                VALUES
                  (%s, %s, 'scene', %s, %s, 'PENDING', 0, 'LEGACY_SCENE_INDEX', %s::jsonb)
                """,
                (
                    int(task["job_id"]),
                    int(task["story_id"]),
                    workunit_id,
                    seq_start + i - 1,
                    Json(scene_payload),
                ),
            )
        finally:
            cur.close()

    cur3 = conn.cursor()
    try:
        cur3.execute(
            """
            UPDATE public.ingest_job
            SET total_tasks = total_tasks + %s,
                updated_at = now()
            WHERE id = %s
            """,
            (len(scenes), int(task["job_id"])),
        )
    finally:
        cur3.close()

    mark_task_done(conn, int(task["id"]), int(task["job_id"]))


def process_scene_indexing(
    conn,
    task: Dict[str, Any],
    scene_id: int,
    scene_version_id: int,
    workunit_id: str,
    scene_text: str,
) -> None:
    story_id = int(task["story_id"])
    source_ref = f"ingest:{task['job_id']}:{task['id']}:{workunit_id}"
    entities = extract_entities(scene_text)
    timeline_events = extract_timeline_events(scene_text, workunit_id)
    confidence = compute_confidence(scene_text, entities, timeline_events)

    fact_rows = []
    for category in ("character", "location", "item", "lore", "relationship", "event"):
        for content in entities.get(category, []):
            fact_rows.append((category, content))

    new_entity_count = count_new_facts(conn, story_id, fact_rows)
    major_event_count = len(entities.get("event", []))
    policy = load_review_policy(conn, int(task["job_id"]))

    if confidence >= 0.8:
        importance = 5
    elif confidence >= 0.65:
        importance = 4
    elif confidence >= 0.5:
        importance = 3
    elif confidence >= 0.35:
        importance = 2
    else:
        importance = 1

    cur = conn.cursor()
    try:
        for idx, (category, content) in enumerate(fact_rows, start=1):
            cur.execute(
                """
                INSERT INTO public.story_canon_fact
                  (story_id, category, content, importance, source_ref)
                VALUES
                  (%s, %s, %s, %s, %s)
                """,
                (
                    story_id,
                    category,
                    content[:3000],
                    importance,
                    f"{source_ref}:fact:{idx}:cf={confidence:.2f}",
                ),
            )

        for idx, ev in enumerate(timeline_events, start=1):
            event_key = f"ingest_job_{task['job_id']}_task_{task['id']}_ev_{idx}"
            cur.execute(
                """
                INSERT INTO public.timeline_event
                  (story_id, event_key, title, body, tags)
                VALUES
                  (%s, %s, %s, %s, %s)
                ON CONFLICT (event_key)
                DO UPDATE SET
                  title = EXCLUDED.title,
                  body = EXCLUDED.body,
                  tags = EXCLUDED.tags,
                  updated_at = now()
                """,
                (
                    story_id,
                    event_key,
                    ev["title"][:500],
                    ev["body"][:2000],
                    [workunit_id, "ingest"],
                ),
            )
    finally:
        cur.close()

    should_review = False
    if str(task["job_mode"]) == "REVIEW_GATE":
        should_review = (
            confidence < float(policy["min_confidence"])
            or new_entity_count >= int(policy["min_new_entities"])
            or major_event_count >= int(policy["min_major_events"])
        )

    if should_review:
        cur2 = conn.cursor()
        try:
            cur2.execute(
                """
                SELECT id
                FROM public.review_request
                WHERE story_id = %s
                  AND scene_version_id = %s
                  AND job_id = %s
                  AND status IN ('OPEN','SUBMITTED')
                LIMIT 1
                """,
                (story_id, scene_version_id, int(task["job_id"])),
            )
            exists = cur2.fetchone()
            if exists is None:
                cur2.execute(
                    """
                    INSERT INTO public.review_request
                      (story_id, scene_version_id, job_id, status, rubric_version)
                    VALUES
                      (%s, %s, %s, 'OPEN', 'memory_bridge_v1')
                    """,
                    (story_id, scene_version_id, int(task["job_id"])),
                )
        finally:
            cur2.close()

        mark_task_wait_review(conn, int(task["id"]), int(task["job_id"]), int(task.get("attempts") or 0))
        return

    if str(task["job_mode"]) == "REVIEW_GATE":
        set_scene_status(conn, story_id, scene_id, "LOCKED")

    mark_task_done(conn, int(task["id"]), int(task["job_id"]), int(task.get("attempts") or 0))


def process_scene_task(conn, task: Dict[str, Any]) -> None:
    payload = parse_jsonb(task.get("payload_json"))
    scene_id = int(payload.get("scene_id") or 0)
    scene_version_id = int(payload.get("scene_version_id") or 0)
    workunit_id = str(payload.get("workunit_id") or task.get("source_path") or "unknown")
    scene_text = str(payload.get("scene_text") or "").strip()
    if scene_id <= 0 or scene_version_id <= 0 or not scene_text:
        raise ValueError("SCENE_PAYLOAD_INVALID")
    process_scene_indexing(conn, task, scene_id, scene_version_id, workunit_id, scene_text)


def process_scene_create_task(conn, task: Dict[str, Any]) -> None:
    payload = parse_jsonb(task.get("payload_json"))
    approved_scene = parse_jsonb(payload.get("approved_scene"))
    chapter_text = ""
    text_basis = "unknown"
    source_doc_id = str(payload.get("source_doc_id") or "").strip()
    chapter_task_id = int(payload.get("chapter_task_id") or 0)
    start = int(approved_scene.get("start") or 0)
    end = int(approved_scene.get("end") or 0)
    if end <= start:
        raise ValueError("SCENE_CREATE_RANGE_INVALID")

    if chapter_task_id > 0:
        basis = load_chapter_text_basis_from_split_task(conn, int(task["story_id"]), int(task["job_id"]), chapter_task_id, parse_jsonb)
        if basis:
            chapter_text = basis
            text_basis = "repaired"

    if source_doc_id:
        if not chapter_text:
            source_text = load_source_doc_text(conn, int(task["story_id"]), source_doc_id)
            chapter_text = str(source_text or "")
            if chapter_text:
                text_basis = "raw"
    if not chapter_text:
        chapter_text = str(payload.get("chapter_text") or "")
        if chapter_text:
            text_basis = "payload"
    if not chapter_text:
        raise ValueError("SCENE_CREATE_SOURCE_TEXT_NOT_FOUND")
    if end > len(chapter_text):
        raise ValueError(f"SCENE_CREATE_RANGE_OUT_OF_BOUNDS:{start}:{end}:{len(chapter_text)}")

    scene_text = chapter_text[start:end].strip()
    if not scene_text:
        raise ValueError("SCENE_CREATE_EMPTY_SCENE_TEXT")

    scene_idx = int(approved_scene.get("idx") or 1)
    chapter_no_raw = payload.get("chapter_no")
    chapter_no = int(chapter_no_raw) if isinstance(chapter_no_raw, int) else chapter_no_from_source_path(task.get("source_path") or "")
    chapter_id = str(payload.get("chapter_id") or build_chapter_id(chapter_no))
    workunit_id = str(payload.get("workunit_id") or task.get("source_path") or f"{chapter_id}_s{scene_idx:02d}")
    scene_title = str(approved_scene.get("title") or "").strip() or None

    scene_id, scene_version_id = insert_scene_with_version(
        conn=conn,
        story_id=int(task["story_id"]),
        workunit_id=workunit_id,
        chapter_id=chapter_id,
        scene_idx=scene_idx,
        scene_text=scene_text,
        job_mode=str(task["job_mode"]),
        ingest_run_id=str(payload.get("ingest_run_id") or task.get("ingest_run_id") or "") or None,
        scene_title=scene_title,
        is_verified=bool(payload.get("is_verified", False)),
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
            (
                Json(
                    {
                        "scene_id": scene_id,
                        "scene_version_id": scene_version_id,
                        "chapter_id": chapter_id,
                        "scene_idx": scene_idx,
                        "workunit_id": workunit_id,
                        "text_basis": text_basis,
                        "text_preview": scene_text[:400],
                    }
                ),
                int(task["id"]),
            ),
        )
    finally:
        cur.close()
    process_scene_indexing(conn, task, scene_id, scene_version_id, workunit_id, scene_text)


def process_split_profile_correction_task(conn, task: Dict[str, Any]) -> None:
    """Apply a negative correction to split_strategy_profile for a rejected split.

    When a human rejects a split (Reprocess), we enqueue SPLIT_PROFILE_CORRECTION
    so that the strategy selected in the rejected split gets an additional 'loss'
    recorded in the profile, counterbalancing the positive signal written during
    build_split_proposal (before human review).

    Uses win_reward=0.0 against a small learning_rate to register a loss
    without fully resetting existing statistics.
    """
    from worker_profile_learning import (
        load_split_strategy_profile,
        save_split_strategy_profile,
        load_profile_stats,
        update_profile_stats,
    )
    from worker_common import parse_jsonb as _parse_jsonb
    from worker_constants import SPLIT_PROFILE_GLOBAL_KEY

    payload = parse_jsonb(task.get("payload_json"))
    chapter_id = str(payload.get("chapter_id") or "").strip()
    story_id = int(task.get("story_id") or payload.get("story_id") or 0)
    strategy = str(payload.get("strategy") or "").strip()
    # correction_reward sent by TS: -0.5 (negative) â†’ we use 0.0 for loss
    # (update_profile_stats clamps reward to [0, 1])
    correction_lr = 0.5  # smaller than default chapter_lr to avoid over-correction

    if not chapter_id or not strategy or story_id <= 0:
        # Nothing meaningful to correct
        return

    # Chapter-level profile correction
    chapter_profile = load_split_strategy_profile(conn, story_id, chapter_id, _parse_jsonb)
    chapter_stats = load_profile_stats(chapter_profile)
    chapter_stats = update_profile_stats(
        chapter_stats,
        strategy,
        boundaries_run=0,
        hard_flags_run=0,
        learning_rate=correction_lr,
        win_reward=0.0,  # loss
    )
    chapter_profile_to_save = {
        "best_by_signature": chapter_profile.get("best_by_signature", {}),
        "history": chapter_profile.get("history", []),
        "strategy_stats": chapter_stats,
    }
    save_split_strategy_profile(conn, story_id, chapter_id, chapter_profile_to_save)

    # Global-level profile correction
    global_key = SPLIT_PROFILE_GLOBAL_KEY
    global_profile = load_split_strategy_profile(conn, story_id, global_key, _parse_jsonb)
    global_stats = load_profile_stats(global_profile)
    global_stats = update_profile_stats(
        global_stats,
        strategy,
        boundaries_run=0,
        hard_flags_run=0,
        learning_rate=correction_lr * 0.5,  # gentler for global
        win_reward=0.0,
    )
    global_profile_to_save = {
        "best_by_signature": global_profile.get("best_by_signature", {}),
        "history": global_profile.get("history", []),
        "strategy_stats": global_stats,
    }
    save_split_strategy_profile(conn, story_id, global_key, global_profile_to_save)

    cur = conn.cursor()
    try:
        cur.execute(
            """UPDATE public.ingest_task
               SET status = 'DONE',
                   updated_at = now(),
                   result_json = jsonb_build_object(
                     'chapter_id', %s::text,
                     'strategy', %s::text,
                     'correction_lr', %s::numeric,
                     'corrected_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                   )
               WHERE id = %s""",
            (chapter_id, strategy, correction_lr, int(task["id"])),
        )
    finally:
        cur.close()



def process_chapter_validate_task(conn, task):
    """Run chapter data-quality validation and store a warnings_report.

    The job stays at AWAITING_DATA_APPROVAL after this completes.
    Human reviews the report in ValidateDataPanel and either:
      - approves -> ingestValidateService creates CHAPTER_SPLIT_LLM
      - rejects -> job -> CANCELLED
    """
    from worker_chapter_validate import validate_chapter
    from worker_ingest_repo import load_source_doc_text
    import json as _json
    from worker_common import parse_jsonb as _parse_jsonb

    payload = _parse_jsonb(task.get("payload_json"))
    story_id = int(task.get("story_id") or 0)
    chapter_text = str(payload.get("chapter_text") or "").strip()
    chapter_id = str(payload.get("chapter_id") or "").strip() or None
    run_llm = bool(payload.get("run_llm", True))

    if not chapter_text:
        source_doc_id = str(payload.get("source_doc_id") or "").strip()
        if source_doc_id:
            chapter_text = str(load_source_doc_text(conn, story_id, source_doc_id) or "").strip()

    if not chapter_text:
        raise ValueError("CHAPTER_VALIDATE_TEXT_EMPTY")

    warnings_report = validate_chapter(
        conn,
        story_id=story_id,
        chapter_text=chapter_text,
        chapter_id=chapter_id,
        run_llm=run_llm,
    )

    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE public.ingest_task"
            " SET status = 'DONE', updated_at = now(),"
            " result_json = %s::jsonb"
            " WHERE id = %s",
            (_json.dumps(warnings_report), int(task["id"])),
        )
    finally:
        cur.close()

def process_writing_analysis_task(conn, task: Dict[str, Any]) -> None:
    from worker_writing_analysis import analyze_story_state
    from worker_memory_context import build_planning_context_v5
    from worker_truth_pack_runtime import (
        build_pre_chapter_profile,
        context_pack_compiler,
        entity_resolution_pass,
        persist_analysis_delta_report,
        refresh_cutover_state,
        truth_adjudication_pass,
    )
    import json as _json

    payload = parse_jsonb(task.get("payload_json"))
    story_id = int(task["story_id"])
    instructions = str(payload.get("instructions") or "Analyze context for a new chapter.").strip()
    chapter_no_raw = payload.get("chapter_no")
    chapter_no = int(chapter_no_raw) if isinstance(chapter_no_raw, int) else chapter_no_from_source_path(str(task.get("source_path") or ""))
    chapter_id = str(payload.get("chapter_id") or build_chapter_id(chapter_no)).strip() if chapter_no else str(payload.get("chapter_id") or "").strip() or None
    structural_outline = payload.get("structural_outline") if isinstance(payload.get("structural_outline"), dict) else {}
    analysis_chunk_artifact = payload.get("analysis_chunk_artifact") if isinstance(payload.get("analysis_chunk_artifact"), dict) else {}
    pre_chapter_profile = build_pre_chapter_profile(payload, chapter_id, instructions)
    memory_context_v5 = build_planning_context_v5(
        conn,
        story_id,
        chapter_id,
        instructions,
    )
    pre_trace_count = 0
    duplicate_pre_trace_count = 0
    pre_trace_hashes: set[str] = set()
    last_pre_prompt_text = ""
    last_pre_prompt_hash = ""

    def _pre_llm_trace(trace: Dict[str, Any]) -> None:
        nonlocal pre_trace_count, duplicate_pre_trace_count, last_pre_prompt_text, last_pre_prompt_hash
        prompt_text = str(trace.get("prompt_text") or "")
        prompt_hash = str(trace.get("prompt_hash") or "")
        if not prompt_hash and prompt_text:
            prompt_hash = hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()
        if prompt_hash and prompt_hash in pre_trace_hashes:
            duplicate_pre_trace_count += 1
        elif prompt_hash:
            pre_trace_hashes.add(prompt_hash)
        last_pre_prompt_text = prompt_text
        last_pre_prompt_hash = prompt_hash
        pre_trace_count += 1
        insert_agent_prompt_hydration_trace(
            conn,
            run_trace_id=None,
            task=task,
            agent_name="WRITING_ANALYSIS",
            prompt_version_id=None,
            context_snapshot_id=None,
            hydration_inputs_json={
                "instructions": instructions[:1200],
                "chapter_id": chapter_id,
                "analysis_chunk_artifact_present": isinstance(analysis_chunk_artifact, dict) and bool(analysis_chunk_artifact),
            },
            hydration_render_steps_json={
                "trace_phase": "PRE_LLM",
                "trace_status": "PENDING_RESPONSE",
                "trace_attempt": 1,
                "trace_source": "analysis",
                "chunk_index": int(trace.get("chunk_index") or 0),
                "chunk_count": int(trace.get("chunk_count") or 0),
            },
            hydration_output_hash=prompt_hash or None,
            hydration_output_text=prompt_text or None,
            llm_request_meta_json={
                "trace_phase": "PRE_LLM",
                "trace_status": "PENDING_RESPONSE",
                "trace_attempt": 1,
                "trace_source": "analysis",
                "chunk_index": int(trace.get("chunk_index") or 0),
                "chunk_count": int(trace.get("chunk_count") or 0),
                "prompt_chars": int(trace.get("prompt_chars") or 0),
                "prompt_tokens_est": int(trace.get("prompt_tokens_est") or 0),
            },
            force_commit=True,
        )

    try:
        analysis_result = analyze_story_state(
            conn,
            story_id,
            instructions,
            chapter_id=chapter_id,
            structural_outline=structural_outline,
            analysis_chunk_artifact=analysis_chunk_artifact,
            pre_llm_trace_hook=_pre_llm_trace,
        )
    except Exception as err:
        err_text = str(err or "")
        err_upper = err_text.upper()
        fail_status = "FAILED_TIMEOUT" if ("TIMEOUT" in err_upper or "LLM_TIMEOUT" in err_upper) else "FAILED_ERROR"
        insert_agent_prompt_hydration_trace(
            conn,
            run_trace_id=None,
            task=task,
            agent_name="WRITING_ANALYSIS",
            prompt_version_id=None,
            context_snapshot_id=None,
            hydration_inputs_json={
                "instructions": instructions[:1200],
                "chapter_id": chapter_id,
            },
            hydration_render_steps_json={
                "trace_phase": "POST_LLM",
                "trace_status": fail_status,
                "trace_attempt": 1,
                "trace_source": "analysis",
                "pre_trace_count": pre_trace_count,
            },
            hydration_output_hash=last_pre_prompt_hash or None,
            hydration_output_text=last_pre_prompt_text or None,
            llm_request_meta_json={
                "trace_phase": "POST_LLM",
                "trace_status": fail_status,
                "trace_attempt": 1,
                "trace_source": "analysis",
                "error": err_text[:300],
                "pre_trace_count": pre_trace_count,
                "duplicate_pre_trace_count": duplicate_pre_trace_count,
            },
        )
        raise
    trace_prompt_text = str(analysis_result.pop("_trace_prompt_text", "") or "")
    trace_prompt_hash = str(analysis_result.pop("_trace_prompt_hash", "") or "")
    trace_prompt_meta = (
        analysis_result.pop("_trace_prompt_meta", {})
        if isinstance(analysis_result.get("_trace_prompt_meta"), dict)
        else {}
    )
    analysis_payload = {
        k: v for (k, v) in analysis_result.items() if not str(k).startswith("_trace_")
    }
    entity_snapshot = entity_resolution_pass(
        conn,
        story_id=story_id,
        chapter_id=chapter_id,
        instructions=instructions,
        analysis_result=analysis_payload,
        memory_context=memory_context_v5,
        pre_profile=pre_chapter_profile,
    )
    adjudication_snapshot = truth_adjudication_pass(
        conn,
        story_id=story_id,
        chapter_id=chapter_id,
        analysis_result=analysis_payload,
        entity_snapshot=entity_snapshot,
    )
    truth_context_pack, analysis_delta_report = context_pack_compiler(
        conn,
        story_id=story_id,
        chapter_id=chapter_id,
        pre_profile=pre_chapter_profile,
        entity_snapshot=entity_snapshot,
        adjudication_snapshot=adjudication_snapshot,
    )
    persist_analysis_delta_report(conn, story_id, chapter_id, analysis_delta_report)
    cutover_state = refresh_cutover_state(conn, story_id)
    analysis_payload["entity_resolution_cache_v1"] = entity_snapshot.get("cache_parts") or {}
    analysis_payload["entity_resolution_snapshot_v1"] = entity_snapshot
    analysis_payload["truth_adjudication_snapshot_v1"] = adjudication_snapshot
    analysis_payload["truth_context_pack_v1"] = truth_context_pack
    analysis_payload["pre_chapter_profile_v1"] = pre_chapter_profile
    analysis_payload["post_chapter_profile_v1"] = {}
    analysis_payload["analysis_delta_report_v1"] = analysis_delta_report
    analysis_payload["entity_merge_challenge_v1"] = adjudication_snapshot.get("entity_merge_challenges") if isinstance(adjudication_snapshot.get("entity_merge_challenges"), list) else []
    analysis_payload["cutover_stage"] = cutover_state.get("cutover_stage")
    analysis_payload["cutover_parity_window_stats"] = cutover_state.get("cutover_parity_window_stats")
    input_chunk_obj = analysis_payload.get("analysis_input_chunk") if isinstance(analysis_payload.get("analysis_input_chunk"), dict) else {}
    if isinstance(analysis_payload.get("snapshot_v3"), dict):
        snap_obj = dict(analysis_payload.get("snapshot_v3") or {})
        snap_obj["source_chunk_artifact"] = {
            "version": str(input_chunk_obj.get("artifact_version") or ""),
            "hash": str(input_chunk_obj.get("artifact_hash") or ""),
            "chunk_count": int(input_chunk_obj.get("chunk_count") or 0),
            "split_task_id": int(input_chunk_obj.get("split_task_id") or 0),
        }
        analysis_payload["snapshot_v3"] = snap_obj
    external_signals_obj = analysis_payload.get("external_signals") if isinstance(analysis_payload.get("external_signals"), dict) else {}
    qdrant_status = (
        external_signals_obj.get("qdrant").get("status")
        if isinstance(external_signals_obj.get("qdrant"), dict)
        else "disabled"
    )
    neo4j_status = (
        external_signals_obj.get("neo4j").get("status")
        if isinstance(external_signals_obj.get("neo4j"), dict)
        else "disabled"
    )
    completeness = {
        "fact_logic": isinstance(analysis_payload.get("vetting_report"), dict),
        "timeline": True,
        "lineage": str(neo4j_status) == "ok",
        "narrative_metrics": isinstance(((analysis_payload.get("snapshot_v3") or {}).get("narrative_metrics")), dict),
        "projection_health": str(qdrant_status) == "ok" and str(neo4j_status) == "ok",
        "hydration_evidence": True,
    }
    dimensions_ok = all(bool(v) for v in completeness.values())
    fact_status = str((analysis_payload.get("snapshot_v3") or {}).get("fact_status") or "UNVETTED")
    degraded_mode = bool(analysis_payload.get("degraded_mode"))
    ready_for_writing = bool(dimensions_ok and fact_status == "CLEAN" and not degraded_mode)

    context_snapshot_id = insert_agent_context_snapshot(
        conn,
        story_id=story_id,
        chapter_id=chapter_id,
        snapshot_payload={
            "task_type": "WRITING_ANALYSIS",
            "instructions": instructions[:1200],
            "context_hash": str(analysis_payload.get("context_hash") or ""),
            "analysis_input_chunk": input_chunk_obj,
            "mcp_refs": analysis_payload.get("mcp_refs") if isinstance(analysis_payload.get("mcp_refs"), list) else [],
            "candidate_fact_count": len(analysis_payload.get("candidate_facts") or []),
            "external_adapter_status": {
                "qdrant": (
                    ((analysis_payload.get("external_signals") or {}).get("qdrant") or {}
                     if isinstance((analysis_payload.get("external_signals") or {}).get("qdrant"), dict)
                     else {})
                ).get("status"),
                "neo4j": (
                    ((analysis_payload.get("external_signals") or {}).get("neo4j") or {}
                     if isinstance((analysis_payload.get("external_signals") or {}).get("neo4j"), dict)
                     else {})
                ).get("status"),
            },
        },
    )
    run_trace_id = insert_agent_run_trace(
        conn,
        task=task,
        agent_name="WRITING_ANALYSIS",
        status="DONE",
        input_payload={
            "instructions": instructions[:1200],
            "chapter_id": chapter_id,
        },
        output_payload={
            "integration_status": analysis_payload.get("integration_status"),
            "fact_status": (analysis_payload.get("snapshot_v3") or {}).get("fact_status") if isinstance(analysis_payload.get("snapshot_v3"), dict) else None,
            "narrative_score": (
                ((analysis_payload.get("snapshot_v3") or {}).get("narrative_metrics") or {}).get("narrative_score")
                if isinstance(((analysis_payload.get("snapshot_v3") or {}).get("narrative_metrics")), dict)
                else None
            ),
            "degraded_mode": bool(analysis_payload.get("degraded_mode")),
        },
        model_name="llm_json",
        context_snapshot_id=context_snapshot_id,
        quality_json={
            "degraded_mode": bool(analysis_payload.get("degraded_mode")),
            "integration_status": analysis_payload.get("integration_status"),
            "candidate_fact_count": len(analysis_payload.get("candidate_facts") or []),
            "conflict_count": int(((analysis_payload.get("vetting_report") or {}).get("conflict_count")) or 0)
            if isinstance(analysis_payload.get("vetting_report"), dict)
            else 0,
        },
    )
    insert_agent_prompt_hydration_trace(
        conn,
        run_trace_id=run_trace_id,
        task=task,
        agent_name="WRITING_ANALYSIS",
        prompt_version_id=None,
        context_snapshot_id=context_snapshot_id,
        hydration_inputs_json={
            "instructions": instructions[:1200],
            "chapter_id": chapter_id,
            "context_hash": str(analysis_payload.get("context_hash") or ""),
            "mcp_refs": analysis_payload.get("mcp_refs") if isinstance(analysis_payload.get("mcp_refs"), list) else [],
        },
        hydration_render_steps_json={
            "render_plan": ["historian_extractor_prompt", "candidate_fact_vetting", "snapshot_v3_build"],
            "execution_mode": "HISTORIAN_ANALYSIS_LLM",
            "trace_phase": "POST_LLM",
            "trace_status": "RESPONSE_READY",
            "trace_attempt": 1,
            "trace_source": "analysis",
        },
        hydration_output_hash=trace_prompt_hash or None,
        hydration_output_text=trace_prompt_text or None,
        llm_request_meta_json={
            **(trace_prompt_meta if isinstance(trace_prompt_meta, dict) else {}),
            "trace_phase": "POST_LLM",
            "trace_status": "RESPONSE_READY",
            "trace_attempt": 1,
            "trace_source": "analysis",
            "pre_trace_count": pre_trace_count,
            "duplicate_pre_trace_count": duplicate_pre_trace_count,
        },
    )

    cur = conn.cursor()
    try:
        # Persist staging as best-effort (legacy environments may not have the table).
        try:
            cur.execute(
                """
                INSERT INTO public.writing_analysis_staging
                  (story_id, job_id, task_id, chapter_id, source_hash, candidate_facts_json, narrative_metrics_json, vetting_json, status, updated_at)
                VALUES
                  (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, now())
                ON CONFLICT (story_id, task_id) WHERE task_id IS NOT NULL DO UPDATE SET
                  chapter_id = EXCLUDED.chapter_id,
                  source_hash = EXCLUDED.source_hash,
                  candidate_facts_json = EXCLUDED.candidate_facts_json,
                  narrative_metrics_json = EXCLUDED.narrative_metrics_json,
                  vetting_json = EXCLUDED.vetting_json,
                  status = EXCLUDED.status,
                  updated_at = now()
                """,
                (
                    story_id,
                    int(task["job_id"]),
                    int(task["id"]),
                    chapter_id,
                    str(analysis_payload.get("context_hash") or ""),
                    _json.dumps(analysis_payload.get("candidate_facts") or []),
                    _json.dumps((analysis_payload.get("snapshot_v3") or {}).get("narrative_metrics") or {}),
                    _json.dumps(
                        {
                            "vetting_report": analysis_payload.get("vetting_report") or {},
                            "external_signals": analysis_payload.get("external_signals") or {},
                        }
                    ),
                    "UNVETTED" if bool(analysis_payload.get("degraded_mode")) else str(analysis_payload.get("integration_status") or "VETTED"),
                ),
            )
        except Exception as err:
            print(
                f"[writing_analysis][staging_upsert_error] task_id={int(task['id'])} story_id={story_id} err={str(err)[:500]}",
                file=sys.stderr,
                flush=True,
            )

        # Hard persistence (F5-safe): snapshot row must be written before task is marked DONE.
        cur.execute(
            """
            INSERT INTO public.writing_snapshot_v3
              (story_id, job_id, task_id, chapter_id, fact_status, narrative_score, emotional_target, open_loops, lore_debt, snapshot_json, degraded_mode, completeness_json, ready_for_writing, pre_chapter_profile_json, truth_context_pack_json, analysis_delta_report_json)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s, %s::jsonb, %s, %s::jsonb, %s::jsonb, %s::jsonb)
            """,
            (
                story_id,
                int(task["job_id"]),
                int(task["id"]),
                chapter_id,
                fact_status,
                float(((analysis_payload.get("snapshot_v3") or {}).get("narrative_metrics") or {}).get("narrative_score") or 0.0),
                str((analysis_payload.get("snapshot_v3") or {}).get("emotional_target") or "Mixed"),
                _json.dumps((analysis_payload.get("snapshot_v3") or {}).get("open_loops") or []),
                bool(((analysis_payload.get("snapshot_v3") or {}).get("narrative_metrics") or {}).get("lore_debt")),
                _json.dumps(analysis_payload.get("snapshot_v3") or {}),
                degraded_mode,
                _json.dumps(completeness),
                ready_for_writing,
                _json.dumps(pre_chapter_profile),
                _json.dumps(truth_context_pack),
                _json.dumps(analysis_delta_report),
            ),
        )

        cur.execute(
            """
            UPDATE public.ingest_task
            SET status = 'DONE',
                updated_at = now(),
                result_json = %s::jsonb
            WHERE id = %s
            """,
            (_json.dumps(analysis_payload), int(task["id"]))
        )
        if ready_for_writing and chapter_id:
            chapter_no_match = re.search(r"(\d+)", str(chapter_id))
            chapter_no = int(chapter_no_match.group(1)) if chapter_no_match else 0
            saga_block_raw = str(os.getenv("SAGA_REBUILD_BLOCK_CHAPTERS", "8")).strip()
            try:
                saga_block = int(saga_block_raw)
            except Exception:
                saga_block = 8
            saga_block = max(5, min(10, saga_block))
            force_saga_promote = chapter_no > 0 and (chapter_no % saga_block == 0)
            saga_rebuild_reason = "CHAPTER_BLOCK" if force_saga_promote else None
            cur.execute(
                """
                SELECT 1
                FROM public.ingest_task
                WHERE job_id = %s
                  AND task_type = 'MEMORY_ROLLUP'
                  AND COALESCE(payload_json->>'chapter_id', '') = %s
                LIMIT 1
                """,
                (int(task["job_id"]), chapter_id),
            )
            already = cur.fetchone()
            if not already:
                cur.execute(
                    """
                    INSERT INTO public.ingest_task
                      (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
                    VALUES
                      (
                        %s,
                        %s,
                        'MEMORY_ROLLUP',
                        'memory_rollup',
                        'READY',
                        %s::jsonb,
                        (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = %s)
                      )
                    """,
                    (
                        int(task["job_id"]),
                        story_id,
                        _json.dumps(
                            {
                                "chapter_id": chapter_id,
                                "chapter_from": chapter_id,
                                "chapter_to": chapter_id,
                                "chapter_ids": [chapter_id],
                                "scope_type": "chapter",
                                "scope_key": chapter_id,
                                "rollup_mode": "incremental",
                                "approval_lane": "APPROVED_ONLY",
                                "force_saga_promote": bool(force_saga_promote),
                                "saga_rebuild_reason": saga_rebuild_reason,
                                "saga_rebuild_block": saga_block,
                            }
                        ),
                        int(task["job_id"]),
                    ),
                )
                cur.execute(
                    """
                    UPDATE public.ingest_job
                    SET total_tasks = total_tasks + 1,
                        updated_at = now()
                    WHERE id = %s
                    """,
                    (int(task["job_id"]),),
                )
        # For standalone historian analysis runs, complete the job when all analysis tasks are done.
        if str(task.get("created_by") or "").strip() == "historian_analysis_console":
            cur.execute(
                """
                WITH agg AS (
                  SELECT
                    count(*) FILTER (WHERE status = 'DONE')::int AS done_count,
                    count(*)::int AS total_count
                  FROM public.ingest_task
                  WHERE job_id = %s
                )
                UPDATE public.ingest_job j
                SET completed_tasks = agg.done_count,
                    total_tasks = agg.total_count,
                    status = CASE WHEN agg.done_count >= agg.total_count THEN 'DONE' ELSE j.status END,
                    updated_at = now()
                FROM agg
                WHERE j.id = %s
                """,
                (int(task["job_id"]), int(task["job_id"])),
            )
    finally:
        cur.close()


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
    )

    prose = llm_response.get("prose")
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

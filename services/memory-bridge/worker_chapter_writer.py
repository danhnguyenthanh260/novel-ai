from __future__ import annotations
import json
import os
import re
import time
from typing import Any, Dict, Optional
from worker_common import call_llm_json
from worker_ingest_repo import (
    insert_agent_context_snapshot,
    insert_agent_prompt_hydration_trace,
    insert_agent_run_trace,
)
from worker_narrative_handlers import (
    _estimate_tokens,
    assemble_prompt_layers,
    build_memory_prompt_block,
    retrieve_semantic_memories,
    sanitize_narrative_prose,
)

VALID_PREFLIGHT_STATUSES = {"proceed", "degraded", "blocked"}
REQUIRED_CONTEXT_SECTIONS = {
    "intent",
    "immediate_continuity",
    "current_state",
    "debug_source_metadata",
}
_V3_META_LEAK_PATTERNS = [
    re.compile(r"^\s*here (is|'s) (the|a) chapter\s*[:\-]?\s*$", re.IGNORECASE),
    re.compile(r"^\s*i'?ll now write the chapter\s*[:\-]?\s*$", re.IGNORECASE),
]
_V3_META_INLINE_MARKERS = [
    "as an ai language model",
    "i will now write",
]

def _env_truthy(name: str) -> bool:
    return str(os.getenv(name) or "").strip().lower() in {"1", "true", "yes", "on"}

def _validate_present_writing_context(
    writing_context: Optional[Dict[str, Any]],
    writing_context_preflight: Optional[Dict[str, Any]],
) -> str:
    if writing_context is None:
        if _env_truthy("WRITING_CONTEXT_REQUIRED"):
            raise ValueError("WRITING_CONTEXT_REQUIRED")
        return "compatibility_absent"
    if not isinstance(writing_context, dict):
        raise ValueError("WRITING_CONTEXT_MALFORMED")

    missing = sorted(section for section in REQUIRED_CONTEXT_SECTIONS if not isinstance(writing_context.get(section), dict))
    if missing:
        raise ValueError(f"WRITING_CONTEXT_MISSING_SECTIONS:{','.join(missing)}")

    if not isinstance(writing_context_preflight, dict):
        raise ValueError("WRITING_CONTEXT_PREFLIGHT_MALFORMED")
    status = writing_context_preflight.get("status")
    if status not in VALID_PREFLIGHT_STATUSES:
        raise ValueError("WRITING_CONTEXT_PREFLIGHT_STATUS_INVALID")
    if status == "blocked":
        raise ValueError("WRITING_CONTEXT_PREFLIGHT_BLOCKED")
    return "contract"

def _fallback_metadata(context_mode: str) -> Dict[str, Any]:
    if context_mode == "compatibility_absent":
        return {
            "writing_context_used": False,
            "fallback_reason_code": "LEGACY_PAYLOAD_COMPAT",
            "fallback_source": "working_set",
        }
    return {
        "writing_context_used": True,
        "fallback_reason_code": None,
        "fallback_source": None,
    }

def _compact_fact_list(items: Any, *, limit: int = 8) -> list[str]:
    if not isinstance(items, list):
        return []
    out: list[str] = []
    for item in items[:limit]:
        if isinstance(item, dict):
            label = str(item.get("label") or "").strip()
            value = str(item.get("value") or "").strip()
            if label and value:
                out.append(f"{label}: {value}")
            elif label:
                out.append(label)
        elif item:
            out.append(str(item).strip())
    return [line for line in out if line]

def _memory_query_text(
    chapter_goal: str,
    working_set: Dict[str, Any],
    writing_context: Optional[Dict[str, Any]],
) -> str:
    if isinstance(writing_context, dict):
        intent = writing_context.get("intent") or {}
        immediate = writing_context.get("immediate_continuity") or {}
        current = writing_context.get("current_state") or {}
        parts = [
            chapter_goal,
            json.dumps(intent, ensure_ascii=False, sort_keys=True),
            json.dumps(immediate, ensure_ascii=False, sort_keys=True),
            json.dumps(current, ensure_ascii=False, sort_keys=True),
        ]
        return "\n".join(str(part or "") for part in parts).strip()

    anchor = working_set.get("anchor", {}) if isinstance(working_set, dict) else {}
    active = working_set.get("active_state", {}) if isinstance(working_set, dict) else {}
    meso = working_set.get("meso_context", {}) if isinstance(working_set, dict) else {}
    return "\n".join([
        str(chapter_goal or ""),
        json.dumps(anchor, ensure_ascii=False, sort_keys=True),
        json.dumps(active, ensure_ascii=False, sort_keys=True),
        json.dumps(meso, ensure_ascii=False, sort_keys=True),
    ]).strip()

def _task_payload(task: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    payload = (task or {}).get("payload_json")
    return payload if isinstance(payload, dict) else {}

def _positive_int(value: Any) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else 0
    except Exception:
        return 0

def _extract_word_budget(
    style_options: Optional[Dict[str, Any]],
    task: Optional[Dict[str, Any]],
) -> Dict[str, int]:
    payload = _task_payload(task)
    plan = payload.get("plan") if isinstance(payload.get("plan"), dict) else {}
    contract = plan.get("chapter_output_contract_v1") if isinstance(plan.get("chapter_output_contract_v1"), dict) else {}
    word_range = contract.get("word_range") if isinstance(contract.get("word_range"), dict) else {}
    min_words = _positive_int(word_range.get("min"))
    target_words = _positive_int(word_range.get("target"))
    max_words = _positive_int(word_range.get("max"))

    if not target_words and isinstance(style_options, dict):
        target_words = _positive_int(style_options.get("target_word_count"))
    if target_words and not min_words:
        min_words = max(400, int(target_words * 0.75))
    if target_words and not max_words:
        max_words = max(min_words + 200, int(target_words * 1.25))
    if max_words and min_words and max_words < min_words:
        max_words = min_words
    return {"min": min_words, "target": target_words, "max": max_words}

def _required_location_anchor(task: Optional[Dict[str, Any]]) -> str:
    payload = _task_payload(task)
    plan = payload.get("plan") if isinstance(payload.get("plan"), dict) else {}
    context_guard = plan.get("context_guard") if isinstance(plan.get("context_guard"), dict) else {}
    return str(context_guard.get("location_anchor") or "").strip()

def _guard_chapter_v3_prose(
    raw_prose: Any,
    *,
    style_options: Optional[Dict[str, Any]],
    task: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    guard = sanitize_narrative_prose(raw_prose)
    lines = str(guard.get("text") or "").splitlines()
    kept = []
    v3_removed = 0
    for i, line in enumerate(lines):
        if i < 12 and any(pattern.search(line or "") for pattern in _V3_META_LEAK_PATTERNS):
            v3_removed += 1
            continue
        kept.append(line)
    prose = "\n".join(kept).strip()
    word_count = len(prose.split())
    budget = _extract_word_budget(style_options, task)
    anchor = _required_location_anchor(task)
    anchor_verified = bool(anchor) and (anchor.lower() in prose.lower())
    lowered_head = prose[:1200].lower()
    inline_hits = int(guard.get("inline_hits", 0)) + sum(1 for marker in _V3_META_INLINE_MARKERS if marker in lowered_head)
    removed_lines = int(guard.get("removed_lines", 0)) + v3_removed
    meta_leak = bool(guard.get("meta_leak")) or inline_hits > 0 or removed_lines > 0

    fail_reasons = []
    if not prose:
        fail_reasons.append("EMPTY_PROSE")
    if inline_hits >= 2:
        fail_reasons.append("META_LEAK")
    if budget["min"] > 0 and word_count < budget["min"]:
        fail_reasons.append("WORD_BUDGET_UNDERFLOW")
    if budget["max"] > 0 and word_count > budget["max"]:
        fail_reasons.append("WORD_BUDGET_OVERFLOW")
    if anchor and not anchor_verified:
        fail_reasons.append("ANCHOR_MISSED")

    status = "blocked" if fail_reasons else "sanitized" if removed_lines > 0 else "passed"
    return {
        "status": status,
        "fail_reasons": fail_reasons,
        "word_count": word_count,
        "word_budget_min": budget["min"],
        "word_budget_target": budget["target"],
        "word_budget_max": budget["max"],
        "meta_leak": meta_leak,
        "removed_lines": removed_lines,
        "inline_hits": inline_hits,
        "anchor_required": bool(anchor),
        "anchor": anchor or None,
        "anchor_verified": bool(anchor_verified),
        "sanitized": prose != str(raw_prose or "").strip(),
        "text": prose,
    }

def _render_writing_context_block(
    writing_context: Optional[Dict[str, Any]],
    writing_context_preflight: Optional[Dict[str, Any]],
) -> str:
    if not isinstance(writing_context, dict):
        return "WRITING CONTEXT CONTRACT:\nNot provided; use WorkingSet compatibility context.\n"

    preflight = writing_context_preflight if isinstance(writing_context_preflight, dict) else {}
    immediate = writing_context.get("immediate_continuity") or {}
    current = writing_context.get("current_state") or {}
    constraints = writing_context.get("constraints") or {}
    forbidden = writing_context.get("forbidden_reveals") or {}
    style = writing_context.get("style_anchors") or {}
    debug = writing_context.get("debug_source_metadata") or {}
    uncertainties = writing_context.get("uncertainties") or []

    lines = [
        "WRITING CONTEXT CONTRACT:",
        f"Preflight: {preflight.get('status') or debug.get('readiness', {}).get('status') or 'unknown'}",
        f"Degraded reasons: {json.dumps(preflight.get('degraded_reasons') or debug.get('degraded_reasons') or [])}",
        f"Block reasons: {json.dumps(preflight.get('block_reasons') or [])}",
        f"Continuity refs: {json.dumps(immediate.get('recent_snapshot_refs') or [])}",
        f"Active cast: {json.dumps(_compact_fact_list(current.get('active_cast')))}",
        f"Character state: {json.dumps(_compact_fact_list(current.get('character_states')))}",
        f"Open loops: {json.dumps(_compact_fact_list(immediate.get('open_loops')))}",
        f"Carry-forward hooks: {json.dumps(_compact_fact_list(immediate.get('carry_forward_hooks')))}",
        f"Allowed characters: {json.dumps(_compact_fact_list(constraints.get('allowed_characters')))}",
        f"Forbidden reveals: {json.dumps(_compact_fact_list(forbidden.get('rules')))}",
        f"Style anchors: {json.dumps(_compact_fact_list(style.get('facts'), limit=5))}",
        f"Uncertainties: {json.dumps(_compact_fact_list(uncertainties, limit=10))}",
    ]
    return "\n".join(lines) + "\n"

def _render_working_set_compatibility_block(working_set: Dict[str, Any], context_mode: str) -> str:
    if context_mode != "compatibility_absent":
        return (
            "WORKINGSET COMPATIBILITY CONTEXT:\n"
            "Disabled because a valid WritingContext is present. Do not infer canon from WorkingSet.\n"
        )

    anchor = working_set.get("anchor", {})
    active = working_set.get("active_state", {})
    meso = working_set.get("meso_context", {})
    ephemeral = working_set.get("ephemeral", {})
    return f"""WORKINGSET COMPATIBILITY CONTEXT:
Fallback reason: LEGACY_PAYLOAD_COMPAT

STORY ANCHOR:
Pitch: {anchor.get('story_pitch')}
Style: {json.dumps(anchor.get('style_dna'))}

ACTIVE WORLD STATE & CAST:
Cast: {json.dumps(active.get('cast'))}
Timeline: {json.dumps(active.get('timeline_facts'))}

CONTINUITY (MESO CONTEXT):
Unresolved Loops: {json.dumps(meso.get('unresolved_loops'))}
Recent History: {json.dumps(meso.get('milestone_summaries'))}

RECENT CHANGES (EPHEMERAL):
{json.dumps(ephemeral.get('recent_changes'))}
"""

def generate_chapter_v3(
    conn,
    story_id: int,
    chapter_id: str,
    working_set: Dict[str, Any],
    chapter_goal: str,
    style_options: Optional[Dict[str, Any]] = None,
    writing_context: Optional[Dict[str, Any]] = None,
    writing_context_preflight: Optional[Dict[str, Any]] = None,
    writing_context_debug: Optional[Dict[str, Any]] = None,
    task: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Core Chapter Writer V3 logic.
    Generates full chapter prose based on the WorkingSet.
    """

    # Prompt Construction
    context_mode = _validate_present_writing_context(writing_context, writing_context_preflight)
    preflight_status = (
        writing_context_preflight.get("status")
        if isinstance(writing_context_preflight, dict)
        else None
    )
    writing_context_block = _render_writing_context_block(writing_context, writing_context_preflight)
    working_set_block = _render_working_set_compatibility_block(working_set, context_mode)
    fallback_metadata = _fallback_metadata(context_mode)
    memory_query = _memory_query_text(chapter_goal, working_set, writing_context)
    hydration_error = None
    try:
        semantic = retrieve_semantic_memories(
            conn,
            story_id=story_id,
            chapter_id=chapter_id,
            agent_name="CHAPTER_WRITE_V3",
            query_text=memory_query,
        )
    except Exception as err:
        semantic = {"items": []}
        hydration_error = f"SEMANTIC_MEMORY_UNAVAILABLE:{str(err)[:160]}"
    memory_items = semantic.get("items") or []
    memory_block = build_memory_prompt_block(memory_items)

    default_prompt = f"""You are a master novelist writing a long-form fiction chapter.

{writing_context_block}

{working_set_block}

{memory_block}

CHAPTER OBJECTIVE:
{chapter_goal}

TASK:
Write the full prose for this chapter. Use Markdown for formatting.
Include HTML comments <!-- scene_break --> where you feel a natural scene transition occurs.

Return JSON:
{{
  "prose": "Full chapter text here...",
  "scene_markers": ["optional list of marker positions or descriptions"],
  "notes": "Internal thoughts on continuity"
}}
"""
    template_vars = {
        "chapter_goal": chapter_goal,
        "writing_context_block": writing_context_block,
        "working_set_block": working_set_block,
        "memory_block": memory_block,
    }
    try:
        assembled = assemble_prompt_layers(
            conn,
            story_id=story_id,
            chapter_id=chapter_id,
            agent_name="CHAPTER_WRITE_V3",
            task_id=int((task or {}).get("id") or 0),
            default_prompt=default_prompt,
            template_vars=template_vars,
            style_block=memory_block,
        )
    except Exception as err:
        assembled = {
            "prompt": default_prompt,
            "prompt_version_id": None,
            "assignment": None,
            "experiment_id": None,
            "agent_profile_id": None,
            "equipment_snapshot": {"layers": {"fallback": True}},
        }
        hydration_error = hydration_error or f"PROMPT_HYDRATION_UNAVAILABLE:{str(err)[:160]}"
    prompt = assembled["prompt"]
    context_snapshot_id = None
    if task:
        context_snapshot_id = insert_agent_context_snapshot(
            conn,
            story_id=story_id,
            chapter_id=chapter_id,
            snapshot_payload={
                "chapter_goal": chapter_goal,
                "writing_context_preflight": writing_context_preflight,
                "writing_context_debug": writing_context_debug,
                "working_set_keys": sorted(list(working_set.keys())) if isinstance(working_set, dict) else [],
                "memory_ids": [m.get("id") for m in memory_items],
                "hydration_error": hydration_error,
                "prompt_version_id": assembled.get("prompt_version_id"),
                "agent_profile_id": assembled.get("agent_profile_id"),
                "equipment_snapshot": assembled.get("equipment_snapshot") or {},
            },
        )

    messages = [
        {"role": "system", "content": "You are a professional novelist specializing in high-consistency long-form fiction."},
        {"role": "user", "content": prompt}
    ]

    # Chapter writing takes a lot of tokens
    started = time.time()
    response = call_llm_json(
        messages,
        max_tokens=4000,
        temperature=0.75,
        timeout_sec=300 # 5 minutes for full chapter
    )
    latency_ms = int((time.time() - started) * 1000)

    if not isinstance(response, dict):
        response = {"prose": str(response), "error": "NON_JSON_LLM_RESPONSE"}
    response.setdefault("metadata", {})
    v3_guard = _guard_chapter_v3_prose(
        response.get("prose"),
        style_options=style_options,
        task=task,
    )
    response["prose"] = v3_guard["text"]
    response["guard_status"] = v3_guard["status"]
    response["guard_fail_reasons"] = v3_guard["fail_reasons"]
    if isinstance(response["metadata"], dict):
        response["metadata"]["writing_context_mode"] = context_mode
        response["metadata"]["writing_context_used"] = fallback_metadata["writing_context_used"]
        response["metadata"]["writing_context_preflight_status"] = preflight_status or "not_provided"
        response["metadata"]["fallback_reason_code"] = fallback_metadata["fallback_reason_code"]
        response["metadata"]["fallback_source"] = fallback_metadata["fallback_source"]
        response["metadata"]["writing_context_debug_version"] = (
            writing_context_debug.get("assembler_version")
            if isinstance(writing_context_debug, dict)
            else None
        )
        response["metadata"]["prompt_version_id"] = assembled.get("prompt_version_id")
        response["metadata"]["agent_profile_id"] = assembled.get("agent_profile_id")
        response["metadata"]["memory_ids"] = [m.get("id") for m in memory_items]
        response["metadata"]["memory_hits"] = len(memory_items)
        response["metadata"]["prompt_assignment"] = assembled.get("assignment")
        response["metadata"]["experiment_id"] = assembled.get("experiment_id")
        response["metadata"]["hydration_error"] = hydration_error
        response["metadata"]["v3_guard"] = {k: v for k, v in v3_guard.items() if k != "text"}

    if task:
        run_trace_id = insert_agent_run_trace(
            conn,
            task=task,
            agent_name="CHAPTER_WRITE_V3",
            status="FAILED" if v3_guard["status"] == "blocked" else "DONE",
            input_payload={
                "chapter_goal": chapter_goal,
                "memory_ids": [m.get("id") for m in memory_items],
                "writing_context_mode": context_mode,
                "hydration_error": hydration_error,
            },
            output_payload={
                "prose_chars": len(str(response.get("prose") or "")),
                "scene_markers": response.get("scene_markers") if isinstance(response.get("scene_markers"), list) else [],
                "metadata": response.get("metadata") if isinstance(response.get("metadata"), dict) else {},
            },
            error_code=(
                f"CHAPTER_WRITE_V3_GUARDRAIL_BLOCK:{'|'.join(v3_guard['fail_reasons'])}"
                if v3_guard["status"] == "blocked"
                else None
            ),
            model_name="llm_json",
            prompt_version_id=assembled.get("prompt_version_id"),
            agent_profile_id=assembled.get("agent_profile_id"),
            equipment_snapshot_json=assembled.get("equipment_snapshot") or {},
            context_snapshot_id=context_snapshot_id,
            latency_ms=latency_ms,
            quality_json={
                "memory_hits": len(memory_items),
                "memory_ids": [m.get("id") for m in memory_items],
                "writing_context_mode": context_mode,
                "prompt_assignment": assembled.get("assignment"),
                "experiment_id": assembled.get("experiment_id"),
                "hydration_error": hydration_error,
                "v3_guard": {k: v for k, v in v3_guard.items() if k != "text"},
            },
        )
        insert_agent_prompt_hydration_trace(
            conn,
            run_trace_id=run_trace_id,
            task=task,
            agent_name="CHAPTER_WRITE_V3",
            prompt_version_id=assembled.get("prompt_version_id"),
            context_snapshot_id=context_snapshot_id,
            hydration_inputs_json={
                "context_snapshot_id": context_snapshot_id,
                "memory_ids": [m.get("id") for m in memory_items],
                "prompt_assignment": assembled.get("assignment"),
                "experiment_id": assembled.get("experiment_id"),
                "hydration_error": hydration_error,
            },
            hydration_render_steps_json={
                "layer_flags": (assembled.get("equipment_snapshot") or {}).get("layers") or {},
                "template_keys": sorted(list(template_vars.keys())),
            },
            hydration_output_text=prompt,
            llm_request_meta_json={
                "provider_call": "call_llm_json",
                "task_family": "chapter_write_v3",
                "temperature": 0.75,
                "max_tokens": 4000,
                "timeout_sec": 300,
            },
            tokens_prompt_base=_estimate_tokens(prompt),
            tokens_memory_injected=_estimate_tokens(memory_block),
            tokens_rules_injected=0,
            tokens_feedback_injected=0,
            tokens_truncated=0,
        )

    return response

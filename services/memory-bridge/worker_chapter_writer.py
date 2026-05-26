from __future__ import annotations
import json
import os
import re
import time
from typing import Any, Dict, Optional
from worker_common import call_llm_json, call_llm_text
from worker_ingest_repo import (
    insert_agent_context_snapshot,
    insert_agent_feedback_loop,
    insert_agent_prompt_hydration_trace,
    insert_agent_run_trace,
)
from worker_narrative_handlers import (
    _estimate_tokens,
    assemble_prompt_layers,
    build_memory_prompt_block,
    normalize_critic_result,
    retrieve_semantic_memories,
    sanitize_narrative_prose,
)
from worker_runtime_config import get_llm_timeout

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
        max_words = max(min_words + 200, int(target_words * 2))
    if max_words and min_words and max_words < min_words:
        max_words = min_words
    return {"min": min_words, "target": target_words, "max": max_words}

def _required_location_anchor(task: Optional[Dict[str, Any]]) -> str:
    payload = _task_payload(task)
    plan = payload.get("plan") if isinstance(payload.get("plan"), dict) else {}
    context_guard = plan.get("context_guard") if isinstance(plan.get("context_guard"), dict) else {}
    return str(context_guard.get("location_anchor") or "").strip()

def _chapter_plan_summary(task: Optional[Dict[str, Any]]) -> str:
    payload = _task_payload(task)
    plan = payload.get("plan") if isinstance(payload.get("plan"), dict) else {}
    if not plan:
        return "No structured chapter plan provided."
    summary = str(plan.get("summary") or plan.get("title") or "").strip()
    beats = plan.get("beats") if isinstance(plan.get("beats"), list) else []
    beat_lines = []
    for idx, beat in enumerate(beats[:12], start=1):
        if not isinstance(beat, dict):
            continue
        label = str(beat.get("label") or beat.get("title") or f"Beat {idx}").strip()
        desc = str(beat.get("description") or beat.get("goal") or "").strip()
        if label or desc:
            beat_lines.append(f"{idx}. {label}: {desc}".strip())
    sections = []
    if summary:
        sections.append(f"Summary: {summary}")
    if beat_lines:
        sections.append("Beats:\n" + "\n".join(beat_lines))
    return "\n\n".join(sections) if sections else json.dumps(plan, ensure_ascii=False, sort_keys=True)[:3000]

def _critic_patch_count(critic_result: Dict[str, Any]) -> int:
    patches = critic_result.get("patches")
    return len(patches) if isinstance(patches, list) else 0

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

def _run_v3_internal_critic(
    conn,
    *,
    story_id: int,
    chapter_id: str,
    chapter_goal: str,
    prose: str,
    task: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    plan_summary = _chapter_plan_summary(task)
    default_prompt = f"""
You are the internal CHAPTER_WRITE_V3 critic. Review the draft chapter below.
Return JSON only: {{ "summary": "...", "patches": ["..."] }}

Rules:
- Look for continuity, missing chapter objective, pacing, prose hygiene, and obvious reader-facing quality issues.
- Keep patches actionable and bounded. Prefer at most 5 patches.
- Do not rewrite the chapter here.
- If the draft is acceptable, return an empty patches array.

### CHAPTER OBJECTIVE
{chapter_goal}

### PLAN SUMMARY
{plan_summary}

### DRAFT PROSE
{prose}
""".strip()
    assembled = assemble_prompt_layers(
        conn,
        story_id=story_id,
        chapter_id=chapter_id,
        agent_name="CHAPTER_WRITE_V3_CRITIC",
        task_id=int((task or {}).get("id") or 0),
        default_prompt=default_prompt,
        template_vars={
            "chapter_goal": chapter_goal,
            "plan_summary": plan_summary,
            "draft_prose": prose,
        },
        style_block="",
    )
    prompt = assembled["prompt"]
    context_snapshot_id = None
    if task:
        context_snapshot_id = insert_agent_context_snapshot(
            conn,
            story_id=story_id,
            chapter_id=chapter_id,
            snapshot_payload={
                "chapter_goal": chapter_goal,
                "plan_summary": plan_summary,
                "draft_prose_chars": len(prose),
                "prompt_version_id": assembled.get("prompt_version_id"),
                "agent_profile_id": assembled.get("agent_profile_id"),
                "equipment_snapshot": assembled.get("equipment_snapshot") or {},
            },
        )

    started = time.time()
    raw = call_llm_json(
        [{"role": "user", "content": prompt}],
        max_tokens=1000,
        temperature=0.4,
        timeout_sec=get_llm_timeout("narrative_critic"),
    )
    latency_ms = int((time.time() - started) * 1000)
    critic_result = normalize_critic_result(raw)
    patch_count = _critic_patch_count(critic_result)

    run_trace_id = None
    if task:
        run_trace_id = insert_agent_run_trace(
            conn,
            task=task,
            agent_name="CHAPTER_WRITE_V3_CRITIC",
            status="DONE",
            input_payload={"chapter_goal": chapter_goal, "draft_chars": len(prose)},
            output_payload=critic_result,
            model_name="llm_json",
            prompt_version_id=assembled.get("prompt_version_id"),
            agent_profile_id=assembled.get("agent_profile_id"),
            equipment_snapshot_json=assembled.get("equipment_snapshot") or {},
            context_snapshot_id=context_snapshot_id,
            latency_ms=latency_ms,
            quality_json={
                "patch_count": patch_count,
                "prompt_assignment": assembled.get("assignment"),
                "experiment_id": assembled.get("experiment_id"),
            },
        )
        insert_agent_prompt_hydration_trace(
            conn,
            run_trace_id=run_trace_id,
            task=task,
            agent_name="CHAPTER_WRITE_V3_CRITIC",
            prompt_version_id=assembled.get("prompt_version_id"),
            context_snapshot_id=context_snapshot_id,
            hydration_inputs_json={
                "context_snapshot_id": context_snapshot_id,
                "prompt_assignment": assembled.get("assignment"),
                "experiment_id": assembled.get("experiment_id"),
            },
            hydration_render_steps_json={
                "layer_flags": (assembled.get("equipment_snapshot") or {}).get("layers") or {},
                "template_keys": ["chapter_goal", "plan_summary", "draft_prose"],
            },
            hydration_output_text=prompt,
            llm_request_meta_json={
                "provider_call": "call_llm_json",
                "task_family": "chapter_write_v3_internal_critic",
                "temperature": 0.4,
                "max_tokens": 1000,
                "timeout_sec": get_llm_timeout("narrative_critic"),
            },
            tokens_prompt_base=_estimate_tokens(prompt),
            tokens_rules_injected=0,
            tokens_memory_injected=0,
            tokens_feedback_injected=0,
            tokens_truncated=0,
        )
        feedback_type = "KEEP" if patch_count == 0 else "FIX"
        feedback_text = (
            "CHAPTER_WRITE_V3 critic passed with 0 patches. Preserve this chapter-level prose pattern."
            if patch_count == 0
            else " | ".join(str(p).strip() for p in (critic_result.get("patches") or [])[:3] if str(p).strip())[:1200]
        )
        if feedback_text:
            insert_agent_feedback_loop(
                conn,
                story_id=story_id,
                chapter_id=chapter_id,
                agent_name="CHAPTER_WRITE_V3",
                run_trace_id=run_trace_id,
                feedback_source="CRITIC",
                feedback_type=feedback_type,
                feedback_text=feedback_text,
                weight=1.5 if patch_count == 0 else min(3.0, 1.0 + (patch_count * 0.3)),
            )

    return {
        "status": "passed" if patch_count == 0 else "patches_requested",
        "patch_count": patch_count,
        "result": critic_result,
        "run_trace_id": run_trace_id,
        "prompt_version_id": assembled.get("prompt_version_id"),
        "agent_profile_id": assembled.get("agent_profile_id"),
        "prompt_assignment": assembled.get("assignment"),
        "experiment_id": assembled.get("experiment_id"),
    }

def _run_v3_internal_refine(
    conn,
    *,
    story_id: int,
    chapter_id: str,
    chapter_goal: str,
    prose: str,
    critic_result: Dict[str, Any],
    task: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    budget = _extract_word_budget(None, task)
    anchor = _required_location_anchor(task)
    budget_rule = (
        f"- Keep the final draft between {budget['min']} and {budget['max']} words, aiming near {budget['target']}."
        if budget.get("min") and budget.get("max")
        else "- Keep the final draft close to the original length."
    )
    anchor_rule = (
        f"- Include the exact phrase \"{anchor}\" at least once in reader-facing prose."
        if anchor
        else "- Preserve the location anchors from the draft."
    )
    default_prompt = f"""
Revise this chapter once using the critic feedback.

Rules:
- Output only prose, no commentary.
- Do not summarize.
- Do not add headings unless they were already present in the draft.
{budget_rule}
{anchor_rule}
- Preserve the chapter objective, continuity, and reader-facing voice.
- Apply only the patches that clearly improve the draft.

### CHAPTER OBJECTIVE
{chapter_goal}

### CRITIC SUMMARY
{critic_result.get("summary")}

### PATCHES
{json.dumps(critic_result.get("patches") or [], ensure_ascii=False)}

### DRAFT PROSE
{prose}
""".strip()
    assembled = assemble_prompt_layers(
        conn,
        story_id=story_id,
        chapter_id=chapter_id,
        agent_name="CHAPTER_WRITE_V3_REFINE",
        task_id=int((task or {}).get("id") or 0),
        default_prompt=default_prompt,
        template_vars={
            "chapter_goal": chapter_goal,
            "critic_summary": critic_result.get("summary"),
            "critic_patches": json.dumps(critic_result.get("patches") or [], ensure_ascii=False),
            "draft_prose": prose,
        },
        style_block="",
    )
    prompt = assembled["prompt"]
    context_snapshot_id = None
    if task:
        context_snapshot_id = insert_agent_context_snapshot(
            conn,
            story_id=story_id,
            chapter_id=chapter_id,
            snapshot_payload={
                "critic_result": critic_result,
                "draft_prose_chars": len(prose),
                "prompt_version_id": assembled.get("prompt_version_id"),
                "agent_profile_id": assembled.get("agent_profile_id"),
                "equipment_snapshot": assembled.get("equipment_snapshot") or {},
            },
        )

    started = time.time()
    llm_text = call_llm_text(
        [{"role": "user", "content": prompt}],
        max_tokens=4000,
        temperature=0.6,
        timeout_sec=get_llm_timeout("narrative_refine"),
    )
    latency_ms = int((time.time() - started) * 1000)
    guard = sanitize_narrative_prose(llm_text)
    refined = str(guard.get("text") or "").strip() or prose
    inline_hits = int(guard.get("inline_hits", 0))
    if inline_hits >= 2:
        raise ValueError("CHAPTER_WRITE_V3_REFINE_META_LEAK")

    run_trace_id = None
    if task:
        run_trace_id = insert_agent_run_trace(
            conn,
            task=task,
            agent_name="CHAPTER_WRITE_V3_REFINE",
            status="DONE",
            input_payload={
                "critic_summary": critic_result.get("summary"),
                "patch_count": _critic_patch_count(critic_result),
            },
            output_payload={
                "prose_chars": len(refined),
                "guard": {
                    "meta_leak": bool(guard.get("meta_leak")),
                    "removed_lines": int(guard.get("removed_lines", 0)),
                    "inline_hits": inline_hits,
                },
            },
            model_name="llm_text",
            prompt_version_id=assembled.get("prompt_version_id"),
            agent_profile_id=assembled.get("agent_profile_id"),
            equipment_snapshot_json=assembled.get("equipment_snapshot") or {},
            context_snapshot_id=context_snapshot_id,
            latency_ms=latency_ms,
            quality_json={
                "meta_leak": bool(guard.get("meta_leak")),
                "removed_lines": int(guard.get("removed_lines", 0)),
                "inline_hits": inline_hits,
                "word_count": len(refined.split()),
                "prompt_assignment": assembled.get("assignment"),
                "experiment_id": assembled.get("experiment_id"),
            },
        )
        insert_agent_prompt_hydration_trace(
            conn,
            run_trace_id=run_trace_id,
            task=task,
            agent_name="CHAPTER_WRITE_V3_REFINE",
            prompt_version_id=assembled.get("prompt_version_id"),
            context_snapshot_id=context_snapshot_id,
            hydration_inputs_json={
                "context_snapshot_id": context_snapshot_id,
                "critic_summary": critic_result.get("summary"),
                "prompt_assignment": assembled.get("assignment"),
                "experiment_id": assembled.get("experiment_id"),
            },
            hydration_render_steps_json={
                "layer_flags": (assembled.get("equipment_snapshot") or {}).get("layers") or {},
                "template_keys": ["chapter_goal", "critic_summary", "critic_patches", "draft_prose"],
            },
            hydration_output_text=prompt,
            llm_request_meta_json={
                "provider_call": "call_llm_text",
                "task_family": "chapter_write_v3_internal_refine",
                "temperature": 0.6,
                "max_tokens": 4000,
                "timeout_sec": get_llm_timeout("narrative_refine"),
            },
            tokens_prompt_base=_estimate_tokens(prompt),
            tokens_rules_injected=0,
            tokens_memory_injected=0,
            tokens_feedback_injected=_estimate_tokens(critic_result.get("summary")),
            tokens_truncated=0,
        )

    return {
        "status": "done",
        "prose": refined,
        "run_trace_id": run_trace_id,
        "guard": {
            "meta_leak": bool(guard.get("meta_leak")),
            "removed_lines": int(guard.get("removed_lines", 0)),
            "inline_hits": inline_hits,
        },
        "prompt_version_id": assembled.get("prompt_version_id"),
        "agent_profile_id": assembled.get("agent_profile_id"),
        "prompt_assignment": assembled.get("assignment"),
        "experiment_id": assembled.get("experiment_id"),
    }

def _apply_v3_internal_critic_refine(
    conn,
    *,
    story_id: int,
    chapter_id: str,
    chapter_goal: str,
    prose: str,
    task: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if _env_truthy("CHAPTER_WRITE_V3_INTERNAL_REVIEW_DISABLED"):
        return {"prose": prose, "metadata": {"status": "disabled", "refine_count": 0}}
    try:
        critic = _run_v3_internal_critic(
            conn,
            story_id=story_id,
            chapter_id=chapter_id,
            chapter_goal=chapter_goal,
            prose=prose,
            task=task,
        )
    except Exception as err:
        return {
            "prose": prose,
            "metadata": {
                "status": "critic_failed",
                "error": str(err)[:300],
                "refine_count": 0,
            },
        }

    metadata = {
        "status": critic["status"],
        "critic": {
            "patch_count": critic["patch_count"],
            "summary": (critic.get("result") or {}).get("summary"),
            "patches": (critic.get("result") or {}).get("patches") or [],
            "run_trace_id": critic.get("run_trace_id"),
            "prompt_version_id": critic.get("prompt_version_id"),
            "agent_profile_id": critic.get("agent_profile_id"),
            "prompt_assignment": critic.get("prompt_assignment"),
            "experiment_id": critic.get("experiment_id"),
        },
        "refine_count": 0,
    }
    if critic["patch_count"] <= 0:
        return {"prose": prose, "metadata": metadata}

    try:
        refine = _run_v3_internal_refine(
            conn,
            story_id=story_id,
            chapter_id=chapter_id,
            chapter_goal=chapter_goal,
            prose=prose,
            critic_result=critic["result"],
            task=task,
        )
    except Exception as err:
        metadata["status"] = "refine_failed"
        metadata["refine_error"] = str(err)[:300]
        return {"prose": prose, "metadata": metadata}

    metadata["status"] = "refined"
    metadata["refine_count"] = 1
    metadata["refine"] = {
        "run_trace_id": refine.get("run_trace_id"),
        "guard": refine.get("guard") or {},
        "prompt_version_id": refine.get("prompt_version_id"),
        "agent_profile_id": refine.get("agent_profile_id"),
        "prompt_assignment": refine.get("prompt_assignment"),
        "experiment_id": refine.get("experiment_id"),
    }
    return {"prose": refine["prose"], "metadata": metadata}

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
    plan_summary = _chapter_plan_summary(task)
    budget = _extract_word_budget(style_options, task)
    anchor = _required_location_anchor(task)
    budget_line = (
        f"- Word budget: target {budget['target']} words; acceptable range {budget['min']}-{budget['max']} words."
        if budget.get("target") and budget.get("min") and budget.get("max")
        else "- Word budget: follow the target word count from the request."
    )
    anchor_line = (
        f"- Required anchor: include the exact phrase \"{anchor}\" at least once in the prose."
        if anchor
        else "- Required anchor: preserve the plan's location anchor in prose."
    )

    default_prompt = f"""You are a master novelist writing a long-form fiction chapter.

{writing_context_block}

{working_set_block}

{memory_block}

CHAPTER OBJECTIVE:
{chapter_goal}

CHAPTER PLAN:
{plan_summary}

OUTPUT CONTRACT:
{budget_line}
{anchor_line}
- Use only reader-facing fiction prose.
- Do not introduce forests, clearings, travelers, or unrelated outside locations unless the plan says so.

TASK:
Write the full prose for this chapter. Use Markdown for formatting.
Include HTML comments <!-- scene_break --> where you feel a natural scene transition occurs.
Output only the chapter prose. Do not return JSON, notes, analysis, or commentary.
"""
    template_vars = {
        "chapter_goal": chapter_goal,
        "chapter_plan": plan_summary,
        "output_contract": "\n".join([budget_line, anchor_line]),
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
    timeout_sec = get_llm_timeout("chapter_write_v3", 300)
    prose_text = call_llm_text(
        messages,
        max_tokens=4000,
        temperature=0.75,
        timeout_sec=timeout_sec,
    )
    latency_ms = int((time.time() - started) * 1000)

    response = {
        "prose": prose_text,
        "scene_markers": [],
        "metadata": {
            "response_format": "text",
        },
    }
    response.setdefault("metadata", {})
    internal_review = _apply_v3_internal_critic_refine(
        conn,
        story_id=story_id,
        chapter_id=chapter_id,
        chapter_goal=chapter_goal,
        prose=str(response.get("prose") or ""),
        task=task,
    )
    response["prose"] = internal_review["prose"]
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
        response["metadata"]["internal_review"] = internal_review["metadata"]
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
            model_name="llm_text",
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
                "internal_review": internal_review["metadata"],
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
                "provider_call": "call_llm_text",
                "task_family": "chapter_write_v3",
                "temperature": 0.75,
                "max_tokens": 4000,
                "timeout_sec": timeout_sec,
            },
            tokens_prompt_base=_estimate_tokens(prompt),
            tokens_memory_injected=_estimate_tokens(memory_block),
            tokens_rules_injected=0,
            tokens_feedback_injected=0,
            tokens_truncated=0,
        )

    return response

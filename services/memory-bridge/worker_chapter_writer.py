from __future__ import annotations
import json
from typing import Any, Dict, Optional
from worker_common import call_llm_json

VALID_PREFLIGHT_STATUSES = {"proceed", "degraded", "blocked"}
REQUIRED_CONTEXT_SECTIONS = {
    "intent",
    "immediate_continuity",
    "current_state",
    "debug_source_metadata",
}

def _validate_present_writing_context(
    writing_context: Optional[Dict[str, Any]],
    writing_context_preflight: Optional[Dict[str, Any]],
) -> str:
    if writing_context is None:
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
) -> Dict[str, Any]:
    """
    Core Chapter Writer V3 logic.
    Generates full chapter prose based on the WorkingSet.
    """

    # Prompt Construction
    anchor = working_set.get("anchor", {})
    active = working_set.get("active_state", {})
    meso = working_set.get("meso_context", {})
    ephemeral = working_set.get("ephemeral", {})
    context_mode = _validate_present_writing_context(writing_context, writing_context_preflight)
    preflight_status = (
        writing_context_preflight.get("status")
        if isinstance(writing_context_preflight, dict)
        else None
    )
    writing_context_block = _render_writing_context_block(writing_context, writing_context_preflight)

    prompt = f"""You are a master novelist writing a long-form fiction chapter.

{writing_context_block}

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

    messages = [
        {"role": "system", "content": "You are a professional novelist specializing in high-consistency long-form fiction."},
        {"role": "user", "content": prompt}
    ]

    # Chapter writing takes a lot of tokens
    response = call_llm_json(
        messages,
        max_tokens=4000,
        temperature=0.75,
        timeout_sec=300 # 5 minutes for full chapter
    )

    if not isinstance(response, dict):
        response = {"prose": str(response), "error": "NON_JSON_LLM_RESPONSE"}
    response.setdefault("metadata", {})
    if isinstance(response["metadata"], dict):
        response["metadata"]["writing_context_mode"] = context_mode
        response["metadata"]["writing_context_used"] = isinstance(writing_context, dict)
        response["metadata"]["writing_context_preflight_status"] = preflight_status or "not_provided"
        response["metadata"]["writing_context_debug_version"] = (
            writing_context_debug.get("assembler_version")
            if isinstance(writing_context_debug, dict)
            else None
        )

    return response

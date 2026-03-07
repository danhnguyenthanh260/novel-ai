from __future__ import annotations
import json
import hashlib
from typing import Any, Dict, List, Optional
from psycopg2.extras import RealDictCursor
from worker_common import call_llm_json, parse_jsonb
from worker_runtime_config import get_llm_timeout

def _summarize_memory_context(memory_context: Dict[str, Any]) -> Dict[str, Any]:
    arc_obj = memory_context.get("arc_memory") if isinstance(memory_context.get("arc_memory"), dict) else {}
    saga_obj = memory_context.get("saga_memory") if isinstance(memory_context.get("saga_memory"), dict) else {}
    core_obj = memory_context.get("core_lookup") if isinstance(memory_context.get("core_lookup"), dict) else {}
    recent_obj = memory_context.get("recent_chapter_structured") if isinstance(memory_context.get("recent_chapter_structured"), dict) else {}
    runtime_obj = memory_context.get("memory_runtime") if isinstance(memory_context.get("memory_runtime"), dict) else {}
    milestones = arc_obj.get("milestones") if isinstance(arc_obj.get("milestones"), list) else []
    compact_milestones: List[Dict[str, Any]] = []
    for item in milestones[:8]:
        if not isinstance(item, dict):
            continue
        summary_json = item.get("summary_json") if isinstance(item.get("summary_json"), dict) else {}
        compact_milestones.append(
            {
                "id": item.get("id"),
                "chapter_from": item.get("chapter_from"),
                "chapter_to": item.get("chapter_to"),
                "pacing_state": summary_json.get("pacing_state"),
                "carry_forward_hooks": (summary_json.get("carry_forward_hooks") if isinstance(summary_json.get("carry_forward_hooks"), list) else [])[:6],
            }
        )
    core_facts = core_obj.get("facts") if isinstance(core_obj.get("facts"), list) else []
    recent_chapters = recent_obj.get("chapters") if isinstance(recent_obj.get("chapters"), list) else []
    compact_recent: List[Dict[str, Any]] = []
    for chapter in recent_chapters[:3]:
        if not isinstance(chapter, dict):
            continue
        compact_recent.append(
            {
                "chapter_id": chapter.get("chapter_id"),
                "facts": (chapter.get("facts") if isinstance(chapter.get("facts"), list) else [])[:8],
                "open_loops": (chapter.get("open_loops") if isinstance(chapter.get("open_loops"), list) else [])[:6],
                "world_rules": (chapter.get("world_rules") if isinstance(chapter.get("world_rules"), list) else [])[:6],
            }
        )
    runtime_block = memory_context.get("memory_runtime") if isinstance(memory_context.get("memory_runtime"), dict) else {}
    return {
        "memory_contract_version": "v5",
        "layer_priority": memory_context.get("layer_priority") if isinstance(memory_context.get("layer_priority"), list) else ["recent_structured", "arc", "saga", "core_db"],
        "recent_chapter_structured": {
            "chapter_ids": [x.get("chapter_id") for x in compact_recent if x.get("chapter_id")],
            "chapters": compact_recent,
        },
        "arc_memory": {
            "milestones": compact_milestones,
            "count": len(milestones),
        },
        "saga_memory": {
            "snapshot_id": saga_obj.get("snapshot_id"),
            "ready_for_writing": saga_obj.get("ready_for_writing"),
            "fact_status": saga_obj.get("fact_status"),
            "snapshot_json": saga_obj.get("snapshot_json") if isinstance(saga_obj.get("snapshot_json"), dict) else {},
        },
        "core_lookup": {
            "facts": core_facts[:12],
            "anchors": (core_obj.get("anchors") if isinstance(core_obj.get("anchors"), list) else [])[:8],
            "hits": core_obj.get("hits") if isinstance(core_obj.get("hits"), dict) else {},
        },
        "memory_runtime": {
            "overlap_dedup_ratio": float(runtime_obj.get("overlap_dedup_ratio") or 0.0),
            "arc_items_dropped_as_overlap": int(runtime_obj.get("arc_items_dropped_as_overlap") or 0),
            "layer_priority_effective": runtime_block.get("layer_priority_effective") if isinstance(runtime_block.get("layer_priority_effective"), list) else [],
            "used_counts_by_layer": runtime_block.get("used_counts_by_layer") if isinstance(runtime_block.get("used_counts_by_layer"), dict) else {},
            "dropped_counts_by_layer": runtime_block.get("dropped_counts_by_layer") if isinstance(runtime_block.get("dropped_counts_by_layer"), dict) else {},
            "degraded_reasons": runtime_block.get("degraded_reasons") if isinstance(runtime_block.get("degraded_reasons"), list) else [],
        },
    }


def generate_beat_map(
    conn,
    story_id: int,
    analysis_result: Dict[str, Any],
    instructions: str,
    chapter_no: Optional[int] = None,
    *,
    chapter_id: Optional[str] = None,
    memory_context: Optional[Dict[str, Any]] = None,
    truth_context_pack: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Planning Agent (The Architect) logic:
    Generates a scene-by-scene structural outline (Beat Map).
    """
    
    from worker_profile_learning import load_dictionary_rules
    # Combine analysis fields for RAG context
    ctx = f"{instructions} {json.dumps(analysis_result)}"
    narrative_rules = load_dictionary_rules(conn, story_id, "narrative", chapter_no=chapter_no, context_text=ctx)
    dict_section = ""
    if narrative_rules:
        dict_section = f"\nGLOBAL NARRATIVE DIRECTIVES (MUST OBEY):\n{narrative_rules}\n"

    memory_context_v4 = memory_context if isinstance(memory_context, dict) else {}
    if not memory_context_v4:
        try:
            from worker_memory_context import build_planning_context_v5
            memory_context_v4 = build_planning_context_v5(
                conn,
                story_id,
                chapter_id,
                instructions,
            )
        except Exception:
            memory_context_v4 = {"memory_contract_version": "v5", "layer_priority": ["arc", "saga", "core_db"], "error": "MEMORY_CONTEXT_UNAVAILABLE"}
    compact_memory = _summarize_memory_context(memory_context_v4)
    truth_pack = truth_context_pack if isinstance(truth_context_pack, dict) else {}
    truth_priority_a = truth_pack.get("priority_a") if isinstance(truth_pack.get("priority_a"), dict) else {}
    truth_priority_b = truth_pack.get("priority_b") if isinstance(truth_pack.get("priority_b"), dict) else {}

    prompt = (
        "You are the Planning Agent (The Architect). Your task is to create a detailed scene-by-scene outline for a new chapter.\n"
        "ANALYSIS CONTEXT (compact):\n"
        f"{json.dumps(analysis_result)}\n"
        "TRUTH CONTEXT PACK V1 (primary source of truth):\n"
        f"{json.dumps({'chapter_profile': truth_pack.get('chapter_profile') or {}, 'priority_a': truth_priority_a, 'priority_b': truth_priority_b, 'pov_sequence': truth_pack.get('pov_sequence') or [], 'compression_drops': truth_pack.get('compression_drops') or [], 'drop_risk_level': truth_pack.get('drop_risk_level') or 'unknown'})}\n"
        "LEGACY MEMORY CONTEXT V4 (shadow/fallback only):\n"
        f"{json.dumps(compact_memory)}\n"
        f"USER DIRECTIVES: {instructions}\n"
        f"{dict_section}\n"
        "TASK:\n"
        "1. Break the chapter into 2-4 scenes.\n"
        "2. For each scene, provide a title and 3-5 distinct beats.\n"
        "3. Each beat MUST have: goal, conflict, and outcome.\n"
        "4. Use TRUTH CONTEXT PACK V1 as the primary canon source.\n"
        "5. Treat legacy memory context as fallback only when TRUTH CONTEXT PACK V1 is insufficient.\n"
        "6. Use active cast, anchors, active objects, timeline constraints, open threads, visibility constraints, and voice constraints from TRUTH CONTEXT PACK V1.\n"
        "7. Follow ALL global narrative directives listed above.\n"
        "\n"
        "Return JSON with shape:\n"
        "{\n"
        "  \"chapter_summary\": \"\",\n"
        "  \"memory_evidence_refs\": [\"\"],\n"
        "  \"subplot_continuity_checks\": [\"\"],\n"
        "  \"pacing_intent\": \"\",\n"
        "  \"scenes\": [\n"
        "    {\n"
        "      \"title\": \"\",\n"
        "      \"scene_goal\": \"\",\n"
        "      \"beats\": [\n"
        "        {\n"
        "          \"goal\": \"\",\n"
        "          \"conflict\": \"\",\n"
        "          \"outcome\": \"\",\n"
        "          \"pov\": \"\",\n"
        "          \"notes\": \"\"\n"
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}"
    )

    messages = [
        {"role": "system", "content": "You are a professional story architect."},
        {"role": "user", "content": prompt}
    ]
    
    llm_out = call_llm_json(
        messages,
        max_tokens=1500,
        temperature=0.5,
        timeout_sec=get_llm_timeout("writing_planning"),
    )
    if not isinstance(llm_out, dict):
        llm_out = {}
    mem_rt = (compact_memory.get("memory_runtime") or {}) if isinstance(compact_memory.get("memory_runtime"), dict) else {}
    mem_signature = hashlib.sha256(json.dumps(compact_memory, ensure_ascii=True, sort_keys=True).encode("utf-8")).hexdigest()
    llm_out["memory_runtime_v5"] = {
        "memory_contract_version": "v5",
        "arc_memory_id": (
            (compact_memory.get("arc_memory") or {}).get("milestones", [{}])[0].get("id")
            if isinstance((compact_memory.get("arc_memory") or {}).get("milestones"), list)
            and len((compact_memory.get("arc_memory") or {}).get("milestones") or []) > 0
            else None
        ),
        "saga_snapshot_id": ((compact_memory.get("saga_memory") or {}).get("snapshot_id")),
        "core_lookup_hits": ((compact_memory.get("core_lookup") or {}).get("hits")) or {},
        "overlap_dedup_ratio": float(((compact_memory.get("memory_runtime") or {}).get("overlap_dedup_ratio")) or 0.0),
        "arc_items_dropped_as_overlap": int(((compact_memory.get("memory_runtime") or {}).get("arc_items_dropped_as_overlap")) or 0),
        "layer_priority_effective": mem_rt.get("layer_priority_effective") if isinstance(mem_rt.get("layer_priority_effective"), list) else [],
        "used_counts_by_layer": mem_rt.get("used_counts_by_layer") if isinstance(mem_rt.get("used_counts_by_layer"), dict) else {},
        "dropped_counts_by_layer": mem_rt.get("dropped_counts_by_layer") if isinstance(mem_rt.get("dropped_counts_by_layer"), dict) else {},
        "degraded_reasons": mem_rt.get("degraded_reasons") if isinstance(mem_rt.get("degraded_reasons"), list) else [],
        "evidence_refs": {
            "recent_snapshot_ids": (
                [x.get("snapshot_id") for x in (compact_memory.get("recent_chapter_structured") or {}).get("chapters", []) if isinstance(x, dict) and x.get("snapshot_id")]
                if isinstance((compact_memory.get("recent_chapter_structured") or {}).get("chapters"), list) else []
            ),
            "arc_milestone_ids": (
                [x.get("id") for x in (compact_memory.get("arc_memory") or {}).get("milestones", []) if isinstance(x, dict) and x.get("id")]
                if isinstance((compact_memory.get("arc_memory") or {}).get("milestones"), list) else []
            ),
            "saga_snapshot_id": ((compact_memory.get("saga_memory") or {}).get("snapshot_id")),
            "core_policy": ((compact_memory.get("core_lookup") or {}).get("policy")) or "approved_auto_legacy_v1",
        },
        "degraded_memory_mode": bool(compact_memory.get("error")),
        "memory_pack_signature": mem_signature,
    }
    llm_out["memory_runtime"] = llm_out["memory_runtime_v5"]
    llm_out["truth_context_pack_v1"] = truth_pack
    return llm_out

def save_draft_beat_map(conn, story_id: int, plan: Dict[str, Any], jobId: int):
    """
    Saves the generated plan into story_map_version and story_beat.
    Since we don't have real scene_ids yet for a new chapter, 
    we might need to create placeholders or store them in result_json for the UI to handle.
    """
    # For now, we return the plan in the task result so the UI can display it for review.
    # The UI will then call an 'Approve' endpoint which will materialize the scenes & beats.
    return plan

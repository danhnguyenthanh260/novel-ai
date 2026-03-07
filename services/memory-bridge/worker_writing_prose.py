from __future__ import annotations
import json
import hashlib
from typing import Any, Dict, List, Optional
from worker_common import call_llm_json, parse_jsonb
from worker_runtime_config import get_llm_timeout

def load_previous_snapshot(conn, story_id: int, scene_id: int) -> Dict[str, Any]:
    """
    Fetches the state snapshot from the PREVIOUS scene in the narrative sequence.
    """
    cur = conn.cursor(cursor_factory=None)
    try:
        cur.execute(
            """
            SELECT nss.is_stale, nss.stale_reason
            FROM public.narrative_scene_state nss
            JOIN public.narrative_scene ns ON ns.id = nss.scene_id
            WHERE nss.story_id = %s
              AND nss.scene_id < %s
              AND ns.is_verified = true
            ORDER BY nss.scene_id DESC, nss.created_at DESC
            LIMIT 1
            """,
            (story_id, scene_id)
        )
        latest_row = cur.fetchone()
        if latest_row and bool(latest_row[0]):
            reason = str(latest_row[1] or "stale snapshot")
            raise RuntimeError(f"STALE_REFERENCE:{reason}")

        cur.execute(
            """
            SELECT nss.state_snapshot 
            FROM public.narrative_scene_state nss
            JOIN public.narrative_scene ns ON ns.id = nss.scene_id
            WHERE nss.story_id = %s 
              AND nss.scene_id < %s
              AND ns.is_verified = true
              AND nss.is_stale = false
            ORDER BY nss.scene_id DESC, nss.created_at DESC
            LIMIT 1
            """,
            (story_id, scene_id)
        )
        row = cur.fetchone()
        return row[0] if row else {}
    finally:
        cur.close()

def _working_memory_excerpt(memory_context: Dict[str, Any]) -> Dict[str, Any]:
    working = memory_context.get("working_memory") if isinstance(memory_context.get("working_memory"), dict) else {}
    chapters = working.get("chapters") if isinstance(working.get("chapters"), list) else []
    compact: List[Dict[str, Any]] = []
    for ch in chapters[:3]:
        if not isinstance(ch, dict):
            continue
        scenes = ch.get("scenes") if isinstance(ch.get("scenes"), list) else []
        compact.append(
            {
                "chapter_id": ch.get("chapter_id"),
                "scenes": [
                    {
                        "scene_idx": s.get("scene_idx"),
                        "scene_title": s.get("scene_title"),
                        "text": str(s.get("text") or "")[:500],
                    }
                    for s in scenes[:4]
                    if isinstance(s, dict)
                ],
            }
        )
    saga = memory_context.get("saga_memory") if isinstance(memory_context.get("saga_memory"), dict) else {}
    core = memory_context.get("core_lookup") if isinstance(memory_context.get("core_lookup"), dict) else {}
    recent = memory_context.get("recent_chapter_structured") if isinstance(memory_context.get("recent_chapter_structured"), dict) else {}
    recent_chapters = recent.get("chapters") if isinstance(recent.get("chapters"), list) else []
    compact_recent: List[Dict[str, Any]] = []
    for ch in recent_chapters[:3]:
        if not isinstance(ch, dict):
            continue
        compact_recent.append(
            {
                "chapter_id": ch.get("chapter_id"),
                "facts": (ch.get("facts") if isinstance(ch.get("facts"), list) else [])[:6],
                "open_loops": (ch.get("open_loops") if isinstance(ch.get("open_loops"), list) else [])[:5],
            }
        )
    runtime_obj = memory_context.get("memory_runtime") if isinstance(memory_context.get("memory_runtime"), dict) else {}
    return {
        "working_memory": {"chapters": compact, "chapter_ids": [c.get("chapter_id") for c in compact if c.get("chapter_id")]},
        "recent_chapter_structured": {
            "chapter_ids": [c.get("chapter_id") for c in compact_recent if c.get("chapter_id")],
            "chapters": compact_recent,
        },
        "saga_memory": {"snapshot_id": saga.get("snapshot_id"), "snapshot_json": saga.get("snapshot_json") if isinstance(saga.get("snapshot_json"), dict) else {}, "rebuild_reason": saga.get("rebuild_reason")},
        "core_lookup": {
            "facts": (core.get("facts") if isinstance(core.get("facts"), list) else [])[:10],
            "anchors": (core.get("anchors") if isinstance(core.get("anchors"), list) else [])[:6],
            "hits": core.get("hits") if isinstance(core.get("hits"), dict) else {},
        },
        "memory_runtime": {
            "layer_priority_effective": runtime_obj.get("layer_priority_effective") if isinstance(runtime_obj.get("layer_priority_effective"), list) else [],
            "used_counts_by_layer": runtime_obj.get("used_counts_by_layer") if isinstance(runtime_obj.get("used_counts_by_layer"), dict) else {},
            "dropped_counts_by_layer": runtime_obj.get("dropped_counts_by_layer") if isinstance(runtime_obj.get("dropped_counts_by_layer"), dict) else {},
            "degraded_reasons": runtime_obj.get("degraded_reasons") if isinstance(runtime_obj.get("degraded_reasons"), list) else [],
        },
    }


def generate_prose_with_snapshot(
    conn,
    story_id: int,
    scene_id: int,
    beat: Dict[str, Any],
    instructions: str,
    chapter_no: Optional[int] = None,
    *,
    chapter_id: Optional[str] = None,
    truth_context_pack: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    snapshot = load_previous_snapshot(conn, story_id, scene_id)
    try:
        from worker_memory_context import build_prose_context_v5
        memory_context = build_prose_context_v5(
            conn,
            story_id,
            chapter_id,
            instructions,
            working_window=3,
        )
    except Exception:
        memory_context = {"memory_contract_version": "v5", "error": "MEMORY_CONTEXT_UNAVAILABLE"}
    compact_memory = _working_memory_excerpt(memory_context)
    truth_pack = truth_context_pack if isinstance(truth_context_pack, dict) else {}
    
    # Simple single-shot for now, will add iterative loop logic later
    from worker_profile_learning import load_dictionary_rules
    
    # Combine beat and instructions for RAG context
    ctx = f"{instructions} {json.dumps(beat)}"
    narrative_rules = load_dictionary_rules(conn, story_id, "narrative", chapter_no=chapter_no, context_text=ctx)
    style_rules = load_dictionary_rules(conn, story_id, "style", chapter_no=chapter_no, context_text=ctx)
    
    dict_section = ""
    if narrative_rules or style_rules:
        dict_section = "\nGLOBAL DICTIONARY & STYLE RULES (MUST OBEY):\n"
        if narrative_rules:
            dict_section += f"Narrative Directives:\n{narrative_rules}\n"
        if style_rules:
            dict_section += f"Style Directives:\n{style_rules}\n"

    prompt = (
        "You are the Writing Agent (The Stylist). Write a high-quality prose scene based on the following Beat and State Snapshot.\n"
        f"STATE SNAPSHOT (Inherited from previous scene):\n{json.dumps(snapshot)}\n\n"
        "TRUTH CONTEXT PACK V1 (primary source of truth):\n"
        f"{json.dumps(truth_pack)}\n\n"
        "WORKING MEMORY V4 (fallback only):\n"
        f"{json.dumps(compact_memory)}\n\n"
        f"BEAT TO EXECUTE:\n{json.dumps(beat)}\n\n"
        f"USER DIRECTIVES: {instructions}\n"
        f"{dict_section}\n"
        "Rules:\n"
        "1. Adhere strictly to the state snapshot (characters' physical status, inventory, etc.).\n"
        "2. Use TRUTH CONTEXT PACK V1 as the primary canon source.\n"
        "3. Treat low_confidence_entities as restricted: do not use them for reveal-critical or anchor-critical changes unless explicitly required by the beat.\n"
        "4. Follow the author's style guidelines and dictionary directives.\n"
        "5. Focus on sensory details and character voice.\n"
        "6. Use working memory only as fallback for local recall.\n"
        "\n"
        "Return JSON with shape:\n"
        "{\n"
        "  \"prose\": \"\",\n"
        "  \"scene_state_delta_hint\": \"\",\n"
        "  \"used_memory_refs\": [\"\"],\n"
        "  \"continuity_risk_flags\": [\"\"],\n"
        "  \"notes\": \"\"\n"
        "}"
    )

    messages = [
        {"role": "system", "content": "You are a professional novelist."},
        {"role": "user", "content": prompt}
    ]
    
    # We use a larger max_tokens for prose
    response = call_llm_json(
        messages,
        max_tokens=2500,
        temperature=0.7,
        timeout_sec=get_llm_timeout("writing_prose"),
    )
    if not isinstance(response, dict):
        response = {"prose": str(response)}
    rt = (compact_memory.get("memory_runtime") or {}) if isinstance(compact_memory.get("memory_runtime"), dict) else {}
    mem_signature = hashlib.sha256(json.dumps(compact_memory, ensure_ascii=True, sort_keys=True).encode("utf-8")).hexdigest()
    response["memory_runtime_v5"] = {
        "memory_contract_version": "v5",
        "working_memory_chapters": (compact_memory.get("working_memory") or {}).get("chapter_ids") if isinstance(compact_memory.get("working_memory"), dict) else [],
        "recent_structured_chapters": (compact_memory.get("recent_chapter_structured") or {}).get("chapter_ids") if isinstance(compact_memory.get("recent_chapter_structured"), dict) else [],
        "saga_snapshot_id": ((compact_memory.get("saga_memory") or {}).get("snapshot_id")) if isinstance(compact_memory.get("saga_memory"), dict) else None,
        "saga_rebuild_reason": ((compact_memory.get("saga_memory") or {}).get("rebuild_reason")) if isinstance(compact_memory.get("saga_memory"), dict) else None,
        "core_lookup_hits": ((compact_memory.get("core_lookup") or {}).get("hits")) if isinstance(compact_memory.get("core_lookup"), dict) else {},
        "layer_priority_effective": rt.get("layer_priority_effective") if isinstance(rt.get("layer_priority_effective"), list) else [],
        "used_counts_by_layer": rt.get("used_counts_by_layer") if isinstance(rt.get("used_counts_by_layer"), dict) else {},
        "dropped_counts_by_layer": rt.get("dropped_counts_by_layer") if isinstance(rt.get("dropped_counts_by_layer"), dict) else {},
        "degraded_reasons": rt.get("degraded_reasons") if isinstance(rt.get("degraded_reasons"), list) else [],
        "evidence_refs": {
            "working_chapter_ids": (compact_memory.get("working_memory") or {}).get("chapter_ids") if isinstance(compact_memory.get("working_memory"), dict) else [],
            "recent_chapter_ids": (compact_memory.get("recent_chapter_structured") or {}).get("chapter_ids") if isinstance(compact_memory.get("recent_chapter_structured"), dict) else [],
            "saga_snapshot_id": ((compact_memory.get("saga_memory") or {}).get("snapshot_id")) if isinstance(compact_memory.get("saga_memory"), dict) else None,
            "core_policy": "approved_auto_legacy_v1",
        },
        "degraded_memory_mode": bool(memory_context.get("error")),
        "memory_pack_signature": mem_signature,
    }
    response["memory_runtime"] = response["memory_runtime_v5"]
    response["truth_context_pack_v1"] = truth_pack
    return response

def process_prose_generation(
    conn,
    story_id: int,
    scene_id: int,
    beat: Dict[str, Any],
    instructions: str,
    chapter_no: Optional[int] = None,
    *,
    chapter_id: Optional[str] = None,
    truth_context_pack: Optional[Dict[str, Any]] = None,
):
    # This will involve the Writer -> Critic -> Judge loop in future iterations
    return generate_prose_with_snapshot(
        conn,
        story_id,
        scene_id,
        beat,
        instructions,
        chapter_no=chapter_no,
        chapter_id=chapter_id,
        truth_context_pack=truth_context_pack,
    )

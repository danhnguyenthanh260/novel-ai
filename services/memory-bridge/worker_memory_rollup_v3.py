import json
import logging
from typing import Dict, Any, List
from worker_common import call_llm_json

logger = logging.getLogger(__name__)

def run_memory_rollup_v3(conn, story_id: int, chapter_id: str) -> Dict[str, Any]:
    """
    V3 Memory Rollup: Consolidates chapter_ledger into story_milestone.
    """
    logger.info(f"Running V3 Memory Rollup for story={story_id} chapter={chapter_id}")

    cur = conn.cursor()
    try:
        # 1. Load the ledger for this chapter
        cur.execute(
            "SELECT added_facts, modified_states, resolved_loops, unresolved_loops FROM public.chapter_ledger WHERE story_id = %s AND chapter_id = %s",
            (story_id, chapter_id)
        )
        ledger_row = cur.fetchone()
        if not ledger_row:
            return {"status": "SKIPPED", "reason": "LEDGER_NOT_FOUND"}

        ledger = {
            "added_facts": ledger_row[0],
            "modified_states": ledger_row[1],
            "resolved_loops": ledger_row[2],
            "unresolved_loops": ledger_row[3]
        }

        # 2. Load the latest valid milestone (previous to this chapter)
        cur.execute(
            """
            SELECT summary_json FROM public.story_milestone
            WHERE story_id = %s AND is_stale = false
            ORDER BY id DESC LIMIT 1
            """,
            (story_id,)
        )
        prev_row = cur.fetchone()
        prev_milestone = prev_row[0] if prev_row else {}

        # 3. Consolidate (Merge Logic)
        # For now, we use a simple merge. In production, an LLM could help resolve state conflicts.
        new_milestone = dict(prev_milestone)

        # Merge Facts
        existing_facts = new_milestone.get("facts", [])
        new_facts = list(dict.fromkeys(existing_facts + ledger["added_facts"]))
        new_milestone["facts"] = new_facts[-100:] # Keep last 100 facts for brevity

        # Update State
        current_state = new_milestone.get("world_state", {})
        modified_states = ledger["modified_states"]
        if isinstance(modified_states, dict):
            state_items = modified_states.items()
        elif isinstance(modified_states, list):
            normalized = {}
            for item in modified_states:
                if not isinstance(item, dict):
                    continue
                entity_id = str(item.get("entity") or item.get("entity_id") or "").strip()
                prop = str(item.get("property") or item.get("prop") or "").strip()
                if not entity_id or not prop:
                    continue
                normalized.setdefault(entity_id, {})[prop] = item.get("new_value")
            state_items = normalized.items()
        else:
            state_items = []
        for entity_id, props in state_items:
            if not isinstance(props, dict):
                continue
            if entity_id not in current_state:
                current_state[entity_id] = {}
            current_state[entity_id].update(props)
        new_milestone["world_state"] = current_state

        # Update Loops
        # (Simplified: just override unresolved loops for now)
        new_milestone["unresolved_loops"] = ledger["unresolved_loops"]

        # 4. Persistence
        source_hash = f"v3:{chapter_id}" # Simple identifier
        cur.execute(
            """
            INSERT INTO public.story_milestone
            (story_id, chapter_from, chapter_to, summary_json, source_hash, created_by)
            VALUES (%s, %s, %s, %s::jsonb, %s, 'memory_rollup_v3')
            ON CONFLICT (story_id, chapter_from, chapter_to, source_hash)
            WHERE source_hash IS NOT NULL AND source_hash <> ''
            DO UPDATE SET
                summary_json = EXCLUDED.summary_json,
                updated_at = now()
            RETURNING id
            """,
            (story_id, chapter_id, chapter_id, json.dumps(new_milestone), source_hash)
        )
        milestone_id = cur.fetchone()[0]

        conn.commit()
        return {"status": "OK", "milestone_id": milestone_id}

    finally:
        cur.close()

from __future__ import annotations

import json
from typing import Any, Dict, List

from worker_common import call_llm_json
from worker_runtime_config import get_llm_timeout

def extract_state_delta_raw(prose: str, previous_snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """
    Pass 1: Extractor. Focuses purely on identifying raw changes from prose.
    """
    prompt = (
        "You are the State Extractor. Identify CHANGES in the story state after this scene.\n"
        "PREVIOUS SNAPSHOT:\n"
        f"{json.dumps(previous_snapshot)}\n"
        "\n"
        "NEW PROSE SCENE:\n"
        f"{prose[:7000]}\n"
        "\n"
        "TASK:\n"
        "1. Identify changes to characters (wounds, inventory delta, emotional state).\n"
        "2. Identify changes to the world state.\n"
        "Return ONLY the changes (Delta) in JSON format.\n"
        "\n"
        "Return JSON with shape:\n"
        "{\n"
        "  \"delta\": {\n"
        "    \"characters\": { \"char_id\": { \"transient\": { \"status\": [...] } } },\n"
        "    \"world\": { ... }\n"
        "  }\n"
        "}"
    )
    messages = [
        {"role": "system", "content": "You are a precise JSON state extractor for local 7B models."},
        {"role": "user", "content": prompt}
    ]
    return call_llm_json(
        messages,
        max_tokens=800,
        temperature=0.1,
        timeout_sec=get_llm_timeout("writing_continuity_extract"),
    )

def validate_object_integrity(prose: str, snapshot: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Pass 2: Integrity Guard. Maps nouns in prose to unique object IDs in Snapshot.
    Prevents 'Baton' mutation into 'Iron Bar'.
    """
    inventory_ledger = {}
    for char_id, char_data in snapshot.get("characters", {}).items():
        inv = char_data.get("inventory", [])
        if inv:
            inventory_ledger[char_id] = inv

    prompt = (
        "You are the Object Integrity Guard. Your task is to ensure objects in the story remain consistent.\n"
        "SNAPSHOT INVENTORY LEDGER:\n"
        f"{json.dumps(inventory_ledger)}\n"
        "\n"
        "NEW PROSE SCENE:\n"
        f"{prose[:7000]}\n"
        "\n"
        "TASK:\n"
        "Match every weapon or tool used in the prose to an ID in the Ledger.\n"
        "If an object's nature changed (e.g. 'Baton' becomes 'Iron Bar'), flag as WARNING_OBJECT_MUTATION.\n"
        "\n"
        "Return JSON with shape:\n"
        "{\n"
        "  \"integrity_flags\": [\n"
        "    {\"severity\": \"warning\", \"issue\": \"Object Mutation\", \"details\": \"Kuro used 'Iron Bar' but snapshot contains 'Baton' (item_001)\"}\n"
        "  ]\n"
        "}"
    )
    messages = [
        {"role": "system", "content": "You are a strict narrative logic guard focused on object identity."},
        {"role": "user", "content": prompt}
    ]
    res = call_llm_json(
        messages,
        max_tokens=600,
        temperature=0.1,
        timeout_sec=get_llm_timeout("writing_continuity_integrity"),
    )
    return res.get("integrity_flags") or []

def extract_state_delta(conn, prose: str, previous_snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """
    Orchestrates the Two-Pass Continuity System.
    """
    # Pass 1: Extract changes
    delta_res = extract_state_delta_raw(prose, previous_snapshot)
    
    # Pass 2: Integrity Check
    integrity_flags = validate_object_integrity(prose, previous_snapshot)
    
    return {
        "delta": delta_res.get("delta") or {},
        "logic_flags": integrity_flags
    }
    
def merge_delta_to_snapshot(base: Dict[str, Any], delta: Dict[str, Any]) -> Dict[str, Any]:
    new_state = base.copy()
    if not delta:
        return new_state
    
    # Merge characters
    if "characters" in delta:
        if "characters" not in new_state:
            new_state["characters"] = {}
        for char_id, char_delta in delta["characters"].items():
            if char_id not in new_state["characters"]:
                new_state["characters"][char_id] = char_delta
            else:
                for field, val in char_delta.items():
                    if isinstance(val, dict) and field in new_state["characters"][char_id]:
                        new_state["characters"][char_id][field].update(val)
                    else:
                        new_state["characters"][char_id][field] = val
                        
    # Merge world
    if "world" in delta:
        if "world" not in new_state:
            new_state["world"] = {}
        new_state["world"].update(delta["world"])
        
    return new_state

def save_scene_state(conn, story_id: int, scene_id: int, scene_version_id: int, snapshot: Dict[str, Any], algo_version: str, validation_errors: List[Dict[str, Any]] = []):
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO public.narrative_scene_state
              (story_id, scene_id, scene_version_id, state_snapshot, algo_version, validation_errors, is_stale)
            VALUES
              (%s, %s, %s, %s, %s, %s, false)
            ON CONFLICT (scene_version_id, algo_version)
            DO UPDATE SET
              state_snapshot = EXCLUDED.state_snapshot,
              validation_errors = EXCLUDED.validation_errors,
              updated_at = now()
            """,
            (story_id, scene_id, scene_version_id, json.dumps(snapshot), algo_version, json.dumps(validation_errors))
        )
    finally:
        cur.close()

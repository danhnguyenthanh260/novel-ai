from __future__ import annotations
import json
from typing import Any, Dict, List, Optional
from worker_common import call_llm_json, parse_jsonb
from worker_runtime_config import get_llm_timeout

def supervise_prose(conn, story_id: int, prose: str, target_wc: int, instructions: str, continuity_flags: List[Dict[str, Any]] = [], chapter_no: Optional[int] = None) -> Dict[str, Any]:
    """
    Supervisor Agent (The Editor) logic:
    Polishes prose and performs the final 'Reality Check' for Object Integrity.
    """
    
    from worker_profile_learning import load_dictionary_rules
    style_rules = load_dictionary_rules(conn, story_id, "style", chapter_no=chapter_no, context_text=prose)
    dict_section = ""
    if style_rules:
        dict_section = f"\nGLOBAL STYLE DIRECTIVES:\n{style_rules}\n"

    current_wc = len(prose.split())
    needs_pruning = current_wc > (target_wc + 200)

    # Check for integrity threats from Continuity Agent
    integrity_warnings = [f["details"] for f in continuity_flags if f.get("issue") == "Object Mutation"]

    prompt = (
        "You are the Supervisor Agent (The Editor). Your task is to polish the final prose and ensure Reality Consistency.\n"
        f"CURRENT WORD COUNT: {current_wc}\n"
        f"TARGET WORD COUNT: {target_wc}\n"
        f"REALITY WARNINGS: {json.dumps(integrity_warnings)}\n"
        f"USER DIRECTIVES: {instructions}\n"
        "\n"
        "CONSTRAINTS:\n"
        "1. REALITY CHECK: If a REALITY WARNING exists (e.g. 'Baton' became 'Iron Bar'), you MUST fix the prose to use the correct original object if possible, or flag it clearly.\n"
        "2. Only remove repetition/redundancy. Maintain author voice.\n"
        f"{'3. CRITICAL: The chapter is too long. Prune strictly.' if needs_pruning else ''}\n"
        f"{dict_section}\n"
        "PROSE TO POLISH:\n"
        f"{prose[:18000]}\n"
        "\n"
        "TASK:\n"
        "1. Polish/Prune the prose.\n"
        "2. Address REALITY WARNINGS.\n"
        "3. Return the polished prose and a summary of edits.\n"
        "\n"
        "Return JSON with shape:\n"
        "{\n"
        "  \"polished_prose\": \"\",\n"
        "  \"edit_summary\": \"\",\n"
        "  \"final_word_count\": 0,\n"
        "  \"integrity_fixed\": true/false\n"
        "}"
    )

    messages = [
        {"role": "system", "content": "You are a senior literary editor tasked with maintaining world-state integrity on local hardware (7B)."},
        {"role": "user", "content": prompt}
    ]
    
    return call_llm_json(
        messages,
        max_tokens=3500,
        temperature=0.3,
        timeout_sec=get_llm_timeout("writing_supervisor"),
    )

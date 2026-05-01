import json
import logging
from typing import Dict, Any, List
from worker_common import call_llm_json

logger = logging.getLogger(__name__)

def extract_ledger(full_text: str, working_set: Dict[str, Any], chapter_goal: str) -> Dict[str, Any]:
    """
    Extracts deltas (added facts, modified states, resolved/unresolved loops)
    from chapter prose by comparing it with the WorkingSet.
    """
    logger.info("Extracting ledger from chapter prose...")

    prompt = f"""
    Role: Story Ledger Historian
    Task: Analyze the provided chapter prose and identify all factual and state changes.

    Goal: {chapter_goal}

    Reference WorkingSet (Current State):
    {json.dumps(working_set, indent=2)}

    Prose:
    ---
    {full_text}
    ---

    Identify:
    1. New facts introduced (e.g., items found, names revealed).
    2. State changes for characters or world (e.g., relationship shift, injury, location change).
    3. Story loops resolved vs those that remain open.

    Return JSON format:
    {{
      "added_facts": ["string"],
      "modified_states": [{{ "entity": "name", "property": "attr", "old_value": "...", "new_value": "..." }}],
      "resolved_loops": ["loop_id"],
      "unresolved_loops": ["loop_id"]
    }}
    """

    messages = [
        {"role": "system", "content": "You are a professional story historian specializing in tracking narrative consistency and state changes."},
        {"role": "user", "content": prompt}
    ]

    response = call_llm_json(messages, max_tokens=1500)

    if not isinstance(response, dict):
        response = {
            "added_facts": [],
            "modified_states": [],
            "resolved_loops": [],
            "unresolved_loops": [],
            "error": "NON_JSON_LLM_RESPONSE"
        }

    response["metadata"] = {
        "extractor_version": "v1",
        "model": "gpt-4o"
    }

    return response

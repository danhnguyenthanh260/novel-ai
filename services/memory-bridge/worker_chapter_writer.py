from __future__ import annotations
import json
from typing import Any, Dict, Optional
from worker_common import call_llm_json

def generate_chapter_v3(
    conn,
    story_id: int,
    chapter_id: str,
    working_set: Dict[str, Any],
    chapter_goal: str,
    style_options: Optional[Dict[str, Any]] = None
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

    prompt = f"""You are a master novelist writing a long-form fiction chapter.

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

    return response

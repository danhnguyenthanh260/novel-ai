import json
import logging
from typing import Dict, Any, List
from worker_common import call_llm_json

logger = logging.getLogger(__name__)

def audit_chapter(full_text: str, working_set: Dict[str, Any], chapter_goal: str) -> List[Dict[str, Any]]:
    """
    Runs multi-layered audit:
    1. Hard Consistency (Fact check)
    2. Soft Style (Tone check)
    3. Release Readiness (Formatting check)
    """
    logger.info("Auditing chapter prose for continuity errors...")

    prompt = f"""
    Role: Master Continuity Editor
    Instructions: Review the provided prose against the story's ground truth and style guidelines.

    WorkingSet (Truth Source):
    {json.dumps(working_set, indent=2)}

    Goal: {chapter_goal}

    Prose Under Review:
    ---
    {full_text}
    ---

    Layers:
    1. Hard Consistency: Check for contradictions in facts, character locations, or world rules.
    2. Soft Style: Identify deviations from the prescribed tone, Style DNA, or character voice.
    3. Release Readiness: Ensure the chapter is complete and markers are correctly placed.

    Severities:
    - CRITICAL: Must be fixed (logic breaking, fact contradiction).
    - MAJOR: Highly recommended (serious continuity flaw or character break).
    - MINOR: Subjective/Style (polish, pacing).

    Return JSON format:
    [
      {{
        "issue_code": "LOGIC_ERROR | STYLE_BREAK | FORMATTING",
        "severity": "CRITICAL | MAJOR | MINOR",
        "message": "Description of the issue",
        "location": {{ "context": "snippet where issue occurs" }},
        "auto_patch_available": true/false
      }}
    ]
    """

    messages = [
        {"role": "system", "content": "You are a professional editor specializing in long-form narrative consistency and quality assurance."},
        {"role": "user", "content": prompt}
    ]

    response = call_llm_json(messages, max_tokens=2000)

    if not isinstance(response, list):
        # Handle case where LLM returns a dict or wrap error
        if isinstance(response, dict) and "issues" in response:
            return response["issues"]
        return []

    return response

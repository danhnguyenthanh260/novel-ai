from __future__ import annotations

import os
from typing import Dict


def _as_int(name: str, default: int, *, min_value: int = 1, max_value: int = 3600) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except Exception:
        value = default
    if value < min_value:
        return min_value
    if value > max_value:
        return max_value
    return value


# Single source of truth for worker timing config.
#
# You can override every value via env var without code changes.
# Example:
#   LLM_TIMEOUT_SPLIT=90
#   LLM_TIMEOUT_WRITING_ANALYSIS=120
#   LLM_TIMEOUT_DEFAULT=60
#   LLM_COOL_OFF_SECONDS=30
GLOBAL_LLM_COOL_OFF_SECONDS = _as_int("LLM_COOL_OFF_SECONDS", 2, min_value=0, max_value=1800)
LLM_TIMEOUT_DEFAULT = _as_int("LLM_TIMEOUT_DEFAULT", 60, min_value=5, max_value=1800)
LLM_EMBED_TIMEOUT_DEFAULT = _as_int("LLM_EMBED_TIMEOUT_DEFAULT", 20, min_value=3, max_value=1800)


LLM_TIMEOUTS: Dict[str, int] = {
    # Split pipeline
    "split_boundary": _as_int("LLM_TIMEOUT_SPLIT_BOUNDARY", _as_int("LLM_TIMEOUT_SPLIT", 90)),
    "split_semantic_resplit": _as_int("LLM_TIMEOUT_SPLIT_SEMANTIC_RESPLIT", _as_int("LLM_TIMEOUT_SPLIT", 90)),
    "split_reviewer_gate": _as_int("LLM_TIMEOUT_SPLIT_REVIEWER", _as_int("LLM_TIMEOUT_SPLIT", 90)),
    "split_scene_title": _as_int("LLM_TIMEOUT_SPLIT_SCENE_TITLE", _as_int("LLM_TIMEOUT_SPLIT", 90)),
    # Writing and analysis
    "writing_analysis": _as_int("LLM_TIMEOUT_WRITING_ANALYSIS", _as_int("LLM_TIMEOUT_WRITING", 300)),
    "writing_planning": _as_int("LLM_TIMEOUT_WRITING_PLANNING", _as_int("LLM_TIMEOUT_WRITING", 120)),
    "writing_prose": _as_int("LLM_TIMEOUT_WRITING_PROSE", _as_int("LLM_TIMEOUT_WRITING", 150)),
    "writing_supervisor": _as_int("LLM_TIMEOUT_WRITING_SUPERVISOR", _as_int("LLM_TIMEOUT_WRITING", 150)),
    "writing_continuity_extract": _as_int("LLM_TIMEOUT_WRITING_CONTINUITY_EXTRACT", _as_int("LLM_TIMEOUT_WRITING", 120)),
    "writing_continuity_integrity": _as_int("LLM_TIMEOUT_WRITING_CONTINUITY_INTEGRITY", _as_int("LLM_TIMEOUT_WRITING", 120)),
    # Narrative agents
    "narrative_stylist": _as_int(
        "LLM_TIMEOUT_NARRATIVE_STYLIST",
        _as_int("LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS", _as_int("LLM_TIMEOUT_NARRATIVE", 120)),
    ),
    "narrative_critic": _as_int(
        "LLM_TIMEOUT_NARRATIVE_CRITIC",
        _as_int("LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS", _as_int("LLM_TIMEOUT_NARRATIVE", 120)),
    ),
    "narrative_refine": _as_int(
        "LLM_TIMEOUT_NARRATIVE_REFINE",
        _as_int("LLM_TIMEOUT_CHAPTER_REFINE_SECONDS", _as_int("LLM_TIMEOUT_NARRATIVE", 120)),
    ),
    "chapter_write_v3": _as_int(
        "LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS",
        _as_int("LLM_TIMEOUT_NARRATIVE", 300),
    ),
    # Validation + memory
    "chapter_validate": _as_int("LLM_TIMEOUT_CHAPTER_VALIDATE", 60),
    "memory_pack": _as_int("LLM_TIMEOUT_MEMORY_PACK", 90),
    "embedding": _as_int("LLM_TIMEOUT_EMBEDDING", LLM_EMBED_TIMEOUT_DEFAULT),
    # Grand Historian external adapters (MCP/Qdrant/Neo4j)
    "historian_qdrant": _as_int("LLM_TIMEOUT_HISTORIAN_QDRANT", 12),
    "historian_neo4j": _as_int("LLM_TIMEOUT_HISTORIAN_NEO4J", 12),
}


def get_llm_timeout(task_key: str, default: int | None = None) -> int:
    return int(LLM_TIMEOUTS.get(task_key, default or LLM_TIMEOUT_DEFAULT))

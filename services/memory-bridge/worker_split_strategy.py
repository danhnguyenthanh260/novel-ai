from __future__ import annotations

from typing import Dict, List, Optional, Sequence

from worker_split_policy import has_strong_hints, stable_exploration_roll


def plan_strategy_order(
    *,
    strategies: Sequence[str],
    issue_hints: Dict[str, float],
    boundary_type_hints: Dict[str, float],
    feedback_penalties: Dict[str, float],
    supervisor_strategy_bias: Dict[str, float],
    issue_bias: Dict[str, float],
    boundary_type_bias: Dict[str, float],
    chapter_confident: bool,
    global_confident: bool,
    best_by_signature: Dict[str, str],
    split_mode: str,
    chapter_text: str,
    chapter_id: str,
    self_healing_enabled: bool,
    auto_retry_enabled: bool,
    forced_preferred: Optional[str],
    chapter_best: Optional[str],
    global_best: Optional[str],
    strong_hint_threshold: float,
    long_chapter_chars: int,
    exploration_rate: float,
) -> Dict[str, object]:
    preferred = forced_preferred
    profile_scope = "chapter"
    if not preferred:
        if chapter_confident:
            preferred = chapter_best
            profile_scope = "chapter"
        elif global_confident:
            preferred = global_best
            profile_scope = "global"
        else:
            preferred = best_by_signature.get("LAST_BEST")
            profile_scope = "chapter_fallback"

    strategy_list = list(strategies)
    if isinstance(preferred, str) and preferred in strategy_list:
        base_order: List[str] = [preferred, *[s for s in strategy_list if s != preferred]]
    else:
        base_order = strategy_list[:]

    ordered = sorted(
        base_order,
        key=lambda s: (
            float(feedback_penalties.get(s) or 0.0)
            + float(supervisor_strategy_bias.get(s) or 0.0)
            + float(issue_bias.get(s) or 0.0)
            + float(boundary_type_bias.get(s) or 0.0),
            base_order.index(s),
        ),
    )

    has_strong_issue_hints = has_strong_hints(issue_hints, boundary_type_hints, strong_hint_threshold)
    # REMOVED: Harcoded S0_BASE enforcement for long chapters. 
    # Logic now honors the 'base_order' which respects preferred strategies and biases.

    exploration_roll = stable_exploration_roll(chapter_id, chapter_text)
    exploration_enabled = (
        self_healing_enabled
        and auto_retry_enabled
        and len(ordered) > 1
        and exploration_roll < float(exploration_rate)
    )

    return {
        "preferred": preferred,
        "profile_scope": profile_scope,
        "ordered": ordered,
        "exploration_roll": exploration_roll,
        "exploration_enabled": exploration_enabled,
        "has_strong_issue_hints": has_strong_issue_hints,
    }

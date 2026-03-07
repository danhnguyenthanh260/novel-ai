from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Tuple
from worker_runtime_config import get_llm_timeout


def starts_with_lower_or_punct(text: str) -> bool:
    t = text.lstrip()
    if not t:
        return False
    if re.match(r"^[a-z]", t):
        return True
    if re.match(r"^[,.;:!?]", t):
        return True
    return False


def is_abbrev_or_name_split_at(
    text: str,
    at: int,
    *,
    abbrev_pattern,
    initial_pattern,
    name_head_pattern,
) -> bool:
    left = text[max(0, at - 28) : at]
    right = text[at : min(len(text), at + 28)]
    right_norm = right.lstrip()
    right_norm = re.sub(r"^[\"'“”‘’(\[]+", "", right_norm)
    if abbrev_pattern.search(left.rstrip()) and name_head_pattern.match(right_norm):
        return True
    if initial_pattern.search(left.rstrip()) and name_head_pattern.match(right_norm):
        return True
    return False


def is_quote_continuity_break_at(text: str, at: int) -> bool:
    left = text[max(0, at - 40) : at]
    right = text[at : min(len(text), at + 40)]
    if re.search(r"[\"“‘]\s*$", left) and re.match(r"^[^\"”’]{1,40}$", right.strip()):
        return True
    if re.match(r"^[\"”’]", right.lstrip()):
        return True
    return False


def boundary_penalty(
    text: str,
    at: int,
    *,
    split_min_scene_chars: int,
    ends_with_terminal_punct,
    starts_with_lower_or_punct,
    is_abbrev_or_name_split_at,
) -> int:
    left = text[:at].rstrip()
    right = text[at:].lstrip()
    penalty = 0
    if not ends_with_terminal_punct(left):
        penalty += 3
    if starts_with_lower_or_punct(right):
        penalty += 3
    if len(left) < split_min_scene_chars or len(right) < split_min_scene_chars:
        penalty += 10
    if is_abbrev_or_name_split_at(text, at):
        penalty += 14
    return penalty


def boundary_issue_score(
    text: str,
    at: int,
    *,
    split_min_scene_chars: int,
    ends_with_terminal_punct,
    starts_with_lower_or_punct,
    is_abbrev_or_name_split_at,
    is_quote_continuity_break_at,
) -> int:
    left = text[:at].rstrip()
    right = text[at:].lstrip()
    score = 0
    if not ends_with_terminal_punct(left):
        score += 3
    if starts_with_lower_or_punct(right):
        score += 3
    left_tail = left[-12:]
    right_head = right[:12]
    if re.search(r"[A-Za-z]{2,}$", left_tail) and re.match(r"^[a-z]{2,}", right_head):
        score += 4
    if is_abbrev_or_name_split_at(text, at):
        score += 16
    if is_quote_continuity_break_at(text, at):
        score += 3
    if len(left) < split_min_scene_chars or len(right) < split_min_scene_chars:
        score += 10
    return score


def refine_boundary(
    text: str,
    at: int,
    lock_spans: List[Tuple[int, int]],
    *,
    split_min_scene_chars: int,
    boundary_penalty,
    nearby_natural_boundaries,
    in_locked_span,
) -> int:
    base_penalty = boundary_penalty(text, at)
    candidates = nearby_natural_boundaries(text, at, 320)
    if not candidates:
        return at

    best = at
    best_score = (base_penalty, 10**9)
    for pos, tier in candidates:
        if pos <= split_min_scene_chars or pos >= len(text) - split_min_scene_chars:
            continue
        if in_locked_span(pos, lock_spans):
            continue
        penalty = boundary_penalty(text, pos)
        distance = abs(pos - at)
        score = (penalty + tier, distance)
        if score < best_score:
            best_score = score
            best = pos
    return best


def refine_split_points(
    text: str,
    split_points: List[int],
    lock_spans: List[Tuple[int, int]],
    *,
    split_min_scene_chars: int,
    split_min_gap: int,
    refine_boundary,
) -> List[int]:
    if not split_points:
        return []
    refined: List[int] = []
    for i, at in enumerate(split_points):
        candidate = refine_boundary(text, at, lock_spans)
        if refined:
            candidate = max(candidate, refined[-1] + split_min_gap)
        if i + 1 < len(split_points):
            candidate = min(candidate, split_points[i + 1] - split_min_gap)
        if candidate <= split_min_scene_chars or candidate >= len(text) - split_min_scene_chars:
            candidate = at
        refined.append(candidate)
    out: List[int] = []
    prev = -1
    for p in refined:
        if p <= prev:
            p = prev + split_min_gap
        if p >= len(text) - split_min_scene_chars:
            break
        out.append(p)
        prev = p
    return out


def normalize_split_points(
    points: List[int],
    text_len: int,
    *,
    split_min_scene_chars: int,
    split_min_gap: int,
) -> List[int]:
    out: List[int] = []
    prev = split_min_scene_chars
    for p in sorted(set(points)):
        if p <= split_min_scene_chars:
            continue
        if p >= text_len - split_min_scene_chars:
            continue
        p2 = max(p, prev + split_min_gap if out else p)
        if p2 >= text_len - split_min_scene_chars:
            continue
        out.append(p2)
        prev = p2
    return out


def llm_semantic_resplit_offsets(
    chapter_text: str,
    split_points: List[int],
    llm_state: Dict[str, int],
    *,
    reprocess_note: Optional[str] = None,
    previous_split_contexts: Optional[List[str]] = None,
    active_constraints: Optional[List[str]] = None,
    constraint_pack_mode: Optional[str] = None,
    s3_min_confidence: float,
    s3_max_offset_jump: int,
    s3_min_proof_ratio: float,
    s3_max_rejected_jump_ratio: float,
    llm_can_run,
    llm_consume_call,
    call_llm_json,
    normalize_split_points,
    hard_anchor_positions: Optional[List[int]] = None,
    hard_anchor_tolerance_chars: int = 200,
) -> Tuple[List[int], Dict[str, Any]]:
    report: Dict[str, Any] = {
        "accepted": False,
        "reason": "",
        "confidence": 0.0,
        "moved_boundaries": 0,
        "proof_count": 0,
        "proof_ratio": 0.0,
        "jump_rejected_count": 0,
        "anchor_guard_clamped_count": 0,
        "anchor_guard_violations": 0,
    }
    if not split_points:
        report["reason"] = "NO_SPLIT_POINTS"
        return split_points, report
    if not llm_can_run(llm_state):
        report["reason"] = "LLM_BUDGET_EXCEEDED"
        return split_points, report

    boundaries_payload: List[Dict[str, Any]] = []
    for idx, at in enumerate(split_points, start=1):
        left_start = max(0, at - 180)
        right_end = min(len(chapter_text), at + 180)
        boundaries_payload.append(
            {
                "boundary_index": idx,
                "old_at": at,
                "left_excerpt": chapter_text[left_start:at],
                "right_excerpt": chapter_text[at:right_end],
            }
        )

    critic_context = ""
    if reprocess_note or (previous_split_contexts and len(previous_split_contexts) > 0) or active_constraints:
        critic_context = "\n[CRITIC FEEDBACK FROM PREVIOUS REJECTED ATTEMPT]:\n"
        if reprocess_note:
            critic_context += f"Supervisor Note: {reprocess_note}\n"
        if constraint_pack_mode:
            critic_context += f"Constraint Pack Mode: {constraint_pack_mode}\n"
        if active_constraints:
            critic_context += "CRITICAL CONSTRAINTS TO FIX:\n"
            for c in active_constraints:
                critic_context += f"- {c}\n"
        if previous_split_contexts:
            critic_context += "Context Snippets of Bad Boundaries:\n"
            for snp in previous_split_contexts:
                critic_context += f"- \"...{snp}...\"\n"
        critic_context += "\nAnalyze the Feedback above. You MUST NOT split at the exact same bad contexts again. Fix the errors.\n"

    prompt = (
        "You are a Senior Strategic Narrative Architect for web fiction.\n"
        "Your goal is to adjust proposed scene boundaries into high-quality 'Concrete Blocks' that preserve narrative weight and continuity.\n"
        "\n"
        "UNIVERSAL NARRATIVE PILLARS:\n"
        "1. DIALOGUE ANCHOR: Never split a continuous conversation. A scene must encompass the entirety of a dialogue exchange, including internal reflections, until a natural pause or location shift occurs.\n"
        "2. NARRATIVE WEIGHT: Prioritize 'Concrete Blocks' (2000-3000 characters). Avoid splitting for minor atmospheric shifts or reactive gestures. Each scene must contain a significant plot movement or emotional arc.\n"
        "3. SENSORY INTEGRITY: Abstract sequences (Void, dreams, hallucinations) are single cohesive units. Preserve the character's internal continuity even if the perceived location shifts within the vision.\n"
        "4. PHYSICAL DOMINANCE: Hard boundaries are strictly reserved for significant physical relocation in the 'real world' or major time skips (>1 hour).\n"
        "5. STRUCTURAL FIDELITY: Maintain 100% of the original paragraph structure and whitespace. Do not inject or remove line breaks.\n"
        "\n"
        "STRATEGY: If a proposed boundary creates a fragment smaller than 2000 characters, you SHOULD merge it with the adjacent scene unless it violates Pillar 4 (Hard Boundary). Efficiency and weight are your primary metrics.\n"
        "\n"
        "OUTPUT FORMAT (STRICT JSON ONLY):\n"
        '{"offsets":[123,456], "confidence":0.95, "proofs":[{"boundary_index":1,"old_at":1200,"new_at":1245,"why":"Pillar 1: Dialogue Anchor. Moved to end of continuous exchange."}], "notes":"Consolidated fragments into Concrete Blocks per Pillar 2."}\n'
        "\n"
        f"{critic_context}\n"
        f"TEXT_LEN: {len(chapter_text)}\n"
        f"CURRENT_OFFSETS: {split_points}\n"
        f"BOUNDARY_CONTEXTS_JSON: {json.dumps(boundaries_payload, ensure_ascii=True)}"
    )
    llm_consume_call(llm_state)
    
    system_prompt = "You output strict JSON only."
    if critic_context:
        system_prompt = "You are a Self-Reflective Semantic Boundary Adjuster. You learn from Critic Feedback to correct past mistakes and output strict JSON only."

    parsed = call_llm_json(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        max_tokens=900,
        temperature=0.3,
        timeout_sec=get_llm_timeout("split_semantic_resplit"),
    )
    raw_offsets = parsed.get("offsets")
    if not isinstance(raw_offsets, list):
        report["reason"] = "INVALID_OFFSETS_FORMAT"
        return split_points, report
    try:
        confidence = float(parsed.get("confidence") or 0.0)
    except Exception:
        confidence = 0.0
    report["confidence"] = round(confidence, 4)
    if confidence < s3_min_confidence:
        report["reason"] = "LOW_CONFIDENCE"
        return split_points, report

    out: List[int] = []
    moved = 0
    jump_rejected = 0
    for i, raw in enumerate(raw_offsets):
        try:
            p = int(raw)
        except Exception:
            continue
        if i < len(split_points):
            old = split_points[i]
            if abs(p - old) > s3_max_offset_jump:
                p = old
                jump_rejected += 1
            if p != old:
                moved += 1
        out.append(p)
    if not out:
        report["reason"] = "EMPTY_OFFSETS"
        return split_points, report
    normalized = normalize_split_points(out, len(chapter_text))
    hard_anchor_positions = [int(x) for x in (hard_anchor_positions or []) if isinstance(x, int) or str(x).isdigit()]
    hard_anchor_positions = sorted(set([x for x in hard_anchor_positions if 0 < int(x) < len(chapter_text)]))
    if normalized and hard_anchor_positions:
        clamped_count = 0
        violations = 0
        guarded = normalized[:]
        tolerance = max(40, int(hard_anchor_tolerance_chars or 200))
        for anchor in hard_anchor_positions:
            nearest_idx = min(range(len(guarded)), key=lambda idx: abs(int(guarded[idx]) - int(anchor)))
            nearest_at = int(guarded[nearest_idx])
            dist = abs(nearest_at - int(anchor))
            if dist > tolerance:
                violations += 1
                guarded[nearest_idx] = int(anchor)
                clamped_count += 1
        guarded = normalize_split_points(guarded, len(chapter_text))
        if guarded:
            normalized = guarded
        report["anchor_guard_clamped_count"] = int(clamped_count)
        report["anchor_guard_violations"] = int(violations)
        if hard_anchor_positions:
            ratio = float(clamped_count) / float(max(1, len(hard_anchor_positions)))
            if ratio >= 0.6:
                report["anchor_guard_diagnostic"] = "ANCHOR_GUARD_INTERVENTION_HIGH"

    if not normalized:
        report["reason"] = "NORMALIZED_EMPTY"
        return split_points, report

    proofs = parsed.get("proofs")
    proof_count = 0
    if isinstance(proofs, list):
        for item in proofs:
            if not isinstance(item, dict):
                continue
            why = str(item.get("why") or "").strip()
            if why:
                proof_count += 1
    proof_denom = max(1, moved)
    proof_ratio = float(proof_count) / float(proof_denom)

    report["moved_boundaries"] = moved
    report["proof_count"] = proof_count
    report["proof_ratio"] = round(proof_ratio, 4)
    report["jump_rejected_count"] = jump_rejected

    if moved > 0 and proof_ratio < s3_min_proof_ratio:
        report["reason"] = "INSUFFICIENT_BOUNDARY_PROOF"
        return split_points, report

    if len(split_points) > 1:
        jump_ratio = float(jump_rejected) / float(len(split_points))
        if jump_ratio > s3_max_rejected_jump_ratio:
            report["reason"] = "TOO_MANY_ABNORMAL_JUMPS"
            return split_points, report

    report["accepted"] = True
    report["reason"] = "ACCEPTED"
    return normalized, report


def best_boundary_candidate(
    text: str,
    at: int,
    lock_spans: List[Tuple[int, int]],
    prev_point: int,
    next_point: int,
    *,
    split_min_scene_chars: int,
    nearby_natural_boundaries,
    in_locked_span,
    boundary_issue_score,
) -> Tuple[int, int]:
    candidates = nearby_natural_boundaries(text, at, 700)
    best_at = at
    best_score = boundary_issue_score(text, at)
    best_dist = 10**9
    for pos, tier in candidates:
        if pos <= prev_point + split_min_scene_chars:
            continue
        if pos >= next_point - split_min_scene_chars:
            continue
        if in_locked_span(pos, lock_spans):
            continue
        score = boundary_issue_score(text, pos) + tier
        dist = abs(pos - at)
        if score < best_score or (score == best_score and dist < best_dist):
            best_at = pos
            best_score = score
            best_dist = dist
    return best_at, best_score


def autofix_split_points(
    text: str,
    split_points: List[int],
    lock_spans: List[Tuple[int, int]],
    *,
    normalize_split_points,
    boundary_issue_score,
    best_boundary_candidate,
) -> Tuple[List[int], Dict[str, Any]]:
    points = normalize_split_points(split_points, len(text))
    report = {"passes": 0, "moved": 0, "merged": 0}
    if not points:
        return points, report

    for _ in range(3):
        report["passes"] += 1
        changed = False
        moved_this_pass = 0
        merged_this_pass = 0

        local = points[:]
        edges = [0, *local, len(text)]
        new_points: List[int] = []
        for i, at in enumerate(local):
            prev_point = edges[i]
            next_point = edges[i + 2]
            base_score = boundary_issue_score(text, at)
            cand_at, cand_score = best_boundary_candidate(text, at, lock_spans, prev_point, next_point)

            if cand_at != at and cand_score + 1 < base_score:
                new_points.append(cand_at)
                moved_this_pass += 1
                changed = True
                continue

            if base_score >= 7 and len(local) - merged_this_pass > 1:
                merged_this_pass += 1
                changed = True
                continue

            new_points.append(at)

        points2 = normalize_split_points(new_points, len(text))
        report["moved"] += moved_this_pass
        report["merged"] += merged_this_pass
        points = points2
        if not changed:
            break
        if not points:
            break
    return points, report


def snap_boundary(
    text: str,
    at: int,
    lock_spans: List[Tuple[int, int]],
    *,
    nearby_natural_boundaries,
    in_locked_span,
) -> int:
    if at <= 1 or at >= len(text) - 1:
        return at
    candidates = nearby_natural_boundaries(text, at, 220)
    if not candidates:
        return at

    best = at
    best_score = (10**9, 10**9)
    for pos, tier in candidates:
        if pos <= 1 or pos >= len(text) - 1:
            continue
        if in_locked_span(pos, lock_spans):
            continue
        dist = abs(pos - at)
        score = (tier, dist)
        if score < best_score:
            best_score = score
            best = pos
    return best


def normalize_boundaries(
    text: str,
    text_len: int,
    candidates: List[Tuple[int, str]],
    lock_spans: List[Tuple[int, int]],
    *,
    split_min_scene_chars: int,
    split_min_gap: int,
    snap_boundary,
    in_locked_span,
) -> List[Tuple[int, str]]:
    cleaned: List[Tuple[int, str]] = []
    seen = set()
    for at, reason in candidates:
        at = snap_boundary(text, at, lock_spans)
        if at <= split_min_scene_chars or at >= text_len - split_min_scene_chars:
            continue
        if in_locked_span(at, lock_spans):
            continue
        key = int(at / 50)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append((at, reason or "boundary"))
    cleaned.sort(key=lambda x: x[0])
    merged: List[Tuple[int, str]] = []
    for at, reason in cleaned:
        if not merged:
            merged.append((at, reason))
            continue
        prev_at, _ = merged[-1]
        if at - prev_at < split_min_gap:
            continue
        merged.append((at, reason))
    return merged

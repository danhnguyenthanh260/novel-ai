from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, List, Optional, Tuple

from psycopg2.extras import RealDictCursor


def _safe_json(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _norm_text(value: Any) -> str:
    return re.sub(r"\s+", " ", _clean_text(value).lower())[:240]


def _token_estimate(value: Any) -> int:
    return max(1, int(len(json.dumps(value, ensure_ascii=True)) / 4))


def _hash_obj(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=True, sort_keys=True).encode("utf-8")).hexdigest()


def _chapter_no_fallback(chapter_id: Optional[str]) -> int:
    m = re.search(r"(\d+)", str(chapter_id or ""))
    if not m:
        return 0
    try:
        return int(m.group(1))
    except Exception:
        return 0


def load_story_chapter_order(conn, story_id: int) -> Dict[str, int]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT chapter_id, id
            FROM public.story_chapter
            WHERE story_id = %s
            ORDER BY id ASC
            """,
            (int(story_id),),
        )
        rows = cur.fetchall() or []
        order_map: Dict[str, int] = {}
        for idx, row in enumerate(rows, start=1):
            chapter_id = _clean_text((row or {}).get("chapter_id"))
            if chapter_id and chapter_id not in order_map:
                order_map[chapter_id] = idx
        return order_map
    finally:
        cur.close()


def chapter_position(chapter_id: Optional[str], order_map: Dict[str, int]) -> int:
    chapter = _clean_text(chapter_id)
    if chapter and chapter in order_map:
        return int(order_map[chapter])
    return _chapter_no_fallback(chapter_id)


def load_pack_budget_policy(conn, story_id: int) -> Dict[str, Any]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT *
            FROM public.pack_budget_policy_v1
            WHERE story_id = %s
              AND is_active = true
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """,
            (int(story_id),),
        )
        row = cur.fetchone() or {}
        return dict(row) if row else {}
    finally:
        cur.close()


def load_priority_override_rules(conn, story_id: int) -> List[Dict[str, Any]]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT *
            FROM public.priority_override_rules_v1
            WHERE is_active = true
              AND (story_id IS NULL OR story_id = %s)
            ORDER BY story_id NULLS FIRST, updated_at DESC, id DESC
            """,
            (int(story_id),),
        )
        return [dict(x) for x in (cur.fetchall() or [])]
    finally:
        cur.close()


def load_active_author_annotations(conn, story_id: int, chapter_id: Optional[str], order_map: Dict[str, int]) -> List[Dict[str, Any]]:
    chapter_pos = chapter_position(chapter_id, order_map)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT *
            FROM public.author_annotation_v1
            WHERE story_id = %s
              AND status = 'active'
              AND (chapter_id IS NULL OR chapter_id = %s)
            ORDER BY created_at DESC, annotation_id DESC
            """,
            (int(story_id), _clean_text(chapter_id) or None),
        )
        rows = cur.fetchall() or []
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            from_pos = chapter_position(item.get("effective_from_chapter"), order_map)
            to_pos = chapter_position(item.get("effective_to_chapter"), order_map)
            if from_pos and chapter_pos and chapter_pos < from_pos:
                continue
            if to_pos and chapter_pos and chapter_pos > to_pos:
                continue
            out.append(item)
        return out
    finally:
        cur.close()


def build_pre_chapter_profile(payload: Dict[str, Any], chapter_id: Optional[str], instructions: str) -> Dict[str, Any]:
    existing = payload.get("pre_chapter_profile_v1")
    if isinstance(existing, dict) and existing:
        return dict(existing)
    text = f"{chapter_id or ''} {instructions}".lower()
    if re.search(r"\bflashback|memory|remember|past\b", text):
        chapter_mode = "flashback"
        timeline_mode = "flashback"
    elif re.search(r"\breveal|truth|secret|identity|expose\b", text):
        chapter_mode = "reveal"
        timeline_mode = "present"
    elif re.search(r"\bdialogue|conversation|argument|confession\b", text):
        chapter_mode = "dialogue"
        timeline_mode = "present"
    elif re.search(r"\bgrief|emotion|feel|introspection|reflection\b", text):
        chapter_mode = "introspection"
        timeline_mode = "present"
    elif re.search(r"\bfight|battle|attack|escape|chase\b", text):
        chapter_mode = "action"
        timeline_mode = "present"
    else:
        chapter_mode = "mixed"
        timeline_mode = "interleaved" if re.search(r"\bintercut|parallel|meanwhile\b", text) else "present"
    return {
        "chapter_mode": chapter_mode,
        "pov_mode": "multi" if re.search(r"\bmulti pov|dual pov|multiple pov\b", text) else "single",
        "timeline_mode": timeline_mode,
        "reveal_sensitivity": "high" if chapter_mode == "reveal" else ("medium" if "mystery" in text else "low"),
        "cast_pressure": "medium",
        "thread_pressure": "high" if re.search(r"\bresolve|payoff|closure|answer\b", text) else "medium",
        "target_word_count": int(payload.get("target_word_count") or 0),
        "dominant_signals": [chapter_mode, timeline_mode],
    }


def entity_resolution_pass(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
    instructions: str,
    analysis_result: Dict[str, Any],
    memory_context: Dict[str, Any],
    pre_profile: Dict[str, Any],
) -> Dict[str, Any]:
    order_map = load_story_chapter_order(conn, story_id)
    annotations = load_active_author_annotations(conn, story_id, chapter_id, order_map)
    rules = load_priority_override_rules(conn, story_id)
    policy = load_pack_budget_policy(conn, story_id)
    blocked_entities = {
        _norm_text(item.get("target_ref"))
        for item in annotations
        if _clean_text(item.get("annotation_type")) == "do_not_use_entity_here"
        and _clean_text(item.get("target_type")) == "entity"
    }
    snapshot_v3 = _safe_json(analysis_result.get("snapshot_v3"))
    facts = snapshot_v3.get("facts") if isinstance(snapshot_v3.get("facts"), list) else []
    entity_map: Dict[str, Dict[str, Any]] = {}
    unresolved_collisions: List[Dict[str, Any]] = []
    alias_bindings: List[Dict[str, Any]] = []

    for fact in facts:
        if not isinstance(fact, dict):
            continue
        entity_type = _clean_text(fact.get("entity_type") or "OTHER") or "OTHER"
        for field in ("subject", "object"):
            raw = _clean_text(fact.get(field))
            if not raw:
                continue
            norm = _norm_text(raw)
            if not norm or norm in blocked_entities:
                continue
            item = entity_map.get(norm)
            if not item:
                entity_map[norm] = {
                    "canonical_name": raw,
                    "surface_forms": [raw],
                    "entity_type": entity_type,
                    "evidence_refs": [f"fact:{field}:{_norm_text(fact.get('predicate'))}"],
                    "low_confidence_entity_flag": False,
                }
                continue
            if raw not in item["surface_forms"]:
                item["surface_forms"].append(raw)
                alias_bindings.append({"canonical_name": item["canonical_name"], "alias": raw})
            if entity_type != item["entity_type"]:
                item["low_confidence_entity_flag"] = True
                unresolved_collisions.append(
                    {
                        "canonical_name": item["canonical_name"],
                        "surface_forms": list(item["surface_forms"]),
                        "reason": f"TYPE_MISMATCH:{item['entity_type']}:{entity_type}",
                    }
                )

    chapter_content_hash = _hash_obj(
        {
            "chapter_id": chapter_id,
            "instructions": instructions,
            "target_word_count": pre_profile.get("target_word_count"),
        }
    )
    relevant_entity_snapshot_hash = _hash_obj(
        {
            "recent_structured": memory_context.get("recent_chapter_structured"),
            "saga_snapshot_id": ((memory_context.get("saga_memory") or {}).get("snapshot_id") if isinstance(memory_context.get("saga_memory"), dict) else None),
            "entity_keys": sorted(entity_map.keys()),
        }
    )
    author_annotation_hash = _hash_obj(
        [
            {
                "annotation_id": item.get("annotation_id"),
                "annotation_type": item.get("annotation_type"),
                "target_ref": item.get("target_ref"),
                "annotation_version": item.get("annotation_version"),
            }
            for item in annotations
        ]
    )
    identity_policy_hash = _hash_obj(
        {
            "policy_version": policy.get("policy_version"),
            "default_model_class": policy.get("default_model_class"),
            "rule_keys": [str(item.get("rule_key") or "") for item in rules],
        }
    )
    cache_key = _hash_obj(
        {
            "chapter_content_hash": chapter_content_hash,
            "relevant_entity_snapshot_hash": relevant_entity_snapshot_hash,
            "author_annotation_hash": author_annotation_hash,
            "identity_policy_hash": identity_policy_hash,
        }
    )
    snapshot_json = {
        "canonical_entities": list(entity_map.values()),
        "alias_bindings": alias_bindings,
        "blocked_entities": sorted(blocked_entities),
        "unresolved_identity_collisions": unresolved_collisions,
        "cache_parts": {
            "chapter_content_hash": chapter_content_hash,
            "relevant_entity_snapshot_hash": relevant_entity_snapshot_hash,
            "author_annotation_hash": author_annotation_hash,
            "identity_policy_hash": identity_policy_hash,
            "cache_key": cache_key,
        },
        "cache_hit": False,
    }
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            INSERT INTO public.entity_resolution_snapshot_v1
              (story_id, chapter_id, chapter_content_hash, relevant_entity_snapshot_hash, author_annotation_hash, identity_policy_hash, cache_key, snapshot_json, status, updated_at)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, 'READY', now())
            ON CONFLICT (story_id, chapter_id, cache_key)
            DO UPDATE SET
              snapshot_json = EXCLUDED.snapshot_json,
              status = 'READY',
              updated_at = now()
            RETURNING id
            """,
            (
                int(story_id),
                _clean_text(chapter_id),
                chapter_content_hash,
                relevant_entity_snapshot_hash,
                author_annotation_hash,
                identity_policy_hash,
                cache_key,
                json.dumps(snapshot_json),
            ),
        )
        row = cur.fetchone() or {}
        snapshot_json["snapshot_id"] = int(row.get("id") or 0)
        return snapshot_json
    finally:
        cur.close()


def truth_adjudication_pass(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
    analysis_result: Dict[str, Any],
    entity_snapshot: Dict[str, Any],
) -> Dict[str, Any]:
    order_map = load_story_chapter_order(conn, story_id)
    annotations = load_active_author_annotations(conn, story_id, chapter_id, order_map)
    snapshot_v3 = _safe_json(analysis_result.get("snapshot_v3"))
    facts = snapshot_v3.get("facts") if isinstance(snapshot_v3.get("facts"), list) else []
    open_loops = snapshot_v3.get("open_loops") if isinstance(snapshot_v3.get("open_loops"), list) else []
    world_rules = snapshot_v3.get("world_rules") if isinstance(snapshot_v3.get("world_rules"), list) else []
    canonical_entities = entity_snapshot.get("canonical_entities") if isinstance(entity_snapshot.get("canonical_entities"), list) else []
    unresolved = entity_snapshot.get("unresolved_identity_collisions") if isinstance(entity_snapshot.get("unresolved_identity_collisions"), list) else []

    low_confidence_entities: List[str] = []
    entity_merge_challenges: List[Dict[str, Any]] = []
    for item in unresolved:
        if not isinstance(item, dict):
            continue
        name = _clean_text(item.get("canonical_name"))
        if not name:
            continue
        low_confidence_entities.append(name)
        entity_merge_challenges.append(
            {
                "challenged_entity_id": name,
                "conflicting_surface_forms": item.get("surface_forms") if isinstance(item.get("surface_forms"), list) else [name],
                "challenge_reason": _clean_text(item.get("reason")) or "IDENTITY_COLLISION",
                "confidence": 0.42,
                "affected_fact_refs": [f"entity:{name}"],
                "recommended_action": "HUMAN_REVIEW",
                "severity": "high",
            }
        )

    visibility_constraints: List[str] = []
    ambiguity_constraints: List[str] = []
    for annotation in annotations:
        annotation_type = _clean_text(annotation.get("annotation_type"))
        target_ref = _clean_text(annotation.get("target_ref"))
        if annotation_type in ("reader_should_not_know", "character_should_not_know"):
            visibility_constraints.append(f"{annotation_type}:{target_ref}")
        if annotation_type in ("this_is_intentional_ambiguity", "treat_as_disguise"):
            ambiguity_constraints.append(f"{annotation_type}:{target_ref}")

    active_facts: List[Dict[str, Any]] = []
    contested_claims: List[Dict[str, Any]] = []
    thread_updates: List[Dict[str, Any]] = []
    for fact in facts:
        if not isinstance(fact, dict):
            continue
        fact_payload = {
            "subject": _clean_text(fact.get("subject")),
            "predicate": _clean_text(fact.get("predicate")),
            "object": _clean_text(fact.get("object")),
            "entity_type": _clean_text(fact.get("entity_type") or "OTHER") or "OTHER",
            "is_unreliable": bool(fact.get("is_unreliable")),
        }
        if fact_payload["is_unreliable"]:
            contested_claims.append(fact_payload)
        else:
            active_facts.append(fact_payload)
    for loop in open_loops:
        if not isinstance(loop, dict):
            continue
        thread_id = _clean_text(loop.get("id") or loop.get("description") or loop.get("text"))
        if not thread_id:
            continue
        thread_updates.append(
            {
                "thread_id": thread_id,
                "label": _clean_text(loop.get("description") or loop.get("text") or thread_id),
                "status": "open",
                "urgency": float(loop.get("urgency") or 0.5),
            }
        )

    adjudication_json = {
        "active_facts": active_facts,
        "contested_claims": contested_claims,
        "world_rules": world_rules[:12],
        "visibility_constraints": visibility_constraints,
        "ambiguity_constraints": ambiguity_constraints,
        "low_confidence_entities": low_confidence_entities,
        "entity_merge_challenges": entity_merge_challenges,
        "thread_updates": thread_updates,
        "active_entities": canonical_entities,
    }
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            INSERT INTO public.truth_adjudication_snapshot_v1
              (story_id, chapter_id, entity_resolution_snapshot_id, fact_status, adjudication_json, updated_at)
            VALUES
              (%s, %s, %s, %s, %s::jsonb, now())
            RETURNING id
            """,
            (
                int(story_id),
                _clean_text(chapter_id),
                int(entity_snapshot.get("snapshot_id") or 0) or None,
                "CONFLICT" if entity_merge_challenges else "CLEAN",
                json.dumps(adjudication_json),
            ),
        )
        row = cur.fetchone() or {}
        adjudication_json["snapshot_id"] = int(row.get("id") or 0)

        for challenge in entity_merge_challenges:
            cur.execute(
                """
                INSERT INTO public.entity_merge_challenge_v1
                  (story_id, chapter_id, challenged_entity_id, conflicting_surface_forms, challenge_reason, confidence, affected_fact_refs, recommended_action, severity, status, updated_at)
                VALUES
                  (%s, %s, %s, %s::jsonb, %s, %s, %s::jsonb, %s, %s, 'OPEN', now())
                """,
                (
                    int(story_id),
                    _clean_text(chapter_id),
                    challenge["challenged_entity_id"],
                    json.dumps(challenge["conflicting_surface_forms"]),
                    challenge["challenge_reason"],
                    float(challenge["confidence"]),
                    json.dumps(challenge["affected_fact_refs"]),
                    challenge["recommended_action"],
                    challenge["severity"],
                ),
            )
        for thread in thread_updates:
            cur.execute(
                """
                INSERT INTO public.thread_state_v1
                  (story_id, thread_id, label, origin_chapter, last_touched_chapter, status, urgency, aging_score, pressure_score, closure_conditions, updated_at)
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s, 0, %s, '[]'::jsonb, now())
                ON CONFLICT (story_id, thread_id)
                DO UPDATE SET
                  label = EXCLUDED.label,
                  last_touched_chapter = EXCLUDED.last_touched_chapter,
                  status = EXCLUDED.status,
                  urgency = EXCLUDED.urgency,
                  pressure_score = EXCLUDED.pressure_score,
                  updated_at = now()
                """,
                (
                    int(story_id),
                    thread["thread_id"],
                    thread["label"],
                    _clean_text(chapter_id),
                    _clean_text(chapter_id),
                    thread["status"],
                    str(thread["urgency"]),
                    min(1.0, max(0.2, float(thread["urgency"]))),
                ),
            )
        return adjudication_json
    finally:
        cur.close()


def context_pack_compiler(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
    pre_profile: Dict[str, Any],
    entity_snapshot: Dict[str, Any],
    adjudication_snapshot: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    policy = load_pack_budget_policy(conn, story_id)
    rules = load_priority_override_rules(conn, story_id)
    active_entities = adjudication_snapshot.get("active_entities") if isinstance(adjudication_snapshot.get("active_entities"), list) else []
    active_cast = [str(item.get("canonical_name") or "") for item in active_entities if isinstance(item, dict) and str(item.get("entity_type") or "").upper() == "PERSON"]
    active_cast = [x for x in active_cast if x][:8]
    active_objects = [
        item.get("object")
        for item in (adjudication_snapshot.get("active_facts") if isinstance(adjudication_snapshot.get("active_facts"), list) else [])
        if isinstance(item, dict) and _clean_text(item.get("entity_type")).upper() in ("ITEM", "OTHER")
    ][:8]
    anchors = [
        item.get("object")
        for item in (adjudication_snapshot.get("active_facts") if isinstance(adjudication_snapshot.get("active_facts"), list) else [])
        if isinstance(item, dict) and _clean_text(item.get("entity_type")).upper() == "LOCATION"
    ][:6]
    open_threads = [
        _clean_text(item.get("label") or item.get("thread_id"))
        for item in (adjudication_snapshot.get("thread_updates") if isinstance(adjudication_snapshot.get("thread_updates"), list) else [])
        if isinstance(item, dict) and _clean_text(item.get("status")) == "open"
    ][:8]
    visibility_constraints = adjudication_snapshot.get("visibility_constraints") if isinstance(adjudication_snapshot.get("visibility_constraints"), list) else []
    ambiguity_constraints = adjudication_snapshot.get("ambiguity_constraints") if isinstance(adjudication_snapshot.get("ambiguity_constraints"), list) else []
    low_confidence_entities = adjudication_snapshot.get("low_confidence_entities") if isinstance(adjudication_snapshot.get("low_confidence_entities"), list) else []

    priority_a = {
        "active_cast": active_cast,
        "alias_whitelist": {str(item.get("canonical_name") or ""): item.get("surface_forms") for item in active_entities if isinstance(item, dict)},
        "valid_anchor_set": [str(x) for x in anchors if x],
        "active_objects": [str(x) for x in active_objects if x],
        "timeline_constraints": [str(item.get("predicate") or "") for item in (adjudication_snapshot.get("active_facts") if isinstance(adjudication_snapshot.get("active_facts"), list) else [])[:8] if isinstance(item, dict)],
        "open_threads": [str(x) for x in open_threads if x],
        "ambiguity_constraints": [str(x) for x in ambiguity_constraints if x],
        "knowledge_visibility": [str(x) for x in visibility_constraints if x],
        "voice_constraints": {
            "chapter_mode": pre_profile.get("chapter_mode"),
            "pov_mode": pre_profile.get("pov_mode"),
        },
        "low_confidence_entities": [str(x) for x in low_confidence_entities if x],
    }
    priority_b = {
        "world_rules": adjudication_snapshot.get("world_rules") if isinstance(adjudication_snapshot.get("world_rules"), list) else [],
        "contested_claims": adjudication_snapshot.get("contested_claims") if isinstance(adjudication_snapshot.get("contested_claims"), list) else [],
        "entity_merge_challenges": adjudication_snapshot.get("entity_merge_challenges") if isinstance(adjudication_snapshot.get("entity_merge_challenges"), list) else [],
    }
    promote_to_a = {
        value
        for rule in rules
        if _clean_text(rule.get("chapter_mode")) in ("any", _clean_text(pre_profile.get("chapter_mode")))
        and _clean_text(rule.get("cast_pressure")) in ("any", _clean_text(pre_profile.get("cast_pressure")))
        and _clean_text(rule.get("reveal_sensitivity")) in ("any", _clean_text(pre_profile.get("reveal_sensitivity")))
        and _clean_text(rule.get("timeline_mode")) in ("any", _clean_text(pre_profile.get("timeline_mode")))
        and _clean_text(rule.get("pov_mode")) in ("any", _clean_text(pre_profile.get("pov_mode")))
        for value in (rule.get("promote_to_a") if isinstance(rule.get("promote_to_a"), list) else [])
    }
    if "knowledge_visibility" in promote_to_a:
        priority_a["knowledge_visibility"] = priority_a.get("knowledge_visibility", [])

    priority_a_used = _token_estimate(priority_a)
    priority_b_used = _token_estimate(priority_b)
    compression_drops: List[str] = []
    priority_a_budget = int(policy.get("priority_a_budget") or 1100)
    priority_b_budget = int(policy.get("priority_b_budget") or 800)
    total_budget = priority_a_budget + priority_b_budget
    if priority_b_used > priority_b_budget:
        if isinstance(priority_b.get("world_rules"), list):
            priority_b["world_rules"] = priority_b.get("world_rules", [])[:6]
            compression_drops.append("priority_b.world_rules_trimmed")
        if isinstance(priority_b.get("contested_claims"), list) and _token_estimate(priority_b) > priority_b_budget:
            priority_b["contested_claims"] = priority_b.get("contested_claims", [])[:4]
            compression_drops.append("priority_b.contested_claims_trimmed")
        priority_b_used = _token_estimate(priority_b)
    priority_a_overflow = priority_a_used > priority_a_budget
    total_overflow = (priority_a_used + priority_b_used) > total_budget
    drop_risk_level = "high" if priority_a_overflow or total_overflow else ("medium" if compression_drops else "low")
    pov_sequence = [
        {
            "pov_entity_id": active_cast[0] if active_cast else "narrator",
            "segment_order": 1,
            "timeline_sync_group": "parallel-1" if _clean_text(pre_profile.get("timeline_mode")) == "interleaved" else "g1",
            "segment_kind": "flashback" if _clean_text(pre_profile.get("timeline_mode")) == "flashback" else ("parallel" if _clean_text(pre_profile.get("timeline_mode")) == "interleaved" else "sequential"),
            "segment_anchor_ref": anchors[0] if anchors else None,
        }
    ]
    if _clean_text(pre_profile.get("pov_mode")) == "multi" and len(active_cast) >= 2:
        pov_sequence.append(
            {
                "pov_entity_id": active_cast[1],
                "segment_order": 2,
                "timeline_sync_group": pov_sequence[0]["timeline_sync_group"],
                "segment_kind": pov_sequence[0]["segment_kind"],
                "segment_anchor_ref": anchors[0] if anchors else None,
            }
        )
    truth_context_pack = {
        "chapter_profile": pre_profile,
        "priority_a": priority_a,
        "priority_b": priority_b,
        "priority_c_refs": compression_drops[:],
        "pov_sequence": pov_sequence,
        "token_budget_stats": {
            "token_budget_target": int(policy.get("base_budget_tokens") or 2200),
            "token_budget_used": priority_a_used + priority_b_used,
            "priority_a_used": priority_a_used,
            "priority_b_used": priority_b_used,
            "priority_c_refs_count": len(compression_drops),
        },
        "compression_drops": compression_drops,
        "drop_risk_level": drop_risk_level,
        "staleness_flags": [],
        "thread_pressure_summary": {
            "level": pre_profile.get("thread_pressure"),
            "active_threads": [str(x) for x in open_threads if x],
        },
    }
    analysis_delta_report = {
        "chapter_id": _clean_text(chapter_id),
        "source_hash": _hash_obj({"chapter_id": chapter_id, "entity_snapshot": entity_snapshot.get("snapshot_id"), "adjudication_snapshot": adjudication_snapshot.get("snapshot_id")}),
        "truth_pack_changed": True,
        "entity_merges": [],
        "persona_state_changes": [],
        "fact_promotions": [],
        "fact_demotions": [],
        "claims_marked_contested": adjudication_snapshot.get("contested_claims") if isinstance(adjudication_snapshot.get("contested_claims"), list) else [],
        "lifecycle_updates": [],
        "threads_opened": [str(x) for x in open_threads if x],
        "threads_closed": [],
        "threads_escalated": [],
        "visibility_changes": [str(x) for x in visibility_constraints if x],
        "compression_drops": compression_drops,
        "staleness_flags": [],
        "fallbacks_applied": [],
        "items": [
            {"kind": "entity_merge_challenge", "significance": "critical", "detail": str(item.get("challenged_entity_id") or ""), "refs": item.get("affected_fact_refs") or []}
            for item in (adjudication_snapshot.get("entity_merge_challenges") if isinstance(adjudication_snapshot.get("entity_merge_challenges"), list) else [])
            if isinstance(item, dict)
        ] + [
            {"kind": "compression_drop", "significance": "medium", "detail": drop, "refs": []}
            for drop in compression_drops
        ],
        "drop_risk_level": drop_risk_level,
    }
    return truth_context_pack, analysis_delta_report


def persist_analysis_delta_report(conn, story_id: int, chapter_id: Optional[str], report: Dict[str, Any]) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO public.analysis_delta_report_v1
              (story_id, chapter_id, source_kind, source_ref, source_hash, truth_pack_changed, report_json, updated_at)
            VALUES
              (%s, %s, 'writing_analysis', %s, %s, %s, %s::jsonb, now())
            """,
            (
                int(story_id),
                _clean_text(chapter_id),
                _clean_text(chapter_id),
                _clean_text(report.get("source_hash")),
                bool(report.get("truth_pack_changed")),
                json.dumps(report),
            ),
        )
    finally:
        cur.close()


def refresh_cutover_state(conn, story_id: int) -> Dict[str, Any]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT report_json
            FROM public.analysis_delta_report_v1
            WHERE story_id = %s
            ORDER BY created_at DESC, id DESC
            LIMIT 20
            """,
            (int(story_id),),
        )
        rows = cur.fetchall() or []
        reports = [_safe_json((row or {}).get("report_json")) for row in rows]
        completed = len(reports)
        drop_ok = all(str((report.get("drop_risk_level") or "")).lower() in ("", "low", "medium") for report in reports)
        critical_items = 0
        critical_challenges = 0
        for report in reports:
            items = report.get("items") if isinstance(report.get("items"), list) else []
            critical_items += len([item for item in items if isinstance(item, dict) and _clean_text(item.get("significance")) == "critical"])
            critical_challenges += len([item for item in items if isinstance(item, dict) and _clean_text(item.get("kind")) == "entity_merge_challenge"])
        stage = "STAGE_1_SHADOW"
        if completed >= 20 and drop_ok and critical_items == 0 and critical_challenges == 0:
            stage = "STAGE_2_PLANNER"
        parity_window_stats = {
            "window_size": completed,
            "drop_ok_runs": completed if drop_ok else 0,
            "critical_entity_merge_challenge_count": critical_challenges,
            "critical_delta_item_count": critical_items,
        }
        cur.execute(
            """
            INSERT INTO public.autowrite_cutover_state_v1
              (story_id, cutover_stage, parity_window_stats, updated_at)
            VALUES
              (%s, %s, %s::jsonb, now())
            ON CONFLICT (story_id)
            DO UPDATE SET
              cutover_stage = EXCLUDED.cutover_stage,
              parity_window_stats = EXCLUDED.parity_window_stats,
              updated_at = now()
            """,
            (int(story_id), stage, json.dumps(parity_window_stats)),
        )
        return {"cutover_stage": stage, "cutover_parity_window_stats": parity_window_stats}
    finally:
        cur.close()

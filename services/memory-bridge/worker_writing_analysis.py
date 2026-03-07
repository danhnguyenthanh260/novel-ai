from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional

from psycopg2.extras import RealDictCursor

from worker_common import call_llm_json
from worker_runtime_config import get_llm_timeout

QDRANT_STYLE_THRESHOLD = 0.70
LOCAL_CHAPTER_WINDOW = 3
MESO_CHAPTER_WINDOW = 10
MESO_MILESTONE_LIMIT = 6
ANALYSIS_CONTEXT_MODE = str(os.getenv("WRITING_ANALYSIS_CONTEXT_MODE", "FULL")).strip().upper()
try:
    _fact_gate_raw = float(str(os.getenv("HISTORIAN_FACT_CONFIDENCE_GATE", "0.70")).strip() or "0.70")
except Exception:
    _fact_gate_raw = 0.70
FACT_CONFIDENCE_GATE = max(0.0, min(1.0, _fact_gate_raw))
ENTITY_TYPES = {"PERSON", "LOCATION", "ORG", "ITEM", "OTHER"}
WRITING_ANALYSIS_MAX_TOKENS = max(
    256,
    min(4096, int(str(os.getenv("WRITING_ANALYSIS_MAX_TOKENS", "1536")).strip() or "1536")),
)
AFFINITY_EWMA_ALPHA = max(
    0.05,
    min(0.95, float(str(os.getenv("HISTORIAN_V3_AFFINITY_EWMA_ALPHA", "0.45")).strip() or "0.45")),
)
RELATION_PREDICATE_MARKERS = (
    "friend",
    "ally",
    "enemy",
    "rival",
    "trust",
    "hate",
    "love",
    "mentor",
    "student",
    "parent",
    "child",
    "sibling",
    "marry",
    "married",
)
VOICE_PRONOUN_BLOCKLIST = {
    "he", "she", "they", "him", "her", "them", "his", "hers", "their", "theirs", "it", "its", "we", "us", "our",
}
VOICE_GENERIC_BLOCKLIST = {"the guy", "someone", "somebody", "person", "unknown", "stranger"}
WORLD_RULE_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "is", "are", "was", "were", "be",
}
STATE_CHANGE_REASON_CODES = (
    "INJURY_OR_HEALTH_CHANGE",
    "ASSET_OR_TOOL_ACQUIRED",
    "PROTOCOL_OR_RULE_COMMITTED",
    "SURVEILLANCE_OR_EXPOSURE_RISK",
    "DECISION_WITH_FUTURE_COMMITMENT",
    "RELATIONSHIP_STATE_SHIFT",
)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        x = float(value)
        if x != x:
            return fallback
        return x
    except Exception:
        return fallback


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _safe_env_float(name: str, fallback: float) -> float:
    try:
        return float(str(os.getenv(name, str(fallback))).strip() or str(fallback))
    except Exception:
        return fallback


def _post_json(url: str, payload: Dict[str, Any], timeout_sec: int) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=_json_dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=max(1, int(timeout_sec))) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    parsed = json.loads(raw) if raw else {}
    return parsed if isinstance(parsed, dict) else {}


def _load_external_signals(
    *,
    story_id: int,
    chapter_id: Optional[str],
    instructions: str,
    candidate_facts: List[Dict[str, Any]],
    style_dna: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    base_url = str(os.getenv("HISTORIAN_MCP_BASE_URL", "")).strip().rstrip("/")
    qdrant_enabled = str(os.getenv("HISTORIAN_QDRANT_ENABLED", "0")).strip().lower() in ("1", "true", "yes", "on")
    neo4j_enabled = str(os.getenv("HISTORIAN_NEO4J_ENABLED", "0")).strip().lower() in ("1", "true", "yes", "on")
    out: Dict[str, Any] = {
        "qdrant": {"status": "disabled", "style_similarity": 0.0, "top_matches": []},
        "neo4j": {"status": "disabled", "lineage_conflicts": []},
    }
    if not base_url:
        return out

    if qdrant_enabled:
        try:
            q_payload = {
                "story_id": story_id,
                "chapter_id": chapter_id,
                "query": instructions[:800],
                "candidate_facts": candidate_facts[:10],
                "style_dna": style_dna if isinstance(style_dna, dict) else {},
            }
            q_res = _post_json(
                f"{base_url}/v1/historian/qdrant-search",
                q_payload,
                get_llm_timeout("historian_qdrant"),
            )
            top_matches_raw = q_res.get("top_matches") if isinstance(q_res.get("top_matches"), list) else []
            top_matches: List[Dict[str, Any]] = []
            for item in top_matches_raw[:40]:
                if not isinstance(item, dict):
                    continue
                sim = max(
                    0.0,
                    min(
                        1.0,
                        _safe_float(
                            item.get("similarity", item.get("score", item.get("style_similarity", 0.0))),
                            0.0,
                        ),
                    ),
                )
                if sim >= QDRANT_STYLE_THRESHOLD:
                    top_matches.append({**item, "similarity": sim})
            style_similarity = max(0.0, min(1.0, _safe_float(q_res.get("style_similarity"), 0.0)))
            if style_similarity < QDRANT_STYLE_THRESHOLD:
                style_similarity = 0.0
            out["qdrant"] = {
                "status": "ok",
                "style_similarity": style_similarity,
                "top_matches": top_matches,
                "threshold": QDRANT_STYLE_THRESHOLD,
            }
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError, OSError) as err:
            out["qdrant"] = {"status": "error", "error": str(err)[:240], "style_similarity": 0.0, "top_matches": []}

    if neo4j_enabled:
        try:
            n_payload = {
                "story_id": story_id,
                "chapter_id": chapter_id,
                "candidate_facts": candidate_facts[:20],
            }
            n_res = _post_json(
                f"{base_url}/v1/historian/neo4j-lineage",
                n_payload,
                get_llm_timeout("historian_neo4j"),
            )
            conflicts = n_res.get("lineage_conflicts") if isinstance(n_res.get("lineage_conflicts"), list) else []
            out["neo4j"] = {"status": "ok", "lineage_conflicts": conflicts[:40]}
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError, OSError) as err:
            out["neo4j"] = {"status": "error", "error": str(err)[:240], "lineage_conflicts": []}

    return out


def _normalize_fact_list(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        subject = str(item.get("subject") or "").strip()[:120]
        predicate = str(item.get("predicate") or "").strip()[:120]
        obj = str(item.get("object") or "").strip()[:240]
        confidence = max(0.0, min(1.0, _safe_float(item.get("confidence"), 0.5)))
        evidence = str(item.get("evidence") or "").strip()[:280]
        entity_type = str(item.get("entity_type") or "").strip().upper()[:20]
        classification = str(item.get("classification") or "").strip().upper()[:20]
        is_unreliable = bool(item.get("is_unreliable_narrator", item.get("is_unreliable", False)))
        affinity_weight = _safe_float(item.get("affinity_weight"), 0.0)
        if not subject or not predicate or not obj:
            continue
        if entity_type not in ENTITY_TYPES:
            entity_type = "OTHER"
        if classification not in ("STATIC", "EPHEMERAL", "META"):
            classification = ""
        out.append(
            {
                "subject": subject,
                "predicate": predicate,
                "object": obj,
                "confidence": round(confidence, 4),
                "evidence": evidence,
                "entity_type": entity_type,
                "classification": classification,
                "is_unreliable": is_unreliable,
                "affinity_weight": round(_clamp(affinity_weight, -1.0, 1.0), 4),
            }
        )
    return out[:40]


def _is_relation_fact(fact: Dict[str, Any]) -> bool:
    pred = str(fact.get("predicate") or "").strip().lower()
    obj = str(fact.get("object") or "").strip().lower()
    return any(marker in pred or marker in obj for marker in RELATION_PREDICATE_MARKERS)


def _relation_key(fact: Dict[str, Any]) -> str:
    return (
        f"{str(fact.get('subject') or '').strip().lower()}|"
        f"{str(fact.get('predicate') or '').strip().lower()}|"
        f"{str(fact.get('object') or '').strip().lower()}"
    )


def _event_signal_score(event_text: str) -> float:
    text = str(event_text or "").strip().lower()
    if not text:
        return 0.0
    positive_markers = ("save", "protect", "help", "trust", "forgive", "ally", "support", "care", "love")
    negative_markers = ("betray", "attack", "fight", "hate", "distrust", "rival", "conflict", "threat")
    pos = sum(1 for m in positive_markers if m in text)
    neg = sum(1 for m in negative_markers if m in text)
    return _clamp((pos - neg) * 0.08, -0.3, 0.3)


def _calculate_affinity_shift(old_affinity: float, events: List[str]) -> tuple[float, float]:
    # EWMA policy:
    # 1) derive event signal aggregate (short-term shock),
    # 2) compute target affinity,
    # 3) smooth with fixed alpha for deterministic temporal behavior.
    raw_signal = 0.0
    for event in events:
        raw_signal += _event_signal_score(event)
    event_delta = _clamp(raw_signal, -0.6, 0.6)
    target_affinity = _clamp(old_affinity + event_delta, -1.0, 1.0)
    alpha = AFFINITY_EWMA_ALPHA
    ewma_affinity = _clamp((alpha * target_affinity) + ((1.0 - alpha) * old_affinity), -1.0, 1.0)
    return round(ewma_affinity, 4), round(ewma_affinity - old_affinity, 4)


def _normalize_sensory_profile(raw: Any) -> Dict[str, Any]:
    obj = raw if isinstance(raw, dict) else {}
    colors = obj.get("dominant_colors") if isinstance(obj.get("dominant_colors"), list) else []
    scents = obj.get("atmosphere_scents") if isinstance(obj.get("atmosphere_scents"), list) else []
    return {
        "dominant_colors": [str(x).strip()[:40] for x in colors if str(x).strip()][:8],
        "atmosphere_scents": [str(x).strip()[:60] for x in scents if str(x).strip()][:8],
        "temperature_delta": round(_clamp(_safe_float(obj.get("temperature_delta"), 0.0), -30.0, 30.0), 3),
    }


def _known_entity_names(context: Optional[Dict[str, Any]]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not isinstance(context, dict):
        return out
    entity_truth = context.get("entity_truth_map") if isinstance(context.get("entity_truth_map"), dict) else {}
    for key in entity_truth.keys():
        n = str(key or "").strip()
        if not n:
            continue
        out[n.lower()] = n
    local = context.get("local") if isinstance(context.get("local"), dict) else {}
    for row in local.get("facts") if isinstance(local.get("facts"), list) else []:
        if not isinstance(row, dict):
            continue
        subj = str(row.get("subject") or "").strip()
        if subj:
            out[subj.lower()] = subj
    return out


def _resolve_voice_name(name: str, context: Optional[Dict[str, Any]]) -> tuple[Optional[str], bool, bool]:
    raw = str(name or "").strip()
    if not raw:
        return None, False, False
    low = raw.lower()
    if low in VOICE_PRONOUN_BLOCKLIST or low in VOICE_GENERIC_BLOCKLIST:
        return None, True, False
    known = _known_entity_names(context)
    if low in known:
        canonical = known[low]
        return canonical, False, canonical != raw
    # Attempt simple alias resolution by token overlap.
    raw_tokens = {t for t in re.findall(r"[a-z0-9]+", low) if t}
    for key, canonical in known.items():
        key_tokens = {t for t in re.findall(r"[a-z0-9]+", key) if t}
        if raw_tokens and key_tokens and raw_tokens.issubset(key_tokens):
            return canonical, False, canonical != raw
    return raw, False, False


def _normalize_character_voices(raw: Any, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name_raw = str(item.get("name") or "").strip()[:120]
        name, rejected_pronoun, _remapped = _resolve_voice_name(name_raw, context)
        if rejected_pronoun or not name:
            continue
        cadence = str(item.get("sentence_cadence") or "med").strip().lower()
        if cadence not in ("short", "med", "long"):
            cadence = "med"
        vocab = str(item.get("vocabulary_tier") or "mid").strip().lower()
        if vocab not in ("low", "mid", "high"):
            vocab = "mid"
        out.append(
            {
                "name": name,
                "tone": str(item.get("tone") or "").strip()[:120],
                "sentence_cadence": cadence,
                "vocabulary_tier": vocab,
            }
        )
    return out[:24]


def _resolve_character_voices_with_report(raw: Any, context: Optional[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], Dict[str, int]]:
    if not isinstance(raw, list):
        return [], {"dropped_pronoun_count": 0, "remapped_count": 0}
    out: List[Dict[str, Any]] = []
    dropped_pronoun_count = 0
    remapped_count = 0
    for item in raw:
        if not isinstance(item, dict):
            continue
        name_raw = str(item.get("name") or "").strip()[:120]
        name, rejected_pronoun, remapped = _resolve_voice_name(name_raw, context)
        if rejected_pronoun:
            dropped_pronoun_count += 1
            continue
        if not name:
            continue
        if remapped:
            remapped_count += 1
        cadence = str(item.get("sentence_cadence") or "med").strip().lower()
        if cadence not in ("short", "med", "long"):
            cadence = "med"
        vocab = str(item.get("vocabulary_tier") or "mid").strip().lower()
        if vocab not in ("low", "mid", "high"):
            vocab = "mid"
        out.append(
            {
                "name": name,
                "tone": str(item.get("tone") or "").strip()[:120],
                "sentence_cadence": cadence,
                "vocabulary_tier": vocab,
            }
        )
    # Dedup by normalized name while keeping first.
    deduped: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for voice in out:
        key = str(voice.get("name") or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(voice)
    return deduped[:24], {"dropped_pronoun_count": dropped_pronoun_count, "remapped_count": remapped_count}


def _normalize_world_rules(raw: Any) -> List[Dict[str, str]]:
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, str]] = []
    for item in raw:
        if isinstance(item, dict):
            label = str(item.get("label") or item.get("rule") or "").strip()[:180]
            detail = str(item.get("detail") or item.get("description") or "").strip()[:320]
        else:
            label = str(item or "").strip()[:180]
            detail = ""
        if not label:
            continue
        out.append({"label": label, "detail": detail})
    return out[:30]


def _estimate_style_dna(context: Dict[str, Any], llm_out: Dict[str, Any]) -> Dict[str, float]:
    prose_rows = context.get("local", {}).get("prose", []) if isinstance(context.get("local"), dict) else []
    prose_text = " ".join(str((r or {}).get("text_content") or "") for r in prose_rows if isinstance(r, dict))
    total_chars = max(1, len(prose_text))
    quote_chars = 0
    for quote in ('"', "'", "“", "”", "‘", "’"):
        quote_chars += prose_text.count(quote)
    dialogue_to_narration_ratio = _clamp((quote_chars / 2.0) / float(total_chars), 0.0, 1.0)

    words = [w for w in prose_text.replace("\n", " ").split(" ") if w]
    adjective_suffixes = ("ous", "ful", "ive", "al", "ic", "less", "able", "ible", "ary")
    adjective_hits = 0
    for w in words:
        token = "".join(ch for ch in w.lower() if ch.isalpha())
        if len(token) >= 4 and token.endswith(adjective_suffixes):
            adjective_hits += 1
    adjective_density = _clamp(adjective_hits / float(max(1, len(words))), 0.0, 1.0)

    swas = llm_out.get("swas") if isinstance(llm_out.get("swas"), dict) else {}
    metaphor_signal = _safe_float(swas.get("metaphor_rhetoric_frequency"), _safe_float(swas.get("mental_imagery"), 0.4) * 0.65)
    metaphor_rhetoric_frequency = _clamp(metaphor_signal, 0.0, 1.0)
    return {
        "dialogue_to_narration_ratio": round(dialogue_to_narration_ratio, 4),
        "adjective_density": round(adjective_density, 4),
        "metaphor_rhetoric_frequency": round(metaphor_rhetoric_frequency, 4),
    }


def _load_previous_approved_affinity_map(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
) -> Dict[str, float]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if chapter_id:
            cur.execute(
                """
                SELECT snapshot_json
                FROM public.writing_snapshot_v3
                WHERE story_id = %s
                  AND approval_status = 'APPROVED'
                  AND chapter_id <> %s
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (story_id, chapter_id),
            )
        else:
            cur.execute(
                """
                SELECT snapshot_json
                FROM public.writing_snapshot_v3
                WHERE story_id = %s
                  AND approval_status = 'APPROVED'
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (story_id,),
            )
        row = cur.fetchone() or {}
        snap = row.get("snapshot_json") if isinstance(row.get("snapshot_json"), dict) else {}
        facts = snap.get("facts") if isinstance(snap.get("facts"), list) else []
        out: Dict[str, float] = {}
        for fact in facts:
            if not isinstance(fact, dict):
                continue
            key = _relation_key(fact)
            if not key or key == "||":
                continue
            out[key] = _clamp(_safe_float(fact.get("affinity_weight"), 0.0), -1.0, 1.0)
        return out
    except Exception:
        return {}
    finally:
        cur.close()


def _chapter_numeric(chapter_id: Optional[str]) -> Optional[int]:
    if not chapter_id:
        return None
    digits = "".join(ch for ch in str(chapter_id) if ch.isdigit())
    if not digits:
        return None
    try:
        return int(digits)
    except Exception:
        return None


def _resolve_local_chapters(conn, story_id: int, chapter_id: Optional[str]) -> List[str]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT chapter_id
            FROM public.story_chapter
            WHERE story_id = %s
            ORDER BY id ASC
            """,
            (story_id,),
        )
        chapter_rows = cur.fetchall() or []
        ordered = [str((r or {}).get("chapter_id") or "").strip() for r in chapter_rows]
        ordered = [x for x in ordered if x]
        if not ordered:
            return [chapter_id] if chapter_id else []
        if chapter_id and chapter_id in ordered:
            idx = ordered.index(chapter_id)
        else:
            idx = len(ordered) - 1
        start = max(0, idx - (LOCAL_CHAPTER_WINDOW - 1))
        return ordered[start : idx + 1]
    except Exception:
        return [chapter_id] if chapter_id else []
    finally:
        cur.close()


def _classify_fact(fact: Dict[str, Any]) -> str:
    predicate = str(fact.get("predicate") or "").strip().lower()
    obj = str(fact.get("object") or "").strip().lower()
    evidence = str(fact.get("evidence") or "").strip().lower()
    static_markers = (
        "is", "was", "born", "family", "parent", "child", "sibling", "faction", "kingdom", "rank",
        "wants", "needs", "feels", "plans", "intends", "believes", "personality", "motivates", "looks"
    )
    if any(marker in predicate for marker in static_markers):
        return "STATIC"
    if obj.startswith("meta:") or evidence.startswith("meta:"):
        return "META"
    return "EPHEMERAL"


def _promotion_reason(fact: Dict[str, Any]) -> Optional[str]:
    predicate = str(fact.get("predicate") or "").strip().lower()
    obj = str(fact.get("object") or "").strip().lower()
    evidence = str(fact.get("evidence") or "").strip().lower()
    text = f"{predicate} {obj} {evidence}"

    if any(k in text for k in ("injur", "bruise", "limp", "fracture", "wound", "recovered", "recovery", "medical")):
        return "INJURY_OR_HEALTH_CHANGE"
    if any(k in text for k in ("buy", "bought", "acquire", "acquired", "grabbed", "carry", "carries", "tool", "emitter", "shield")):
        return "ASSET_OR_TOOL_ACQUIRED"
    if any(k in text for k in ("protocol", "if ambient frequency", "sends coordinates", "logs stay local", "rule", "threshold")):
        return "PROTOCOL_OR_RULE_COMMITTED"
    if any(k in text for k in ("record", "recorded", "surveillance", "camera", "tracked", "exposure")):
        return "SURVEILLANCE_OR_EXPOSURE_RISK"
    if any(k in text for k in ("plans", "plan", "decide", "decision", "commits", "commitment", "next move")):
        return "DECISION_WITH_FUTURE_COMMITMENT"
    if any(k in text for k in ("helped by", "supported by", "trust", "ally", "team", "responsibility")):
        return "RELATIONSHIP_STATE_SHIFT"
    return None


def _is_persistent_state_change(fact: Dict[str, Any], _context: Dict[str, Any]) -> bool:
    return _promotion_reason(fact) is not None


def _normalize_text_key(text: str) -> str:
    txt = re.sub(r"[^a-z0-9\s]", " ", str(text or "").lower())
    tokens = [t for t in txt.split() if t and t not in WORLD_RULE_STOPWORDS]
    return " ".join(tokens[:24])


def _world_rule_semantic_key(rule: Dict[str, str]) -> str:
    label = _normalize_text_key(str(rule.get("label") or ""))
    detail = _normalize_text_key(str(rule.get("detail") or ""))
    combined = f"{label} {detail}".strip()
    if not combined:
        return ""
    if any(k in combined for k in ("gang", "street", "threat", "alley")):
        return "security gang threat"
    if any(k in combined for k in ("technology", "tech", "emitter", "shield", "filter", "device")):
        return "technology operational tools"
    if any(k in combined for k in ("resourcefulness", "improvised", "prepare", "prepared", "checklist")):
        return "resourcefulness preparedness"
    # Keep a coarse semantic signature (topic + actor + constraint style).
    tokens = combined.split()
    return " ".join(tokens[:8])


def _is_scene_local_world_rule(rule: Dict[str, str]) -> bool:
    label = str(rule.get("label") or "").lower()
    detail = str(rule.get("detail") or "").lower()
    text = f"{label} {detail}"
    return any(
        marker in text
        for marker in (
            "kuro ", "mike ", "classmate", "he ", "she ", "they ", "said", "walked", "looked", "yelled", "smiled"
        )
    )


def _dedup_world_rules_semantic(raw: Any) -> tuple[List[Dict[str, str]], Dict[str, int]]:
    rules = _normalize_world_rules(raw)
    by_key: Dict[str, Dict[str, str]] = {}
    dropped_scene_local = 0
    merge_hits = 0
    for rule in rules:
        if _is_scene_local_world_rule(rule):
            dropped_scene_local += 1
            continue
        key = _world_rule_semantic_key(rule)
        if not key:
            continue
        prev = by_key.get(key)
        if prev is None:
            by_key[key] = rule
            continue
        merge_hits += 1
        # Keep richer detail text for better operator readability.
        if len(str(rule.get("detail") or "")) > len(str(prev.get("detail") or "")):
            by_key[key] = rule
    deduped = list(by_key.values())[:30]
    return deduped, {
        "input_count": len(rules),
        "merged_count": merge_hits,
        "dropped_scene_local_count": dropped_scene_local,
    }


def _open_loop_semantic_key(loop_id: str, description: str) -> str:
    text = _normalize_text_key(f"{loop_id} {description}")
    # Collapse equivalent injury loops like bruise/limping into a health-impact group.
    if any(k in text for k in ("bruise", "limp", "injur", "side pain", "throb")):
        return "kuro health injury impact"
    return " ".join(text.split()[:10])


def _merge_open_loops_semantic(raw: Any, accepted_facts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = raw if isinstance(raw, list) else []
    merged: Dict[str, Dict[str, Any]] = {}
    accepted_blob = _normalize_text_key(" ".join(
        f"{str(x.get('subject') or '')} {str(x.get('predicate') or '')} {str(x.get('object') or '')}"
        for x in accepted_facts if isinstance(x, dict)
    ))
    for row in rows:
        if not isinstance(row, dict):
            continue
        loop_id = str(row.get("id") or "").strip()[:80]
        desc = str(row.get("description") or "").strip()[:300]
        urgency = round(_clamp(_safe_float(row.get("urgency"), 0.0), 0.0, 1.0), 4)
        if not loop_id and not desc:
            continue
        key = _open_loop_semantic_key(loop_id, desc)
        if not key:
            continue
        resolved_hint = bool(desc and _normalize_text_key(desc) and _normalize_text_key(desc) in accepted_blob)
        item = merged.get(key)
        if item is None:
            merged[key] = {
                "id": loop_id or desc[:40],
                "description": desc,
                "urgency": urgency,
                "merged_from_ids": [loop_id] if loop_id else [],
                "resolved_hint": resolved_hint,
            }
            continue
        if loop_id and loop_id not in item.get("merged_from_ids", []):
            item["merged_from_ids"] = list(item.get("merged_from_ids") or []) + [loop_id]
        if urgency > _safe_float(item.get("urgency"), 0.0):
            item["urgency"] = urgency
            item["description"] = desc
            item["id"] = loop_id or desc[:40]
        item["resolved_hint"] = bool(item.get("resolved_hint")) or resolved_hint
    return list(merged.values())[:20]


def _resolve_empty_warning_reason(vetting: Dict[str, Any]) -> Optional[str]:
    clean_count = int(vetting.get("clean_count") or 0)
    promoted_count = int(vetting.get("promoted_count") or 0)
    low_conf = int(vetting.get("low_confidence_count") or 0)
    eph = int(vetting.get("ephemeral_filtered_count") or 0)
    if clean_count >= 2 or promoted_count > 0:
        return None
    if low_conf > 0 and eph == 0:
        return "LOW_CONFIDENCE_COLLAPSE"
    if eph > 0:
        return "EPHEMERAL_OVERFILTERED"
    return "NO_STATIC_FACTS"


def _guess_entity_type(fact: Dict[str, Any]) -> str:
    subject = str(fact.get("subject") or "").strip()
    predicate = str(fact.get("predicate") or "").strip().lower()
    obj = str(fact.get("object") or "").strip().lower()
    subj_l = subject.lower()
    if any(x in predicate for x in ("located", "in_city", "in_country", "at_place")):
        return "LOCATION"
    if any(x in predicate for x in ("member_of", "belongs_to", "rules", "controls")):
        return "ORG"
    if any(x in predicate for x in ("holds", "uses", "wields", "carries")):
        return "ITEM"
    if any(x in obj for x in ("kingdom", "empire", "guild", "order", "council", "organization")):
        return "ORG"
    if any(x in obj for x in ("city", "village", "mountain", "river", "planet", "realm")):
        return "LOCATION"
    if subject and subject[:1].isupper() and " " in subject:
        return "PERSON"
    if any(x in subj_l for x in ("city", "fort", "mount", "river", "valley")):
        return "LOCATION"
    return "OTHER"


def _load_entity_truth_map(conn, story_id: int) -> Dict[str, str]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        try:
            cur.execute(
                """
                SELECT DISTINCT ON (lower(subject))
                  lower(subject) AS subject_key,
                  upper(entity_type) AS entity_type
                FROM public.canon_fact
                WHERE story_id = %s
                  AND entity_type IS NOT NULL
                  AND (
                    COALESCE(is_static, false) = true
                    OR UPPER(COALESCE(classification, '')) = 'STATIC'
                  )
                ORDER BY lower(subject), created_at DESC, id DESC
                """,
                (story_id,),
            )
            rows = cur.fetchall() or []
            out: Dict[str, str] = {}
            for row in rows:
                key = str((row or {}).get("subject_key") or "").strip().lower()
                et = str((row or {}).get("entity_type") or "").strip().upper()
                if key and et in ENTITY_TYPES:
                    out[key] = et
            return out
        except Exception:
            return {}
    finally:
        cur.close()


def load_tiered_context(
    conn,
    story_id: int,
    arc_id: Optional[int] = None,
    *,
    chapter_id: Optional[str] = None,
) -> Dict[str, Any]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    full_mode = ANALYSIS_CONTEXT_MODE == "FULL"
    # FULL means full chapter scope for the requested chapter, not blind full-story dump.
    if full_mode:
        local_chapter_ids = [chapter_id] if chapter_id else []
    else:
        local_chapter_ids = _resolve_local_chapters(conn, story_id, chapter_id)
    chapter_num = _chapter_numeric(chapter_id)
    try:
        cur.execute(
            """
            SELECT
              COALESCE(f.tags[1], 'RELATION') AS category,
              f.subject,
              f.predicate,
              f.object,
              f.confidence,
              f.created_at,
              s.chapter_id
            FROM public.canon_fact f
            JOIN public.narrative_scene s ON s.id = f.scene_id
            WHERE f.story_id = %s
              AND s.is_verified = true
              AND s.status <> 'ARCHIVED'
              AND (
                cardinality(%s::text[]) = 0
                OR s.chapter_id = ANY(%s::text[])
              )
            ORDER BY f.created_at DESC
            """,
            (story_id, local_chapter_ids, local_chapter_ids),
        )
        local_facts = cur.fetchall() or []

        cur.execute(
            """
            SELECT a.event_label, a.participants, a.location, a.created_at, s.chapter_id
            FROM public.timeline_anchor a
            JOIN public.narrative_scene s ON s.id = a.scene_id
            WHERE a.story_id = %s
              AND s.is_verified = true
              AND s.status <> 'ARCHIVED'
              AND (
                cardinality(%s::text[]) = 0
                OR s.chapter_id = ANY(%s::text[])
              )
            ORDER BY a.created_at DESC
            """,
            (story_id, local_chapter_ids, local_chapter_ids),
        )
        local_anchors = cur.fetchall() or []

        cur.execute(
            """
            SELECT
              s.id AS scene_id,
              s.chapter_id,
              s.idx AS scene_idx,
              s.title AS scene_title,
              COALESCE(v.text_content, '') AS text_content
            FROM public.narrative_scene s
            LEFT JOIN public.narrative_scene_version v ON v.id = s.current_version_id
            WHERE s.story_id = %s
              AND s.is_verified = true
              AND s.status <> 'ARCHIVED'
              AND (
                cardinality(%s::text[]) = 0
                OR s.chapter_id = ANY(%s::text[])
              )
            ORDER BY s.chapter_id ASC, s.idx ASC, s.id ASC
            LIMIT 80
            """,
            (story_id, local_chapter_ids, local_chapter_ids),
        )
        local_prose_rows = cur.fetchall() or []
        local_prose: List[Dict[str, Any]] = []
        for row in local_prose_rows:
            text = str((row or {}).get("text_content") or "").strip()
            if not text:
                continue
            local_prose.append(
                {
                    "scene_id": (row or {}).get("scene_id"),
                    "chapter_id": str((row or {}).get("chapter_id") or ""),
                    "scene_idx": (row or {}).get("scene_idx"),
                    "scene_title": str((row or {}).get("scene_title") or "").strip()[:120],
                    "text_content": text[:1800],
                }
            )

        cur.execute(
            """
            SELECT id, name, slug, kind, act_model
            FROM public.story_arc
            WHERE story_id = %s AND (id = %s OR %s IS NULL)
            ORDER BY id DESC
            LIMIT 1
            """,
            (story_id, arc_id, arc_id),
        )
        arc_info = cur.fetchone() or {}

        try:
            cur.execute(
                """
                SELECT
                  subject,
                  predicate,
                  object,
                  confidence,
                  COALESCE(classification, CASE WHEN COALESCE(is_static, false) THEN 'STATIC' ELSE 'EPHEMERAL' END) AS classification
                FROM public.canon_fact
                WHERE story_id = %s
                  AND (
                    COALESCE(is_static, false) = true
                    OR UPPER(COALESCE(classification, '')) = 'STATIC'
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT 40
                """,
                (story_id,),
            )
            global_hints = cur.fetchall() or []
        except Exception:
            cur.execute(
                """
                SELECT category, content, importance
                FROM public.story_canon_fact
                WHERE story_id = %s
                  AND importance >= 4
                ORDER BY updated_at ASC
                LIMIT 20
                """,
                (story_id,),
            )
            global_hints = cur.fetchall() or []

        meso_milestones: List[Dict[str, Any]] = []
        try:
            if (not full_mode) and chapter_num is not None:
                lower = max(1, chapter_num - MESO_CHAPTER_WINDOW)
                cur.execute(
                    """
                    SELECT id, chapter_from, chapter_to, summary_json, quality_score, source_hash
                    FROM public.story_milestone
                    WHERE story_id = %s
                      AND chapter_to < %s
                      AND chapter_to >= %s
                    ORDER BY chapter_to DESC, id DESC
                    LIMIT %s
                    """,
                    (story_id, chapter_num, lower, MESO_MILESTONE_LIMIT),
                )
            elif not full_mode:
                cur.execute(
                    """
                    SELECT id, chapter_from, chapter_to, summary_json, quality_score, source_hash
                    FROM public.story_milestone
                    WHERE story_id = %s
                    ORDER BY chapter_to DESC, id DESC
                    LIMIT %s
                    """,
                    (story_id, MESO_MILESTONE_LIMIT),
                )
            meso_milestones = cur.fetchall() or []
        except Exception:
            meso_milestones = []

        layers_v4: Dict[str, Any] = {}
        try:
            from worker_memory_context import (
                load_working_memory,
                load_arc_memory,
                load_saga_memory,
                load_core_lookup,
            )
            layers_v4 = {
                "memory_contract_version": "v4",
                "working": load_working_memory(conn, story_id, chapter_id, window=LOCAL_CHAPTER_WINDOW),
                "arc": load_arc_memory(conn, story_id, chapter_id, arc_id=arc_id, limit=MESO_CHAPTER_WINDOW),
                "saga": load_saga_memory(conn, story_id),
                "core_db": load_core_lookup(
                    conn,
                    story_id,
                    {"chapter_goal": chapter_id or "", "instructions": "historian_analysis", "keywords": chapter_id or ""},
                ),
            }
        except Exception:
            layers_v4 = {"memory_contract_version": "v4", "error": "MEMORY_CONTEXT_UNAVAILABLE"}

        return {
            "local": {
                "facts": local_facts,
                "anchors": local_anchors,
                "prose": local_prose,
                "chapter_ids": local_chapter_ids,
            },
            "meso": {"milestones": meso_milestones},
            "mid_term": arc_info,
            "global_hints": global_hints,
            "entity_truth_map": _load_entity_truth_map(conn, story_id),
            "mcp_refs": ["story://canon", "story://lineage", "story://semantic"],
            "analysis_context_mode": "FULL" if full_mode else "WINDOWED",
            "analysis_inputs": {
                "structural_outline": _load_structural_outline_for_chapter(conn, story_id=story_id, chapter_id=chapter_id),
            },
            "layers_v4": layers_v4,
        }
    finally:
        cur.close()


def _load_structural_outline_for_chapter(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
) -> Dict[str, Any]:
    if not chapter_id:
        return {}
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT result_json
            FROM public.ingest_task
            WHERE story_id = %s
              AND task_type = 'CHAPTER_SPLIT_LLM'
              AND status = 'DONE'
              AND (
                COALESCE(result_json->>'chapter_id', '') = %s
                OR COALESCE(payload_json->>'chapter_id', '') = %s
              )
            ORDER BY updated_at DESC NULLS LAST, id DESC
            LIMIT 1
            """,
            (story_id, chapter_id, chapter_id),
        )
        row = cur.fetchone() or {}
        result_json = row.get("result_json") if isinstance(row.get("result_json"), dict) else {}
        outline = result_json.get("structural_outline") if isinstance(result_json.get("structural_outline"), dict) else {}
        beats = outline.get("beats") if isinstance(outline.get("beats"), list) else []
        if not beats:
            return {}
        return outline
    except Exception:
        return {}
    finally:
        cur.close()


def _load_analysis_chunk_artifact_for_chapter(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
) -> Dict[str, Any]:
    if not chapter_id:
        return {}
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT result_json
            FROM public.ingest_task
            WHERE story_id = %s
              AND task_type = 'CHAPTER_SPLIT_LLM'
              AND status = 'DONE'
              AND (
                COALESCE(result_json->>'chapter_id', '') = %s
                OR COALESCE(payload_json->>'chapter_id', '') = %s
              )
            ORDER BY updated_at DESC NULLS LAST, id DESC
            LIMIT 1
            """,
            (story_id, chapter_id, chapter_id),
        )
        row = cur.fetchone() or {}
        result_json = row.get("result_json") if isinstance(row.get("result_json"), dict) else {}
        artifact = result_json.get("analysis_chunk_artifact") if isinstance(result_json.get("analysis_chunk_artifact"), dict) else {}
        return artifact if isinstance(artifact, dict) else {}
    except Exception:
        return {}
    finally:
        cur.close()


def _load_split_operational_state_for_chapter(
    conn,
    *,
    story_id: int,
    chapter_id: Optional[str],
) -> tuple[str, str]:
    if not chapter_id:
        return ("UNKNOWN", "MISSING_CHAPTER_ID")
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT result_json
            FROM public.ingest_task
            WHERE story_id = %s
              AND task_type = 'CHAPTER_SPLIT_LLM'
              AND status = 'DONE'
              AND (
                COALESCE(result_json->>'chapter_id', '') = %s
                OR COALESCE(payload_json->>'chapter_id', '') = %s
              )
            ORDER BY updated_at DESC NULLS LAST, id DESC
            LIMIT 1
            """,
            (story_id, chapter_id, chapter_id),
        )
        row = cur.fetchone() or {}
        result_json = row.get("result_json") if isinstance(row.get("result_json"), dict) else {}
        op_state = str(result_json.get("operational_state") or "").strip().upper()
        op_reason = str(result_json.get("operational_state_reason") or "").strip()
        if op_state in ("READY_FOR_ANALYSIS", "NEEDS_RETRY"):
            return (op_state, op_reason or "UNKNOWN")
        # Backward compatibility for historical rows without operational_state.
        artifact = result_json.get("analysis_chunk_artifact") if isinstance(result_json.get("analysis_chunk_artifact"), dict) else {}
        artifact_status = str(artifact.get("status") or "").strip().upper()
        if artifact_status == "READY_FOR_ANALYSIS":
            return ("READY_FOR_ANALYSIS", "LEGACY_ARTIFACT_STATUS")
        return ("NEEDS_RETRY", "LEGACY_ARTIFACT_NOT_READY")
    except Exception:
        return ("UNKNOWN", "LOOKUP_ERROR")
    finally:
        cur.close()


def _validate_analysis_chunk_artifact(artifact: Dict[str, Any]) -> tuple[bool, str]:
    if not isinstance(artifact, dict) or not artifact:
        return False, "ANALYSIS_INPUT_MISSING_CHUNK_ARTIFACT"
    status = str(artifact.get("status") or "")
    if status != "READY_FOR_ANALYSIS":
        return False, "ANALYSIS_INPUT_STATUS_NOT_READY"
    coverage = artifact.get("coverage") if isinstance(artifact.get("coverage"), dict) else {}
    coverage_ratio = _safe_float(coverage.get("coverage_ratio"), 0.0)
    passes_gate = bool(coverage.get("passes_gate"))
    if not passes_gate or coverage_ratio < 0.99:
        return False, "ANALYSIS_INPUT_COVERAGE_GATE_FAIL"
    chunks = artifact.get("chunks") if isinstance(artifact.get("chunks"), list) else []
    if not chunks:
        return False, "ANALYSIS_INPUT_MISSING_CHUNK_ARTIFACT"
    return True, ""


def _chunk_rows_from_artifact(artifact: Dict[str, Any]) -> List[List[Dict[str, Any]]]:
    chunks = artifact.get("chunks") if isinstance(artifact.get("chunks"), list) else []
    out: List[List[Dict[str, Any]]] = []
    for item in sorted(
        [x for x in chunks if isinstance(x, dict)],
        key=lambda x: int(x.get("order") or 0),
    ):
        txt = str(item.get("chunk_text") or "")
        if not txt:
            continue
        out.append(
            [
                {
                    "chunk_id": str(item.get("chunk_id") or ""),
                    "scene_idx": int(item.get("order") or 0),
                    "scene_title": str(item.get("chunk_id") or ""),
                    "text_content": txt,
                }
            ]
        )
    return out


def _build_extractor_prompt(context: Dict[str, Any], instructions: str) -> str:
    return (
        "You are The Historian Extractor.\n"
        "Extract candidate narrative facts and basic narrative signals from verified context.\n"
        "Keep output compact and bounded.\n"
        "Hard caps: candidate_facts <= 20, character_voices <= 12, world_rules <= 15, open_loops <= 8.\n"
        "AVOID IDENTITY FRAGMENTATION: Use full, consistent character names (e.g., 'Kuro Sora' instead of just 'Kuro').\n"
        "ALIAS HANDLING: Always map pronouns or nicknames back to the Character's Full Name in the 'subject' field, but you may note the nickname in the 'evidence' or 'notes' field.\n"
        "MARK PERSISTENT CONSEQUENCES AS STATIC: injuries, acquired tools, committed protocols, surveillance risk, and forward decisions must be STATIC.\n"
        "DO NOT EMIT PRONOUN-ONLY CHARACTER NAMES in character_voices.\n"
        "OPEN LOOP HYGIENE: only unresolved loops; if directly answered by current text, lower urgency or omit.\n"
        "EVALUATE VIBE: Do not default SWAS metrics or narrative_tension to 0; analyze the actual sensory and emotional depth.\n"
        "SWAS CALIBRATION: Score on a realistic scale. Prose with clear sensory details, character interiority, or atmosphere should score 0.40+. "
        "Only truly empty, mechanical, or context-free prose should score below 0.25. Do not cluster all scores near 0.0.\n"

        "Avoid prose explanation outside JSON fields.\n"
        "Return strict JSON only with shape:\n"
        "{\n"
        '  "candidate_facts":[{"subject":"","entity_type":"PERSON|LOCATION|ORG|ITEM|OTHER","predicate":"","object":"","classification":"STATIC|EPHEMERAL|META","confidence":0.0,"evidence":"","is_unreliable_narrator":false,"affinity_weight":0.0}],\n'
        '  "sensory_profile":{"dominant_colors":[""],"atmosphere_scents":[""],"temperature_delta":0.0},\n'
        '  "character_voices":[{"name":"","tone":"","sentence_cadence":"short|med|long","vocabulary_tier":"low|mid|high"}],\n'
        '  "world_rules":[{"label":"","detail":""}],\n'
        '  "emotional_target":"Empathy|Suspense|Wonder|Mixed",\n'
        '  "open_loops":[{"id":"","description":"","urgency":0.0}],\n'
        '  "swas":{"mental_imagery":0.0,"engagement":0.0,"metaphor_rhetoric_frequency":0.0},\n'
        '  "narrative_tension":0.0,\n'
        '  "notes":""\n'
        "}\n"
        f"INSTRUCTIONS: {instructions[:1200]}\n"
        f"LOCAL_FACTS: {_json_dumps(context.get('local', {}).get('facts', []))}\n"
        f"LOCAL_ANCHORS: {_json_dumps(context.get('local', {}).get('anchors', []))}\n"
        f"LOCAL_PROSE: {_json_dumps(context.get('local', {}).get('prose', []))}\n"
        f"MESO_MILESTONES: {_json_dumps(context.get('meso', {}).get('milestones', []))}\n"
        f"GLOBAL_HINTS: {_json_dumps(context.get('global_hints', []))}\n"
        f"STRUCTURAL_OUTLINE_BEATS: {_json_dumps((((context.get('analysis_inputs') or {}) if isinstance(context.get('analysis_inputs'), dict) else {}).get('structural_outline') or {}).get('beats', []))}\n"
    )


def _extract_candidate_facts_llm(
    context: Dict[str, Any],
    instructions: str,
    *,
    prompt_override: Optional[str] = None,
) -> tuple[Dict[str, Any], str]:
    prompt = prompt_override or _build_extractor_prompt(context, instructions)
    messages = [
        {"role": "system", "content": "You are a precise narrative extraction engine."},
        {"role": "user", "content": prompt},
    ]
    message_chars = sum(len(str((m or {}).get("content") or "")) for m in messages)
    print(
        f"[writing_analysis][llm_prompt] prompt_chars={len(prompt)} message_chars={message_chars} instructions_chars={len(instructions or '')}",
        file=sys.stderr,
    )
    llm_out = call_llm_json(
        messages,
        max_tokens=WRITING_ANALYSIS_MAX_TOKENS,
        temperature=0.2,
        timeout_sec=get_llm_timeout("writing_analysis"),
        raise_on_error=True,
    )
    return llm_out, prompt


def _context_for_chunk(base_context: Dict[str, Any], prose_chunk: List[Dict[str, Any]]) -> Dict[str, Any]:
    local_src = base_context.get("local") if isinstance(base_context.get("local"), dict) else {}
    local_out = {
        "facts": local_src.get("facts", []),
        "anchors": local_src.get("anchors", []),
        "prose": prose_chunk,
        "chapter_ids": local_src.get("chapter_ids", []),
    }
    out = dict(base_context)
    out["local"] = local_out
    return out


def _merge_chunk_outputs(chunk_outputs: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not chunk_outputs:
        return {
            "candidate_facts": [],
            "sensory_profile": {"dominant_colors": [], "atmosphere_scents": [], "temperature_delta": 0.0},
            "character_voices": [],
            "world_rules": [],
            "emotional_target": "Mixed",
            "open_loops": [],
            "swas": {"mental_imagery": 0.45, "engagement": 0.45, "metaphor_rhetoric_frequency": 0.4},
            "narrative_tension": 0.4,
            "notes": "",
        }

    merged_facts: List[Dict[str, Any]] = []
    merged_colors: List[str] = []
    merged_scents: List[str] = []
    temp_sum = 0.0
    temp_count = 0
    voice_by_name: Dict[str, Dict[str, Any]] = {}
    world_rule_map: Dict[str, Dict[str, str]] = {}
    open_loop_map: Dict[str, Dict[str, Any]] = {}
    swas_mi = 0.0
    swas_eng = 0.0
    swas_meta = 0.0
    tension_sum = 0.0
    emotional_counts: Dict[str, int] = {}
    notes_parts: List[str] = []

    for out in chunk_outputs:
        merged_facts.extend(_normalize_fact_list(out.get("candidate_facts")))

        sensory = _normalize_sensory_profile(out.get("sensory_profile"))
        for c in sensory.get("dominant_colors", []):
            if c and c not in merged_colors:
                merged_colors.append(c)
        for s in sensory.get("atmosphere_scents", []):
            if s and s not in merged_scents:
                merged_scents.append(s)
        temp_sum += _safe_float(sensory.get("temperature_delta"), 0.0)
        temp_count += 1

        for voice in _normalize_character_voices(out.get("character_voices")):
            name_key = str(voice.get("name") or "").strip().lower()
            if not name_key or name_key in voice_by_name:
                continue
            voice_by_name[name_key] = voice

        for rule in _normalize_world_rules(out.get("world_rules")):
            key = f"{str(rule.get('label') or '').strip().lower()}|{str(rule.get('detail') or '').strip().lower()}"
            if key and key not in world_rule_map:
                world_rule_map[key] = rule

        open_loops = out.get("open_loops") if isinstance(out.get("open_loops"), list) else []
        for row in open_loops:
            if not isinstance(row, dict):
                continue
            loop_id = str(row.get("id") or "").strip()[:80]
            desc = str(row.get("description") or "").strip()[:300]
            urgency = round(_clamp(_safe_float(row.get("urgency"), 0.0), 0.0, 1.0), 4)
            if not loop_id and not desc:
                continue
            key = (loop_id or desc).strip().lower()
            prev = open_loop_map.get(key)
            if prev is None or urgency > _safe_float(prev.get("urgency"), 0.0):
                open_loop_map[key] = {"id": loop_id or desc[:40], "description": desc, "urgency": urgency}

        swas = out.get("swas") if isinstance(out.get("swas"), dict) else {}
        swas_mi += _clamp(_safe_float(swas.get("mental_imagery"), 0.45), 0.0, 1.0)
        swas_eng += _clamp(_safe_float(swas.get("engagement"), 0.45), 0.0, 1.0)
        swas_meta += _clamp(_safe_float(swas.get("metaphor_rhetoric_frequency"), 0.4), 0.0, 1.0)
        tension_sum += _clamp(_safe_float(out.get("narrative_tension"), 0.4), 0.0, 1.0)

        target = str(out.get("emotional_target") or "Mixed").strip()[:40] or "Mixed"
        emotional_counts[target] = emotional_counts.get(target, 0) + 1

        note = str(out.get("notes") or "").strip()
        if note:
            notes_parts.append(note[:200])

    n = max(1, len(chunk_outputs))
    emotional_target = max(emotional_counts.items(), key=lambda kv: (kv[1], kv[0]))[0] if emotional_counts else "Mixed"
    notes_merged = " | ".join(notes_parts[:12])[:1000]

    return {
        "candidate_facts": merged_facts[:240],
        "sensory_profile": {
            "dominant_colors": merged_colors[:16],
            "atmosphere_scents": merged_scents[:16],
            "temperature_delta": round(temp_sum / float(max(1, temp_count)), 3),
        },
        "character_voices": list(voice_by_name.values())[:24],
        "world_rules": list(world_rule_map.values())[:30],
        "emotional_target": emotional_target,
        "open_loops": list(open_loop_map.values())[:20],
        "swas": {
            "mental_imagery": round(swas_mi / n, 4),
            "engagement": round(swas_eng / n, 4),
            "metaphor_rhetoric_frequency": round(swas_meta / n, 4),
        },
        "narrative_tension": round(tension_sum / n, 4),
        "notes": notes_merged,
    }


def _vet_candidate_facts(
    candidate_facts: List[Dict[str, Any]],
    context: Dict[str, Any],
    external_signals: Optional[Dict[str, Any]] = None,
    previous_affinity_map: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    local_truth = context.get("local", {}).get("facts", [])
    global_truth = context.get("global_hints", [])
    truth_map: Dict[str, str] = {}
    exact_truth: set[str] = set()
    for row in local_truth:
        if not isinstance(row, dict):
            continue
        s = str(row.get("subject") or "").strip().lower()
        p = str(row.get("predicate") or "").strip().lower()
        o = str(row.get("object") or "").strip()
        if s and p and o:
            truth_map[f"{s}|{p}"] = o
            exact_truth.add(f"{s}|{p}|{o.strip().lower()}")
    for row in global_truth:
        if not isinstance(row, dict):
            continue
        s = str(row.get("subject") or "").strip().lower()
        p = str(row.get("predicate") or "").strip().lower()
        o = str(row.get("object") or "").strip()
        if s and p and o:
            truth_map[f"{s}|{p}"] = o
            exact_truth.add(f"{s}|{p}|{o.strip().lower()}")

    conflicts: List[Dict[str, Any]] = []
    entity_type_conflicts: List[Dict[str, Any]] = []
    low_confidence_rejects: List[Dict[str, Any]] = []
    ephemeral_filtered: List[Dict[str, Any]] = []
    duplicates: List[Dict[str, Any]] = []
    promoted_facts: List[Dict[str, Any]] = []
    accepted_facts: List[Dict[str, Any]] = []
    classification_stats = {"STATIC": 0, "EPHEMERAL": 0, "META": 0}
    entity_type_stats: Dict[str, int] = {"PERSON": 0, "LOCATION": 0, "ORG": 0, "ITEM": 0, "OTHER": 0}
    state_change_stats: Dict[str, int] = {k: 0 for k in STATE_CHANGE_REASON_CODES}
    filter_reason_stats: Dict[str, int] = {"LOW_CONFIDENCE": 0, "EPHEMERAL_FILTERED": 0, "DUPLICATE": 0, "CONFLICT": 0}
    dedup_keys: set[str] = set()
    entity_truth_map = context.get("entity_truth_map") if isinstance(context.get("entity_truth_map"), dict) else {}
    for fact in candidate_facts:
        s = str(fact.get("subject") or "").strip().lower()
        p = str(fact.get("predicate") or "").strip().lower()
        o = str(fact.get("object") or "").strip()
        if not s or not p or not o:
            continue
        confidence = max(0.0, min(1.0, _safe_float(fact.get("confidence"), 0.0)))
        if confidence < FACT_CONFIDENCE_GATE:
            filter_reason_stats["LOW_CONFIDENCE"] += 1
            low_confidence_rejects.append(
                {
                    "subject": fact.get("subject"),
                    "predicate": fact.get("predicate"),
                    "object": fact.get("object"),
                    "confidence": round(confidence, 4),
                    "reason": "LOW_CONFIDENCE",
                }
            )
            continue
        exact_key = f"{s}|{p}|{o.strip().lower()}"
        if exact_key in dedup_keys or exact_key in exact_truth:
            filter_reason_stats["DUPLICATE"] += 1
            duplicates.append(
                {
                    "subject": fact.get("subject"),
                    "predicate": fact.get("predicate"),
                    "object": fact.get("object"),
                    "reason": "DUPLICATE",
                }
            )
            continue
        dedup_keys.add(exact_key)
        key = f"{s}|{p}"
        if key in truth_map and truth_map[key].strip().lower() != o.strip().lower():
            filter_reason_stats["CONFLICT"] += 1
            conflicts.append(
                {
                    "subject": fact.get("subject"),
                    "predicate": fact.get("predicate"),
                    "candidate_object": o,
                    "ground_truth_object": truth_map[key],
                    "reason": "OBJECT_MISMATCH",
                }
            )
        else:
            classification = str(fact.get("classification") or "").strip().upper()
            if classification not in ("STATIC", "EPHEMERAL", "META"):
                classification = _classify_fact(fact)
            classification_stats[classification] = classification_stats.get(classification, 0) + 1
            promotion_reason = None
            if classification != "STATIC":
                if _is_persistent_state_change(fact, context):
                    promotion_reason = _promotion_reason(fact)
                    if promotion_reason:
                        state_change_stats[promotion_reason] = state_change_stats.get(promotion_reason, 0) + 1
                if not promotion_reason:
                    filter_reason_stats["EPHEMERAL_FILTERED"] += 1
                    ephemeral_filtered.append(
                        {
                            "subject": fact.get("subject"),
                            "predicate": fact.get("predicate"),
                            "object": fact.get("object"),
                            "classification": classification,
                            "reason": "EPHEMERAL_FILTERED",
                        }
                    )
                    continue
            proposed_entity_type = str(fact.get("entity_type") or "").strip().upper()
            if proposed_entity_type not in ENTITY_TYPES:
                proposed_entity_type = _guess_entity_type(fact)
            known_entity_type = str(entity_truth_map.get(s) or "").strip().upper()
            entity_type = proposed_entity_type
            if known_entity_type and known_entity_type in ENTITY_TYPES and known_entity_type != proposed_entity_type:
                entity_type_conflicts.append(
                    {
                        "subject": fact.get("subject"),
                        "proposed_entity_type": proposed_entity_type,
                        "known_entity_type": known_entity_type,
                        "reason": "ENTITY_TYPE_CONFLICT",
                    }
                )
                entity_type = known_entity_type
            entity_type_stats[entity_type] = entity_type_stats.get(entity_type, 0) + 1
            is_relationship = _is_relation_fact(fact)
            affinity_history: List[Dict[str, Any]] = []
            affinity_weight = _clamp(_safe_float(fact.get("affinity_weight"), 0.0), -1.0, 1.0)
            affinity_prev = None
            affinity_shift = 0.0
            if is_relationship:
                rel_key = _relation_key(fact)
                if isinstance(previous_affinity_map, dict) and rel_key in previous_affinity_map:
                    affinity_prev = _clamp(_safe_float(previous_affinity_map.get(rel_key), 0.0), -1.0, 1.0)
                    combined_signal = " ".join(
                        [
                            str(fact.get("predicate") or ""),
                            str(fact.get("object") or ""),
                            str(fact.get("evidence") or ""),
                        ]
                    )
                    affinity_weight, affinity_shift = _calculate_affinity_shift(affinity_prev, [combined_signal])
                    affinity_history = [
                        {
                            "from": round(affinity_prev, 4),
                            "to": round(affinity_weight, 4),
                            "delta": round(affinity_shift, 4),
                            "event_signal": round(_event_signal_score(combined_signal), 4),
                        }
                    ]
            accepted_facts.append(
                {
                    **fact,
                    "entity_type": entity_type,
                    "classification": "STATIC",
                    "is_static": True,
                    "promoted_from_classification": classification if promotion_reason else None,
                    "promotion_reason": promotion_reason,
                    "is_unreliable": bool(fact.get("is_unreliable", False)),
                    "is_relationship": is_relationship,
                    "affinity_weight": round(affinity_weight, 4),
                    "affinity_prev": (round(affinity_prev, 4) if isinstance(affinity_prev, (int, float)) else None),
                    "affinity_shift": round(affinity_shift, 4),
                    "affinity_shift_history": affinity_history,
                    "confidence": round(confidence, 4),
                }
            )
            if promotion_reason:
                promoted_facts.append(
                    {
                        "subject": fact.get("subject"),
                        "predicate": fact.get("predicate"),
                        "object": fact.get("object"),
                        "promotion_reason": promotion_reason,
                        "confidence": round(confidence, 4),
                    }
                )

    external_conflicts = []
    neo4j_obj = (external_signals or {}).get("neo4j") if isinstance((external_signals or {}).get("neo4j"), dict) else {}
    lineage_conflicts = neo4j_obj.get("lineage_conflicts") if isinstance(neo4j_obj.get("lineage_conflicts"), list) else []
    for item in lineage_conflicts[:40]:
        if not isinstance(item, dict):
            continue
        external_conflicts.append(
            {
                "subject": str(item.get("subject") or ""),
                "predicate": str(item.get("predicate") or ""),
                "candidate_object": str(item.get("candidate_object") or ""),
                "ground_truth_object": str(item.get("ground_truth_object") or ""),
                "reason": "LINEAGE_CONFLICT_GRAPH",
            }
        )
    all_conflicts = conflicts + external_conflicts + entity_type_conflicts
    fact_status = "CONFLICT" if all_conflicts else "CLEAN"
    return {
        "fact_status": fact_status,
        "clean_count": len(accepted_facts),
        "duplicate_count": len(duplicates),
        "low_confidence_count": len(low_confidence_rejects),
        "ephemeral_filtered_count": len(ephemeral_filtered),
        "promoted_count": len(promoted_facts),
        "conflict_count": len(all_conflicts),
        "accepted_facts": accepted_facts[:40],
        "promoted_facts": promoted_facts[:40],
        "duplicates": duplicates[:40],
        "low_confidence_rejects": low_confidence_rejects[:40],
        "ephemeral_filtered": ephemeral_filtered[:40],
        "classification_stats": classification_stats,
        "filter_reason_stats": filter_reason_stats,
        "state_change_stats": state_change_stats,
        "entity_type_stats": entity_type_stats,
        "entity_type_conflicts": entity_type_conflicts[:40],
        "conflicts": all_conflicts[:40],
    }


def _build_snapshot_v3(
    *,
    chapter_id: Optional[str],
    context: Dict[str, Any],
    llm_out: Dict[str, Any],
    vetting: Dict[str, Any],
    accepted_facts: List[Dict[str, Any]],
    external_signals: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    swas = llm_out.get("swas") if isinstance(llm_out.get("swas"), dict) else {}
    imagery = max(0.0, min(1.0, _safe_float(swas.get("mental_imagery"), 0.45)))
    engagement = max(0.0, min(1.0, _safe_float(swas.get("engagement"), 0.45)))
    tension = max(0.0, min(1.0, _safe_float(llm_out.get("narrative_tension"), 0.4)))
    style_similarity = max(
        0.0,
        min(
            1.0,
            _safe_float(
                ((external_signals or {}).get("qdrant") or {}).get("style_similarity")
                if isinstance((external_signals or {}).get("qdrant"), dict)
                else 0.0,
                0.0,
            ),
        ),
    )
    narrative_score = round(((imagery + engagement + tension) / 3.0) * 0.85 + (style_similarity * 0.15), 4)

    open_loops_raw = llm_out.get("open_loops")
    open_loops = _merge_open_loops_semantic(open_loops_raw, accepted_facts)
    lore_debt = any(_safe_float(x.get("urgency"), 0.0) >= 0.8 for x in open_loops)
    emotional_target = str(llm_out.get("emotional_target") or "Mixed").strip()[:40] or "Mixed"
    sensory_profile = _normalize_sensory_profile(llm_out.get("sensory_profile"))
    character_voices, voice_resolution_report = _resolve_character_voices_with_report(llm_out.get("character_voices"), context)
    world_rules, world_rules_dedup_report = _dedup_world_rules_semantic(llm_out.get("world_rules"))
    style_dna = _estimate_style_dna(context, llm_out)

    return {
        "snapshot_version": "v3.0",
        "chapter_id": chapter_id,
        "fact_status": vetting.get("fact_status", "UNVETTED"),
        "emotional_target": emotional_target,
        "sensory_profile": sensory_profile,
        "character_voices": character_voices,
        "character_voices_resolution_report": voice_resolution_report,
        "world_rules": world_rules,
        "world_rules_dedup_report": world_rules_dedup_report,
        "style_dna": style_dna,
        "facts": accepted_facts[:80],
        "open_loops": open_loops[:20],
        "narrative_metrics": {
            "swas": {
                "mental_imagery": imagery,
                "engagement": engagement,
            },
            "narrative_tension": tension,
            "style_similarity": style_similarity,
            "narrative_score": narrative_score,
            "lore_debt": lore_debt,
        },
        "external_signals": external_signals or {},
    }


def analyze_story_state(
    conn,
    story_id: int,
    instructions: str,
    *,
    chapter_id: Optional[str] = None,
    structural_outline: Optional[Dict[str, Any]] = None,
    analysis_chunk_artifact: Optional[Dict[str, Any]] = None,
    pre_llm_trace_hook: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    context = load_tiered_context(conn, story_id, chapter_id=chapter_id)
    outline_obj = structural_outline if isinstance(structural_outline, dict) else {}
    if not outline_obj:
        outline_obj = _load_structural_outline_for_chapter(conn, story_id=story_id, chapter_id=chapter_id)
    chunk_artifact = analysis_chunk_artifact if isinstance(analysis_chunk_artifact, dict) else {}
    if not chunk_artifact:
        chunk_artifact = _load_analysis_chunk_artifact_for_chapter(conn, story_id=story_id, chapter_id=chapter_id)
    op_state, _op_reason = _load_split_operational_state_for_chapter(conn, story_id=story_id, chapter_id=chapter_id)
    if op_state != "READY_FOR_ANALYSIS":
        raise ValueError("ANALYSIS_INPUT_OPERATIONAL_STATE_NOT_READY")
    ok_artifact, artifact_error = _validate_analysis_chunk_artifact(chunk_artifact)
    if not ok_artifact:
        raise ValueError(artifact_error)
    context["analysis_inputs"] = {
        "structural_outline": outline_obj if isinstance(outline_obj, dict) else {},
        "analysis_chunk_artifact": chunk_artifact,
    }
    context_hash = hashlib.sha256(_json_dumps(context).encode("utf-8")).hexdigest()
    previous_affinity_map = _load_previous_approved_affinity_map(conn, story_id=story_id, chapter_id=chapter_id)
    try:
        prose_chunks = _chunk_rows_from_artifact(chunk_artifact)
        if not prose_chunks:
            raise ValueError("ANALYSIS_INPUT_MISSING_CHUNK_ARTIFACT")
        chunk_outputs: List[Dict[str, Any]] = []
        chunk_prompts: List[str] = []
        for idx, chunk in enumerate(prose_chunks):
            chunk_ctx = _context_for_chunk(context, chunk)
            chunk_instructions = f"{instructions}\nCHUNK_SCOPE: {idx + 1}/{len(prose_chunks)}"
            llm_prompt_chunk = _build_extractor_prompt(chunk_ctx, chunk_instructions.strip())
            if callable(pre_llm_trace_hook):
                try:
                    pre_llm_trace_hook(
                        {
                            "chunk_index": idx + 1,
                            "chunk_count": len(prose_chunks),
                            "prompt_text": llm_prompt_chunk,
                            "prompt_hash": hashlib.sha256(llm_prompt_chunk.encode("utf-8")).hexdigest(),
                            "prompt_chars": len(llm_prompt_chunk),
                            "prompt_tokens_est": max(1, int(len(llm_prompt_chunk) / 4)),
                        }
                    )
                except Exception:
                    pass
            llm_out_chunk, _ = _extract_candidate_facts_llm(
                chunk_ctx,
                chunk_instructions.strip(),
                prompt_override=llm_prompt_chunk,
            )
            chunk_outputs.append(llm_out_chunk if isinstance(llm_out_chunk, dict) else {})
            chunk_prompts.append(llm_prompt_chunk)
            if idx < len(prose_chunks) - 1:
                time.sleep(1.5)
        llm_out = _merge_chunk_outputs(chunk_outputs)
        llm_prompt_text = chunk_prompts[0] if chunk_prompts else ""

        candidate_facts_raw = _normalize_fact_list(llm_out.get("candidate_facts"))
        style_dna = _estimate_style_dna(context, llm_out)
        external_signals = _load_external_signals(
            story_id=story_id,
            chapter_id=chapter_id,
            instructions=instructions,
            candidate_facts=candidate_facts_raw,
            style_dna=style_dna,
        )
        vetting = _vet_candidate_facts(
            candidate_facts_raw,
            context,
            external_signals=external_signals,
            previous_affinity_map=previous_affinity_map,
        )
        accepted_facts = vetting.get("accepted_facts") if isinstance(vetting.get("accepted_facts"), list) else candidate_facts_raw
        snapshot_v3 = _build_snapshot_v3(
            chapter_id=chapter_id,
            context=context,
            llm_out=llm_out,
            vetting=vetting,
            accepted_facts=accepted_facts,
            external_signals=external_signals,
        )
        clean_count = int(vetting.get("clean_count") or 0)
        promoted_count = int(vetting.get("promoted_count") or 0)
        empty_warning_reason_code = _resolve_empty_warning_reason(vetting)
        if empty_warning_reason_code:
            vetting["fact_status"] = "EMPTY_WARNING"
            vetting["empty_warning_reason_code"] = empty_warning_reason_code
            snapshot_v3["fact_status"] = "EMPTY_WARNING"
            snapshot_v3["empty_warning_reason_code"] = empty_warning_reason_code
        integration_status = "INTEGRATED" if snapshot_v3["fact_status"] == "CLEAN" else str(snapshot_v3["fact_status"] or "VETTED")
        return {
            "degraded_mode": False,
            "mcp_refs": context.get("mcp_refs", []),
            "context_hash": context_hash,
            "analysis_input_chunk": {
                "artifact_version": str(chunk_artifact.get("version") or ""),
                "artifact_hash": hashlib.sha256(_json_dumps(chunk_artifact).encode("utf-8")).hexdigest(),
                "chunk_count": len((chunk_artifact.get("chunks") if isinstance(chunk_artifact.get("chunks"), list) else [])),
                "split_task_id": int((((chunk_artifact.get("source") if isinstance(chunk_artifact.get("source"), dict) else {}).get("split_task_id")) or 0)),
            },
            "candidate_facts_raw": candidate_facts_raw,
            "candidate_facts": accepted_facts,
            "affinity_reference_count": len(previous_affinity_map),
            "vetting_report": vetting,
            "snapshot_v3": snapshot_v3,
            "empty_warning": bool(empty_warning_reason_code),
            "external_signals": external_signals,
            "integration_status": integration_status,
            "analysis_notes": str(llm_out.get("notes") or "").strip()[:1000],
            "_trace_prompt_text": llm_prompt_text,
            "_trace_prompt_hash": hashlib.sha256(llm_prompt_text.encode("utf-8")).hexdigest(),
            "_trace_prompt_meta": {
                "provider_call": "call_llm_json",
                "task_family": "writing_analysis",
                "temperature": 0.2,
                "max_tokens": WRITING_ANALYSIS_MAX_TOKENS,
                "timeout_sec": get_llm_timeout("writing_analysis"),
                "chunk_count": len(prose_chunks),
                "chunk_scene_counts": [len(c) for c in prose_chunks],
                "prompt_chars": sum(len(x) for x in chunk_prompts),
                "prompt_tokens_est": max(1, int(sum(len(x) for x in chunk_prompts) / 4)),
                "first_chunk_prompt_chars": len(llm_prompt_text),
                "input_chunk_artifact_hash": hashlib.sha256(_json_dumps(chunk_artifact).encode("utf-8")).hexdigest(),
                "input_chunk_count": len((chunk_artifact.get("chunks") if isinstance(chunk_artifact.get("chunks"), list) else [])),
                "input_split_task_id": int((((chunk_artifact.get("source") if isinstance(chunk_artifact.get("source"), dict) else {}).get("split_task_id")) or 0)),
            },
        }
    except Exception as err:
        # LLM transport/protocol failures must fail the task instead of degrading into empty snapshots.
        if str(err).startswith("LLM_") or str(err).startswith("ANALYSIS_INPUT_"):
            raise
        snapshot_v3 = {
            "snapshot_version": "v3.0",
            "chapter_id": chapter_id,
            "fact_status": "UNVETTED",
            "emotional_target": "Mixed",
            "open_loops": [],
            "narrative_metrics": {
                "swas": {"mental_imagery": 0.0, "engagement": 0.0},
                "narrative_tension": 0.0,
                "narrative_score": 0.0,
                "lore_debt": False,
            },
        }
        return {
            "degraded_mode": True,
            "degraded_reason": f"ANALYSIS_ERROR:{str(err)[:300]}",
            "mcp_refs": context.get("mcp_refs", []),
            "context_hash": context_hash,
            "candidate_facts_raw": [],
            "candidate_facts": [],
            "vetting_report": {
                "fact_status": "UNVETTED",
                "clean_count": 0,
                "conflict_count": 0,
                "conflicts": [],
            },
            "snapshot_v3": snapshot_v3,
            "integration_status": "UNVETTED",
        }

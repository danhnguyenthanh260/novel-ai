from __future__ import annotations

import re
from typing import Any, Dict, List
from worker_runtime_config import get_llm_timeout


def split_sentences(text: str) -> List[str]:
    chunks = re.split(r"(?<=[\.\!\?])\s+", text.strip())
    return [c.strip() for c in chunks if c.strip()]


def uniq_keep_order(items: List[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for it in items:
        key = it.lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(it.strip())
    return out


def extract_entities(scene_text: str) -> Dict[str, List[str]]:
    text = scene_text.strip()
    lower = text.lower()
    sentences = split_sentences(text)

    stop = {
        "the",
        "and",
        "but",
        "when",
        "then",
        "there",
        "this",
        "that",
        "with",
        "from",
        "into",
        "after",
        "before",
        "about",
        "because",
        "while",
    }

    character_candidates = re.findall(r"\b[A-Z][a-z]{2,}\b", text)
    characters = [c for c in character_candidates if c.lower() not in stop]

    relationship_patterns = [
        r"\b([A-Z][a-z]{2,})\s+(trusts|hates|loves|fears|betrayed|protects|serves)\s+([A-Z][a-z]{2,})\b",
        r"\b([A-Z][a-z]{2,})\s+and\s+([A-Z][a-z]{2,})\s+(are allies|are enemies|are siblings)\b",
    ]
    relationships: List[str] = []
    for pat in relationship_patterns:
        for m in re.finditer(pat, text):
            relationships.append(m.group(0))

    location_keywords = ["city", "bridge", "station", "district", "temple", "planet", "sector", "port", "gate"]
    locations = [s for s in sentences if any(k in s.lower() for k in location_keywords)]

    item_keywords = ["key", "artifact", "blade", "device", "module", "relic", "map", "engine", "core", "token"]
    items = [s for s in sentences if any(k in s.lower() for k in item_keywords)]

    lore_keywords = ["rule", "law", "oath", "forbidden", "must", "always", "never", "ritual", "canon"]
    lore = [s for s in sentences if any(k in s.lower() for k in lore_keywords)]

    event_keywords = ["opened", "closed", "arrived", "escaped", "collapsed", "killed", "saved", "attacked", "revealed"]
    events = [s for s in sentences if any(k in s.lower() for k in event_keywords)]
    if not events and sentences:
        events = sentences[:1]

    return {
        "character": uniq_keep_order(characters)[:10],
        "location": uniq_keep_order(locations)[:8],
        "item": uniq_keep_order(items)[:8],
        "lore": uniq_keep_order(lore)[:8],
        "relationship": uniq_keep_order(relationships)[:8],
        "event": uniq_keep_order(events)[:10],
    }


def extract_timeline_events(scene_text: str, workunit_id: str) -> List[Dict[str, str]]:
    sentences = split_sentences(scene_text)
    if not sentences:
        return []
    picks = sentences[: min(3, len(sentences))]
    out: List[Dict[str, str]] = []
    for i, line in enumerate(picks, start=1):
        out.append(
            {
                "title": f"Ingest {workunit_id} event {i}",
                "body": line[:1800],
            }
        )
    return out


def compute_confidence(scene_text: str, entities: Dict[str, List[str]], events: List[Dict[str, str]]) -> float:
    char_len = len(scene_text.strip())
    entity_count = sum(len(v) for v in entities.values())
    event_count = len(events)

    score = 0.35
    score += min(0.2, event_count * 0.07)
    score += min(0.2, entity_count * 0.015)
    if 180 <= char_len <= 6000:
        score += 0.15
    if "[todo: question]" in scene_text.lower():
        score -= 0.15
    if entity_count == 0:
        score -= 0.1

    return max(0.05, min(0.99, score))


def clip01(value: Any) -> float:
    try:
        n = float(value)
    except Exception:
        return 0.0
    return max(0.0, min(1.0, n))


def compute_style_metrics(scene_text: str) -> Dict[str, float]:
    text = scene_text.strip()
    if not text:
        return {
            "sentence_complexity": 0.0,
            "dialogue_ratio": 0.0,
            "metaphor_density": 0.0,
            "sensory_sight": 0.0,
            "sensory_sound": 0.0,
            "sensory_touch": 0.0,
            "sensory_smell": 0.0,
            "sensory_taste": 0.0,
        }

    sentences = split_sentences(text)
    words = re.findall(r"\b[\w'-]+\b", text)
    word_count = max(1, len(words))
    avg_sentence_words = word_count / max(1, len(sentences))
    long_sentence_ratio = (
        sum(1 for s in sentences if len(re.findall(r"\b[\w'-]+\b", s)) >= 22) / max(1, len(sentences))
    )
    sentence_complexity = clip01((avg_sentence_words / 28.0) * 0.7 + long_sentence_ratio * 0.3)

    dialogue_chars = sum(len(m.group(0)) for m in re.finditer(r"[\"“][^\"”]{1,200}[\"”]", text))
    dialogue_ratio = clip01(dialogue_chars / max(1, len(text)))

    metaphor_markers = ["like a", "as if", "as though", "metaphor", "symbol", "echoed"]
    metaphor_hits = sum(text.lower().count(marker) for marker in metaphor_markers)
    metaphor_density = clip01(metaphor_hits / max(1, len(sentences)))

    def _sense_density(keywords: List[str]) -> float:
        hits = sum(text.lower().count(k) for k in keywords)
        return clip01(hits / max(1, len(sentences)))

    return {
        "sentence_complexity": sentence_complexity,
        "dialogue_ratio": dialogue_ratio,
        "metaphor_density": metaphor_density,
        "sensory_sight": _sense_density(["light", "dark", "glow", "color", "shadow", "see"]),
        "sensory_sound": _sense_density(["sound", "echo", "whisper", "shout", "noise", "silence"]),
        "sensory_touch": _sense_density(["cold", "warm", "rough", "soft", "touch", "pain"]),
        "sensory_smell": _sense_density(["smell", "scent", "odor", "fragrance", "reek"]),
        "sensory_taste": _sense_density(["taste", "bitter", "sweet", "salty", "sour"]),
    }


def fallback_memory_pack(scene_text: str) -> Dict[str, Any]:
    entities = extract_entities(scene_text)
    events = extract_timeline_events(scene_text, "memory")
    confidence = compute_confidence(scene_text, entities, events)

    canon: List[Dict[str, Any]] = []
    for character in entities.get("character", [])[:6]:
        canon.append(
            {
                "subject": character,
                "predicate": "appears_in",
                "object": "scene",
                "confidence": confidence,
                "tags": ["character"],
                "source_trace": {"method": "heuristic"},
            }
        )
    for location_line in entities.get("location", [])[:4]:
        canon.append(
            {
                "subject": "scene",
                "predicate": "located_at",
                "object": location_line[:180],
                "confidence": confidence,
                "tags": ["location"],
                "source_trace": {"method": "heuristic"},
            }
        )
    for relation in entities.get("relationship", [])[:4]:
        canon.append(
            {
                "subject": "relationship",
                "predicate": "states",
                "object": relation[:180],
                "confidence": confidence,
                "tags": ["relationship"],
                "source_trace": {"method": "heuristic"},
            }
        )

    timeline: List[Dict[str, Any]] = []
    for ev in events[:3]:
        timeline.append(
            {
                "event_label": ev["title"][:180],
                "relative_time": None,
                "absolute_time": None,
                "location": None,
                "participants": entities.get("character", [])[:4],
                "source_trace": {"excerpt": ev["body"][:240], "method": "heuristic"},
            }
        )

    return {
        "facts": canon[:20],
        "timeline": timeline[:8],
        "style": compute_style_metrics(scene_text),
    }


def llm_memory_pack(scene_text: str, call_llm_json) -> Dict[str, Any]:
    prompt = (
        "Extract structured memory from this scene.\n"
        "Return strict JSON only with shape:\n"
        "{"
        "\"facts\":[{\"subject\":\"\",\"predicate\":\"\",\"object\":\"\",\"confidence\":0.0,\"tags\":[\"\"],\"source_trace\":{\"excerpt\":\"\"}}],"
        "\"timeline\":[{\"event_label\":\"\",\"relative_time\":\"\",\"absolute_time\":\"\",\"location\":\"\",\"participants\":[\"\"],\"source_trace\":{\"excerpt\":\"\"}}],"
        "\"style\":{\"sentence_complexity\":0.0,\"dialogue_ratio\":0.0,\"metaphor_density\":0.0,\"sensory_sight\":0.0,\"sensory_sound\":0.0,\"sensory_touch\":0.0,\"sensory_smell\":0.0,\"sensory_taste\":0.0}"
        "}\n"
        "Rules:\n"
        "- Extract only; do not invent external facts.\n"
        "- Keep facts atomic and concise.\n"
        "- Confidence must be 0..1.\n"
        "- Use empty string or [] when unknown.\n"
        f"SCENE_TEXT:\n{scene_text[:6500]}"
    )
    parsed = call_llm_json(
        messages=[
            {"role": "system", "content": "You are a strict JSON extractor for narrative memory packs."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1200,
        temperature=0.25,
        timeout_sec=get_llm_timeout("memory_pack"),
    )
    if isinstance(parsed.get("facts"), list) and isinstance(parsed.get("timeline"), list) and isinstance(parsed.get("style"), dict):
        return parsed
    return {}


def normalize_memory_pack(scene_text: str, pack: Dict[str, Any]) -> Dict[str, Any]:
    if not pack:
        pack = fallback_memory_pack(scene_text)

    facts_raw = pack.get("facts")
    timeline_raw = pack.get("timeline")
    style_raw = pack.get("style")

    facts_out: List[Dict[str, Any]] = []
    if isinstance(facts_raw, list):
        for item in facts_raw:
            if not isinstance(item, dict):
                continue
            subject = str(item.get("subject") or "").strip()
            predicate = str(item.get("predicate") or "").strip()
            obj = str(item.get("object") or "").strip()
            if not subject or not predicate or not obj:
                continue
            tags = item.get("tags")
            tags_out = [str(t).strip() for t in tags] if isinstance(tags, list) else []
            source_trace = item.get("source_trace")
            if not isinstance(source_trace, dict):
                source_trace = {}
            facts_out.append(
                {
                    "subject": subject[:240],
                    "predicate": predicate[:120],
                    "object": obj[:1200],
                    "confidence": clip01(item.get("confidence", 0.65)),
                    "tags": [t[:60] for t in tags_out if t][:8],
                    "source_trace": source_trace,
                }
            )
    facts_out = facts_out[:30]

    timeline_out: List[Dict[str, Any]] = []
    if isinstance(timeline_raw, list):
        for item in timeline_raw:
            if not isinstance(item, dict):
                continue
            label = str(item.get("event_label") or "").strip()
            if not label:
                continue
            participants = item.get("participants")
            participants_out = [str(p).strip() for p in participants] if isinstance(participants, list) else []
            source_trace = item.get("source_trace")
            if not isinstance(source_trace, dict):
                source_trace = {}
            timeline_out.append(
                {
                    "event_label": label[:300],
                    "relative_time": str(item.get("relative_time") or "").strip()[:120] or None,
                    "absolute_time": str(item.get("absolute_time") or "").strip()[:120] or None,
                    "location": str(item.get("location") or "").strip()[:300] or None,
                    "participants": [p[:120] for p in participants_out if p][:8],
                    "source_trace": source_trace,
                }
            )
    timeline_out = timeline_out[:20]

    style_fallback = compute_style_metrics(scene_text)
    style_out = dict(style_fallback)
    if isinstance(style_raw, dict):
        for k in style_out.keys():
            if k in style_raw:
                style_out[k] = clip01(style_raw.get(k))

    return {"facts": facts_out, "timeline": timeline_out, "style": style_out}


def process_memory_enrich_task(
    conn,
    task: Dict[str, Any],
    memory_enrich_algo_version: str,
    load_scene_version_text,
    llm_memory_pack,
    normalize_memory_pack,
    save_memory_pack,
    mark_memory_task_done,
) -> None:
    story_id = int(task["story_id"])
    scene_id = int(task["scene_id"])
    scene_version_id = int(task["scene_version_id"])
    algo_version = str(task.get("algo_version") or memory_enrich_algo_version)

    scene_text = load_scene_version_text(conn, story_id, scene_id, scene_version_id)
    if not scene_text or not scene_text.strip():
        raise ValueError("MEMORY_ENRICH_SCENE_TEXT_EMPTY")

    pack_raw = llm_memory_pack(scene_text)
    pack = normalize_memory_pack(scene_text, pack_raw)
    save_memory_pack(conn, story_id, scene_id, scene_version_id, algo_version, pack)
    mark_memory_task_done(conn, int(task["id"]))

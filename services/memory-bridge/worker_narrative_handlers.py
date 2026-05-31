import json
import re
import time
import math
import hashlib
from worker_common import call_llm_json, call_llm_text, call_llm_embedding, parse_jsonb
from worker_runtime_config import get_llm_timeout
from worker_ingest_repo import (
    mark_task_done,
    insert_agent_run_trace,
    insert_agent_prompt_hydration_trace,
    insert_agent_context_snapshot,
    insert_agent_memory_vector,
    insert_agent_feedback_loop,
    resolve_active_agent_prompt,
    resolve_agent_profile_runtime,
    load_agent_prompt_version_by_id,
    load_memory_text_by_id,
)

def ensure_prose_text(raw, fallback=""):
    if isinstance(raw, str):
        text = raw.strip()
        if text:
            return text
    if raw is None:
        fb = str(fallback or "").strip()
        return fb
    text = str(raw).strip()
    if text:
        return text
    return str(fallback or "").strip()

_META_LEAK_PATTERNS = [
    re.compile(r"^\s*certainly[!,.:\s]", re.IGNORECASE),
    re.compile(r"^\s*here is (a|the) (revised|rewritten|updated) version", re.IGNORECASE),
    re.compile(r"^\s*(version|option)\s*#?\d+", re.IGNORECASE),
    re.compile(r"^\s*(revised version|rewrite)\s*[:\-]", re.IGNORECASE),
    re.compile(r"^\s*this chapter is empty\.?\s*$", re.IGNORECASE),
]

_META_INLINE_MARKERS = [
    "here is a revised version",
    "here's a revised version",
    "option 1",
    "option 2",
    "version 1",
    "version 2",
]
_MEMORY_EMBED_DIM = 96
_MEMORY_TOP_K = 3
_MEMORY_SIMILARITY_THRESHOLD = 0.22
_MEMORY_MAX_CHARS = 1400
_MEMORY_MIN_SCORE = 1.0

def _estimate_tokens(text):
    s = str(text or "").strip()
    if not s:
        return 0
    # Stable coarse estimate for observability; not billing-accurate.
    return max(1, int(len(s) / 4))

def _tokenize_for_memory(text):
    return re.findall(r"[a-zA-Z0-9']+", str(text or "").lower())

def embed_text_hash(text, dim=_MEMORY_EMBED_DIM):
    vec = [0.0] * int(max(8, dim))
    toks = _tokenize_for_memory(text)
    if not toks:
        return vec
    for tok in toks:
        h = hashlib.sha256(tok.encode("utf-8")).digest()
        idx = int.from_bytes(h[:2], "big") % len(vec)
        sign = 1.0 if (h[2] % 2 == 0) else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]

def embed_text_semantic(text):
    # Provider-first embedding. If endpoint/model is unavailable, fallback to hash embedding.
    v = call_llm_embedding(str(text or ""), timeout_sec=get_llm_timeout("embedding"))
    if isinstance(v, list) and len(v) >= 16:
        norm = math.sqrt(sum(float(x) * float(x) for x in v)) or 1.0
        return [float(x) / norm for x in v]
    return embed_text_hash(text, dim=_MEMORY_EMBED_DIM)

def cosine_similarity(a, b):
    if not isinstance(a, list) or not isinstance(b, list):
        return -1.0
    if not a or not b or len(a) != len(b):
        return -1.0
    dot = sum(float(a[i]) * float(b[i]) for i in range(len(a)))
    na = math.sqrt(sum(float(x) * float(x) for x in a))
    nb = math.sqrt(sum(float(x) * float(x) for x in b))
    if na <= 0 or nb <= 0:
        return -1.0
    return dot / (na * nb)

def _extract_embedding(raw):
    if not isinstance(raw, list):
        return []
    out = []
    for x in raw:
        try:
            out.append(float(x))
        except Exception:
            return []
    return out

def _recency_decay(created_at):
    try:
        age_sec = max(0.0, (time.time() - float(created_at.timestamp())))
        age_days = age_sec / 86400.0
        return max(0.0, math.exp(-age_days / 14.0))
    except Exception:
        return 0.5

def retrieve_semantic_memories(conn, *, story_id, chapter_id, agent_name, query_text, top_k=_MEMORY_TOP_K):
    q_primary = embed_text_semantic(query_text)
    query_by_dim = {len(q_primary): q_primary}
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT id, chapter_id, memory_type, memory_text, embedding_json, score, tags, created_at
            FROM public.agent_memory_vector
            WHERE story_id = %s
              AND agent_name = %s
              AND (chapter_id = %s OR chapter_id IS NULL)
            ORDER BY CASE WHEN chapter_id = %s THEN 0 ELSE 1 END ASC, created_at DESC, id DESC
            LIMIT 400
            """,
            (int(story_id), str(agent_name), chapter_id, chapter_id),
        )
        rows = cur.fetchall() or []
    finally:
        cur.close()

    scored = []
    for r in rows:
        emb = _extract_embedding(r[4])
        if not emb:
            continue
        q = query_by_dim.get(len(emb))
        if q is None:
            # Backward compatibility for old memory rows with different dimensions.
            q = embed_text_hash(query_text, dim=len(emb))
            query_by_dim[len(emb)] = q
        sim = cosine_similarity(q, emb)
        if sim < _MEMORY_SIMILARITY_THRESHOLD:
            continue
        try:
            score = float(r[5] or 0.0)
        except Exception:
            score = 0.0
        if score < _MEMORY_MIN_SCORE:
            continue
        recency = _recency_decay(r[7])
        rank = (0.75 * sim) + (0.20 * max(-1.0, min(1.0, score / 10.0))) + (0.05 * recency)
        scored.append({
            "id": int(r[0]),
            "chapter_id": r[1],
            "memory_type": str(r[2]),
            "memory_text": str(r[3] or "").strip(),
            "embedding": emb,
            "score": score,
            "similarity": sim,
            "rank": rank,
        })

    scored.sort(key=lambda x: (x["rank"], x["similarity"], x["score"]), reverse=True)

    chosen = []
    used_chars = 0
    for cand in scored:
        if not cand["memory_text"]:
            continue
        # Diversity filter: skip near-duplicate semantic memories.
        too_close = False
        for picked in chosen:
            if cosine_similarity(cand["embedding"], picked["embedding"]) >= 0.96:
                too_close = True
                break
        if too_close:
            continue

        text_len = len(cand["memory_text"])
        if used_chars + text_len > _MEMORY_MAX_CHARS:
            continue
        chosen.append(cand)
        used_chars += text_len
        if len(chosen) >= max(1, int(top_k)):
            break

    return {
        "query_embedding": q_primary,
        "items": chosen,
    }

def build_memory_prompt_block(memories):
    items = memories or []
    if not items:
        return ""
    lines = ["### SEMANTIC MEMORY (Use only if contextually relevant)"]
    for i, m in enumerate(items, start=1):
        lines.append(f"- Memory #{i} [{m.get('memory_type')} | sim={m.get('similarity', 0):.2f}]: {m.get('memory_text')}")
    return "\n".join(lines).strip()

def sanitize_narrative_prose(raw_text):
    """
    Strict output guard:
    - Removes chat-like preamble lines.
    - Removes markdown fences if model wraps prose.
    - Flags suspicious meta leakage so caller can fail-fast.
    """
    text = ensure_prose_text(raw_text)
    if not text:
        return {"text": "", "meta_leak": False, "removed_lines": 0, "inline_hits": 0}

    # Drop code fences and keep inner text.
    fenced = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text.strip())
    fenced = re.sub(r"\s*```$", "", fenced).strip()
    if fenced:
        text = fenced

    lines = text.splitlines()
    kept = []
    removed = 0
    for i, line in enumerate(lines):
        # Only strip likely meta lines near the beginning to avoid damaging prose body.
        if i < 12 and any(p.search(line or "") for p in _META_LEAK_PATTERNS):
            removed += 1
            continue
        kept.append(line)
    cleaned = "\n".join(kept).strip()

    lowered_head = cleaned[:1200].lower()
    inline_hits = sum(1 for marker in _META_INLINE_MARKERS if marker in lowered_head)
    meta_leak = inline_hits > 0 or removed > 0

    return {
        "text": cleaned,
        "meta_leak": meta_leak,
        "removed_lines": removed,
        "inline_hits": inline_hits,
    }

def render_prompt_template(template_text, variables):
    text = str(template_text or "")
    if not text:
        return ""
    for key, value in (variables or {}).items():
        text = text.replace(f"{{{{{key}}}}}", str(value))
    return text


def _slot_by_type(runtime_slots, slot_type):
    for s in runtime_slots or []:
        if str(s.get("slot_type") or "").upper() == slot_type:
            return s
    return None


def assemble_prompt_layers(
    conn,
    *,
    story_id,
    chapter_id,
    agent_name,
    task_id,
    default_prompt,
    template_vars,
    style_block="",
):
    resolved_prompt = resolve_active_agent_prompt(
        conn,
        story_id=int(story_id),
        chapter_id=str(chapter_id) if chapter_id else None,
        agent_name=str(agent_name),
        task_id=int(task_id or 0),
    )
    runtime = resolve_agent_profile_runtime(conn, story_id=int(story_id), agent_name=str(agent_name))
    profile = runtime.get("profile") or None
    slots = runtime.get("slots") or []

    dna_text = (resolved_prompt or {}).get("system_prompt") or str(default_prompt or "")
    prompt_version_id = (resolved_prompt or {}).get("version_id")
    weapon_text = ""
    style_text_parts = []
    if style_block:
        style_text_parts.append(str(style_block).strip())

    dna_slot = _slot_by_type(slots, "DNA")
    if dna_slot and str(dna_slot.get("artifact_ref_type") or "").upper() == "PROMPT_VERSION":
        try:
            dna_ver = int(str(dna_slot.get("artifact_id") or "0"))
            dna_prompt = load_agent_prompt_version_by_id(conn, dna_ver)
            if dna_prompt and str(dna_prompt.get("system_prompt") or "").strip():
                dna_text = str(dna_prompt.get("system_prompt"))
                prompt_version_id = int(dna_prompt.get("version_id") or dna_ver)
        except Exception:
            pass

    weapon_slot = _slot_by_type(slots, "WEAPON_PROMPT")
    if weapon_slot and str(weapon_slot.get("artifact_ref_type") or "").upper() == "PROMPT_VERSION":
        try:
            weapon_ver = int(str(weapon_slot.get("artifact_id") or "0"))
            weapon_prompt = load_agent_prompt_version_by_id(conn, weapon_ver)
            if weapon_prompt and str(weapon_prompt.get("system_prompt") or "").strip():
                weapon_text = str(weapon_prompt.get("system_prompt")).strip()
        except Exception:
            pass

    memory_slot = _slot_by_type(slots, "MEMORY_SHARD")
    if memory_slot:
        ref_type = str(memory_slot.get("artifact_ref_type") or "").upper()
        if ref_type == "MEMORY_TEXT":
            shard_text = str(memory_slot.get("artifact_id") or "").strip()
            if shard_text:
                style_text_parts.append(f"[MEMORY_SHARD]\n{shard_text}")
        elif ref_type == "MEMORY_VECTOR":
            try:
                mem_id = int(str(memory_slot.get("artifact_id") or "0"))
                mem_text = load_memory_text_by_id(conn, mem_id)
                if mem_text:
                    style_text_parts.append(f"[MEMORY_SHARD]\n{mem_text}")
            except Exception:
                pass

    dna_rendered = render_prompt_template(dna_text, template_vars)
    weapon_rendered = render_prompt_template(weapon_text, template_vars) if weapon_text else ""
    style_rendered = "\n\n".join([x for x in style_text_parts if x]).strip()

    sections = [dna_rendered.strip()]
    if weapon_rendered:
        sections.append(f"### WEAPON_LAYER\n{weapon_rendered}")
    if style_rendered:
        sections.append(f"### STYLE_LAYER\n{style_rendered}")
    final_prompt = "\n\n".join([x for x in sections if x]).strip()

    equipment_snapshot = {
        "profile_id": (profile or {}).get("id"),
        "species_name": (profile or {}).get("species_name"),
        "slots": slots,
        "resolved_prompt_version_id": prompt_version_id,
        "layers": {
            "has_weapon_layer": bool(weapon_rendered),
            "has_style_layer": bool(style_rendered),
            "style_items": len(style_text_parts),
        },
    }
    return {
        "prompt": final_prompt,
        "prompt_version_id": prompt_version_id,
        "assignment": (resolved_prompt or {}).get("assignment"),
        "experiment_id": (resolved_prompt or {}).get("experiment_id"),
        "agent_profile_id": (profile or {}).get("id"),
        "equipment_snapshot": equipment_snapshot,
    }

def normalize_critic_result(raw):
    """
    Normalize critic output into:
    {
      "summary": string(non-empty),
      "patches": string[]
    }
    """
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            raise ValueError("NARRATIVE_CRITIC_SCHEMA_INVALID")
        return {
            "summary": text[:3000],
            "patches": [],
        }
    if not isinstance(raw, dict):
        raise ValueError("NARRATIVE_CRITIC_SCHEMA_INVALID")

    summary = raw.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        for key in ("feedback", "critique", "notes", "analysis", "verdict"):
            candidate = raw.get(key)
            if isinstance(candidate, str) and candidate.strip():
                summary = candidate.strip()
                break
    patches = raw.get("patches")
    if patches is None:
        for key in ("suggestions", "issues", "fixes", "patch", "edits"):
            candidate = raw.get(key)
            if candidate is not None:
                patches = candidate
                break
    if isinstance(patches, str):
        patches = [patches]
    elif isinstance(patches, dict):
        flattened = []
        for key, value in patches.items():
            if isinstance(value, str) and value.strip():
                flattened.append(f"{key}: {value.strip()}")
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and item.strip():
                        flattened.append(f"{key}: {item.strip()}")
        patches = flattened
    if summary is None and isinstance(patches, list) and patches:
        first = next((str(p).strip() for p in patches if isinstance(p, str) and str(p).strip()), "")
        summary = first or "Narrative critic requested targeted revisions."
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("NARRATIVE_CRITIC_SCHEMA_INVALID")
    if patches is None:
        patches = []
    if not isinstance(patches, list):
        raise ValueError("NARRATIVE_CRITIC_SCHEMA_INVALID")
    normalized_patches = []
    for p in patches:
        if isinstance(p, dict):
            s = json.dumps(p, ensure_ascii=False).strip()
        elif isinstance(p, str):
            s = p.strip()
        else:
            s = str(p).strip()
        if s:
            normalized_patches.append(s)
    return {
        "summary": summary.strip(),
        "patches": normalized_patches,
    }

def build_narrative_idempotency_key(job_id, task_type, payload):
    chapter_id = str(
        payload.get("chapter_id")
        or ((payload.get("job_config") or {}).get("chapter_id"))
        or "unknown"
    )
    beat_idx = int(payload.get("beat_idx", -1))
    refine_count = int(payload.get("refine_count", 0))
    accumulated_count = len(payload.get("accumulated_prose") or [])
    return f"narrative:{job_id}:{chapter_id}:{task_type}:b{beat_idx}:r{refine_count}:a{accumulated_count}"

def enqueue_narrative_task(conn, job_id, story_id, task_type, payload, available_at_sql="NOW()"):
    """
    Replicates the TypeScript enqueueNarrativeTask logic.
    """
    cur = conn.cursor()
    try:
        idempotency_key = build_narrative_idempotency_key(job_id, task_type, payload)
        # Note: We don't rebuild context in Python yet to keep it simple, 
        # but we propagate existing context and config from the previous payload.
        cur.execute(
            f"""INSERT INTO public.ingest_task
             (job_id, story_id, task_type, unit_type, status, payload_json, available_at, seq_no, idempotency_key)
             SELECT %s, %s, %s, 'chapter', 'READY', %s, {available_at_sql},
             (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = %s), %s
             WHERE NOT EXISTS (
               SELECT 1 FROM public.ingest_task t
               WHERE t.story_id = %s
                 AND t.task_type = %s
                 AND t.idempotency_key = %s
             )""",
            (
                job_id,
                story_id,
                task_type,
                json.dumps(payload),
                job_id,
                idempotency_key,
                story_id,
                task_type,
                idempotency_key,
            )
        )
    finally:
        cur.close()

def finalize_or_next_beat(conn, task, payload, beat_prose):
    job_id = int(task["job_id"])
    story_id = int(task["story_id"])
    job_config = payload.get("job_config") or {}
    plan = job_config.get("plan") or {}
    
    next_idx = int(payload.get("beat_idx", 0)) + 1
    accumulated = payload.get("accumulated_prose") or []
    updated_accumulated = accumulated + [beat_prose]
    
    cool_off = int(job_config.get("cool_off_seconds") or 60)
    next_available_sql = f"NOW() + interval '{cool_off} seconds'"

    if next_idx < len(plan.get("beats", [])):
        # Next Beat
        new_payload = {
            **payload,
            "beat_idx": next_idx,
            "accumulated_prose": updated_accumulated,
            "refine_count": 0,
            "draft_prose": None,
            "critic_result": None
        }
        enqueue_narrative_task(conn, job_id, story_id, 'NARRATIVE_STYLIST', new_payload, next_available_sql)
    else:
        # Finalize
        new_payload = {
            **payload,
            "accumulated_prose": updated_accumulated
        }
        enqueue_narrative_task(conn, job_id, story_id, 'NARRATIVE_FINALIZE', new_payload, next_available_sql)

def process_narrative_start_task(conn, task):
    payload = parse_jsonb(task.get("payload_json"))
    job_id = int(task["job_id"])
    story_id = int(task["story_id"])
    
    # Advance to Stylist for Beat 0
    new_payload = {
        **payload,
        "beat_idx": 0,
        "accumulated_prose": []
    }
    enqueue_narrative_task(conn, job_id, story_id, 'NARRATIVE_STYLIST', new_payload, "NOW()")
    context_snapshot_id = insert_agent_context_snapshot(
        conn,
        story_id=story_id,
        chapter_id=str(payload.get("chapter_id") or (payload.get("job_config") or {}).get("chapter_id") or "") or None,
        snapshot_payload={"payload": payload, "next_payload": new_payload},
    )
    insert_agent_run_trace(
        conn,
        task=task,
        agent_name="NARRATIVE_START",
        status="DONE",
        input_payload=payload,
        output_payload={"next_task": "NARRATIVE_STYLIST", "beat_idx": 0},
        context_snapshot_id=context_snapshot_id,
    )
    
    mark_task_done(conn, int(task["id"]), int(task["job_id"]), int(task.get("attempts") or 0))

def process_narrative_stylist_task(conn, task):
    payload = parse_jsonb(task.get("payload_json"))
    job_id = int(task["job_id"])
    story_id = int(task["story_id"])
    job_config = payload.get("job_config") or {}
    plan = job_config.get("plan") or {}
    beat_idx = int(payload.get("beat_idx", 0))
    
    context_block = payload.get("context_block") or "Story context unavailable."
    truth_context_pack = plan.get("truth_context_pack_v1") if isinstance(plan.get("truth_context_pack_v1"), dict) else {}
    beats = plan.get("beats", [])
    if beat_idx >= len(beats):
        raise ValueError(f"BEAT_INDEX_OUT_OF_BOUNDS:{beat_idx}")
    
    beat = beats[beat_idx]
    target_words = int(beat.get("estimated_words") or 350)
    min_words = max(120, int(target_words * 0.75))
    max_words = max(min_words + 80, int(target_words * 1.35))
    
    default_prompt = f"""
Output language: English.
You are the STYLIST AGENT, a master of high-fidelity, soulful prose. 
Your task is to write a single scene beat based on the following context and constraints.

### 1. CORE CONSTRAINTS
- **DEEP NARRATIVE MODELING**: 
    - **Value Shift**: Every action must move the emotional needle.
    - **Causal Linkage**: Strictly use "BUT/THEREFORE" logic. Avoid "And then..."
    - **Subtext**: Show emotions through physical indicators only.
- **WRITER IDENTITY**:
    - **Sensory Signature**: Inject a unique atmospheric smell, sound, or texture.
    - **Micro-Tension**: Ensure conflict every few sentences.
    - **Pacing**: sentence length matches conflict level.

### 2. TRUTH CONTEXT PACK V1
{json.dumps(truth_context_pack)}

### 3. STORY CONTEXT (fallback only)
{context_block}

### 4. BEAT SPECIFICATION
[BEAT {beat.get('idx')}: {beat.get('label')}]
Description: {beat.get('description')}
Characters: {", ".join(beat.get('characters', [])) or "Someone"}
Location: {beat.get('location')}
Target words for this beat: {target_words} (acceptable range: {min_words}-{max_words})

### 5. OUTPUT INSTRUCTIONS
- Use TRUTH CONTEXT PACK V1 as the primary canon source.
- If truth_context_pack_v1.priority_a.low_confidence_entities includes an entity, do not use that entity for reveal-critical or anchor-critical changes unless the beat explicitly requires it.
- Output ONLY the prose text. No preamble, no commentary, no headings.
- You MUST write at least {min_words} words. Falling short is a hard failure.
- Keep output length within {min_words}-{max_words} words.
""".strip()

    chapter_id = payload.get("chapter_id") or job_config.get("chapter_id")
    template_vars = {
        "context_block": context_block,
        "beat_idx": beat.get("idx"),
        "beat_label": beat.get("label"),
        "beat_description": beat.get("description"),
        "beat_characters": ", ".join(beat.get("characters", [])) or "Someone",
        "beat_location": beat.get("location"),
        "target_words": target_words,
        "min_words": min_words,
        "max_words": max_words,
        "truth_context_pack_v1": json.dumps(truth_context_pack),
    }
    memory_query_text = "\n".join(
        [
            str(beat.get("label") or ""),
            str(beat.get("description") or ""),
            str(beat.get("location") or ""),
            str(", ".join(beat.get("characters", []) or [])),
            str(context_block or ""),
        ]
    ).strip()
    semantic = retrieve_semantic_memories(
        conn,
        story_id=story_id,
        chapter_id=str(chapter_id) if chapter_id else None,
        agent_name="NARRATIVE_STYLIST",
        query_text=memory_query_text,
        top_k=_MEMORY_TOP_K,
    )
    memory_items = semantic.get("items") or []
    memory_block = build_memory_prompt_block(memory_items)
    template_vars["memory_block"] = memory_block
    assembled = assemble_prompt_layers(
        conn,
        story_id=story_id,
        chapter_id=str(chapter_id) if chapter_id else None,
        agent_name="NARRATIVE_STYLIST",
        task_id=int(task.get("id") or 0),
        default_prompt=default_prompt,
        template_vars=template_vars,
        style_block=(memory_block if memory_block else ""),
    )
    prompt = assembled["prompt"]
    context_snapshot_id = insert_agent_context_snapshot(
        conn,
        story_id=story_id,
        chapter_id=str(chapter_id) if chapter_id else None,
        snapshot_payload={
            "context_block": context_block,
            "beat": beat,
            "template_vars": template_vars,
            "memory_ids": [m.get("id") for m in memory_items],
            "prompt_version_id": assembled.get("prompt_version_id"),
            "agent_profile_id": assembled.get("agent_profile_id"),
            "equipment_snapshot": assembled.get("equipment_snapshot") or {},
        },
    )

    messages = [{"role": "user", "content": prompt}]
    started = time.time()
    llm_text = call_llm_text(
        messages,
        max_tokens=3000,
        temperature=0.8,
        timeout_sec=get_llm_timeout("narrative_stylist"),
    )
    latency_ms = int((time.time() - started) * 1000)
    guard = sanitize_narrative_prose(llm_text)
    prose = ensure_prose_text(guard.get("text"))
    if not prose:
        insert_agent_feedback_loop(
            conn,
            story_id=story_id,
            chapter_id=str(chapter_id) if chapter_id else None,
            agent_name="NARRATIVE_STYLIST",
            run_trace_id=None,
            feedback_source="SYSTEM",
            feedback_type="RULE",
            feedback_text="Stylist returned empty prose. Enforce non-empty raw prose output contract.",
            weight=2.0,
        )
        raise ValueError("NARRATIVE_STYLIST_EMPTY_PROSE")
    if guard.get("inline_hits", 0) >= 2:
        insert_agent_feedback_loop(
            conn,
            story_id=story_id,
            chapter_id=str(chapter_id) if chapter_id else None,
            agent_name="NARRATIVE_STYLIST",
            run_trace_id=None,
            feedback_source="SYSTEM",
            feedback_type="AVOID",
            feedback_text="Stylist emitted meta chat preamble/option text. Keep output as raw prose only.",
            weight=2.5,
        )
        raise ValueError("NARRATIVE_STYLIST_META_LEAK")
    
    # Save result
    cur = conn.cursor()
    try:
        cur.execute(
            """UPDATE public.ingest_task 
               SET status = 'DONE',
                   result_json = jsonb_build_object(
                     'prose', %s::text,
                     'guard', jsonb_build_object(
                       'meta_leak', %s::boolean,
                       'removed_lines', %s::int,
                       'inline_hits', %s::int
                     )
                   ),
                   updated_at = now()
               WHERE id = %s""",
            (
                prose,
                bool(guard.get("meta_leak")),
                int(guard.get("removed_lines", 0)),
                int(guard.get("inline_hits", 0)),
                int(task["id"]),
            )
        )
    finally:
        cur.close()

    stylist_trace_id = insert_agent_run_trace(
        conn,
        task=task,
        agent_name="NARRATIVE_STYLIST",
        status="DONE",
        input_payload={"prompt": prompt, "beat_idx": beat_idx, "target_words": target_words},
        output_payload={"prose": prose},
        model_name="llm_text",
        prompt_version_id=assembled.get("prompt_version_id"),
        agent_profile_id=assembled.get("agent_profile_id"),
        equipment_snapshot_json=assembled.get("equipment_snapshot") or {},
        context_snapshot_id=context_snapshot_id,
        latency_ms=latency_ms,
        quality_json={
            "meta_leak": bool(guard.get("meta_leak")),
            "removed_lines": int(guard.get("removed_lines", 0)),
            "inline_hits": int(guard.get("inline_hits", 0)),
            "word_count": len(prose.split()),
            "memory_hits": len(memory_items),
            "memory_ids": [m.get("id") for m in memory_items],
            "prompt_assignment": assembled.get("assignment"),
            "experiment_id": assembled.get("experiment_id"),
        },
    )
    insert_agent_prompt_hydration_trace(
        conn,
        run_trace_id=stylist_trace_id,
        task=task,
        agent_name="NARRATIVE_STYLIST",
        prompt_version_id=assembled.get("prompt_version_id"),
        context_snapshot_id=context_snapshot_id,
        hydration_inputs_json={
            "context_snapshot_id": context_snapshot_id,
            "memory_ids": [m.get("id") for m in memory_items],
            "prompt_assignment": assembled.get("assignment"),
            "experiment_id": assembled.get("experiment_id"),
        },
        hydration_render_steps_json={
            "layer_flags": (assembled.get("equipment_snapshot") or {}).get("layers") or {},
            "template_keys": sorted(list(template_vars.keys())),
        },
        hydration_output_text=prompt,
        llm_request_meta_json={
            "provider_call": "call_llm_text",
            "task_family": "narrative_stylist",
            "temperature": 0.8,
            "max_tokens": 2000,
            "timeout_sec": get_llm_timeout("narrative_stylist"),
        },
        tokens_prompt_base=_estimate_tokens(prompt),
        tokens_memory_injected=_estimate_tokens(memory_block),
        tokens_rules_injected=0,
        tokens_feedback_injected=0,
        tokens_truncated=0,
    )
    if bool(guard.get("meta_leak")):
        insert_agent_feedback_loop(
            conn,
            story_id=story_id,
            chapter_id=str(chapter_id) if chapter_id else None,
            agent_name="NARRATIVE_STYLIST",
            run_trace_id=stylist_trace_id,
            feedback_source="SYSTEM",
            feedback_type="AVOID",
            feedback_text="Stylist output included removable meta leakage. Reinforce no preamble/postamble.",
            weight=1.8,
        )

    # Advance to Critic
    cool_off = int(job_config.get("cool_off_seconds") or 60)
    new_payload = {
        **payload,
        "draft_prose": prose
    }
    enqueue_narrative_task(conn, job_id, story_id, 'NARRATIVE_CRITIC', new_payload, f"NOW() + interval '{cool_off} seconds'")

def process_narrative_critic_task(conn, task):
    payload = parse_jsonb(task.get("payload_json"))
    job_id = int(task["job_id"])
    story_id = int(task["story_id"])
    job_config = payload.get("job_config") or {}
    plan = job_config.get("plan") or {}
    beat_idx = int(payload.get("beat_idx", 0))
    draft_prose = payload.get("draft_prose", "")
    
    beat = plan.get("beats", [])[beat_idx]

    default_prompt = f"""
You are the EDITORIAL CRITIC AGENT. Review the DRAFT PROSE below.
Output JSON: {{ "summary": "...", "patches": ["..."] }}

### BEAT SPEC
{beat.get('description')}

### DRAFT PROSE
{draft_prose}
""".strip()

    chapter_id = payload.get("chapter_id") or job_config.get("chapter_id")
    assembled = assemble_prompt_layers(
        conn,
        story_id=story_id,
        chapter_id=str(chapter_id) if chapter_id else None,
        agent_name="NARRATIVE_CRITIC",
        task_id=int(task.get("id") or 0),
        default_prompt=default_prompt,
        template_vars={
            "beat_description": beat.get("description"),
            "draft_prose": draft_prose,
            "beat_idx": beat.get("idx"),
        },
        style_block="",
    )
    prompt = assembled["prompt"]
    context_snapshot_id = insert_agent_context_snapshot(
        conn,
        story_id=story_id,
        chapter_id=str(chapter_id) if chapter_id else None,
        snapshot_payload={
            "beat": beat,
            "draft_prose": draft_prose,
            "prompt_version_id": assembled.get("prompt_version_id"),
            "agent_profile_id": assembled.get("agent_profile_id"),
            "equipment_snapshot": assembled.get("equipment_snapshot") or {},
        },
    )

    messages = [{"role": "user", "content": prompt}]
    started = time.time()
    llm_res = call_llm_json(
        messages,
        max_tokens=4000,
        temperature=0.4,
        timeout_sec=get_llm_timeout("narrative_critic"),
    )
    latency_ms = int((time.time() - started) * 1000)
    llm_res = normalize_critic_result(llm_res)

    cur = conn.cursor()
    try:
        cur.execute(
            """UPDATE public.ingest_task SET status = 'DONE', result_json = %s::jsonb, updated_at = now() WHERE id = %s""",
            (json.dumps(llm_res), int(task["id"]))
        )
    finally:
        cur.close()

    critic_trace_id = insert_agent_run_trace(
        conn,
        task=task,
        agent_name="NARRATIVE_CRITIC",
        status="DONE",
        input_payload={"prompt": prompt, "beat_idx": beat_idx},
        output_payload=llm_res,
        model_name="llm_json",
        prompt_version_id=assembled.get("prompt_version_id"),
        agent_profile_id=assembled.get("agent_profile_id"),
        equipment_snapshot_json=assembled.get("equipment_snapshot") or {},
        context_snapshot_id=context_snapshot_id,
        latency_ms=latency_ms,
        quality_json={
            "patch_count": len(llm_res.get("patches") or []),
            "prompt_assignment": assembled.get("assignment"),
            "experiment_id": assembled.get("experiment_id"),
        },
    )
    insert_agent_prompt_hydration_trace(
        conn,
        run_trace_id=critic_trace_id,
        task=task,
        agent_name="NARRATIVE_CRITIC",
        prompt_version_id=assembled.get("prompt_version_id"),
        context_snapshot_id=context_snapshot_id,
        hydration_inputs_json={
            "context_snapshot_id": context_snapshot_id,
            "prompt_assignment": assembled.get("assignment"),
            "experiment_id": assembled.get("experiment_id"),
        },
        hydration_render_steps_json={
            "layer_flags": (assembled.get("equipment_snapshot") or {}).get("layers") or {},
            "template_keys": ["beat_description", "draft_prose", "beat_idx"],
        },
        hydration_output_text=prompt,
        llm_request_meta_json={
            "provider_call": "call_llm_json",
            "task_family": "narrative_critic",
            "temperature": 0.4,
            "max_tokens": 1000,
            "timeout_sec": get_llm_timeout("narrative_critic"),
        },
        tokens_prompt_base=_estimate_tokens(prompt),
        tokens_rules_injected=0,
        tokens_memory_injected=0,
        tokens_feedback_injected=0,
        tokens_truncated=0,
    )

    patch_count = len(llm_res.get("patches") or [])
    draft_wc = len(str(draft_prose or "").split())
    if patch_count == 0 and draft_wc >= 120:
        memory_text = str(draft_prose or "").strip()
        emb_text = "\n".join([str(beat.get("description") or ""), memory_text])
        insert_agent_memory_vector(
            conn,
            story_id=story_id,
            chapter_id=str(chapter_id) if chapter_id else None,
            agent_name="NARRATIVE_STYLIST",
            source_run_trace_id=critic_trace_id,
            memory_type="POSITIVE_EXAMPLE",
            memory_text=memory_text[:4000],
            embedding=embed_text_semantic(emb_text),
            score=8.5,
            tags={
                "beat_idx": beat_idx,
                "beat_label": beat.get("label"),
                "source": "critic_pass_no_patch",
                "chapter_id": chapter_id,
            },
        )
        insert_agent_feedback_loop(
            conn,
            story_id=story_id,
            chapter_id=str(chapter_id) if chapter_id else None,
            agent_name="NARRATIVE_STYLIST",
            run_trace_id=critic_trace_id,
            feedback_source="CRITIC",
            feedback_type="KEEP",
            feedback_text=f"Beat {beat_idx} passed critic with 0 patches. Preserve style/fidelity pattern.",
            weight=1.5,
        )
    elif patch_count > 0:
        patches = llm_res.get("patches") or []
        top_patches = [str(p).strip() for p in patches[:3] if str(p).strip()]
        if top_patches:
            insert_agent_feedback_loop(
                conn,
                story_id=story_id,
                chapter_id=str(chapter_id) if chapter_id else None,
                agent_name="NARRATIVE_STYLIST",
                run_trace_id=critic_trace_id,
                feedback_source="CRITIC",
                feedback_type="FIX",
                feedback_text=" | ".join(top_patches)[:1200],
                weight=min(3.0, 1.0 + (patch_count * 0.3)),
            )

    # Advance logic
    cool_off = int(job_config.get("cool_off_seconds") or 60)
    next_avail = f"NOW() + interval '{cool_off} seconds'"
    
    if llm_res.get("patches") and len(llm_res.get("patches")) > 0 and int(payload.get("refine_count", 0)) < 1:
        new_payload = {
            **payload,
            "critic_result": llm_res,
            "refine_count": int(payload.get("refine_count", 0)) + 1
        }
        enqueue_narrative_task(conn, job_id, story_id, 'NARRATIVE_REFINE', new_payload, next_avail)
    else:
        finalize_or_next_beat(conn, task, payload, draft_prose)

def process_narrative_refine_task(conn, task):
    payload = parse_jsonb(task.get("payload_json"))
    job_id = int(task["job_id"])
    story_id = int(task["story_id"])
    draft_prose = payload.get("draft_prose", "")
    critic_result = payload.get("critic_result") or {}
    
    chapter_id = payload.get("chapter_id") or (payload.get("job_config") or {}).get("chapter_id")
    default_prompt = f"Revise this prose based on feedback: {critic_result.get('summary')}\n\nDRAFT:\n{draft_prose}\n\nRULES:\n- Keep or expand the word count. Do NOT shorten.\n- Output only prose, no commentary."
    assembled = assemble_prompt_layers(
        conn,
        story_id=story_id,
        chapter_id=str(chapter_id) if chapter_id else None,
        agent_name="NARRATIVE_REFINE",
        task_id=int(task.get("id") or 0),
        default_prompt=default_prompt,
        template_vars={
            "critic_summary": critic_result.get("summary"),
            "draft_prose": draft_prose,
        },
        style_block="",
    )
    prompt = assembled["prompt"]
    context_snapshot_id = insert_agent_context_snapshot(
        conn,
        story_id=story_id,
        chapter_id=str(chapter_id) if chapter_id else None,
        snapshot_payload={
            "critic_result": critic_result,
            "draft_prose": draft_prose,
            "prompt_version_id": assembled.get("prompt_version_id"),
            "agent_profile_id": assembled.get("agent_profile_id"),
            "equipment_snapshot": assembled.get("equipment_snapshot") or {},
        },
    )
    messages = [{"role": "user", "content": prompt}]
    started = time.time()
    llm_text = call_llm_text(
        messages,
        max_tokens=2500,
        temperature=0.6,
        timeout_sec=get_llm_timeout("narrative_refine"),
    )
    latency_ms = int((time.time() - started) * 1000)
    guard = sanitize_narrative_prose(llm_text)
    prose = ensure_prose_text(
        guard.get("text"),
        fallback=draft_prose,
    )
    if guard.get("inline_hits", 0) >= 2:
        insert_agent_feedback_loop(
            conn,
            story_id=story_id,
            chapter_id=str(chapter_id) if chapter_id else None,
            agent_name="NARRATIVE_REFINE",
            run_trace_id=None,
            feedback_source="SYSTEM",
            feedback_type="RULE",
            feedback_text="Refine step produced meta output. Keep refine output as pure prose text.",
            weight=2.2,
        )
        raise ValueError("NARRATIVE_REFINE_META_LEAK")
    
    cur = conn.cursor()
    try:
        cur.execute(
            """UPDATE public.ingest_task
               SET status = 'DONE',
                   result_json = jsonb_build_object(
                     'prose', %s::text,
                     'guard', jsonb_build_object(
                       'meta_leak', %s::boolean,
                       'removed_lines', %s::int,
                       'inline_hits', %s::int
                     )
                   ),
                   updated_at = now()
               WHERE id = %s""",
            (
                prose,
                bool(guard.get("meta_leak")),
                int(guard.get("removed_lines", 0)),
                int(guard.get("inline_hits", 0)),
                int(task["id"]),
            )
        )
    finally:
        cur.close()

    refine_trace_id = insert_agent_run_trace(
        conn,
        task=task,
        agent_name="NARRATIVE_REFINE",
        status="DONE",
        input_payload={"prompt": prompt, "critic_summary": critic_result.get("summary")},
        output_payload={"prose": prose},
        model_name="llm_text",
        prompt_version_id=assembled.get("prompt_version_id"),
        agent_profile_id=assembled.get("agent_profile_id"),
        equipment_snapshot_json=assembled.get("equipment_snapshot") or {},
        context_snapshot_id=context_snapshot_id,
        latency_ms=latency_ms,
        quality_json={
            "meta_leak": bool(guard.get("meta_leak")),
            "removed_lines": int(guard.get("removed_lines", 0)),
            "inline_hits": int(guard.get("inline_hits", 0)),
            "word_count": len(prose.split()),
            "prompt_assignment": assembled.get("assignment"),
            "experiment_id": assembled.get("experiment_id"),
        },
    )
    insert_agent_prompt_hydration_trace(
        conn,
        run_trace_id=refine_trace_id,
        task=task,
        agent_name="NARRATIVE_REFINE",
        prompt_version_id=assembled.get("prompt_version_id"),
        context_snapshot_id=context_snapshot_id,
        hydration_inputs_json={
            "context_snapshot_id": context_snapshot_id,
            "critic_summary": critic_result.get("summary"),
            "prompt_assignment": assembled.get("assignment"),
            "experiment_id": assembled.get("experiment_id"),
        },
        hydration_render_steps_json={
            "layer_flags": (assembled.get("equipment_snapshot") or {}).get("layers") or {},
            "template_keys": ["critic_summary", "draft_prose"],
        },
        hydration_output_text=prompt,
        llm_request_meta_json={
            "provider_call": "call_llm_text",
            "task_family": "narrative_refine",
            "temperature": 0.6,
            "max_tokens": 1500,
            "timeout_sec": get_llm_timeout("narrative_refine"),
        },
        tokens_prompt_base=_estimate_tokens(prompt),
        tokens_rules_injected=0,
        tokens_memory_injected=0,
        tokens_feedback_injected=_estimate_tokens(critic_result.get("summary")),
        tokens_truncated=0,
    )

    finalize_or_next_beat(conn, task, payload, prose)

def process_narrative_finalize_task(conn, task):
    payload = parse_jsonb(task.get("payload_json"))
    job_id = int(task["job_id"])
    story_id = int(task["story_id"])
    accumulated = payload.get("accumulated_prose") or []
    safe_accumulated = []
    for item in accumulated:
        text = ensure_prose_text(item)
        if text:
            safe_accumulated.append(text)
    if not safe_accumulated:
        raise ValueError("NARRATIVE_FINALIZE_EMPTY_PROSE")
    final_prose = "\n\n---\n\n".join(safe_accumulated)
    job_config = payload.get("job_config") or {}
    plan = job_config.get("plan") or {}
    chapter_id = payload.get("chapter_id") or job_config.get("chapter_id")
    guard = sanitize_narrative_prose(final_prose)
    final_word_count = len(final_prose.split())

    beats = plan.get("beats") or []
    estimated_total = 0
    for b in beats:
        try:
            estimated_total += int((b or {}).get("estimated_words") or 0)
        except Exception:
            pass
    min_ratio = 0.72
    max_ratio = 1.60
    min_words = int(estimated_total * min_ratio) if estimated_total > 0 else 0
    max_words = int(estimated_total * max_ratio) if estimated_total > 0 else 0

    context_guard = plan.get("context_guard") or {}
    anchor = str(context_guard.get("location_anchor") or "").strip()
    has_anchor = bool(anchor) and (anchor.lower() in final_prose.lower())

    critical_fail_reasons = []
    if int(guard.get("inline_hits", 0)) >= 2:
        critical_fail_reasons.append("META_LEAK")
    if min_words > 0 and final_word_count < min_words:
        critical_fail_reasons.append("WORD_BUDGET_UNDERFLOW")
    if max_words > 0 and final_word_count > max_words:
        critical_fail_reasons.append("WORD_BUDGET_OVERFLOW")
    if anchor and not has_anchor:
        critical_fail_reasons.append("ANCHOR_MISSED")

    if critical_fail_reasons:
        insert_agent_feedback_loop(
            conn,
            story_id=story_id,
            chapter_id=str(chapter_id) if chapter_id else None,
            agent_name="NARRATIVE_FINALIZE",
            run_trace_id=None,
            feedback_source="SYSTEM",
            feedback_type="RULE",
            feedback_text=f"Finalize blocked by critical guardrails: {', '.join(critical_fail_reasons)}",
            weight=3.0,
        )
        raise ValueError(f"NARRATIVE_FINALIZE_GUARDRAIL_BLOCK:{'|'.join(critical_fail_reasons)}")

    cur = conn.cursor()
    try:
        # Replicate narrative_chapter_staging insertion
        cur.execute(
            """INSERT INTO public.narrative_chapter_staging (story_id, chapter_id, llm_prose, plan_json)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (story_id, chapter_id) DO UPDATE SET llm_prose = %s, updated_at = NOW()""",
            (story_id, chapter_id, final_prose, json.dumps(plan), final_prose)
        )
        # Mark job as DONE
        cur.execute("UPDATE public.ingest_job SET status = 'DONE' WHERE id = %s", (job_id,))
    finally:
        cur.close()

    context_snapshot_id = insert_agent_context_snapshot(
        conn,
        story_id=story_id,
        chapter_id=str(chapter_id) if chapter_id else None,
        snapshot_payload={
            "accumulated_count": len(accumulated),
            "safe_accumulated_count": len(safe_accumulated),
            "plan": plan,
        },
    )

    insert_agent_run_trace(
        conn,
        task=task,
        agent_name="NARRATIVE_FINALIZE",
        status="DONE",
        input_payload={"accumulated_count": len(accumulated)},
        output_payload={"final_word_count": final_word_count},
        quality_json={
            "final_word_count": final_word_count,
            "estimated_total_words": estimated_total,
            "word_budget_min": min_words,
            "word_budget_max": max_words,
            "meta_leak": bool(guard.get("meta_leak")),
            "inline_hits": int(guard.get("inline_hits", 0)),
            "anchor_required": bool(anchor),
            "anchor_verified": bool(has_anchor),
        },
        context_snapshot_id=context_snapshot_id,
    )
        
    mark_task_done(conn, int(task["id"]), int(task["job_id"]), int(task.get("attempts") or 0))

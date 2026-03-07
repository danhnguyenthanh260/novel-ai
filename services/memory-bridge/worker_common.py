from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
import sys
import traceback
import psycopg2
from typing import Any, Dict, List, Optional, Tuple
from worker_runtime_config import get_llm_timeout, LLM_TIMEOUT_DEFAULT

import worker_constants as C


from worker_split_quality import (
    quality_report,
    supervisor_decision_from_quality,
    is_hard_fail_quality,
    rerun_reason,
    quality_signature,
)
from worker_profile_learning import (
    aggregate_boundary_type_hints,
    best_strategy_from_stats,
    issue_strategy_bias,
    load_profile_stats,
    load_split_feedback_penalties,
    load_supervisor_strategy_bias,
    load_split_issue_hints,
    load_split_strategy_profile,
    profile_confident,
    update_profile_stats,
    save_split_strategy_profile,
    forced_strategy_from_issue_hints,
    boundary_type_strategy_bias,
)
from worker_split_policy import (
    quality_self_signal,
    should_force_retry_by_quality_hints,
)
from worker_split_strategy import plan_strategy_order
from worker_split_pipeline import run_split_attempt
from worker_split_orchestrator import run_auto_split_attempts

# small helpers that were previously defined in memory_bridge_worker

def parse_jsonb(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def parse_split_controls(raw: Any) -> Dict[str, Any]:
    obj = parse_jsonb(raw)
    self_healing_enabled = bool(obj.get("self_healing_enabled", True))
    auto_retry_enabled = bool(obj.get("auto_retry_enabled", True))
    allow_learning = bool(obj.get("allow_learning", False))
    profile_reset_scope_raw = str(obj.get("profile_reset_scope") or "").strip().lower()
    profile_reset_scope = profile_reset_scope_raw if profile_reset_scope_raw in {"chapter", "global", "both"} else None
    profile_reset_reason = str(obj.get("profile_reset_reason") or "").strip()[:200] or None
    try:
        profile_decay_factor = float(obj.get("profile_decay_factor", 1.0))
    except Exception:
        profile_decay_factor = 1.0
    profile_decay_factor = max(0.1, min(1.0, profile_decay_factor))
    try:
        max_llm_calls = int(obj.get("max_llm_calls", C.SPLIT_MAX_LLM_CALLS_PER_CHAPTER))
    except Exception:
        max_llm_calls = C.SPLIT_MAX_LLM_CALLS_PER_CHAPTER
    max_llm_calls = max(1, min(10, max_llm_calls))
    _valid_strategies = {"S0_BASE", "S3_SEMANTIC_RESPLIT"}
    _raw_fs = obj.get("forced_strategy")
    forced_strategy = str(_raw_fs).strip() if isinstance(_raw_fs, str) and str(_raw_fs).strip() in _valid_strategies else None
    _raw_shadow = obj.get("shadow_prompt_version_id")
    shadow_prompt_version_id = None
    try:
        if _raw_shadow is not None:
            _parsed = int(_raw_shadow)
            if _parsed > 0:
                shadow_prompt_version_id = _parsed
    except Exception:
        shadow_prompt_version_id = None
    runtime_mode_raw = str(obj.get("runtime_mode") or "").strip().upper()
    runtime_mode = runtime_mode_raw if runtime_mode_raw in {"S3_STRATEGIC"} else None
    context_pack_version = str(obj.get("context_pack_version") or "").strip()[:64] or "context_pack_v1"
    preference_rule_version = str(obj.get("preference_rule_version") or "").strip()[:64] or "pref_rule_v1"
    context_window_obj = parse_jsonb(obj.get("context_window"))
    story_summary = str(obj.get("story_summary") or context_window_obj.get("story_summary") or "").strip()
    arc_context = str(obj.get("arc_context") or context_window_obj.get("arc_context") or "").strip()
    approved_ids_raw = obj.get("approved_context_ids")
    if not isinstance(approved_ids_raw, list):
        approved_ids_raw = context_window_obj.get("approved_context_ids")
    golden_ids_raw = obj.get("golden_chapter_ids")
    if not isinstance(golden_ids_raw, list):
        golden_ids_raw = context_window_obj.get("golden_chapter_ids")
    pacing_metadata = parse_jsonb(obj.get("pacing_metadata"))
    if not pacing_metadata:
        pacing_metadata = parse_jsonb(context_window_obj.get("pacing_metadata"))
    approved_context_ids: List[str] = []
    if isinstance(approved_ids_raw, list):
        for x in approved_ids_raw:
            val = str(x or "").strip()
            if val and val not in approved_context_ids:
                approved_context_ids.append(val[:120])
    golden_chapter_ids: List[str] = []
    if isinstance(golden_ids_raw, list):
        for x in golden_ids_raw:
            val = str(x or "").strip()
            if val and val not in golden_chapter_ids:
                golden_chapter_ids.append(val[:120])
    context_window = {
        "story_summary": story_summary or None,
        "arc_context": arc_context or None,
        "approved_context_ids": approved_context_ids,
        "golden_chapter_ids": golden_chapter_ids,
        "pacing_metadata": pacing_metadata or {},
    }
    def _opt_float(name: str) -> Optional[float]:
        try:
            if obj.get(name) is None:
                return None
            return float(obj.get(name))
        except Exception:
            return None

    retry_profile_used = str(obj.get("retry_profile_used") or "").strip() or None
    retry_profile = str(obj.get("retry_profile") or "").strip() or None
    retry_root_cause = str(obj.get("retry_root_cause") or "").strip() or None
    retry_requested_at = str(obj.get("retry_requested_at") or "").strip() or None
    previous_result_runtime = obj.get("previous_result_runtime") if isinstance(obj.get("previous_result_runtime"), dict) else None
    recovery_override = bool(obj.get("recovery_override", False))
    budget_profile = str(obj.get("budget_profile") or "").strip() or None
    total_budget_sec = _opt_float("total_budget_sec")
    outline_budget_sec = _opt_float("outline_budget_sec")
    primary_budget_sec = _opt_float("primary_budget_sec")
    repair_budget_sec = _opt_float("repair_budget_sec")
    analysis_chunk_max_chars = None
    try:
        if obj.get("analysis_chunk_max_chars") is not None:
            analysis_chunk_max_chars = int(obj.get("analysis_chunk_max_chars"))
    except Exception:
        analysis_chunk_max_chars = None
    return {
        "self_healing_enabled": self_healing_enabled,
        "auto_retry_enabled": auto_retry_enabled,
        "allow_learning": allow_learning,
        "profile_reset_scope": profile_reset_scope,
        "profile_reset_reason": profile_reset_reason,
        "profile_decay_factor": profile_decay_factor,
        "max_llm_calls": max_llm_calls,
        "forced_strategy": forced_strategy,
        "runtime_mode": runtime_mode,
        "context_pack_version": context_pack_version,
        "preference_rule_version": preference_rule_version,
        "context_window": context_window,
        "retry_profile_used": retry_profile_used,
        "retry_profile": retry_profile,
        "retry_root_cause": retry_root_cause,
        "retry_requested_at": retry_requested_at,
        "previous_result_runtime": previous_result_runtime,
        "recovery_override": recovery_override,
        "budget_profile": budget_profile,
        "total_budget_sec": total_budget_sec,
        "outline_budget_sec": outline_budget_sec,
        "primary_budget_sec": primary_budget_sec,
        "repair_budget_sec": repair_budget_sec,
        "analysis_chunk_max_chars": analysis_chunk_max_chars,
        "shadow_prompt_version_id": shadow_prompt_version_id,
        "_resolved_splitter_system_prompt": str(obj.get("_resolved_splitter_system_prompt") or "").strip() or None,
        "_resolved_splitter_prompt_version_id": (
            int(obj.get("_resolved_splitter_prompt_version_id"))
            if isinstance(obj.get("_resolved_splitter_prompt_version_id"), (int, float, str))
            and str(obj.get("_resolved_splitter_prompt_version_id")).strip().isdigit()
            else None
        ),
    }


def chapter_no_from_source_path(path: str) -> Optional[int]:
    m = re.search(r"(?:chapter|ch)[^0-9]*([0-9]{1,4})", path, re.IGNORECASE)
    if not m:
        return None
    return int(m.group(1))


def split_scenes(text: str) -> List[str]:
    raw = text.strip()
    if not raw:
        return []

    heading_matches = list(
        re.finditer(r"^\s*##\s*Scene\b.*$", raw, flags=re.IGNORECASE | re.MULTILINE)
    )
    if heading_matches:
        parts: List[str] = []
        for idx, cur in enumerate(heading_matches):
            start = cur.end()
            end = heading_matches[idx + 1].start() if idx + 1 < len(heading_matches) else len(raw)
            body = raw[start:end].strip()
            if body:
                parts.append(body)
        return parts

    parts = [p.strip() for p in re.split(r"^\s*---\s*$", raw, flags=re.MULTILINE) if p.strip()]
    if parts:
        return parts

    return [raw]


def repair_chapter_text(raw_text: str) -> Tuple[str, Dict[str, Any]]:
    # delegate to shared module implementation
    from worker_text_repair import repair_chapter_text as _impl

    return _impl(raw_text, C.BROKEN_WORD_SUFFIXES)


def split_lock_spans(text: str) -> List[Tuple[int, int]]:
    from worker_text_repair import split_lock_spans as _impl

    return _impl(text)


def in_locked_span(pos: int, spans: List[Tuple[int, int]]) -> bool:
    from worker_text_repair import in_locked_span as _impl

    return _impl(pos, spans)


def chunk_text(text: str, size: int, overlap: int) -> List[Tuple[int, str]]:
    n = len(text)
    if n <= size:
        return [(0, text)]
    out: List[Tuple[int, str]] = []
    start = 0
    while start < n:
        end = min(n, start + size)
        if end < n:
            cut = text.rfind("\n\n", start + size - 1200, end)
            if cut == -1:
                cut = text.rfind("\n", start + size - 800, end)
            if cut != -1 and cut > start + int(size * 0.55):
                end = cut
        chunk = text[start:end]
        if chunk.strip():
            out.append((start, chunk))
        if end >= n:
            break
        start = max(0, end - overlap)
    return out


def coerce_boundaries(raw: Any) -> List[Tuple[int, str]]:
    if not isinstance(raw, list):
        return []
    out: List[Tuple[int, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        at = item.get("at")
        reason = item.get("reason")
        if not isinstance(at, (int, float)):
            continue
        out.append((int(at), str(reason or "").strip()[:240]))
    return out


def parse_json_text(raw: str) -> Dict[str, Any]:
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE).strip()
        s = re.sub(r"\s*```$", "", s).strip()
    try:
        parsed = json.loads(s)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return {}
    return {}


def wait_for_llm_cool_off() -> None:
    dsn = os.getenv("DB_DSN", os.getenv("DATABASE_URL", C.DEFAULT_DSN))
    try:
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        try:
            # Atomic update and fetch of last timestamp
            cur.execute(
                """
                SELECT EXTRACT(EPOCH FROM (NOW() - last_at)) 
                FROM public.system_heartbeat 
                WHERE key = 'last_llm_call'
                FOR UPDATE
                """
            )
            row = cur.fetchone()
            diff_sec = float(row[0]) if row else 9999.0
            
            cool_off = C.GLOBAL_LLM_COOL_OFF_SECONDS
            if diff_sec < cool_off:
                wait_sec = cool_off - diff_sec
                print(f"[LLM_GUARD] Cooling off for {wait_sec:.1f}s...", flush=True)
                time.sleep(wait_sec)
            
            cur.execute(
                "UPDATE public.system_heartbeat SET last_at = NOW() WHERE key = 'last_llm_call'"
            )
            conn.commit()
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        print(f"[LLM_GUARD] Warning: Heartbeat check failed: {e}", file=sys.stderr, flush=True)

def call_llm_json(
    messages: List[Dict[str, str]],
    max_tokens: int,
    temperature: float,
    timeout_sec: int = LLM_TIMEOUT_DEFAULT,
    *,
    raise_on_error: bool = False,
) -> Dict[str, Any]:
    # Enforce global cool-off
    wait_for_llm_cool_off()
    endpoint = f"{C.DEFAULT_LLM_BASE}/chat/completions"
    try:
        msg_chars = sum(len(str((m or {}).get("content") or "")) for m in (messages or []))
    except Exception:
        msg_chars = 0
    print(
        f"[call_llm_json] endpoint={endpoint} messages={len(messages or [])} chars={msg_chars} max_tokens={max_tokens} timeout_sec={timeout_sec}",
        file=sys.stderr,
        flush=True,
    )

    payload = {
        "model": C.DEFAULT_LLM_MODEL,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    req = urllib.request.Request(
        f"{C.DEFAULT_LLM_BASE}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {C.DEFAULT_LLM_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", errors="replace")
        except Exception:
            err_body = ""
        print(
            f"[call_llm_json] HTTPError: code={getattr(e, 'code', '?')} reason={getattr(e, 'reason', '')} body={err_body[:1200]}",
            file=sys.stderr,
            flush=True,
        )
        traceback.print_exc(file=sys.stderr)
        if raise_on_error:
            raise RuntimeError(f"LLM_HTTP_{getattr(e, 'code', 'ERR')}: {str(e)} | body={err_body[:500]}") from e
        return {}
    except urllib.error.URLError as e:
        print(f"[call_llm_json] URLError: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        if raise_on_error:
            raise RuntimeError(f"LLM_URL_ERROR: {str(e)}") from e
        return {}
    except Exception as e:
        print(f"[call_llm_json] HTTP request failed: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        if raise_on_error:
            raise RuntimeError(f"LLM_REQUEST_FAILED: {str(e)}") from e
        return {}
    try:
        parsed = json.loads(body)
        content = (
            parsed.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        if not isinstance(content, str) or not content.strip():
            print(f"[call_llm_json] empty content, parsed={parsed}", file=sys.stderr)
            if raise_on_error:
                raise RuntimeError("LLM_EMPTY_CONTENT")
            return {}
        return parse_json_text(content)
    except Exception:
        print(f"[call_llm_json] parse failure, body={body}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        if raise_on_error:
            raise RuntimeError("LLM_PARSE_FAILURE")
        return {}


def call_llm_text(
    messages: List[Dict[str, str]], max_tokens: int, temperature: float, timeout_sec: int = LLM_TIMEOUT_DEFAULT
) -> str:
    wait_for_llm_cool_off()
    endpoint = f"{C.DEFAULT_LLM_BASE}/chat/completions"

    payload = {
        "model": C.DEFAULT_LLM_MODEL,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {C.DEFAULT_LLM_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        print(f"[call_llm_text] URLError: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return ""
    except Exception as e:
        print(f"[call_llm_text] HTTP request failed: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return ""
    try:
        parsed = json.loads(body)
        content = (
            parsed.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        if not isinstance(content, str):
            return ""
        return content.strip()
    except Exception:
        print(f"[call_llm_text] parse failure, body={body}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return ""

def call_llm_embedding(text: str, timeout_sec: int = get_llm_timeout("embedding")) -> List[float]:
    content = str(text or "").strip()
    if not content:
        return []
    payload = {
        "model": C.DEFAULT_EMBED_MODEL,
        "input": content,
    }
    req = urllib.request.Request(
        f"{C.DEFAULT_EMBED_BASE}/embeddings",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {C.DEFAULT_LLM_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return []
    try:
        parsed = json.loads(body)
        if isinstance(parsed, dict):
            if isinstance(parsed.get("data"), list) and parsed["data"]:
                emb = parsed["data"][0].get("embedding")
                if isinstance(emb, list):
                    return [float(x) for x in emb if isinstance(x, (int, float))]
            emb = parsed.get("embedding")
            if isinstance(emb, list):
                return [float(x) for x in emb if isinstance(x, (int, float))]
        return []
    except Exception:
        return []


def llm_can_run(llm_state: Dict[str, int]) -> bool:
    used = int(llm_state.get("used") or 0)
    max_calls = int(llm_state.get("max_calls") or C.SPLIT_MAX_LLM_CALLS_PER_CHAPTER)
    return used < max_calls


def llm_consume_call(llm_state: Dict[str, int]) -> None:
    llm_state["used"] = int(llm_state.get("used") or 0) + 1


def llm_boundaries_for_chunk(
    chunk_text: str,
    strict: bool = False,
    tech_rules: str = "",
    active_constraints: Optional[List[str]] = None,
    forced_dictionary_override: bool = False,
    splitter_system_prompt_override: Optional[str] = None,
    split_trace_chunks: Optional[List[Dict[str, Any]]] = None,
    chunk_index: Optional[int] = None,
    chunk_start: Optional[int] = None,
    hard_anchor_specs: Optional[List[Dict[str, Any]]] = None,
    soft_anchor_specs: Optional[List[Dict[str, Any]]] = None,
    lore_ranges: Optional[List[Dict[str, Any]]] = None,
) -> List[Tuple[int, str]]:
    prompt_integrity_v1_enabled = str(os.getenv("SPLIT_PROMPT_INTEGRITY_V1_ENABLED", "1")).strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    try:
        prompt_soft_cap_chars = int(os.getenv("SPLIT_PROMPT_SOFT_CAP_CHARS", "16000") or 16000)
    except Exception:
        prompt_soft_cap_chars = 16000
    strict_rules = (
        "- STRICT mode: boundary must align to natural sentence/paragraph boundary.\n"
        "- STRICT mode: never split inside a word or between lowercase letters.\n"
        "- STRICT mode: avoid boundary if left chunk does not end with terminal punctuation.\n"
        "- STRICT mode: avoid boundary if right chunk starts with lowercase.\n"
        if strict
        else ""
    )
    technical_guidance = ""
    if tech_rules:
        technical_guidance = (
            "SECTION: TECHNICAL GUIDANCE\n"
            "- Follow these technical rules while preserving coherent scene flow:\n"
            f"{tech_rules}\n"
        )
    constraint_rules = ""
    if active_constraints:
        if forced_dictionary_override:
            constraint_rules = (
                "SECTION: HARD CONSTRAINTS\n"
                "- CRITICAL OVERRIDE: Base framing rules (like pacing or natural boundaries) are SUSPENDED. "
                "The attached ACTIVE CONSTRAINTS are the absolute law. Ignore pacing if it conflicts with these constraints:\n"
            )
        else:
            constraint_rules = (
                "SECTION: HARD CONSTRAINTS\n"
                "- CRITICAL USER CONSTRAINTS (ABSOLUTE LAWS. You MUST obey these even if it violates normal scene pacing):\n"
            )
        for c in active_constraints:
            constraint_rules += f"  * {c}\n"
        constraint_rules += "\n"
        
    pacing_rules = (
        "- Prefer boundary when context/time/POV clearly changes.\n"
        "- Avoid too frequent boundaries.\n"
    ) if not active_constraints else (
        "- Prefer boundary when context/time/POV clearly changes, UNLESS it violates the CRITICAL USER CONSTRAINTS above.\n"
    )
    if forced_dictionary_override:
        pacing_rules = ""

    hard_anchor_specs = hard_anchor_specs or []
    soft_anchor_specs = soft_anchor_specs or []
    lore_ranges = lore_ranges or []
    chunk_origin = int(chunk_start or 0)
    chunk_end = chunk_origin + len(chunk_text)

    chunk_hard_anchors: List[Dict[str, Any]] = []
    for item in hard_anchor_specs:
        try:
            at = int(item.get("at") or 0)
        except Exception:
            continue
        if chunk_origin < at < chunk_end:
            chunk_hard_anchors.append(
                {
                    "anchor_id": str(item.get("id") or ""),
                    "type": str(item.get("type") or "TEMPORAL_HARD"),
                    "at": int(at - chunk_origin),
                    "tolerance_chars": int(item.get("tolerance_chars") or C.SPLIT_HARD_ANCHOR_TOLERANCE_CHARS),
                }
            )
    chunk_soft_anchors: List[Dict[str, Any]] = []
    for item in soft_anchor_specs:
        try:
            at = int(item.get("at") or 0)
        except Exception:
            continue
        if chunk_origin < at < chunk_end:
            chunk_soft_anchors.append(
                {
                    "anchor_id": str(item.get("id") or ""),
                    "type": str(item.get("type") or "STRUCTURAL_SOFT"),
                    "at": int(at - chunk_origin),
                }
            )
    chunk_lore_ranges: List[Dict[str, Any]] = []
    for item in lore_ranges:
        try:
            start_at = int(item.get("start_at") or 0)
            end_at = int(item.get("end_at") or 0)
        except Exception:
            continue
        if end_at <= chunk_origin or start_at >= chunk_end:
            continue
        chunk_lore_ranges.append(
            {
                "id": str(item.get("id") or ""),
                "start_at": int(max(start_at, chunk_origin) - chunk_origin),
                "end_at": int(min(end_at, chunk_end) - chunk_origin),
                "isolate_hint": str(item.get("isolate_hint") or "")[:220],
            }
        )

    anchor_rules = ""
    if chunk_hard_anchors or chunk_soft_anchors or chunk_lore_ranges:
        anchor_rules = (
            "SECTION: ANCHOR VALIDATION CONTRACT\n"
            "- Detected hard anchors are mandatory split intents. Use exact at when possible.\n"
            "- If moving a hard anchor boundary, stay within +/- tolerance_chars.\n"
            "- If rejecting a hard anchor, output anchor_decisions[] with reason.\n"
            "- Lore ranges are soft isolation hints.\n"
            f"- HARD_ANCHORS_JSON: {json.dumps(chunk_hard_anchors, ensure_ascii=True)}\n"
            f"- SOFT_ANCHORS_JSON: {json.dumps(chunk_soft_anchors, ensure_ascii=True)}\n"
            f"- LORE_RANGES_JSON: {json.dumps(chunk_lore_ranges, ensure_ascii=True)}\n"
        )
    schema_section = (
        "Split this chapter chunk into scene boundaries.\n"
        "Output STRICT JSON only:\n"
        '{"boundaries":[{"at":1234,"reason":"POV shift","anchor_ref":"h001"}],"anchor_decisions":[{"anchor_id":"h001","decision":"accepted|moved|rejected","reason":"..."}]}\n'
    )
    mechanics_section = (
        "SECTION: CORE BOUNDARY MECHANICS\n"
        "- at is character offset within this chunk text.\n"
        "- Do not create boundary inside [[LOCK]]...[[/LOCK]].\n"
        f"{pacing_rules}\n"
        f"{strict_rules}\n"
    )
    user_prompt = (
        f"{schema_section}"
        f"{mechanics_section}"
        f"{constraint_rules}"
        f"{technical_guidance}"
        f"{anchor_rules}"
        f"CHUNK_TEXT:\n{chunk_text}"
    )
    prompt_compaction_applied = False
    if prompt_integrity_v1_enabled and len(user_prompt) > prompt_soft_cap_chars and technical_guidance:
        prompt_compaction_applied = True
        # Compact guidance first while preserving hard constraints + anchors.
        max_guidance_chars = max(800, prompt_soft_cap_chars // 6)
        if len(technical_guidance) > max_guidance_chars:
            technical_guidance = technical_guidance[:max_guidance_chars].rstrip() + "\n...[GUIDANCE_COMPACTED]\n"
        user_prompt = (
            f"{schema_section}"
            f"{mechanics_section}"
            f"{constraint_rules}"
            f"{technical_guidance}"
            f"{anchor_rules}"
            f"CHUNK_TEXT:\n{chunk_text}"
        )
    system_prompt = str(splitter_system_prompt_override or "").strip() or "You are a strict JSON scene boundary segmenter."
    trace_item: Optional[Dict[str, Any]] = None
    if isinstance(split_trace_chunks, list):
        include_prompt_text = str(os.getenv("AGENT_TRACE_STORE_PROMPT_TEXT", "1")).strip().lower() not in (
            "0",
            "false",
            "off",
            "no",
        )
        try:
            max_chunks = int(os.getenv("AGENT_TRACE_SPLIT_PROMPT_MAX_CHUNKS", "40") or 40)
        except Exception:
            max_chunks = 40
        if len(split_trace_chunks) < max(1, max_chunks):
            item: Dict[str, Any] = {
                "chunk_index": int(chunk_index or 0),
                "chunk_start": int(chunk_start or 0),
                "chunk_chars": len(chunk_text),
                "strict": bool(strict),
                "forced_dictionary_override": bool(forced_dictionary_override),
                "prompt_compaction_applied": bool(prompt_compaction_applied and prompt_integrity_v1_enabled),
                "prompt_truncation_markers_count": int(str(user_prompt).count("[TRUNCATED]")),
                "system_prompt_sha256": hashlib.sha256(system_prompt.encode("utf-8")).hexdigest(),
                "user_prompt_sha256": hashlib.sha256(user_prompt.encode("utf-8")).hexdigest(),
            }
            if include_prompt_text:
                item["system_prompt"] = system_prompt
                item["user_prompt"] = user_prompt
            else:
                item["system_prompt_preview"] = system_prompt[:240]
                item["user_prompt_preview"] = user_prompt[:480]
            split_trace_chunks.append(item)
            trace_item = item
    parsed = call_llm_json(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=800 if strict else 700,
        temperature=0.2 if strict else 0.3,
        timeout_sec=get_llm_timeout("split_boundary"),
    )
    if isinstance(trace_item, dict):
        decisions = parsed.get("anchor_decisions")
        if isinstance(decisions, list):
            trace_item["anchor_decisions"] = decisions[:20]
    return coerce_boundaries(parsed.get("boundaries"))


def heuristic_boundaries(chunk_text: str) -> List[Tuple[int, str]]:
    out: List[Tuple[int, str]] = []
    for m in re.finditer(
        r"^\s*##\s*Scene\b.*$", chunk_text, flags=re.IGNORECASE | re.MULTILINE
    ):
        out.append((m.start(), "scene heading"))
    for m in re.finditer(r"^\s*---\s*$", chunk_text, flags=re.MULTILINE):
        out.append((m.start(), "separator"))
    para_positions = [m.start() for m in re.finditer(r"\n{2,}", chunk_text)]
    if len(para_positions) > 5:
        step = max(1, len(para_positions) // 4)
        for i in range(step, len(para_positions), step):
            out.append((para_positions[i], "paragraph shift"))
    return out


def nearby_natural_boundaries(text: str, center: int, window: int) -> List[Tuple[int, int]]:
    left = max(1, center - window)
    right = min(len(text) - 1, center + window)
    if right <= left:
        return []

    out: List[Tuple[int, int]] = []
    segment = text[left:right]

    # Strong boundary: paragraph break
    for m in re.finditer(r"\n{2,}", segment):
        pos = left + m.start()
        out.append((pos, 0))

    # Medium boundary: sentence ending before whitespace/newline
    for m in re.finditer(r"(?<=[\.\!\?])\s+", segment):
        pos = left + m.start()
        out.append((pos, 1))

    # Fallback boundary: line break
    for m in re.finditer(r"\n", segment):
        pos = left + m.start()
        out.append((pos, 2))

    return out


def ends_with_terminal_punct(text: str) -> bool:
    t = text.rstrip()
    if not t:
        return False
    return bool(re.search(r"[.!?…\"'\)\]]\s*$", t))


def starts_with_lower_or_punct(text: str) -> bool:
    from worker_split_refine import starts_with_lower_or_punct as _impl

    return _impl(text)


def is_abbrev_or_name_split_at(text: str, at: int) -> bool:
    from worker_split_refine import is_abbrev_or_name_split_at as _impl

    return _impl(
        text,
        at,
        abbrev_pattern=C.ABBREV_PATTERN,
        initial_pattern=C.INITIAL_PATTERN,
        name_head_pattern=C.NAME_HEAD_PATTERN,
    )


def is_quote_continuity_break_at(text: str, at: int) -> bool:
    from worker_split_refine import is_quote_continuity_break_at as _impl

    return _impl(text, at)


def boundary_penalty(text: str, at: int) -> int:
    from worker_split_refine import boundary_penalty as _impl

    return _impl(
        text,
        at,
        split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
        ends_with_terminal_punct=ends_with_terminal_punct,
        starts_with_lower_or_punct=starts_with_lower_or_punct,
        is_abbrev_or_name_split_at=is_abbrev_or_name_split_at,
    )


def boundary_issue_score(text: str, at: int) -> int:
    from worker_split_refine import boundary_issue_score as _impl

    return _impl(
        text,
        at,
        split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
        ends_with_terminal_punct=ends_with_terminal_punct,
        starts_with_lower_or_punct=starts_with_lower_or_punct,
        is_abbrev_or_name_split_at=is_abbrev_or_name_split_at,
        is_quote_continuity_break_at=is_quote_continuity_break_at,
    )


def refine_boundary(text: str, at: int, lock_spans: List[Tuple[int, int]]) -> int:
    from worker_split_refine import refine_boundary as _impl

    return _impl(
        text,
        at,
        lock_spans,
        split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
        boundary_penalty=boundary_penalty,
        nearby_natural_boundaries=nearby_natural_boundaries,
        in_locked_span=in_locked_span,
    )


def refine_split_points(text: str, split_points: List[int], lock_spans: List[Tuple[int, int]]) -> List[int]:
    from worker_split_refine import refine_split_points as _impl

    return _impl(
        text,
        split_points,
        lock_spans,
        split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
        split_min_gap=C.SPLIT_MIN_GAP,
        refine_boundary=refine_boundary,
    )


def normalize_split_points(points: List[int], text_len: int) -> List[int]:
    from worker_split_refine import normalize_split_points as _impl

    return _impl(
        points,
        text_len,
        split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
        split_min_gap=C.SPLIT_MIN_GAP,
    )


def llm_semantic_resplit_offsets(
    chapter_text: str,
    split_points: List[int],
    llm_state: Dict[str, int],
    *,
    reprocess_note: Optional[str] = None,
    previous_split_contexts: Optional[List[str]] = None,
    active_constraints: Optional[List[str]] = None,
    constraint_pack_mode: Optional[str] = None,
    hard_anchor_positions: Optional[List[int]] = None,
    hard_anchor_tolerance_chars: Optional[int] = None,
) -> Tuple[List[int], Dict[str, Any]]:
    from worker_split_refine import llm_semantic_resplit_offsets as _impl

    return _impl(
        chapter_text,
        split_points,
        llm_state,
        reprocess_note=reprocess_note,
        previous_split_contexts=previous_split_contexts,
        active_constraints=active_constraints,
        constraint_pack_mode=constraint_pack_mode,
        s3_min_confidence=C.S3_MIN_CONFIDENCE,
        s3_max_offset_jump=max(C.S3_MAX_OFFSET_JUMP, int(len(chapter_text) * 0.15)),
        s3_min_proof_ratio=C.S3_MIN_PROOF_RATIO,
        s3_max_rejected_jump_ratio=C.S3_MAX_REJECTED_JUMP_RATIO,
        llm_can_run=llm_can_run,
        llm_consume_call=llm_consume_call,
        call_llm_json=call_llm_json,
        normalize_split_points=normalize_split_points,
        hard_anchor_positions=hard_anchor_positions,
        hard_anchor_tolerance_chars=int(
            hard_anchor_tolerance_chars
            if hard_anchor_tolerance_chars is not None
            else C.SPLIT_HARD_ANCHOR_TOLERANCE_CHARS
        ),
    )


def llm_reviewer_gate(
    chapter_text: str,
    split_points: List[int],
    active_constraints: List[str],
    llm_state: Dict[str, int],
) -> Dict[str, Any]:
    if not llm_can_run(llm_state) or not active_constraints:
        return {"pass": True, "reason": "Skipped due to no constraints or no llm calls left", "bad_split_points": []}
        
    snippets = []
    text_len = len(chapter_text)
    for p in split_points:
        start = max(0, p - 800)
        end = min(text_len, p + 800)
        snippet = chapter_text[start:end].replace("\n", " ")
        snippets.append(f"Split Point Context:\n...{snippet}...")

    snippets_text = "\n\n".join(snippets)
    constraints_text = "\n".join(f"- {c}" for c in active_constraints)

    sys_prompt = (
        "You are a strict QA Reviewer Agent evaluating document splits against Critical User Constraints.\n"
        "Your job is to determine if ANY of the proposed split points violate ANY of the constraints.\n"
        "If they do, you must FAIL the review, provide a clear reason, and list the 0-indexed indices of the bad split points.\n"
        "Output strictly valid JSON:\n"
        "{\n"
        '  "pass": boolean,\n'
        '  "reason": "Clear explanation of which constraint was violated and why",\n'
        '  "bad_split_points_indices": [integer, integer] // The 0-based indices of the snippets that failed\n'
        "}"
    )

    user_prompt = (
        f"CRITICAL USER CONSTRAINTS TO ENFORCE:\n{constraints_text}\n\n"
        f"PROPOSED SPLIT SNIPPETS:\n"
    )
    for i, snip in enumerate(snippets):
        user_prompt += f"--- Snippet Index {i} ---\n{snip}\n\n"
        
    user_prompt += "Evaluate if these splits strictly respect the constraints."

    parsed = call_llm_json(
        [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=250,
        temperature=0.1,
        timeout_sec=get_llm_timeout("split_reviewer_gate"),
    )
    llm_consume_call(llm_state)

    passed = bool(parsed.get("pass", True))
    reason = str(parsed.get("reason") or "").strip()
    bad_indices = parsed.get("bad_split_points_indices", [])
    if not isinstance(bad_indices, list):
        bad_indices = []
        
    bad_points = []
    for idx in bad_indices:
        if isinstance(idx, int) and 0 <= idx < len(split_points):
            bad_points.append(split_points[idx])
            
    # Default behavior if validation explicitly fails but returns no specific points
    if not passed and not bad_points and split_points:
        bad_points = list(split_points)

    return {
        "pass": passed,
        "reason": reason,
        "bad_split_points": bad_points,
    }



def best_boundary_candidate(
    text: str,
    at: int,
    lock_spans: List[Tuple[int, int]],
    prev_point: int,
    next_point: int,
) -> Tuple[int, int]:
    from worker_split_refine import best_boundary_candidate as _impl

    return _impl(
        text,
        at,
        lock_spans,
        prev_point,
        next_point,
        split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
        nearby_natural_boundaries=nearby_natural_boundaries,
        in_locked_span=in_locked_span,
        boundary_issue_score=boundary_issue_score,
    )


def autofix_split_points(text: str, split_points: List[int], lock_spans: List[Tuple[int, int]]) -> Tuple[List[int], Dict[str, Any]]:
    from worker_split_refine import (
        autofix_split_points as _impl,
        boundary_issue_score,
        best_boundary_candidate,
        starts_with_lower_or_punct,
    )

    return _impl(
        text,
        split_points,
        lock_spans,
        normalize_split_points=normalize_split_points,
        boundary_issue_score=lambda t, at: boundary_issue_score(
            t,
            at,
            split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
            ends_with_terminal_punct=ends_with_terminal_punct,
            starts_with_lower_or_punct=starts_with_lower_or_punct,
            is_abbrev_or_name_split_at=is_abbrev_or_name_split_at,
            is_quote_continuity_break_at=is_quote_continuity_break_at,
        ),
        best_boundary_candidate=lambda t, at, spans, prev_point, next_point: best_boundary_candidate(
            t, at, spans, prev_point, next_point,
            split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
            nearby_natural_boundaries=nearby_natural_boundaries,
            in_locked_span=in_locked_span,
            boundary_issue_score=lambda t, at: boundary_issue_score(
                t,
                at,
                split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
                ends_with_terminal_punct=ends_with_terminal_punct,
                starts_with_lower_or_punct=starts_with_lower_or_punct,
                is_abbrev_or_name_split_at=is_abbrev_or_name_split_at,
                is_quote_continuity_break_at=is_quote_continuity_break_at,
            ),
        ),
    )


def snap_boundary(text: str, at: int, lock_spans: List[Tuple[int, int]]) -> int:
    from worker_split_refine import snap_boundary as _impl

    return _impl(
        text,
        at,
        lock_spans,
        nearby_natural_boundaries=nearby_natural_boundaries,
        in_locked_span=in_locked_span,
    )


def normalize_boundaries(
    text: str,
    text_len: int,
    candidates: List[Tuple[int, str]],
    lock_spans: List[Tuple[int, int]],
) -> List[Tuple[int, str]]:
    from worker_split_refine import normalize_boundaries as _impl

    return _impl(
        text,
        text_len,
        candidates,
        lock_spans,
        split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
        split_min_gap=C.SPLIT_MIN_GAP,
        snap_boundary=snap_boundary,
        in_locked_span=in_locked_span,
    )


def scene_title_summary(scene_text: str, idx: int) -> Tuple[str, str]:
    parsed = call_llm_json(
        messages=[
            {"role": "system", "content": "You output strict JSON only."},
            {
                "role": "user",
                "content": (
                    "Create concise scene label JSON.\n"
                    "Output strict JSON only:\n"
                    '{"title":"string","summary":"string"}\n'
                    f"SCENE_INDEX: {idx}\n"
                    f"SCENE_TEXT:\n{scene_text[:3500]}"
                ),
            },
        ],
        max_tokens=240,
        temperature=0.4,
        timeout_sec=get_llm_timeout("split_scene_title"),
    )
    title = str(parsed.get("title") or "").strip()
    summary = str(parsed.get("summary") or "").strip()
    if not title:
        title = f"Scene {idx}"
    if not summary:
        summary = split_scenes(scene_text[:900])[0] if split_scenes(scene_text[:900]) else scene_text[:220]
    return title[:180], summary[:900]


def chapter_title_from_text(chapter_text: str, chapter_id: Optional[str]) -> str:
    lines = [ln.strip() for ln in chapter_text.splitlines() if ln.strip()]
    if not lines:
        return chapter_id or "Untitled Chapter"

    first = lines[0]
    if len(first) <= 120:
        return first

    for line in lines[1:8]:
        if 3 <= len(line) <= 120:
            return line
    return (chapter_id or "Untitled Chapter")[:120]


def build_chapter_id(chapter_no: Optional[int]) -> str:
    if chapter_no is None:
        return "ch00"
    return f"ch{chapter_no:02d}"


def build_workunit_id(chapter_no: Optional[int], scene_idx: int, chapter_task_seq: int) -> str:
    if chapter_no is None:
        return f"ch00_s{chapter_task_seq:03d}_{scene_idx:02d}"
    return f"ch{chapter_no:03d}_s{scene_idx:02d}"


def is_degenerate_single_scene(chapter_text: str, scenes: List[Dict[str, Any]], split_mode: str) -> bool:
    # copied from original worker logic
    return (
        split_mode == "auto"
        and len(chapter_text) >= C.SPLIT_LONG_CHAPTER_CHARS
        and len(scenes) <= 1
    )


# dissolve higher‑level wrappers for split proposal logic
from worker_split_proposal import (
    build_manual_split_proposal as _build_manual_split_proposal_impl,
    build_split_proposal as _build_split_proposal_impl,
)
from worker_split_boundary_helpers import (
    extract_split_candidates as _extract_split_candidates_impl,
    build_scenes_from_candidates as _build_scenes_from_candidates_impl,
    build_scenes_from_split_points as _build_scenes_from_split_points_impl,
    build_scenes_from_split_points as _build_scenes_from_split_points_impl,
)


def reason_for_scene(boundary_pos: int, reasons_by_boundary: Dict[int, str], scene_idx: int) -> str:
    """Return a reason string for a scene boundary."""
    return reasons_by_boundary.get(boundary_pos, "semantic_resplit")


def extract_split_candidates(
    chapter_text: str,
    strategy: str,
    llm_state: Dict[str, int],
    tech_rules: str = "",
    active_constraints: Optional[List[str]] = None,
    forced_dictionary_override: bool = False,
    splitter_system_prompt_override: Optional[str] = None,
    split_trace_chunks: Optional[List[Dict[str, Any]]] = None,
    hard_anchor_specs: Optional[List[Dict[str, Any]]] = None,
    soft_anchor_specs: Optional[List[Dict[str, Any]]] = None,
    lore_ranges: Optional[List[Dict[str, Any]]] = None,
) -> List[Tuple[int, str]]:
    return _extract_split_candidates_impl(
        chapter_text,
        strategy,
        llm_state,
        split_chunk_target=C.SPLIT_CHUNK_TARGET,
        split_chunk_overlap=C.SPLIT_CHUNK_OVERLAP,
        chunk_text=chunk_text,
        llm_can_run=llm_can_run,
        llm_consume_call=llm_consume_call,
        llm_boundaries_for_chunk=lambda t, strict=False, **chunk_ctx: llm_boundaries_for_chunk(
            t, strict,
            tech_rules=tech_rules,
            active_constraints=active_constraints,
            forced_dictionary_override=forced_dictionary_override,
            splitter_system_prompt_override=splitter_system_prompt_override,
            split_trace_chunks=split_trace_chunks,
            chunk_index=chunk_ctx.get("chunk_index"),
            chunk_start=chunk_ctx.get("chunk_start"),
            hard_anchor_specs=hard_anchor_specs,
            soft_anchor_specs=soft_anchor_specs,
            lore_ranges=lore_ranges,
        ),
        heuristic_boundaries=heuristic_boundaries,
        hard_anchor_specs=hard_anchor_specs,
        soft_anchor_specs=soft_anchor_specs,
        lore_ranges=lore_ranges,
    )


def build_scenes_from_split_points(
    chapter_text: str,
    split_points: List[int],
    reasons_by_boundary: Dict[int, str],
) -> List[Dict[str, Any]]:
    return _build_scenes_from_split_points_impl(
        chapter_text,
        split_points,
        reasons_by_boundary,
        scene_title_summary=scene_title_summary,
        reason_for_scene=reason_for_scene,
    )


def merge_bad_boundaries(
    chapter_text: str,
    split_points: List[int],
) -> Tuple[List[int], int]:
    from worker_split_boundary_helpers import merge_bad_boundaries as _merge_bad_boundaries_impl
    from worker_split_refine import (
        boundary_issue_score,
        starts_with_lower_or_punct,
    )

    return _merge_bad_boundaries_impl(
        chapter_text,
        split_points,
        boundary_issue_score=lambda t, at: boundary_issue_score(
            t,
            at,
            split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
            ends_with_terminal_punct=ends_with_terminal_punct,
            starts_with_lower_or_punct=starts_with_lower_or_punct,
            is_abbrev_or_name_split_at=is_abbrev_or_name_split_at,
            is_quote_continuity_break_at=is_quote_continuity_break_at,
        ),
        normalize_split_points=normalize_split_points,
    )


def merge_for_fragmentation(
    chapter_text: str,
    split_points: List[int],
    max_removals: int = 3,
) -> Tuple[List[int], int]:
    from worker_split_boundary_helpers import merge_for_fragmentation as _merge_for_fragmentation_impl
    from worker_split_refine import (
        boundary_issue_score,
        starts_with_lower_or_punct,
    )

    return _merge_for_fragmentation_impl(
        chapter_text,
        split_points,
        max_removals,
        split_fragment_short_chars=C.SPLIT_FRAGMENT_SHORT_CHARS,
        boundary_issue_score=lambda t, at: boundary_issue_score(
            t,
            at,
            split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
            ends_with_terminal_punct=ends_with_terminal_punct,
            starts_with_lower_or_punct=starts_with_lower_or_punct,
            is_abbrev_or_name_split_at=is_abbrev_or_name_split_at,
            is_quote_continuity_break_at=is_quote_continuity_break_at,
        ),
        normalize_split_points=normalize_split_points,
    )


def window_rerun_splice(
    chapter_text: str,
    split_points: List[int],
    lock_spans: List[Tuple[int, int]],
    llm_state: Dict[str, int],
) -> Tuple[List[int], Dict[str, Any]]:
    from worker_split_boundary_helpers import (
        window_rerun_splice as _window_rerun_splice_impl,
        best_window_boundary as _best_window_boundary_impl,
        force_abbrev_boundary_move as _force_abbrev_boundary_move_impl,
    )
    from worker_split_refine import (
        boundary_issue_score,
        refine_boundary as _refine_boundary_impl,
        starts_with_lower_or_punct,
    )

    return _window_rerun_splice_impl(
        chapter_text,
        split_points,
        lock_spans,
        llm_state,
        split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
        normalize_split_points=normalize_split_points,
        boundary_issue_score=lambda t, at: boundary_issue_score(
            t,
            at,
            split_min_scene_chars=C.SPLIT_MIN_SCENE_CHARS,
            ends_with_terminal_punct=ends_with_terminal_punct,
            starts_with_lower_or_punct=starts_with_lower_or_punct,
            is_abbrev_or_name_split_at=is_abbrev_or_name_split_at,
            is_quote_continuity_break_at=is_quote_continuity_break_at,
        ),
        llm_can_run=llm_can_run,
        llm_consume_call=llm_consume_call,
        llm_boundaries_for_chunk=llm_boundaries_for_chunk,
        heuristic_boundaries=heuristic_boundaries,
        best_window_boundary=_best_window_boundary_impl,
        refine_boundary=_refine_boundary_impl,
        force_abbrev_boundary_move=_force_abbrev_boundary_move_impl,
    )


def build_scenes_from_candidates(
    chapter_text: str,
    candidates: List[Tuple[int, str]],
    lock_spans: List[Tuple[int, int]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], List[int]]:
    return _build_scenes_from_candidates_impl(
        chapter_text,
        candidates,
        lock_spans,
        normalize_boundaries=normalize_boundaries,
        refine_split_points=refine_split_points,
        autofix_split_points=autofix_split_points,
        build_scenes_from_split_points=build_scenes_from_split_points,
    )


def build_manual_split_proposal(
    chapter_text: str,
    chapter_no: Optional[int],
    repair_report: Optional[Dict[str, Any]] = None,
    *,
    reprocess_note: Optional[str] = None,
    previous_split_contexts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return _build_manual_split_proposal_impl(
        chapter_text,
        chapter_no,
        repair_report,
        reprocess_note=reprocess_note,
        previous_split_contexts=previous_split_contexts,
        build_chapter_id=build_chapter_id,
        chapter_title_from_text=chapter_title_from_text,
        scene_title_summary=scene_title_summary,
        quality_report=quality_report,
        supervisor_decision_from_quality=lambda q: supervisor_decision_from_quality(
            q,
            False,
            C.SPLIT_FRAGMENT_SCORE_RETRY_THRESHOLD,
            C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
            C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
            C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
        ),
        ends_with_terminal_punct=ends_with_terminal_punct,
        is_abbrev_or_name_split_at=is_abbrev_or_name_split_at,
        is_quote_continuity_break_at=is_quote_continuity_break_at,
    )


def build_split_proposal(
    conn,
    chapter_text: str,
    chapter_no: Optional[int],
    story_id: int,
    repair_report: Optional[Dict[str, Any]] = None,
    split_controls: Optional[Dict[str, Any]] = None,
    split_mode: str = "auto",
    *,
    reprocess_note: Optional[str] = None,
    previous_split_contexts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return _build_split_proposal_impl(
        conn,
        chapter_text,
        chapter_no,
        story_id,
        repair_report,
        split_controls,
        split_mode,
        reprocess_note=reprocess_note,
        previous_split_contexts=previous_split_contexts,
        split_profile_global_key=C.SPLIT_PROFILE_GLOBAL_KEY,
        split_max_llm_calls_per_chapter=C.SPLIT_MAX_LLM_CALLS_PER_CHAPTER,
        split_strong_hint_threshold=C.SPLIT_STRONG_HINT_THRESHOLD,
        split_long_chapter_chars=C.SPLIT_LONG_CHAPTER_CHARS,
        split_exploration_rate=C.SPLIT_EXPLORATION_RATE,
        split_profile_chapter_lr=C.SPLIT_PROFILE_CHAPTER_LR,
        split_profile_global_lr=C.SPLIT_PROFILE_GLOBAL_LR,
        split_profile_history_max=C.SPLIT_PROFILE_HISTORY_MAX,
        build_chapter_id=build_chapter_id,
        chapter_title_from_text=chapter_title_from_text,
        split_lock_spans=split_lock_spans,
        load_split_strategy_profile=load_split_strategy_profile,
        load_profile_stats=load_profile_stats,
        profile_confident=profile_confident,
        parse_jsonb=parse_jsonb,
        load_split_feedback_penalties=load_split_feedback_penalties,
        load_supervisor_strategy_bias=load_supervisor_strategy_bias,
        load_split_issue_hints=load_split_issue_hints,
        issue_strategy_bias=issue_strategy_bias,
        aggregate_boundary_type_hints=aggregate_boundary_type_hints,
        boundary_type_strategy_bias=boundary_type_strategy_bias,
        parse_split_controls=parse_split_controls,
        forced_strategy_from_issue_hints=forced_strategy_from_issue_hints,
        plan_strategy_order=plan_strategy_order,
        best_strategy_from_stats=best_strategy_from_stats,
        run_auto_split_attempts=run_auto_split_attempts,
        run_split_attempt=run_split_attempt,
        extract_split_candidates=extract_split_candidates,
        build_scenes_from_candidates=build_scenes_from_candidates,
        llm_semantic_resplit_offsets=llm_semantic_resplit_offsets,
        refine_split_points=refine_split_points,
        normalize_split_points=normalize_split_points,
        autofix_split_points=autofix_split_points,
        build_scenes_from_split_points=build_scenes_from_split_points,
        window_rerun_splice=window_rerun_splice,
        merge_bad_boundaries=merge_bad_boundaries,
        merge_for_fragmentation=merge_for_fragmentation,
        quality_report=quality_report,
        is_degenerate_single_scene=is_degenerate_single_scene,
        is_hard_fail_quality=is_hard_fail_quality,
        supervisor_decision_from_quality=supervisor_decision_from_quality,
        llm_can_run=llm_can_run,
        rerun_reason=rerun_reason,
        should_force_retry_by_quality_hints=should_force_retry_by_quality_hints,
        quality_self_signal=quality_self_signal,
        quality_signature=quality_signature,
        update_profile_stats=update_profile_stats,
        save_split_strategy_profile=save_split_strategy_profile,
        ends_with_terminal_punct=ends_with_terminal_punct,
        is_abbrev_or_name_split_at=is_abbrev_or_name_split_at,
        is_quote_continuity_break_at=is_quote_continuity_break_at,
    )

# wrappers to inject missing dependencies for memory_bridge_worker calls

from worker_ingest_repo import (
    load_cached_split_result as _load_cached_split_result_impl,
    load_review_policy as _load_review_policy_impl,
    mark_memory_task_failed as _mark_memory_task_failed_impl,
    load_scene_version_text,
    save_memory_pack,
    mark_memory_task_done,
)
from worker_memory_pack import (
    process_memory_enrich_task as _process_memory_enrich_task_impl,
    llm_memory_pack,
    normalize_memory_pack,
)

# constants for memory enrichment
MEMORY_ENRICH_ALGO_VERSION = "v1"
MAX_MEMORY_TASK_RETRIES = 3


def load_cached_split_result(conn, story_id: int, task_id: int, idempotency_key: str) -> Optional[Dict[str, Any]]:
    """Load cached split result with parse_jsonb injected."""
    return _load_cached_split_result_impl(conn, story_id, task_id, idempotency_key, parse_jsonb)


def load_review_policy(conn, job_id: int) -> Dict[str, float]:
    """Load review policy with parse_jsonb injected."""
    return _load_review_policy_impl(conn, job_id, parse_jsonb)


def process_memory_enrich_task(conn, task: Dict[str, Any]) -> None:
    """Process memory enrichment task with all dependencies injected."""
    return _process_memory_enrich_task_impl(
        conn,
        task,
        memory_enrich_algo_version=MEMORY_ENRICH_ALGO_VERSION,
        load_scene_version_text=load_scene_version_text,
        llm_memory_pack=llm_memory_pack,
        normalize_memory_pack=normalize_memory_pack,
        save_memory_pack=save_memory_pack,
        mark_memory_task_done=mark_memory_task_done,
    )


def mark_memory_task_failed(conn, task_id: int, err: str) -> None:
    """Mark memory task failed with max_retries injected."""
    return _mark_memory_task_failed_impl(conn, task_id, err, max_retries=MAX_MEMORY_TASK_RETRIES)

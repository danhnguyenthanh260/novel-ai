from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import worker_constants as C
import worker_common
from typing import Any, Dict, List, Optional, Tuple
from collections import defaultdict
from worker_common import call_llm_json, get_llm_timeout
from worker_split_anchors import extract_deterministic_anchors

_TRUTH_STRATEGIES = {"S0_BASE", "S3_SEMANTIC_RESPLIT"}


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def _extract_strategy_tokens(text: str, key: str) -> List[str]:
    if not text:
        return []
    pattern = re.compile(
        rf"{key}\s*(?:[:=]\s*|\s+)(S0_BASE|S3_SEMANTIC_RESPLIT)",
        flags=re.IGNORECASE,
    )
    out: List[str] = []
    for m in pattern.finditer(str(text)):
        tok = str(m.group(1) or "").upper().strip()
        if tok in _TRUTH_STRATEGIES and tok not in out:
            out.append(tok)
    return out


def _resolve_truth_strategy_order(
    *,
    ordered: List[str],
    controls_forced_strategy: Optional[str],
    forced_preferred: Optional[str],
    tech_rules: str,
    active_constraints: List[str],
    all_strategies: List[str],
) -> Dict[str, Any]:
    conflicts: List[Dict[str, Any]] = []
    banned_refs: List[Dict[str, str]] = []
    prefer_refs: List[Dict[str, str]] = []

    for s in _extract_strategy_tokens(tech_rules, "BAN_STRATEGY"):
        banned_refs.append({"strategy": s, "rule_ref": f"HUMAN_VERIFIED_GLOBAL_RULE:{s}"})
    for c in active_constraints or []:
        for s in _extract_strategy_tokens(str(c), "BAN_STRATEGY"):
            banned_refs.append({"strategy": s, "rule_ref": f"HUMAN_VERIFIED_CHAPTER_RULE:{s}"})
    for s in _extract_strategy_tokens(tech_rules, "PREFER_STRATEGY"):
        prefer_refs.append({"strategy": s, "rule_ref": f"HUMAN_VERIFIED_GLOBAL_RULE:{s}"})
    for c in active_constraints or []:
        for s in _extract_strategy_tokens(str(c), "PREFER_STRATEGY"):
            prefer_refs.append({"strategy": s, "rule_ref": f"HUMAN_VERIFIED_CHAPTER_RULE:{s}"})

    banned_set = {x["strategy"] for x in banned_refs}
    out = [x for x in ordered if x not in banned_set]
    effective_forced = controls_forced_strategy if controls_forced_strategy in _TRUTH_STRATEGIES else None

    if effective_forced and effective_forced in banned_set:
        winner = next((x for x in banned_refs if x["strategy"] == effective_forced), None)
        conflicts.append(
            {
                "conflict_id": f"forced_vs_ban:{effective_forced}",
                "losing_rule_ref": f"OPERATOR_FORCED_STRATEGY:{effective_forced}",
                "winning_rule_ref": (winner or {}).get("rule_ref") or f"HUMAN_VERIFIED_RULE:{effective_forced}",
                "resolution_mode": "HIERARCHY",
                "resolution_reason": "Hard policy ban overrides forced strategy.",
                "strategy": effective_forced,
            }
        )
        effective_forced = None

    if effective_forced:
        out = [effective_forced]
    else:
        preferred = next((p for p in prefer_refs if p["strategy"] in out), None)
        if preferred:
            out = [preferred["strategy"]] + [x for x in out if x != preferred["strategy"]]
        elif forced_preferred and forced_preferred in out:
            out = [forced_preferred] + [x for x in out if x != forced_preferred]
        elif forced_preferred and forced_preferred in banned_set:
            winner = next((x for x in banned_refs if x["strategy"] == forced_preferred), None)
            conflicts.append(
                {
                    "conflict_id": f"inferred_vs_ban:{forced_preferred}",
                    "losing_rule_ref": f"AGENT_INFERRED_HINT:{forced_preferred}",
                    "winning_rule_ref": (winner or {}).get("rule_ref") or f"HUMAN_VERIFIED_RULE:{forced_preferred}",
                    "resolution_mode": "HIERARCHY",
                    "resolution_reason": "Hard policy ban overrides inferred strategy hint.",
                    "strategy": forced_preferred,
                }
            )

    if not out:
        fallback = [s for s in all_strategies if s not in banned_set]
        out = fallback[:1] or ["S0_BASE"]

    return {
        "ordered": out,
        "effective_forced_strategy": effective_forced,
        "banned_strategies": sorted(list(banned_set)),
        "preferred_rules": prefer_refs,
        "conflicts": conflicts,
        "priority_matrix_version": "truth_v1",
    }


def _zero_strategy_stats(strategies: List[str]) -> Dict[str, Dict[str, float]]:
    return {
        s: {
            "total_runs": 0.0,
            "win_count": 0.0,
            "total_boundaries": 0.0,
            "total_hard_flags": 0.0,
            "score": 0.5,
        }
        for s in strategies
    }


def _decay_strategy_stats(stats: Dict[str, Dict[str, float]], factor: float) -> Dict[str, Dict[str, float]]:
    f = max(0.1, min(1.0, float(factor or 1.0)))
    if f >= 0.9999:
        return {k: dict(v) for k, v in stats.items()}
    out: Dict[str, Dict[str, float]] = {}
    for k, v in stats.items():
        tr = max(0.0, float(v.get("total_runs") or 0.0) * f)
        wc = max(0.0, float(v.get("win_count") or 0.0) * f)
        tb = max(0.0, float(v.get("total_boundaries") or 0.0) * f)
        th = max(0.0, float(v.get("total_hard_flags") or 0.0) * f)
        out[k] = {
            "total_runs": tr,
            "win_count": wc,
            "total_boundaries": tb,
            "total_hard_flags": th,
            "score": (wc + 1.0) / (tr + 2.0),
        }
    return out


def _safe_text(value: Any, max_len: int = 400) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    return text[:max_len]


def _string_list(value: Any, max_items: int = 20, max_len: int = 120) -> List[str]:
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for raw in value:
        text = _safe_text(raw, max_len)
        if not text or text in out:
            continue
        out.append(text)
        if len(out) >= max_items:
            break
    return out


def _merge_valid_spans_from_beats(beats: List[Dict[str, Any]], chapter_chars: int) -> List[Tuple[int, int]]:
    spans: List[Tuple[int, int]] = []
    for beat in beats:
        try:
            start = int(beat.get("start_char") or 0)
            end = int(beat.get("end_char") or 0)
        except Exception:
            continue
        start = max(0, min(chapter_chars, start))
        end = max(0, min(chapter_chars, end))
        if start < end:
            spans.append((start, end))
    if not spans:
        return []
    spans.sort(key=lambda x: x[0])
    merged: List[Tuple[int, int]] = []
    for start, end in spans:
        if not merged:
            merged.append((start, end))
            continue
        prev_start, prev_end = merged[-1]
        if start <= prev_end:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))
    return merged


def _non_ws_char_count(text: str) -> int:
    return sum(1 for ch in text if not ch.isspace())


def validate_outline_coverage(outline: Dict[str, Any], chapter_text: str) -> Dict[str, Any]:
    chapter_chars = len(chapter_text or "")
    if chapter_chars <= 0:
        return {
            "chapter_chars": 0,
            "covered_chars": 0,
            "coverage_ratio": 1.0,
            "chapter_non_ws_chars": 0,
            "covered_non_ws_chars": 0,
            "coverage_ratio_non_ws": 1.0,
            "passes_gate": True,
            "gate_threshold": 0.99,
        }
    beats = list(outline.get("beats") or [])
    return _outline_coverage(
        beats=beats,
        chapter_chars=chapter_chars,
        gate_threshold=0.99,
        chapter_text=chapter_text,
    )


def _context_hash_payload(*, context_window: Dict[str, Any], controls: Dict[str, Any], active_constraints: List[str], chapter_id: str) -> Dict[str, Any]:
    return {
        "chapter_id": _safe_text(chapter_id, 120),
        "runtime_mode": _safe_text(controls.get("runtime_mode"), 40) or "DEFAULT",
        "context_pack_version": _safe_text(controls.get("context_pack_version"), 64) or "context_pack_v1",
        "preference_rule_version": _safe_text(controls.get("preference_rule_version"), 64) or "pref_rule_v1",
        "story_summary": _safe_text(context_window.get("story_summary"), 1200),
        "arc_context": _safe_text(context_window.get("arc_context"), 1200),
        "approved_context_ids": _string_list(context_window.get("approved_context_ids"), max_items=20, max_len=120),
        "golden_chapter_ids": _string_list(context_window.get("golden_chapter_ids"), max_items=20, max_len=120),
        "pacing_metadata": context_window.get("pacing_metadata") if isinstance(context_window.get("pacing_metadata"), dict) else {},
        "active_constraints": [_safe_text(x, 300) for x in (active_constraints or [])][:20],
    }


def _stable_context_hash(*, context_window: Dict[str, Any], controls: Dict[str, Any], active_constraints: List[str], chapter_id: str) -> str:
    payload = _context_hash_payload(
        context_window=context_window,
        controls=controls,
        active_constraints=active_constraints,
        chapter_id=chapter_id,
    )
    canonical = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _outline_max_tokens(chapter_chars: int) -> int:
    dynamic = int((max(1, int(chapter_chars)) + 19) / 20)
    return max(700, min(2400, dynamic))


def _env_float(name: str, default: float, lo: float, hi: float) -> float:
    try:
        value = float(str(os.getenv(name, str(default))).strip() or str(default))
    except Exception:
        value = float(default)
    return max(float(lo), min(float(hi), float(value)))


def _split_pipeline_v2_enabled(story_id: int, controls: Dict[str, Any]) -> bool:
    explicit = controls.get("split_pipeline_v2_enabled")
    if isinstance(explicit, bool):
        return explicit
    if isinstance(explicit, (int, float)):
        return bool(int(explicit))
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip().lower() in ("1", "true", "yes", "on")

    global_enabled = str(os.getenv("SPLIT_PIPELINE_V2_ENABLED", "0")).strip().lower() in ("1", "true", "yes", "on")
    if not global_enabled:
        return False
    allowlist_raw = str(os.getenv("SPLIT_PIPELINE_V2_STORY_ALLOWLIST", "")).strip()
    if not allowlist_raw:
        return True
    allowlist = {item.strip() for item in allowlist_raw.split(",") if item.strip()}
    return str(int(story_id)) in allowlist


def _split_anchor_v11_enabled(story_id: int) -> bool:
    if not bool(getattr(C, "SPLIT_ANCHOR_ENABLE", False)):
        return False
    global_enabled = str(os.getenv("SPLIT_DETERMINISTIC_ANCHOR_V1_1_ENABLED", "0")).strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if not global_enabled:
        return False
    allowlist_raw = str(os.getenv("SPLIT_DETERMINISTIC_ANCHOR_V1_1_STORY_ALLOWLIST", "")).strip()
    if not allowlist_raw:
        return True
    allowlist = {item.strip() for item in allowlist_raw.split(",") if item.strip()}
    return str(int(story_id)) in allowlist


def _strip_conflicting_anchor_kwargs(res_kwargs: Dict[str, Any]) -> Dict[str, Any]:
    clean = dict(res_kwargs or {})
    clean.pop("hard_anchor_positions", None)
    clean.pop("hard_anchor_tolerance_chars", None)
    return clean


def _split_phase_budgets_from_env() -> Dict[str, float]:
    total = _env_float("SPLIT_TOTAL_BUDGET_SEC", 180.0, 30.0, 1800.0)
    outline = _env_float("SPLIT_OUTLINE_BUDGET_SEC", 55.0, 5.0, total)
    primary = _env_float("SPLIT_PRIMARY_BUDGET_SEC", 95.0, 5.0, total)
    repair = _env_float("SPLIT_REPAIR_BUDGET_SEC", 30.0, 0.0, total)
    return {
        "total_budget_sec": float(total),
        "outline_budget_sec": float(outline),
        "primary_budget_sec": float(primary),
        "repair_budget_sec": float(repair),
    }


def _budget_profile_for_chapter(chapter_chars: int, retry_profile_used: Optional[str]) -> str:
    if retry_profile_used in ("auto_recovery_budget", "auto_recovery_artifact"):
        return "retry_recovery"
    if chapter_chars > 14000:
        return "long_high_risk"
    if chapter_chars > 13000:
        return "long"
    if chapter_chars > 7000:
        return "medium"
    return "short"


def _resolve_phase_budgets(
    *,
    chapter_chars: int,
    split_controls: Optional[Dict[str, Any]],
    env_budgets: Dict[str, float],
    retry_profile_used: Optional[str],
    previous_result_runtime: Optional[Dict[str, Any]] = None,
    issue_hints: Optional[Dict[str, Any]] = None,
    constraint_pack_mode: Optional[str] = None,
    constraint_pack_stats: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, float], str]:
    controls = split_controls if isinstance(split_controls, dict) else {}
    profile = _budget_profile_for_chapter(chapter_chars, retry_profile_used)
    hints = issue_hints if isinstance(issue_hints, dict) else {}
    runtime = previous_result_runtime if isinstance(previous_result_runtime, dict) else {}
    pack_mode = str(constraint_pack_mode or "").strip().lower()
    pack_stats = constraint_pack_stats if isinstance(constraint_pack_stats, dict) else {}
    queue_pressure_high = bool(
        controls.get("queue_pressure_high")
        or controls.get("backlog_high")
        or controls.get("degrade_by_load")
    )
    scene_overdense = float(hints.get("SCENE_OVERDENSE") or 0.0)
    narrative_weight = float(hints.get("NARRATIVE_WEIGHT") or 0.0)
    risk_from_hints = scene_overdense >= 4.5 or narrative_weight >= 4.0
    runtime_budget_signal = bool(_budget_preempt_signal_from_runtime(runtime))
    raw_constraints = int(pack_stats.get("raw_constraints_count") or 0)
    dedup_constraints = int(pack_stats.get("dedup_constraints_count") or 0)
    injected_constraints = int(pack_stats.get("injected_constraints_count") or 0)
    strict_pack = (
        pack_mode in ("full", "minimal_long_chapter")
        and (raw_constraints >= 5 or dedup_constraints >= 10 or injected_constraints >= 5)
    )
    high_risk_long = (
        int(chapter_chars or 0) >= 14000
        and not queue_pressure_high
        and (runtime_budget_signal or risk_from_hints or strict_pack)
    )
    if profile == "long_high_risk" and not high_risk_long:
        profile = "long"
    elif profile == "long" and high_risk_long:
        profile = "long_high_risk"

    factor = 1.0
    if profile == "medium":
        factor = 1.2
    elif profile == "long":
        factor = 1.85
    elif profile == "long_high_risk":
        factor = 1.75
    elif profile == "retry_recovery":
        factor = 1.75
    total_default = float(env_budgets.get("total_budget_sec") or 180.0) * factor
    outline_default = float(env_budgets.get("outline_budget_sec") or 55.0) * factor
    primary_default = float(env_budgets.get("primary_budget_sec") or 95.0) * factor
    repair_default = float(env_budgets.get("repair_budget_sec") or 30.0) * factor

    def _num(name: str, default: float) -> float:
        raw = controls.get(name)
        try:
            if raw is None:
                return float(default)
            return float(raw)
        except Exception:
            return float(default)

    budgets = {
        "total_budget_sec": max(30.0, _num("total_budget_sec", total_default)),
        "outline_budget_sec": max(5.0, _num("outline_budget_sec", outline_default)),
        "primary_budget_sec": max(5.0, _num("primary_budget_sec", primary_default)),
        "repair_budget_sec": max(0.0, _num("repair_budget_sec", repair_default)),
    }
    # Long chapter guardrail: default 300-360s, retry-budget override can extend to 600s.
    if profile in ("long", "long_high_risk", "retry_recovery") and chapter_chars > 10000:
        retry_override = (
            str(retry_profile_used or "").strip() == "auto_recovery_budget"
            or bool(controls.get("recovery_override"))
        )
        if profile == "long_high_risk":
            total_cap = 600.0
        else:
            total_cap = 600.0 if retry_override else 360.0
        budgets["total_budget_sec"] = max(300.0, min(total_cap, float(budgets.get("total_budget_sec") or 300.0)))
        # Preserve phase floors while ensuring no phase monopolizes total budget.
        budgets["outline_budget_sec"] = max(55.0, min(float(budgets["total_budget_sec"]) * 0.35, float(budgets["outline_budget_sec"])))
        budgets["primary_budget_sec"] = max(120.0, min(float(budgets["total_budget_sec"]) * 0.70, float(budgets["primary_budget_sec"])))
        budgets["repair_budget_sec"] = max(20.0, min(float(budgets["total_budget_sec"]) * 0.30, float(budgets["repair_budget_sec"])))
        if profile == "long_high_risk":
            budgets["total_budget_sec"] = max(600.0, float(budgets["total_budget_sec"]))
            budgets["outline_budget_sec"] = max(120.0, float(budgets["outline_budget_sec"]))
            budgets["primary_budget_sec"] = max(360.0, float(budgets["primary_budget_sec"]))
            budgets["repair_budget_sec"] = max(180.0, float(budgets["repair_budget_sec"]))
    return budgets, profile


def _budget_preempt_signal_from_runtime(previous_result_runtime: Optional[Dict[str, Any]]) -> str:
    runtime = previous_result_runtime if isinstance(previous_result_runtime, dict) else {}
    phase_stop_reason = str(runtime.get("phase_stop_reason") or "").upper()
    stop_reason = str(runtime.get("stop_reason") or "").upper()
    if "BUDGET_EXCEEDED" in phase_stop_reason:
        return "PHASE_STOP_BUDGET_EXCEEDED"
    if stop_reason == "TIME_BUDGET_PREEMPTED":
        return "STOP_TIME_BUDGET_PREEMPTED"
    reason_codes = runtime.get("reason_codes")
    if isinstance(reason_codes, list):
        for code in reason_codes:
            c = str(code).strip().upper()
            if c == "BUDGET_DEGRADE_PATH_TAKEN":
                return "REASON_CODE_BUDGET_DEGRADE_PATH"
    degrade_reason = str(runtime.get("degrade_reason_code") or "").strip().upper()
    if degrade_reason == "BUDGET_DEGRADE_PATH_TAKEN":
        return "DEGRADE_REASON_BUDGET_PATH"
    return ""


def _budget_recovery_guard_reason(
    controls: Optional[Dict[str, Any]],
    previous_result_runtime: Optional[Dict[str, Any]],
    chapter_chars: int,
) -> str:
    if not bool(getattr(C, "SPLIT_BUDGET_GUARD_ENABLED", False)):
        return ""
    if int(chapter_chars or 0) < int(getattr(C, "SPLIT_BUDGET_GUARD_MIN_CHARS", 9000) or 9000):
        return ""
    obj = controls if isinstance(controls, dict) else {}
    retry_profile_used = str(obj.get("retry_profile_used") or obj.get("retry_profile") or "").strip()
    if retry_profile_used == "auto_recovery_budget":
        return ""
    runtime_reason = _budget_preempt_signal_from_runtime(previous_result_runtime)
    if runtime_reason:
        return runtime_reason
    retry_root_cause = str(obj.get("retry_root_cause") or "").strip().upper()
    if retry_root_cause == "BUDGET":
        return "RETRY_ROOT_CAUSE_BUDGET"
    return ""


def _should_force_budget_recovery_from_runtime(
    controls: Optional[Dict[str, Any]],
    previous_result_runtime: Optional[Dict[str, Any]],
    chapter_chars: int,
) -> bool:
    return bool(_budget_recovery_guard_reason(controls, previous_result_runtime, chapter_chars))


def _should_enable_one_pass_recovery(
    *,
    budget_profile: str,
    controls: Optional[Dict[str, Any]],
) -> bool:
    if str(budget_profile or "").strip() != "long_high_risk":
        return False
    obj = controls if isinstance(controls, dict) else {}
    if bool(obj.get("disable_one_pass_recovery")):
        return False
    return True


def _runtime_diagnosis(
    *,
    phase_stop_reason: str,
    stop_reason: str,
    degrade_reason_code: str,
    artifact_status: str,
    oversized_count: int,
    rerun_reason: str,
) -> Tuple[str, str, float, str]:
    stop = str(phase_stop_reason or "").upper()
    stop2 = str(stop_reason or "").upper()
    degrade = str(degrade_reason_code or "").upper()
    rerun = str(rerun_reason or "").upper()
    if "OUTLINE" in stop or "OUTLINE" in rerun:
        return ("OUTLINE", "RETRY_WITH_OUTLINE_RECOVERY", 0.92, "RUNBOOK_SPLIT_OUTLINE_COVERAGE")
    if (
        "BUDGET" in stop
        or "TIME_BUDGET" in stop2
        or "BUDGET_DEGRADE_PATH_TAKEN" in degrade
        or "TIME_BUDGET" in rerun
    ):
        return ("BUDGET", "RETRY_WITH_BUDGET_RECOVERY", 0.9, "RUNBOOK_SPLIT_BUDGET_PREEMPTION")
    artifact_not_ready = str(artifact_status).upper() != "READY_FOR_ANALYSIS"
    rerun_artifact_not_ready = "ARTIFACT_NOT_READY" in rerun
    if artifact_not_ready or oversized_count > 0 or rerun_artifact_not_ready:
        if oversized_count > 0:
            return ("ARTIFACT", "RETRY_WITH_ARTIFACT_RECOVERY", 0.95, "RUNBOOK_SPLIT_ARTIFACT_OVERSIZED")
        if artifact_not_ready:
            return ("ARTIFACT", "RETRY_WITH_ARTIFACT_RECOVERY", 0.82, "RUNBOOK_SPLIT_ARTIFACT_COVERAGE_GAP")
        return ("ARTIFACT", "RETRY_WITH_ARTIFACT_RECOVERY", 0.82, "RUNBOOK_SPLIT_ARTIFACT_NOT_READY")
    return ("UNKNOWN", "RETRY_AFTER_LLM_HEALTH_CHECK", 0.55, "RUNBOOK_SPLIT_GENERIC_TRIAGE")


def _outline_prompt_excerpt(chapter_text: str, cap_chars: int = 36000) -> Tuple[str, bool]:
    text = str(chapter_text or "")
    cap = max(4000, int(cap_chars))
    if len(text) <= cap:
        return text, False
    head_len = int(cap * 0.45)
    mid_len = int(cap * 0.10)
    tail_len = cap - head_len - mid_len
    mid_start = max(0, (len(text) // 2) - (mid_len // 2))
    mid_end = min(len(text), mid_start + mid_len)
    excerpt = (
        text[:head_len]
        + "\n\n[[... MIDDLE_EXCERPT ...]]\n\n"
        + text[mid_start:mid_end]
        + "\n\n[[... TAIL_EXCERPT ...]]\n\n"
        + text[-tail_len:]
    )
    return excerpt, True


def _coerce_outline_beats(raw: Any, chapter_chars: int) -> Tuple[List[Dict[str, Any]], bool]:
    beats_raw = raw if isinstance(raw, list) else []
    beats_pre: List[Dict[str, Any]] = []
    for idx, item in enumerate(beats_raw, start=1):
        if not isinstance(item, dict):
            continue
        label = _safe_text(item.get("label") or item.get("title") or f"beat_{idx}", 240) or f"beat_{idx}"
        try:
            start = int(item.get("start_char"))
            end = int(item.get("end_char"))
        except Exception:
            continue
        start = max(0, min(chapter_chars, start))
        end = max(0, min(chapter_chars, end))
        if end <= start:
            continue
        confidence = max(0.0, min(1.0, float(item.get("confidence") or 0.0)))
        beats_pre.append(
            {
                "label": label,
                "start_char": start,
                "end_char": end,
                "confidence": round(confidence, 4),
            }
        )
    beats_pre.sort(key=lambda x: (int(x.get("start_char") or 0), int(x.get("end_char") or 0)))
    beats: List[Dict[str, Any]] = []
    overlap_detected = False
    prev_end = 0
    for idx, beat in enumerate(beats_pre, start=1):
        start = int(beat.get("start_char") or 0)
        end = int(beat.get("end_char") or 0)
        if start < prev_end:
            overlap_detected = True
            start = prev_end
        if end <= start:
            continue
        beats.append(
            {
                "id": f"b{idx:02d}",
                "label": beat.get("label"),
                "start_char": start,
                "end_char": end,
                "confidence": beat.get("confidence"),
            }
        )
        prev_end = end

    # Gap Coercion
    if beats:
        if beats[0]["start_char"] > 0:
            beats[0]["start_char"] = 0
            
        for i in range(1, len(beats)):
            if beats[i-1]["end_char"] < beats[i]["start_char"]:
                beats[i-1]["end_char"] = beats[i]["start_char"]
                
        if beats[-1]["end_char"] < chapter_chars:
            beats[-1]["end_char"] = chapter_chars

    return beats, overlap_detected


def _outline_coverage(
    beats: List[Dict[str, Any]],
    chapter_chars: int,
    gate_threshold: float = 0.99,
    chapter_text: Optional[str] = None,
) -> Dict[str, Any]:
    chapter_chars = max(1, int(chapter_chars))
    merged = _merge_valid_spans_from_beats(beats, chapter_chars)
    covered = sum((end - start) for start, end in merged)
    ratio = float(covered) / float(chapter_chars)

    chapter_non_ws_chars = 0
    covered_non_ws_chars = 0
    ratio_non_ws = ratio
    passes_gate = bool(ratio >= gate_threshold)
    if isinstance(chapter_text, str):
        chapter_non_ws_chars = _non_ws_char_count(chapter_text)
        if chapter_non_ws_chars <= 0:
            chapter_non_ws_chars = 0
            covered_non_ws_chars = 0
            ratio_non_ws = 1.0
            passes_gate = True
        else:
            for start, end in merged:
                covered_non_ws_chars += _non_ws_char_count(chapter_text[start:end])
            ratio_non_ws = float(covered_non_ws_chars) / float(chapter_non_ws_chars)
            passes_gate = bool(ratio_non_ws >= gate_threshold)

    return {
        "chapter_chars": chapter_chars,
        "covered_chars": int(covered),
        "coverage_ratio": round(ratio, 6),
        "chapter_non_ws_chars": int(chapter_non_ws_chars),
        "covered_non_ws_chars": int(covered_non_ws_chars),
        "coverage_ratio_non_ws": round(ratio_non_ws, 6),
        "passes_gate": passes_gate,
        "gate_threshold": gate_threshold,
    }


def extract_structural_outline(
    *,
    chapter_text: str,
    chapter_id: str,
    max_retries: int = 2,
    temperature: float = 0.1,
) -> Dict[str, Any]:
    chapter_chars = len(chapter_text or "")
    max_tokens = _outline_max_tokens(chapter_chars)
    prompt_text_excerpt, prompt_excerpted = _outline_prompt_excerpt(chapter_text, cap_chars=36000)
    last_error = ""
    missing_ranges_note = ""
    last_beats: List[Dict[str, Any]] = []
    gate_threshold = 0.97
    last_coverage_ratio = 0.0
    last_coverage_ratio_non_ws = 0.0
    last_overlap_detected = False
    for attempt in range(0, max_retries + 1):
        prompt = (
            "You are an outline extractor.\n"
            "Extract a structural beat map that covers the full chapter with char spans.\n"
            "Output strict JSON only with shape:\n"
            "{\n"
            '  "beats":[{"label":"...","start_char":0,"end_char":100,"confidence":0.9}],\n'
            '  "notes":"..."\n'
            "}\n"
            "Rules:\n"
            "- beats must be non-empty and ordered along chapter flow\n"
            "- start_char/end_char must be valid integer offsets over chapter text\n"
            "- avoid overlaps; cover full chapter structure, not only highlighted parts\n"
            "- output compact JSON; do not add narrative prose\n"
            f"- chapter_id: {chapter_id}\n"
            f"- chapter_chars: {chapter_chars}\n"
            f"{missing_ranges_note}\n"
            "CHAPTER_TEXT:\n"
            f"{prompt_text_excerpt}"
        )
        try:
            out = worker_common.call_llm_json(
                messages=[
                    {"role": "system", "content": "You output strict JSON only."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=max_tokens,
                temperature=temperature,
                timeout_sec=180,
                raise_on_error=True,
            )
            beats, overlap_detected = _coerce_outline_beats(out.get("beats"), chapter_chars)
            last_beats = beats[:]
            coverage = _outline_coverage(beats, chapter_chars, gate_threshold=gate_threshold, chapter_text=chapter_text)
            last_coverage_ratio = float(coverage.get("coverage_ratio") or 0.0)
            last_coverage_ratio_non_ws = float(coverage.get("coverage_ratio_non_ws") or 0.0)
            last_overlap_detected = bool(overlap_detected)
            if coverage.get("passes_gate") and beats:
                return {
                    "version": "v1",
                    "beats": beats,
                    "coverage": coverage,
                    "generation": {
                        "model_call_used": attempt + 1,
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                        "prompt_chars": len(prompt),
                        "prompt_excerpted": bool(prompt_excerpted),
                    },
                }
            # Retry with concrete gap hint.
            missing_ranges_note = (
                "COVERAGE_RETRY: previous extraction did not pass coverage/non-overlap gate. "
                f"Current coverage_ratio={coverage.get('coverage_ratio')}, "
                f"coverage_ratio_non_ws={coverage.get('coverage_ratio_non_ws')}, "
                f"threshold={gate_threshold}, overlap_detected={overlap_detected}. "
                "Expand beats to include missing spans and remove overlaps."
            )
            last_error = "OUTLINE_COVERAGE_FAIL"
        except Exception as err:
            last_error = str(err)[:240]
            missing_ranges_note = f"PARSE_RETRY: previous call failed: {last_error}"

    raise ValueError(
        "OUTLINE_COVERAGE_FAIL:"
        f"ratio={round(float(last_coverage_ratio), 6)};"
        f"ratio_non_ws={round(float(last_coverage_ratio_non_ws), 6)};"
        f"threshold={gate_threshold};"
        f"overlap={str(bool(last_overlap_detected)).lower()};"
        f"last_error={last_error or 'unknown'}"
    )


def _build_analysis_chunk_artifact(
    *,
    chapter_id: str,
    split_task_id: Optional[int],
    strategy: str,
    chapter_text: str,
    scenes: List[Dict[str, Any]],
    structural_outline: Dict[str, Any],
    max_chunk_chars: int = 4000,
    repair_attempted: bool = False,
) -> Dict[str, Any]:
    chapter_chars = len(chapter_text or "")
    coverage = _outline_coverage(
        structural_outline.get("beats") if isinstance(structural_outline, dict) else [],
        chapter_chars,
        gate_threshold=0.99,
        chapter_text=chapter_text,
    )
    chunks: List[Dict[str, Any]] = []
    violations: List[str] = []
    for idx, scene in enumerate(scenes or [], start=1):
        try:
            start = int(scene.get("start") or 0)
            end = int(scene.get("end") or 0)
        except Exception:
            continue
        start = max(0, min(chapter_chars, start))
        end = max(start, min(chapter_chars, end))
        if end <= start:
            continue
        chunk_text = chapter_text[start:end]
        chars = len(chunk_text)
        if chars > int(max_chunk_chars):
            violations.append(f"CHUNK_OVERSIZED:{idx}:{chars}>{int(max_chunk_chars)}")
        chunk_id = f"{chapter_id}:c{idx:02d}"
        chunk_obj = {
            "chunk_id": chunk_id,
            "order": idx,
            "start_char": start,
            "end_char": end,
            "scene_refs": [int(scene.get("idx") or idx)],
            "beat_refs": [],
            "text_hash": hashlib.sha256(chunk_text.encode("utf-8")).hexdigest(),
            "chunk_text": chunk_text,
            "quality": {
                "chars": chars,
                "has_unclosed_quote": bool((chunk_text.count('"') % 2) != 0),
            },
        }
        chunks.append(chunk_obj)

    if not chunks:
        violations.append("NO_CHUNKS")
    if not bool(coverage.get("passes_gate")):
        violations.append("OUTLINE_COVERAGE_GATE_FAIL")
    status = "READY_FOR_ANALYSIS" if not violations else "NOT_READY"
    oversized_vals: List[int] = []
    for item in violations:
        if not str(item).startswith("CHUNK_OVERSIZED:"):
            continue
        try:
            observed = int(str(item).split(":")[2].split(">")[0])
            oversized_vals.append(observed)
        except Exception:
            continue
    diagnostics = {
        "oversized_count": int(sum(1 for x in violations if str(x).startswith("CHUNK_OVERSIZED:"))),
        "max_chunk_chars_observed": int(max(oversized_vals) if oversized_vals else 0),
        "repair_attempted": bool(repair_attempted),
        "repair_exhausted": bool(repair_attempted and any(str(x).startswith("CHUNK_OVERSIZED:") for x in violations)),
    }
    return {
        "version": "v1",
        "chapter_id": chapter_id,
        "source": {
            "split_task_id": int(split_task_id or 0),
            "strategy": str(strategy or "S3_SEMANTIC_RESPLIT"),
            "outline_version": str((structural_outline or {}).get("version") or "v1"),
        },
        "chunks": chunks,
        "coverage": coverage,
        "status": status,
        "violations": violations,
        "max_chunk_chars": int(max_chunk_chars),
        "diagnostics": diagnostics,
    }


def _load_recent_approved_chapter_ids(conn, story_id: int, chapter_id: str, limit: int = 3) -> List[str]:
    out: List[str] = []
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT chapter_id::text
            FROM public.supervisor_memory
            WHERE story_id = %s
              AND human_outcome = 'APPROVED_HUMAN'
              AND COALESCE(chapter_id, '') <> ''
              AND chapter_id <> %s
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
            LIMIT %s
            """,
            (story_id, chapter_id, max(1, int(limit or 3))),
        )
        rows = cur.fetchall()
    except Exception:
        return []
    finally:
        cur.close()
    for row in rows or []:
        cid = _safe_text((row[0] if isinstance(row, (list, tuple)) and row else row), 120)
        if cid and cid not in out:
            out.append(cid)
    return out


def _vet_context_window(conn, story_id: int, chapter_id: str, context_window: Dict[str, Any]) -> Dict[str, Any]:
    story_summary = _safe_text(context_window.get("story_summary"), 2400)
    arc_context = _safe_text(context_window.get("arc_context"), 2400)
    approved_ids = _string_list(context_window.get("approved_context_ids"), max_items=3, max_len=120)
    golden_ids = _string_list(context_window.get("golden_chapter_ids"), max_items=3, max_len=120)
    pacing_metadata = context_window.get("pacing_metadata") if isinstance(context_window.get("pacing_metadata"), dict) else {}

    source = "provided_approved"
    if not approved_ids:
        approved_ids = _load_recent_approved_chapter_ids(conn, story_id=story_id, chapter_id=chapter_id, limit=3)
        source = "recent_approved_fallback"
    if not approved_ids and golden_ids:
        approved_ids = list(golden_ids[:3])
        source = "golden_fallback"

    return {
        "story_summary": story_summary,
        "arc_context": arc_context,
        "approved_context_ids": approved_ids,
        "golden_chapter_ids": golden_ids,
        "pacing_metadata": pacing_metadata,
        "context_vetting": {
            "source": source,
            "approved_count": len(approved_ids),
            "golden_count": len(golden_ids),
        },
    }


def manual_scene_ranges(chapter_text: str) -> List[Tuple[int, int, str]]:
    raw = chapter_text
    heading_matches = list(re.finditer(r"^\s*##\s*Scene\b.*$", raw, flags=re.IGNORECASE | re.MULTILINE))
    ranges: List[Tuple[int, int, str]] = []
    if heading_matches:
        for idx, cur in enumerate(heading_matches):
            start = cur.end()
            end = heading_matches[idx + 1].start() if idx + 1 < len(heading_matches) else len(raw)
            if end > start and raw[start:end].strip():
                ranges.append((start, end, "manual scene heading"))
        return ranges

    sep_matches = list(re.finditer(r"^\s*---\s*$", raw, flags=re.MULTILINE))
    if sep_matches:
        start = 0
        for sep in sep_matches:
            end = sep.start()
            if end > start and raw[start:end].strip():
                ranges.append((start, end, "manual separator"))
            start = sep.end()
        if len(raw) > start and raw[start:].strip():
            ranges.append((start, len(raw), "manual separator"))
        return ranges

    trimmed = raw.strip()
    if not trimmed:
        return []
    left = raw.find(trimmed)
    right = left + len(trimmed)
    return [(left, right, "manual fallback")]


def build_manual_split_proposal(
    chapter_text: str,
    chapter_no: Optional[int],
    repair_report: Optional[Dict[str, Any]],
    *,
    reprocess_note: Optional[str] = None,
    previous_split_contexts: Optional[List[str]] = None,
    build_chapter_id,
    chapter_title_from_text,
    scene_title_summary,
    quality_report,
    supervisor_decision_from_quality,
    ends_with_terminal_punct,
    is_abbrev_or_name_split_at,
    is_quote_continuity_break_at,
) -> Dict[str, Any]:
    chapter_id = build_chapter_id(chapter_no)
    chapter_title = chapter_title_from_text(chapter_text, chapter_id)
    ranges = manual_scene_ranges(chapter_text)
    scenes: List[Dict[str, Any]] = []
    for idx, (start, end, reason) in enumerate(ranges, start=1):
        scene_text = chapter_text[start:end].strip()
        if not scene_text:
            continue
        title, summary = scene_title_summary(scene_text, idx)
        scenes.append(
            {
                "idx": idx,
                "start": start,
                "end": end,
                "title": title,
                "summary": summary,
                "reason": reason,
                "scene_text_sha256": hashlib.sha256(scene_text.encode("utf-8")).hexdigest(),
            }
        )

    if not scenes:
        title, summary = scene_title_summary(chapter_text, 1)
        scenes = [
            {
                "idx": 1,
                "start": 0,
                "end": len(chapter_text),
                "title": title,
                "summary": summary,
                "reason": "manual fallback single scene",
                "scene_text_sha256": hashlib.sha256(chapter_text.strip().encode("utf-8")).hexdigest(),
            }
        ]

    quality = quality_report(
        chapter_text,
        scenes,
        C.SPLIT_FRAGMENT_SHORT_CHARS,
        C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
        C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
        C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
        ends_with_terminal_punct,
        is_abbrev_or_name_split_at,
        is_quote_continuity_break_at,
        C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
        C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
    )
    supervisor_decision = supervisor_decision_from_quality(
        quality,
        False,  # enforce_mid_word_gate
        C.SPLIT_FRAGMENT_SCORE_RETRY_THRESHOLD,
        C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
        C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
        C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
        C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
        C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
    )
    manual_outline = {
        "version": "v1_manual",
        "beats": [
            {
                "id": f"b{idx:02d}",
                "label": str(sc.get("title") or f"beat_{idx}"),
                "start_char": int(sc.get("start") or 0),
                "end_char": int(sc.get("end") or 0),
                "confidence": 1.0,
            }
            for idx, sc in enumerate(scenes, start=1)
        ],
    }
    analysis_chunk_artifact = _build_analysis_chunk_artifact(
        chapter_id=chapter_id,
        split_task_id=None,
        strategy="S0_BASE",
        chapter_text=chapter_text,
        scenes=scenes,
        structural_outline=manual_outline,
        max_chunk_chars=4000,
    )
    reason_codes = [
        str(code).strip()
        for code in (quality.get("hard_fail_reason_codes") if isinstance(quality.get("hard_fail_reason_codes"), list) else [])
        if str(code).strip()
    ]
    if not reason_codes and bool(quality.get("hard_fail")):
        reason_codes.append("HARD_FAIL")
    return {
        "chapter_id": chapter_id,
        "chapter_title": chapter_title,
        "chapter_no": chapter_no,
        "text_basis": "repaired",
        "chapter_text_basis": chapter_text,
        "chapter_text": chapter_text,
        "chapter_text_stats": {"chars": len(chapter_text)},
        "scenes": scenes,
        "algo_version": "split_v1_manual",
        "split_mode": "manual",
        "repair_report": repair_report or {},
        "autofix_report": {"passes": 0, "moved": 0, "merged": 0},
        "quality_report": quality,
        "reason_codes": reason_codes,
        "structural_outline": manual_outline,
        "analysis_chunk_artifact": analysis_chunk_artifact,
        "supervisor_decision": supervisor_decision,
        "supervisor_retry_used": False,
        "proposed_at": int(time.time()),
    }


def build_split_proposal(
    conn,
    chapter_text: str,
    chapter_no: Optional[int],
    story_id: int,
    repair_report: Optional[Dict[str, Any]],
    split_controls: Optional[Dict[str, Any]],
    split_mode: str,
    *,
    reprocess_note: Optional[str] = None,
    previous_split_contexts: Optional[List[str]] = None,
    split_profile_global_key: str,
    split_max_llm_calls_per_chapter: int,
    split_strong_hint_threshold: float,
    split_long_chapter_chars: int,
    split_exploration_rate: float,
    split_profile_chapter_lr: float,
    split_profile_global_lr: float,
    split_profile_history_max: int,
    build_chapter_id,
    chapter_title_from_text,
    split_lock_spans,
    load_split_strategy_profile,
    load_profile_stats,
    profile_confident,
    parse_jsonb,
    load_split_feedback_penalties,
    load_supervisor_strategy_bias,
    load_split_issue_hints,
    issue_strategy_bias,
    aggregate_boundary_type_hints,
    boundary_type_strategy_bias,
    parse_split_controls,
    forced_strategy_from_issue_hints,
    plan_strategy_order,
    best_strategy_from_stats,
    run_auto_split_attempts,
    run_split_attempt,
    extract_split_candidates,
    build_scenes_from_candidates,
    llm_semantic_resplit_offsets,
    refine_split_points,
    normalize_split_points,
    autofix_split_points,
    build_scenes_from_split_points,
    window_rerun_splice,
    merge_bad_boundaries,
    merge_for_fragmentation,
    quality_report,
    is_degenerate_single_scene,
    is_hard_fail_quality,
    supervisor_decision_from_quality,
    llm_can_run,
    rerun_reason,
    should_force_retry_by_quality_hints,
    quality_self_signal,
    quality_signature,
    update_profile_stats,
    save_split_strategy_profile,
    ends_with_terminal_punct,
    is_abbrev_or_name_split_at,
    is_quote_continuity_break_at,
) -> Dict[str, Any]:
    chapter_id = build_chapter_id(chapter_no)
    chapter_title = chapter_title_from_text(chapter_text, chapter_id)
    lock_spans = split_lock_spans(chapter_text)
    controls = parse_split_controls(split_controls)
    retry_profile_used = str(controls.get("retry_profile_used") or controls.get("retry_profile") or "").strip() or None
    previous_result_runtime = (
        controls.get("previous_result_runtime")
        if isinstance(controls.get("previous_result_runtime"), dict)
        else {}
    )
    budget_guard_reason = _budget_recovery_guard_reason(
        controls,
        previous_result_runtime if isinstance(previous_result_runtime, dict) else {},
        len(chapter_text or ""),
    )
    budget_recovery_guard_applied = bool(
        _should_force_budget_recovery_from_runtime(
            controls,
            previous_result_runtime if isinstance(previous_result_runtime, dict) else {},
            len(chapter_text or ""),
        )
    )
    retry_profile_effective = (
        "auto_recovery_budget"
        if budget_recovery_guard_applied
        else retry_profile_used
    )
    recovery_path_mode = "guard_forced" if budget_recovery_guard_applied else "explicit_profile"
    recovery_override = bool(controls.get("recovery_override"))
    retry_root_cause = str(controls.get("retry_root_cause") or "").strip().upper()
    previous_operational_state_reason = str(
        (previous_result_runtime or {}).get("operational_state_reason")
        if isinstance(previous_result_runtime, dict)
        else ""
    ).strip().upper()
    artifact_recovery_requested = bool(
        retry_root_cause == "ARTIFACT"
        or "ARTIFACT_NOT_READY_CHUNK_OVERSIZED" in previous_operational_state_reason
    )
    context_window_raw = controls.get("context_window") if isinstance(controls.get("context_window"), dict) else {}
    arc_context_for_constraints = str(context_window_raw.get("arc_context") or "").strip() or None
    
    from worker_profile_learning import (
        load_dictionary_rules,
        load_actionable_constraints,
        load_split_latency_window,
        build_split_constraint_pack,
    )
    tech_rules_raw = load_dictionary_rules(conn, story_id, "technical", chapter_no=chapter_no, context_text=chapter_text)
    active_constraints_raw = load_actionable_constraints(conn, story_id, chapter_id, arc_context=arc_context_for_constraints)
    latency_window = load_split_latency_window(conn, story_id, sample_size=20)
    constraint_pack = build_split_constraint_pack(
        tech_rules_text=tech_rules_raw,
        active_constraints=active_constraints_raw,
        chapter_chars=len(chapter_text or ""),
        latency_window=latency_window,
        retry_profile_used=retry_profile_effective,
        budget_recovery_guard_applied=bool(budget_recovery_guard_applied),
        artifact_recovery_requested=artifact_recovery_requested,
    )
    tech_rules = str(constraint_pack.get("tech_rules_text") or "")
    active_constraints = [str(x) for x in (constraint_pack.get("active_constraints") or []) if str(x).strip()]
    
    profile = load_split_strategy_profile(conn, story_id, chapter_id, parse_jsonb)
    chapter_stats = load_profile_stats(profile)
    global_profile = load_split_strategy_profile(conn, story_id, split_profile_global_key, parse_jsonb)
    global_stats = load_profile_stats(global_profile)
    best_by_signature = parse_jsonb(profile.get("best_by_signature"))
    feedback_penalties = load_split_feedback_penalties(conn, story_id, chapter_id)
    supervisor_strategy_bias = load_supervisor_strategy_bias(conn, story_id, chapter_id)
    issue_hints_explicit, issue_hints_inferred, issue_hints = load_split_issue_hints(conn, story_id, chapter_id)
    issue_bias = issue_strategy_bias(issue_hints)
    boundary_type_hints = aggregate_boundary_type_hints(issue_hints)
    boundary_type_bias = boundary_type_strategy_bias(boundary_type_hints)
    history = profile.get("history")
    if not isinstance(history, list):
        history = []

    splitter_system_prompt_override = str(controls.get("_resolved_splitter_system_prompt") or "").strip() or None
    split_prompt_trace_chunks: List[Dict[str, Any]] = []
    self_healing_enabled = bool(controls.get("self_healing_enabled", True))
    auto_retry_enabled = bool(controls.get("auto_retry_enabled", True))
    allow_learning = bool(controls.get("allow_learning", False))
    profile_reset_scope = controls.get("profile_reset_scope")
    profile_reset_reason = controls.get("profile_reset_reason")
    profile_decay_factor = float(controls.get("profile_decay_factor") or 1.0)
    max_llm_calls = int(controls.get("max_llm_calls", split_max_llm_calls_per_chapter))
    raw_context_window = controls.get("context_window") if isinstance(controls.get("context_window"), dict) else {}
    start_time = time.time()
    context_window = _vet_context_window(conn, story_id=story_id, chapter_id=chapter_id, context_window=raw_context_window)
    context_hash = _stable_context_hash(
        context_window=context_window,
        controls=controls,
        active_constraints=active_constraints,
        chapter_id=chapter_id,
    )
    controls_forced_strategy: Optional[str] = controls.get("forced_strategy")
    if recovery_override:
        controls_forced_strategy = None
    strategies = ["S3_SEMANTIC_RESPLIT", "S0_BASE"]
    llm_state: Dict[str, int] = {"used": 0, "max_calls": max_llm_calls}
    # Adaptive budget for large chapters: ensure enough iterations.
    # 1 (Outline) + N (S3 Pass 1 candidates) + N (S3 Refinement) + Retries.
    # Each N is roughly ceil(chapter_chars / 6500) considering overlap.
    tlen = len(chapter_text or "")
    estimated_chunks = max(1, (tlen + 6500 - 1) // 6500)
    needed_budget = 1 + (estimated_chunks * 2) + 1  # Outline + extraction + refinement + recursive room
    if needed_budget > llm_state["max_calls"]:
        llm_state["max_calls"] = needed_budget
    print(f"[DEBUG_BUDGET] chapter_chars={tlen} estimated_chunks={estimated_chunks} max_llm_calls_init={max_llm_calls} adapted_max={llm_state['max_calls']}", file=sys.stderr, flush=True)
    profile_reset_applied = {"chapter": False, "global": False}

    if profile_reset_scope in ("chapter", "both"):
        chapter_stats = _zero_strategy_stats(strategies)
        best_by_signature = {}
        history = []
        profile_reset_applied["chapter"] = True
    if profile_reset_scope in ("global", "both"):
        global_stats = _zero_strategy_stats(strategies)
        profile_reset_applied["global"] = True

    chapter_stats = _decay_strategy_stats(chapter_stats, profile_decay_factor)
    global_stats = _decay_strategy_stats(global_stats, profile_decay_factor)

    chapter_confident = profile_confident(
        chapter_stats,
        C.SPLIT_PROFILE_CHAPTER_MIN_RUNS,
        C.SPLIT_PROFILE_CHAPTER_MIN_BOUNDARIES,
        C.SPLIT_PROFILE_CHAPTER_MIN_HARD_FLAGS,
    )
    global_confident = profile_confident(
        global_stats,
        C.SPLIT_PROFILE_CHAPTER_MIN_RUNS,
        C.SPLIT_PROFILE_CHAPTER_MIN_BOUNDARIES,
        C.SPLIT_PROFILE_CHAPTER_MIN_HARD_FLAGS,
    )

    forced_preferred = forced_strategy_from_issue_hints(issue_hints)
    strategy_plan = plan_strategy_order(
        strategies=strategies,
        issue_hints=issue_hints,
        boundary_type_hints=boundary_type_hints,
        feedback_penalties=feedback_penalties,
        supervisor_strategy_bias=supervisor_strategy_bias,
        issue_bias=issue_bias,
        boundary_type_bias=boundary_type_bias,
        chapter_confident=chapter_confident,
        global_confident=global_confident,
        best_by_signature=best_by_signature,
        split_mode=split_mode,
        chapter_text=chapter_text,
        chapter_id=chapter_id,
        self_healing_enabled=self_healing_enabled,
        auto_retry_enabled=auto_retry_enabled,
        forced_preferred=forced_preferred,
        chapter_best=best_strategy_from_stats(chapter_stats),
        global_best=best_strategy_from_stats(global_stats),
        strong_hint_threshold=split_strong_hint_threshold,
        long_chapter_chars=split_long_chapter_chars,
        exploration_rate=split_exploration_rate,
    )
    ordered = list(strategy_plan.get("ordered") or strategies[:])
    profile_scope = str(strategy_plan.get("profile_scope") or "chapter")
    exploration_roll = float(strategy_plan.get("exploration_roll") or 0.0)
    exploration_enabled = bool(strategy_plan.get("exploration_enabled"))

    truth_resolution = _resolve_truth_strategy_order(
        ordered=ordered,
        controls_forced_strategy=controls_forced_strategy,
        forced_preferred=forced_preferred,
        tech_rules=tech_rules,
        active_constraints=active_constraints,
        all_strategies=strategies,
    )
    ordered = list(truth_resolution.get("ordered") or ordered)
    effective_forced_strategy = truth_resolution.get("effective_forced_strategy")
    # RFC: forced strategy constrains strategy choice only.
    # It must not disable recursive validation/retry in S3 pipeline.
    is_forced_run = bool(effective_forced_strategy)
    if is_forced_run:
        learning_mode = "forced_allowed" if allow_learning else "constrained"
    else:
        learning_mode = "normal"
    chapter_learning_lr = split_profile_chapter_lr
    global_learning_lr = split_profile_global_lr
    if is_forced_run:
        if allow_learning:
            chapter_learning_lr = split_profile_chapter_lr * 0.25
            global_learning_lr = split_profile_global_lr * 0.25
        else:
            chapter_learning_lr = 0.0
            global_learning_lr = 0.0

    structural_outline = extract_structural_outline(
        chapter_text=chapter_text,
        chapter_id=chapter_id,
        max_retries=2,
        temperature=0.1,
    )
    outline_elapsed_sec = max(0.0, time.time() - start_time)
    split_phase_budgets_env = _split_phase_budgets_from_env()
    split_phase_budgets, budget_profile = _resolve_phase_budgets(
        chapter_chars=len(chapter_text or ""),
        split_controls=split_controls if isinstance(split_controls, dict) else controls,
        env_budgets=split_phase_budgets_env,
        retry_profile_used=retry_profile_effective,
        previous_result_runtime=previous_result_runtime if isinstance(previous_result_runtime, dict) else {},
        issue_hints=issue_hints,
        constraint_pack_mode=str(constraint_pack.get("mode") or ""),
        constraint_pack_stats=constraint_pack.get("stats") if isinstance(constraint_pack.get("stats"), dict) else {},
    )
    one_pass_recovery_enabled = _should_enable_one_pass_recovery(
        budget_profile=budget_profile,
        controls=controls,
    )
    recovery_override_effective = bool(recovery_override or one_pass_recovery_enabled)
    pipeline_v2_enabled = _split_pipeline_v2_enabled(story_id=story_id, controls=controls)
    analysis_chunk_max_chars = int(controls.get("analysis_chunk_max_chars") or 4000)
    llm_state["used"] = int(llm_state.get("used") or 0) + int(
        ((structural_outline.get("generation") or {}).get("model_call_used") or 1)
    )
    print(f"[DEBUG_BUDGET] After outline used={llm_state['used']} max={llm_state['max_calls']}", file=sys.stderr, flush=True)
    anchor_enabled = _split_anchor_v11_enabled(story_id)
    anchor_payload: Dict[str, Any] = {
        "hard_anchors": [],
        "soft_anchors": [],
        "lore_ranges": [],
        "stats": {"total": 0, "hard_count": 0, "soft_count": 0, "lore_range_count": 0, "by_type": {}},
        "debug_notes": [],
    }
    if anchor_enabled:
        try:
            anchor_payload = extract_deterministic_anchors(
                chapter_text=chapter_text,
                outline_beats=structural_outline.get("beats") if isinstance(structural_outline, dict) else [],
                chapter_chars=len(chapter_text or ""),
            )
        except Exception as err:
            anchor_payload = {
                "hard_anchors": [],
                "soft_anchors": [],
                "lore_ranges": [],
                "stats": {"total": 0, "hard_count": 0, "soft_count": 0, "lore_range_count": 0, "by_type": {}},
                "debug_notes": [f"ANCHOR_EXTRACTION_ERROR:{str(err)[:180]}"],
            }
    hard_anchor_specs = [x for x in (anchor_payload.get("hard_anchors") or []) if isinstance(x, dict)]
    soft_anchor_specs = [x for x in (anchor_payload.get("soft_anchors") or []) if isinstance(x, dict)]
    lore_ranges = [x for x in (anchor_payload.get("lore_ranges") or []) if isinstance(x, dict)]
    outline_anchor_note = (
        "STRUCTURAL_OUTLINE_ANCHOR (hard): split along beat joints, preserve continuity.\n"
        f"STRUCTURAL_OUTLINE_BEATS_JSON: {_json_dumps(structural_outline.get('beats') or [])}"
    )
    deterministic_anchor_note = (
        "DETERMINISTIC_ANCHOR_GUIDE_V1_1:\n"
        f"HARD_ANCHORS_JSON: {_json_dumps(hard_anchor_specs)}\n"
        f"SOFT_ANCHORS_JSON: {_json_dumps(soft_anchor_specs)}\n"
        f"LORE_RANGES_JSON: {_json_dumps(lore_ranges)}\n"
        "For hard anchors, preserve boundary near anchor position within tolerance when possible."
        if anchor_enabled
        else ""
    )
    effective_reprocess_note = (
        f"{(reprocess_note or '').strip()}\n{outline_anchor_note}\n{deterministic_anchor_note}".strip()
    )

    attempt_out = run_auto_split_attempts(
        ordered=ordered,
        chapter_text=chapter_text,
        split_mode=split_mode,
        lock_spans=lock_spans,
        llm_state=llm_state,
        auto_retry_enabled=auto_retry_enabled,
        self_healing_enabled=self_healing_enabled,
        exploration_enabled=exploration_enabled,
        issue_hints=issue_hints,
        boundary_type_hints=boundary_type_hints,
        supervisor_strategy_bias=supervisor_strategy_bias,
        reprocess_note=effective_reprocess_note,
        previous_split_contexts=previous_split_contexts,
        active_constraints=active_constraints,
        chapter_no=chapter_no,
        llm_reviewer_gate=lambda text, pts, state: worker_common.llm_reviewer_gate(text, pts, active_constraints, state) if active_constraints else {"pass": True},
        run_split_attempt=lambda **kwargs: run_split_attempt(
            **{k: v for k, v in kwargs.items() if k != "forced_dictionary_override"},
            extract_split_candidates=lambda t, s, l: extract_split_candidates(
                t,
                s,
                l,
                tech_rules=tech_rules,
                active_constraints=active_constraints,
                forced_dictionary_override=kwargs.get("forced_dictionary_override", False),
                splitter_system_prompt_override=splitter_system_prompt_override,
                split_trace_chunks=split_prompt_trace_chunks,
                hard_anchor_specs=hard_anchor_specs,
                soft_anchor_specs=soft_anchor_specs,
                lore_ranges=lore_ranges,
            ),
            build_scenes_from_candidates=build_scenes_from_candidates,
            llm_semantic_resplit_offsets=lambda text, pts, state, **res_kwargs: llm_semantic_resplit_offsets(
                text,
                pts,
                state,
                active_constraints=active_constraints,
                constraint_pack_mode=str(constraint_pack.get("mode") or "full"),
                hard_anchor_positions=[int(x.get("at") or 0) for x in hard_anchor_specs if str(x.get("type") or "").endswith("_HARD")],
                hard_anchor_tolerance_chars=int(C.SPLIT_HARD_ANCHOR_TOLERANCE_CHARS),
                **_strip_conflicting_anchor_kwargs(res_kwargs),
            ),
            refine_split_points=refine_split_points,
            autofix_split_points=autofix_split_points,
            build_scenes_from_split_points=build_scenes_from_split_points,
            window_rerun_splice=window_rerun_splice,
            merge_bad_boundaries=merge_bad_boundaries,
            merge_for_fragmentation=merge_for_fragmentation,
            quality_report=lambda text, scenes: quality_report(
                text,
                scenes,
                C.SPLIT_FRAGMENT_SHORT_CHARS,
                C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
                C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
                C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
                ends_with_terminal_punct,
                is_abbrev_or_name_split_at,
                is_quote_continuity_break_at,
                C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
                C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
            ),
            is_degenerate_single_scene=is_degenerate_single_scene,
            is_hard_fail_quality=lambda q: is_hard_fail_quality(
                q,
                C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
                C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
                C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
                C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
                C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
            ),
            ),

        supervisor_decision_from_quality=lambda q, enforce_mid_word_gate=False: supervisor_decision_from_quality(
            q,
            enforce_mid_word_gate,
            C.SPLIT_FRAGMENT_SCORE_RETRY_THRESHOLD,
            C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
            C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
            C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
            C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
            C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
        ),
        is_hard_fail_quality=lambda q: is_hard_fail_quality(
            q,
            C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
            C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
            C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
            C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
            C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
        ),
        llm_can_run=llm_can_run,
        rerun_reason=lambda q, llm, auto: rerun_reason(
            q,
            llm,
            auto,
            C.SPLIT_FRAGMENT_SCORE_RETRY_THRESHOLD,
            C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
            C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
            C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
            C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
            C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
        ),
        should_force_retry_by_quality_hints=lambda q, **kwargs: should_force_retry_by_quality_hints(
            q,
            **kwargs,
            force_retry_fragmentation_threshold=C.SPLIT_FORCE_RETRY_FRAGMENTATION_THRESHOLD,
            force_retry_fragmentation_with_hints_threshold=C.SPLIT_FORCE_RETRY_FRAGMENTATION_WITH_HINTS_THRESHOLD,
            force_retry_hint_min=C.SPLIT_FORCE_RETRY_HINT_MIN,
        ),
        window_rerun_splice=window_rerun_splice,
        build_scenes_from_split_points=build_scenes_from_split_points,
        quality_report=lambda text, scenes: quality_report(
            text,
            scenes,
            C.SPLIT_FRAGMENT_SHORT_CHARS,
            C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
            C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
            C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
            ends_with_terminal_punct,
            is_abbrev_or_name_split_at,
            is_quote_continuity_break_at,
            C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
            C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
        ),
        started_at=start_time,
        recursion_soft_deadline_sec=float((split_controls or {}).get("recursion_soft_deadline_sec") or 120.0),
        total_budget_sec=float(split_phase_budgets.get("total_budget_sec") or 180.0),
        outline_budget_sec=float(split_phase_budgets.get("outline_budget_sec") or 55.0),
        primary_budget_sec=float(split_phase_budgets.get("primary_budget_sec") or 95.0),
        repair_budget_sec=float(split_phase_budgets.get("repair_budget_sec") or 30.0),
        outline_elapsed_sec=float(outline_elapsed_sec),
        runtime_mode=controls.get("runtime_mode"),
        reflect_v2_enabled=bool(controls.get("runtime_mode") == "S3_STRATEGIC"),
        pipeline_v2_enabled=pipeline_v2_enabled,
        boundary_shift_window_chars=int(controls.get("boundary_shift_window_chars") or C.SPLIT_BOUNDARY_SHIFT_WINDOW_CHARS),
        oversized_split_window_chars=int(controls.get("oversized_split_window_chars") or C.SPLIT_OVERSIZED_SPLIT_WINDOW_CHARS),
        max_oversized_deterministic_splits_per_chunk=int(
            controls.get("max_oversized_deterministic_splits_per_chunk")
            or C.SPLIT_MAX_OVERSIZED_DETERMINISTIC_SPLITS_PER_CHUNK
        ),
        dialogue_attribution_guard_enabled=bool(
            controls.get("dialogue_attribution_guard_enabled")
            if controls.get("dialogue_attribution_guard_enabled") is not None
            else C.SPLIT_DIALOGUE_ATTRIBUTION_GUARD_ENABLED
        ),
        retry_profile_used=retry_profile_effective,
        recovery_path_mode=recovery_path_mode,
        recovery_override=recovery_override_effective,
        one_pass_recovery_enabled=bool(one_pass_recovery_enabled),
        recursion_min_budget_sec=float(
            controls.get("recursion_min_budget_sec") or C.SPLIT_RECOVERY_RECURSION_MIN_BUDGET_SEC
        ),
        repair_min_budget_sec=float(
            controls.get("repair_min_budget_sec") or C.SPLIT_RECOVERY_REPAIR_MIN_BUDGET_SEC
        ),
        normalize_split_points=normalize_split_points,
        oversized_scene_threshold_chars=analysis_chunk_max_chars,
        hard_anchor_positions=[int(x.get("at") or 0) for x in hard_anchor_specs if str(x.get("type") or "").endswith("_HARD")],
        outline_hint_positions=sorted(set(
            int(b.get("end_char") or 0)
            for b in (structural_outline.get("beats") if isinstance(structural_outline, dict) else []) or []
            if isinstance(b, dict) and int(b.get("end_char") or 0) > 0 and int(b.get("end_char") or 0) < len(chapter_text)
        )),
    )
    attempts = list(attempt_out.get("attempts") or [])
    chosen_strategy = str(attempt_out.get("chosen_strategy") or "S0_BASE")
    scenes = list(attempt_out.get("scenes") or [])
    autofix_report = dict(attempt_out.get("autofix_report") or {})
    quality = dict(attempt_out.get("quality") or {})
    retry_used = bool(attempt_out.get("retry_used"))
    window_rerun_report = dict(attempt_out.get("window_rerun_report") or {})
    exploration_used = bool(attempt_out.get("exploration_used"))
    strategy_switched = bool(attempt_out.get("strategy_switched"))
    split_runtime = attempt_out.get("split_runtime") if isinstance(attempt_out.get("split_runtime"), dict) else {}

    decision = supervisor_decision_from_quality(
        quality,
        True,  # enforce_mid_word_gate=True
        C.SPLIT_FRAGMENT_SCORE_RETRY_THRESHOLD,
        C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
        C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
        C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
        C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
        C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
    )
    safe_to_approve = decision == "auto_pass"
    final_rerun_reason = rerun_reason(
        quality,
        llm_can_run(llm_state),
        auto_retry_enabled,
        C.SPLIT_FRAGMENT_SCORE_RETRY_THRESHOLD,
        C.SPLIT_HARD_FAIL_MID_WORD_COUNT,
        C.SPLIT_HARD_FAIL_MID_WORD_RATIO,
        C.SPLIT_HARD_FAIL_SEMANTIC_COUNT,
        C.SPLIT_HARD_FAIL_SEMANTIC_FLAGGED_PCT_GUARD,
        C.SPLIT_HARD_FAIL_SEMANTIC_QUOTE_BREAK_GUARD,
    )
    final_boundaries = sorted(
        set(
            int(s.get("end") or 0)
            for s in scenes[:-1]
            if isinstance(s, dict) and int(s.get("end") or 0) > 0
        )
    )
    anchor_required = len(hard_anchor_specs)
    anchor_satisfied = 0
    anchor_missed_ids: List[str] = []
    anchor_missed_temporal = 0
    anchor_missed_location = 0
    for item in hard_anchor_specs:
        at = int(item.get("at") or 0)
        tol = int(item.get("tolerance_chars") or C.SPLIT_HARD_ANCHOR_TOLERANCE_CHARS)
        aid = str(item.get("id") or "")
        ok = any(abs(int(p) - at) <= tol for p in final_boundaries)
        if ok:
            anchor_satisfied += 1
            continue
        if aid:
            anchor_missed_ids.append(aid)
        atype = str(item.get("type") or "")
        if atype == "TEMPORAL_HARD":
            anchor_missed_temporal += 1
        elif atype == "LOCATION_HARD":
            anchor_missed_location += 1

    lore_total = len(lore_ranges)
    lore_isolated = 0
    for lr in lore_ranges:
        start_at = int(lr.get("start_at") or 0)
        end_at = int(lr.get("end_at") or 0)
        if end_at <= start_at:
            continue
        for sc in scenes:
            s0 = int(sc.get("start") or 0)
            s1 = int(sc.get("end") or 0)
            if s0 <= start_at and end_at <= s1:
                lore_isolated += 1
                break
    lore_not_isolated = max(0, lore_total - lore_isolated)
    quality_reason_codes = [
        str(code).strip()
        for code in (quality.get("hard_fail_reason_codes") if isinstance(quality.get("hard_fail_reason_codes"), list) else [])
        if str(code).strip()
    ]
    reason_codes = list(dict.fromkeys(quality_reason_codes))
    runtime_degrade_reason = ""
    if isinstance(split_runtime, dict):
        runtime_degrade_reason = str(split_runtime.get("degrade_reason_code") or "").strip()
    if runtime_degrade_reason:
        reason_codes.append(runtime_degrade_reason[:120])
    if isinstance(split_runtime, dict) and bool(split_runtime.get("deterministic_fallback_applied")):
        reason_codes.append("OVERSIZED_DETERMINISTIC_SPLIT_APPLIED")
        notes = split_runtime.get("deterministic_fallback_notes")
        if isinstance(notes, list) and any("FALLBACK" in str(n).upper() for n in notes):
            reason_codes.append("OVERSIZED_DETERMINISTIC_SPLIT_FALLBACK")
    runtime_recovery_reason_codes = (
        split_runtime.get("recovery_reason_codes")
        if isinstance(split_runtime.get("recovery_reason_codes"), list)
        else []
    )
    for code in runtime_recovery_reason_codes:
        c = str(code).strip()
        if c:
            reason_codes.append(c[:120])
    repair_summary_for_reasons = (
        split_runtime.get("repair_summary")
        if isinstance(split_runtime.get("repair_summary"), dict)
        else {}
    )
    conjunction_report = (
        repair_summary_for_reasons.get("conjunction_report")
        if isinstance(repair_summary_for_reasons.get("conjunction_report"), dict)
        else {}
    )
    if int(conjunction_report.get("guard_hits") or 0) > 0:
        reason_codes.append("DIALOGUE_ATTRIBUTION_GUARD_HIT")
    if str(retry_profile_effective or "").strip() == "auto_recovery_budget":
        reason_codes.append("PROMPT_LITE_RETRY_PROFILE")
        if "BUDGET" in str(final_rerun_reason or "").upper():
            reason_codes.append("PROMPT_LITE_RETRY_EXHAUSTED")
    if bool(constraint_pack.get("rule_fragmentation_detected")):
        reason_codes.append("PROMPT_RULE_FRAGMENTATION_DETECTED")
    trace_prompt_compaction_applied = any(
        bool((x or {}).get("prompt_compaction_applied"))
        for x in (split_prompt_trace_chunks or [])
        if isinstance(x, dict)
    )
    trace_truncation_markers_count = sum(
        int((x or {}).get("prompt_truncation_markers_count") or 0)
        for x in (split_prompt_trace_chunks or [])
        if isinstance(x, dict)
    )
    if trace_truncation_markers_count > 0:
        reason_codes.append("PROMPT_TRUNCATION_APPLIED")
    if anchor_missed_temporal > 0:
        reason_codes.append("ANCHOR_MISS_TEMPORAL")
    if anchor_missed_location > 0:
        reason_codes.append("ANCHOR_MISS_LOCATION")
    if lore_not_isolated > 0:
        reason_codes.append("ANCHOR_LORE_NOT_ISOLATED")
    semantic_guard_chosen: Dict[str, Any] = {}
    for att in attempts:
        if str(att.get("strategy") or "") != str(chosen_strategy):
            continue
        rep = att.get("semantic_guard_report")
        if isinstance(rep, dict):
            semantic_guard_chosen = rep
            break
    if int(semantic_guard_chosen.get("anchor_guard_clamped_count") or 0) > 0:
        diag = str(semantic_guard_chosen.get("anchor_guard_diagnostic") or "").strip()
        if diag:
            reason_codes.append(diag)
    reason_codes = list(dict.fromkeys([str(x).strip() for x in reason_codes if str(x).strip()]))
    if not reason_codes and final_rerun_reason:
        reason_codes.append(str(final_rerun_reason).strip()[:120])
    if not reason_codes and bool(quality.get("hard_fail")):
        reason_codes.append("HARD_FAIL")
    q_signal = quality_self_signal(quality)

    signature = quality_signature(quality)
    best_by_signature[signature] = chosen_strategy
    best_by_signature["LAST_BEST"] = chosen_strategy
    boundaries_run = max(0, len(scenes) - 1)
    hard_flags_run = int(quality.get("mid_word_cut_count") or 0) + int(quality.get("abbrev_or_name_cut_count") or 0)
    chapter_stats = update_profile_stats(
        chapter_stats,
        chosen_strategy,
        boundaries_run,
        hard_flags_run,
        chapter_learning_lr,
        q_signal,
    )
    history.append(
        {
            "ts": int(time.time()),
            "signature": signature,
            "strategy": chosen_strategy,
            "flagged_pct": float(quality.get("flagged_pct") or 0.0),
            "mid_word_cut_count": int(quality.get("mid_word_cut_count") or 0),
            "llm_calls_used": int(llm_state.get("used") or 0),
            "window_rerun_moved": int(window_rerun_report.get("moved") or 0),
            "scene_total": len(scenes),
        }
    )
    profile_to_save = {
        "best_by_signature": best_by_signature,
        "history": history[-split_profile_history_max:],
        "strategy_stats": chapter_stats,
    }
    chapter_profile_version = save_split_strategy_profile(conn, story_id, chapter_id, profile_to_save)

    global_best_by_signature = parse_jsonb(global_profile.get("best_by_signature"))
    if profile_reset_applied["global"]:
        global_best_by_signature = {}
    global_history = global_profile.get("history")
    if not isinstance(global_history, list):
        global_history = []
    if profile_reset_applied["global"]:
        global_history = []
    global_best_by_signature[signature] = chosen_strategy
    global_best_by_signature["LAST_BEST"] = chosen_strategy
    global_stats = update_profile_stats(
        global_stats,
        chosen_strategy,
        boundaries_run,
        hard_flags_run,
        global_learning_lr,
        q_signal,
    )
    global_history.append(
        {
            "ts": int(time.time()),
            "chapter_id": chapter_id,
            "signature": signature,
            "strategy": chosen_strategy,
            "flagged_pct": float(quality.get("flagged_pct") or 0.0),
            "mid_word_cut_count": int(quality.get("mid_word_cut_count") or 0),
            "llm_calls_used": int(llm_state.get("used") or 0),
            "scene_total": len(scenes),
        }
    )
    global_profile_to_save = {
        "best_by_signature": global_best_by_signature,
        "history": global_history[-split_profile_history_max:],
        "strategy_stats": global_stats,
    }
    global_profile_version = save_split_strategy_profile(conn, story_id, split_profile_global_key, global_profile_to_save)

    analysis_chunk_artifact = _build_analysis_chunk_artifact(
        chapter_id=chapter_id,
        split_task_id=None,
        strategy=chosen_strategy,
        chapter_text=chapter_text,
        scenes=scenes,
        structural_outline=structural_outline,
        max_chunk_chars=analysis_chunk_max_chars,
        repair_attempted=bool(
            (
                split_runtime.get("repair_summary")
                if isinstance(split_runtime.get("repair_summary"), dict)
                else {}
            ).get("attempted")
        ),
    )

    # Phase 3: Synthetic Feedback generation
    if decision != "auto_pass" or quality.get("hard_fail"):
        for att in attempts:
            if att.get("rerun_reason") == "REVIEWER_AGENT_REJECT":
                reason = att.get("autofix_report", {}).get("reviewer_rejection_reason", "Constraints Violated")
                from worker_synthetic_feedback import record_synthetic_feedback
                record_synthetic_feedback(conn, story_id, chapter_id, reason)
                break

    split_runtime_out = {
        **split_runtime,
        "pipeline_version": "v2" if pipeline_v2_enabled else "v1",
        "phase_budget": split_runtime.get("phase_budget")
        if isinstance(split_runtime.get("phase_budget"), dict)
        else split_phase_budgets,
        "phase_timing": {
            **(
                split_runtime.get("phase_timing")
                if isinstance(split_runtime.get("phase_timing"), dict)
                else {}
            ),
            "outline_sec": round(float(outline_elapsed_sec), 2),
        },
        "budget_profile": budget_profile,
        "retry_profile_used": retry_profile_used,
        "retry_profile_effective": retry_profile_effective,
        "one_pass_recovery_enabled": bool(one_pass_recovery_enabled),
        "recovery_override_effective": bool(recovery_override_effective),
        "budget_recovery_guard_applied": bool(budget_recovery_guard_applied),
        "budget_recovery_guard_reason": str(budget_guard_reason or "").strip() or None,
        "recovery_path_mode": recovery_path_mode,
        "constraint_pack_mode": str(constraint_pack.get("mode") or "full"),
        "prompt_tier_used": str(constraint_pack.get("prompt_tier_used") or "compact_first_pass"),
        "prompt_chars_rule_section": int(constraint_pack.get("prompt_chars_rule_section") or 0),
        "prompt_rule_count": int(constraint_pack.get("prompt_rule_count") or 0),
        "constraint_pack_stats": (
            constraint_pack.get("stats")
            if isinstance(constraint_pack.get("stats"), dict)
            else {
                "raw_constraints_count": len(active_constraints_raw),
                "dedup_constraints_count": len(active_constraints),
                "injected_constraints_count": len(active_constraints),
                "dropped_low_priority_count": 0,
                "tech_blocks_raw_count": 0,
                "tech_blocks_packed_count": 0,
                "tech_blocks_truncated_count": 0,
            }
        ),
        "prompt_integrity": {
            "rule_fragmentation_detected": bool(constraint_pack.get("rule_fragmentation_detected")),
            "truncation_markers_count": int(trace_truncation_markers_count),
            "prompt_compaction_applied": bool(trace_prompt_compaction_applied),
        },
        "latency_adaptive_triggered": bool(constraint_pack.get("latency_adaptive_triggered")),
        "latency_source_window": (
            constraint_pack.get("latency_source_window")
            if isinstance(constraint_pack.get("latency_source_window"), dict)
            else {"sample_size": 0, "p50_ms": 0.0, "p75_ms": 0.0}
        ),
        "degrade_path_taken": bool(split_runtime.get("degrade_path_taken")) if isinstance(split_runtime, dict) else False,
        "degrade_reason_code": (
            str(split_runtime.get("degrade_reason_code") or "").strip() or None
        ) if isinstance(split_runtime, dict) else None,
        "anchor_mode": "deterministic_prepass_v1_1" if anchor_enabled else "disabled",
        "anchor_stats": anchor_payload.get("stats") if isinstance(anchor_payload.get("stats"), dict) else {},
        "anchor_enforcement": {
            "required": int(anchor_required),
            "satisfied": int(anchor_satisfied),
            "missed": int(max(0, anchor_required - anchor_satisfied)),
            "missed_ids": anchor_missed_ids[:40],
        },
        "lore_range_stats": {
            "total": int(lore_total),
            "isolated": int(lore_isolated),
            "not_isolated": int(lore_not_isolated),
        },
        "deterministic_fallback_applied": bool(split_runtime.get("deterministic_fallback_applied"))
        if isinstance(split_runtime, dict)
        else False,
        "deterministic_fallback_notes": [
            str(x) for x in (split_runtime.get("deterministic_fallback_notes") or [])
            if str(x).strip()
        ] if isinstance(split_runtime, dict) and isinstance(split_runtime.get("deterministic_fallback_notes"), list) else [],
        "anchor_guard_active": bool(split_runtime.get("anchor_guard_active")) if isinstance(split_runtime, dict) else False,
        "anchor_guard_clamped_count": int(
            split_runtime.get("anchor_guard_clamped_count") or semantic_guard_chosen.get("anchor_guard_clamped_count") or 0
        ) if isinstance(split_runtime, dict) else int(semantic_guard_chosen.get("anchor_guard_clamped_count") or 0),
    }
    artifact_status = str(analysis_chunk_artifact.get("status") or "NOT_READY")
    artifact_diag = (
        analysis_chunk_artifact.get("diagnostics")
        if isinstance(analysis_chunk_artifact.get("diagnostics"), dict)
        else {}
    )
    oversized_count = int(artifact_diag.get("oversized_count") or 0)
    root_cause_class, recommended_action_code, root_cause_confidence, runbook_hint_code = _runtime_diagnosis(
        phase_stop_reason=str(split_runtime_out.get("phase_stop_reason") or ""),
        stop_reason=str(split_runtime_out.get("stop_reason") or ""),
        degrade_reason_code=str(split_runtime_out.get("degrade_reason_code") or ""),
        artifact_status=artifact_status,
        oversized_count=oversized_count,
        rerun_reason=str(final_rerun_reason or ""),
    )
    root_cause_secondary: List[str] = []
    if str(root_cause_class) == "BUDGET" and oversized_count > 0:
        root_cause_secondary.append("ARTIFACT_NOT_READY_CHUNK_OVERSIZED")
    split_runtime_out["root_cause_class"] = root_cause_class
    split_runtime_out["root_cause_secondary"] = root_cause_secondary
    split_runtime_out["recommended_action_code"] = recommended_action_code
    split_runtime_out["root_cause_confidence"] = round(float(root_cause_confidence), 4)
    split_runtime_out["runbook_hint_code"] = runbook_hint_code
    operational_state = "READY_FOR_ANALYSIS" if artifact_status == "READY_FOR_ANALYSIS" else "NEEDS_RETRY"
    artifact_violations = analysis_chunk_artifact.get("violations") if isinstance(analysis_chunk_artifact.get("violations"), list) else []
    has_no_chunks = any(str(v).strip().upper() == "NO_CHUNKS" for v in artifact_violations)
    has_outline_gate = any(str(v).strip().upper() == "OUTLINE_COVERAGE_GATE_FAIL" for v in artifact_violations)
    operational_state_reason = (
        "ARTIFACT_READY"
        if operational_state == "READY_FOR_ANALYSIS"
        else (
            "ARTIFACT_NOT_READY_CHUNK_OVERSIZED"
            if oversized_count > 0
            else (
                "ARTIFACT_NOT_READY_NO_CHUNKS"
                if has_no_chunks
                else (
                    "ARTIFACT_NOT_READY_OUTLINE_COVERAGE"
                    if has_outline_gate
                    else "ARTIFACT_NOT_READY"
                )
            )
        )
    )

    return {
        "chapter_id": chapter_id,
        "chapter_title": chapter_title,
        "chapter_no": chapter_no,
        "text_basis": "repaired",
        "chapter_text_basis": chapter_text,
        "chapter_text": chapter_text,
        "chapter_text_stats": {"chars": len(chapter_text)},
        "scenes": scenes,
        "algo_version": "split_v1",
        "split_mode": "auto",
        "split_controls": controls,
        "runtime_mode": controls.get("runtime_mode"),
        "context_pack_version": controls.get("context_pack_version"),
        "preference_rule_version": controls.get("preference_rule_version"),
        "context_window": context_window,
        "context_hash": context_hash,
        "profile_decay_factor": round(float(profile_decay_factor), 6),
        "profile_reset_scope": profile_reset_scope,
        "profile_reset_reason": profile_reset_reason,
        "profile_reset_applied": profile_reset_applied,
        "truth_resolution": {
            **truth_resolution,
            "recovery_override": recovery_override,
        },
        "strategy_order_used": ordered,
        "strategy_selected": chosen_strategy,
        "forced_preferred_strategy": forced_preferred,
        "effective_forced_strategy": effective_forced_strategy,
        "learning_mode": learning_mode,
        "allow_learning": allow_learning,
        "learning_applied": bool(chapter_learning_lr > 0.0),
        "learning_lr": {
            "chapter": round(float(chapter_learning_lr), 6),
            "global": round(float(global_learning_lr), 6),
        },
        "profile_scope": profile_scope,
        "feedback_penalties": feedback_penalties,
        "issue_hints_explicit": issue_hints_explicit,
        "issue_hints_inferred": issue_hints_inferred,
        "issue_hints": issue_hints,
        "boundary_type_hints": boundary_type_hints,
        "strategy_bias": {
            "supervisor_strategy_bias": supervisor_strategy_bias,
            "issue_bias": issue_bias,
            "boundary_type_bias": boundary_type_bias,
        },
        "strategy_attempts": [
            {
                "strategy": str(x["strategy"]),
                "quality_report": x["quality_report"],
                "llm_calls_used": x.get("llm_calls_used"),
                "semantic_guard_report": x.get("semantic_guard_report") or {},
                "targeted_window_report": x.get("targeted_window_report") or {},
                "hard_fail": bool(x.get("hard_fail")),
                "rerun_reason": str(x.get("rerun_reason") or ""),
                "forced_retry_gate": bool(x.get("forced_retry_gate")),
                "supervisor_history_retry": bool(x.get("supervisor_history_retry")),
                "exploration_retry": bool(x.get("exploration_retry")),
                "split_points": [s.get("end") for s in x.get("scenes", [])[:-1]] if x.get("scenes") else [],
                "reviewer_rejection_reason": x.get("autofix_report", {}).get("reviewer_rejection_reason", ""),
            }
            for x in attempts
        ],
        "llm_calls_used": int(llm_state.get("used") or 0),
        "llm_calls_budget": int(llm_state.get("max_calls") or split_max_llm_calls_per_chapter),
        "window_rerun_report": window_rerun_report,
        "lock_span_count": len(lock_spans),
        "repair_report": repair_report or {},
        "autofix_report": autofix_report,
        "quality_report": quality,
        "hard_fail": bool(quality.get("hard_fail")),
        "reason_codes": reason_codes,
        "safe_to_approve": safe_to_approve,
        "rerun_reason": final_rerun_reason,
        "supervisor_decision": decision,
        "supervisor_retry_used": retry_used,
        "exploration_enabled": exploration_enabled,
        "exploration_roll": round(exploration_roll, 6),
        "exploration_rate_target": split_exploration_rate,
        "exploration_used": exploration_used,
        "strategy_switched": strategy_switched,
        "quality_self_signal": round(q_signal, 4),
        "supervisor_retry_quality_report": attempts[1].get("quality_report") or {} if len(attempts) > 1 else {},
        "supervisor_retry_autofix_report": attempts[1].get("autofix_report") or {} if len(attempts) > 1 else {},
        "proposed_at": int(time.time()),
        "strategy_profile": {
            "chapter_confident": chapter_confident,
            "global_confident": global_confident,
            "chapter_best": best_strategy_from_stats(chapter_stats),
            "global_best": best_strategy_from_stats(global_stats),
            "chapter_profile_version": chapter_profile_version,
            "global_profile_version": global_profile_version,
        },
        "split_prompt_trace_chunks": split_prompt_trace_chunks,
        "structural_outline": structural_outline,
        "analysis_chunk_artifact": analysis_chunk_artifact,
        "operational_state": operational_state,
        "operational_state_reason": operational_state_reason,
        "split_runtime": {**split_runtime_out, "duration_sec": round(time.time() - start_time, 2)},
    }

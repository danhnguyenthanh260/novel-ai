from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any, Dict, List, Optional

from psycopg2.extras import RealDictCursor
from worker_common import call_llm_json
from worker_runtime_config import get_llm_timeout


ARC_WINDOW_CHAPTERS = 15
ALLOWED_VALIDATION_FLAGS = {
    "CONFLICT_DETECTED",
    "PACING_ISSUE",
    "CHARACTER_DRIFT",
    "LORE_DEBT_ACCUMULATING",
    "OVERLAP_EXCESSIVE",
}


def _chapter_no(chapter_id: Optional[str]) -> int:
    raw = str(chapter_id or "").strip()
    if not raw:
        return 0
    m = re.search(r"(\d+)", raw)
    if not m:
        return 0
    try:
        return int(m.group(1))
    except Exception:
        return 0


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


def _parse_block_size() -> int:
    raw = str(os.getenv("SAGA_REBUILD_BLOCK_CHAPTERS", "8")).strip()
    try:
        n = int(raw)
    except Exception:
        n = 8
    return max(5, min(10, n))


ARC_ROLLUP_V5_DELTA_PROMPT = {
    "profile": "ARC_ROLLUP_V5_DELTA",
    "system": (
        "You are Arc Rollup Agent v5. Convert approved chapter snapshots into arc deltas only. "
        "Do not restate facts already present in recent structured memory. "
        "Output only JSON with milestones, carry_forward_hooks, constraints, overlap_report, and validation_flags."
    ),
    "rule": "Do not restate recent memory; produce deltas and trajectory.",
}

SAGA_ROLLUP_V5_CANON_PROMPT = {
    "profile": "SAGA_ROLLUP_V5_CANON",
    "system": (
        "You are Saga Canon Rollup Agent v5. Consolidate approved chapter snapshots + arc rollups + core constraints "
        "into long-arc direction. Emit canon risks, unresolved lore debt, and next chapter guardrails."
    ),
    "rule": "Surface long-arc direction and unresolved debt for payoff planning.",
}


def _llm_enabled() -> bool:
    raw = str(os.getenv("HISTORIAN_ROLLUP_USE_LLM", "1")).strip().lower()
    return raw not in ("0", "false", "off", "no")


def _run_arc_rollup_llm(
    *,
    chapter_from: str,
    chapter_to: str,
    arc_milestones: List[Dict[str, Any]],
    theme_threads: List[Dict[str, Any]],
    overlap_dedup_ratio: float,
) -> Dict[str, Any]:
    compact_input = {
        "chapter_from": chapter_from,
        "chapter_to": chapter_to,
        "arc_milestones": arc_milestones[-12:],
        "theme_threads": sorted(theme_threads, key=lambda t: float(t.get("urgency") or 0.0), reverse=True)[:20],
        "overlap_dedup_ratio": round(float(overlap_dedup_ratio), 4),
    }
    prompt = (
        "Return STRICT JSON only with keys:\n"
        "{\n"
        '  "carry_forward_hooks": [string],\n'
        '  "constraints": [string],\n'
        '  "arc_milestones": [{"chapter_id":string,"milestone":string,"trajectory":"rise|fall|stable"}],\n'
        '  "validation_flags": [string]\n'
        "}\n"
        "Rules:\n"
        "- Focus on trajectory deltas, avoid restating chapter details.\n"
        "- Keep hooks/constraints concise and actionable.\n"
        "- validation_flags must be from: CONFLICT_DETECTED, PACING_ISSUE, CHARACTER_DRIFT, LORE_DEBT_ACCUMULATING, OVERLAP_EXCESSIVE.\n"
        f"Input:\n{json.dumps(compact_input, ensure_ascii=True)}"
    )
    out = call_llm_json(
        [
            {"role": "system", "content": ARC_ROLLUP_V5_DELTA_PROMPT.get("system") or "You are Arc Rollup Agent v5."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1200,
        temperature=0.2,
        timeout_sec=get_llm_timeout("writing_analysis"),
    )
    return out if isinstance(out, dict) else {}


def _run_saga_rollup_llm(
    *,
    chapter_from: str,
    chapter_to: str,
    arc_milestones: List[Dict[str, Any]],
    theme_threads: List[Dict[str, Any]],
    unresolved_lore_debt: List[Dict[str, Any]],
) -> Dict[str, Any]:
    compact_input = {
        "chapter_from": chapter_from,
        "chapter_to": chapter_to,
        "arc_milestones": arc_milestones[-12:],
        "theme_threads": sorted(theme_threads, key=lambda t: float(t.get("urgency") or 0.0), reverse=True)[:20],
        "unresolved_lore_debt": sorted(unresolved_lore_debt, key=lambda x: float(x.get("urgency") or 0.0), reverse=True)[:20],
    }
    prompt = (
        "Return STRICT JSON only with keys:\n"
        "{\n"
        '  "global_milestones": [string],\n'
        '  "theme_threads": [string],\n'
        '  "canon_risks": [string],\n'
        '  "next_chapter_guardrails": [string],\n'
        '  "unresolved_lore_debt": [{"debt_id":string,"origin_chapter_id":string,"description":string,"urgency":number,"suggested_payoff_windows":[string]}]\n'
        "}\n"
        "Rules:\n"
        "- Keep long-arc direction explicit.\n"
        "- Preserve unresolved debt items that remain actionable.\n"
        f"Input:\n{json.dumps(compact_input, ensure_ascii=True)}"
    )
    out = call_llm_json(
        [
            {"role": "system", "content": SAGA_ROLLUP_V5_CANON_PROMPT.get("system") or "You are Saga Canon Rollup Agent v5."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1500,
        temperature=0.2,
        timeout_sec=get_llm_timeout("writing_analysis"),
    )
    return out if isinstance(out, dict) else {}


def _normalize_chapter_ids(payload: Dict[str, Any]) -> List[str]:
    raw = payload.get("chapter_ids")
    out: List[str] = []
    if isinstance(raw, list):
        for item in raw:
            text = str(item or "").strip()
            if text and text not in out:
                out.append(text)
    chapter_id = str(payload.get("chapter_id") or "").strip()
    if chapter_id and chapter_id not in out:
        out.append(chapter_id)
    out.sort(key=lambda x: (_chapter_no(x), x))
    return out


def _invalidate_from_chapter(conn, story_id: int, chapter_from: str) -> Dict[str, int]:
    target_no = _chapter_no(chapter_from)
    if target_no <= 0:
        return {"arc_invalidated": 0, "saga_invalidated": 0}
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            UPDATE public.story_milestone
            SET is_stale = true,
                stale_reason = %s,
                updated_at = now()
            WHERE story_id = %s
              AND NULLIF(regexp_replace(chapter_to, '[^0-9]', '', 'g'), '')::int >= %s
              AND COALESCE(is_stale, false) = false
            """,
            (f"RETCON_FROM:{chapter_from}", int(story_id), int(target_no)),
        )
        arc_count = int(cur.rowcount or 0)
        cur.execute(
            """
            UPDATE public.writing_scope_snapshot_v1
            SET is_stale = true,
                stale_reason = %s
            WHERE story_id = %s
              AND scope_type = 'story'
              AND COALESCE(is_stale, false) = false
            """,
            (f"RETCON_FROM:{chapter_from}", int(story_id)),
        )
        saga_count = int(cur.rowcount or 0)
        return {"arc_invalidated": arc_count, "saga_invalidated": saga_count}
    finally:
        cur.close()


def _load_clean_snapshots(conn, story_id: int, chapter_ids: List[str]) -> List[Dict[str, Any]]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT
              a.chapter_id,
              s.id AS snapshot_id,
              s.snapshot_json
            FROM public.story_active_analysis_snapshot a
            JOIN public.writing_snapshot_v3 s
              ON s.id = a.snapshot_id
             AND s.story_id = a.story_id
            WHERE a.story_id = %s
              AND (
                cardinality(%s::text[]) = 0
                OR a.chapter_id = ANY(%s::text[])
              )
              AND s.approval_status = 'APPROVED'
              AND s.ready_for_writing = true
              AND s.degraded_mode = false
              AND s.fact_status = 'CLEAN'
            ORDER BY
              NULLIF(regexp_replace(a.chapter_id, '[^0-9]', '', 'g'), '')::int ASC NULLS LAST,
              a.chapter_id ASC
            """,
            (int(story_id), chapter_ids, chapter_ids),
        )
        return [dict(x) for x in (cur.fetchall() or [])]
    finally:
        cur.close()


def _extract_arc_points(snapshot_json: Dict[str, Any]) -> Dict[str, Any]:
    loops = snapshot_json.get("open_loops") if isinstance(snapshot_json.get("open_loops"), list) else []
    metrics = snapshot_json.get("narrative_metrics") if isinstance(snapshot_json.get("narrative_metrics"), dict) else {}
    target = str(snapshot_json.get("emotional_target") or "").strip()
    facts = snapshot_json.get("facts") if isinstance(snapshot_json.get("facts"), list) else []
    top_facts: List[str] = []
    for f in facts[:6]:
        if not isinstance(f, dict):
            continue
        s = str(f.get("subject") or "").strip()
        p = str(f.get("predicate") or "").strip()
        o = str(f.get("object") or "").strip()
        if s and p and o:
            top_facts.append(f"{s} {p} {o}"[:220])
    return {
        "open_loops": loops[:8],
        "narrative_score": float(metrics.get("narrative_score") or 0.0),
        "lore_debt": bool(metrics.get("lore_debt")),
        "emotional_target": target or "Mixed",
        "fact_points": top_facts,
    }


def _collect_lore_debt(chapter_id: str, snapshot_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    metrics = snapshot_json.get("narrative_metrics") if isinstance(snapshot_json.get("narrative_metrics"), dict) else {}
    if not bool(metrics.get("lore_debt")):
        return []
    loops = snapshot_json.get("open_loops") if isinstance(snapshot_json.get("open_loops"), list) else []
    items: List[Dict[str, Any]] = []
    for idx, lp in enumerate(loops[:6], start=1):
        if not isinstance(lp, dict):
            continue
        desc = str(lp.get("description") or "").strip()
        if not desc:
            continue
        urgency = float(lp.get("urgency") or 0.5)
        items.append(
            {
                "debt_id": f"{chapter_id}:ld:{idx}",
                "origin_chapter_id": chapter_id,
                "description": desc[:260],
                "urgency": round(max(0.0, min(1.0, urgency)), 3),
                "suggested_payoff_windows": [f"within_next_{3 if urgency >= 0.7 else 6}_chapters"],
            }
        )
    if items:
        return items
    return [
        {
            "debt_id": f"{chapter_id}:ld:1",
            "origin_chapter_id": chapter_id,
            "description": "Lore debt was flagged but no explicit loop description was extracted.",
            "urgency": 0.5,
            "suggested_payoff_windows": ["within_next_6_chapters"],
        }
    ]


def _validation_flags(
    *,
    arc_milestones: List[Dict[str, Any]],
    theme_threads: List[Dict[str, Any]],
    lore_debt_items: List[Dict[str, Any]],
    overlap_dedup_ratio: float,
) -> List[str]:
    flags: List[str] = []
    if len(theme_threads) >= 18:
        flags.append("CONFLICT_DETECTED")
    if arc_milestones:
        scores = [float(x.get("narrative_score") or 0.0) for x in arc_milestones]
        if scores and (max(scores) - min(scores) >= 0.45):
            flags.append("PACING_ISSUE")
    emotional_targets = [str(x.get("emotional_target") or "").strip().lower() for x in arc_milestones if str(x.get("emotional_target") or "").strip()]
    if len(set(emotional_targets)) >= 5:
        flags.append("CHARACTER_DRIFT")
    if len(lore_debt_items) >= 2:
        flags.append("LORE_DEBT_ACCUMULATING")
    if overlap_dedup_ratio > 0.55:
        flags.append("OVERLAP_EXCESSIVE")
    # hard enum guard
    return [x for x in flags if x in ALLOWED_VALIDATION_FLAGS]


def run_memory_rollup_v4(
    conn,
    *,
    story_id: int,
    payload: Dict[str, Any],
    created_by: str,
) -> Dict[str, Any]:
    chapter_ids = _normalize_chapter_ids(payload)
    chapter_from = str(payload.get("chapter_from") or (chapter_ids[0] if chapter_ids else "")).strip()
    chapter_to = str(payload.get("chapter_to") or (chapter_ids[-1] if chapter_ids else chapter_from)).strip()
    scope_type = str(payload.get("scope_type") or "batch").strip().lower()
    scope_key = str(payload.get("scope_key") or "").strip()
    rollup_mode = str(payload.get("rollup_mode") or "incremental").strip().lower()
    if rollup_mode not in ("incremental", "rebuild", "window_slide"):
        rollup_mode = "incremental"

    invalidation = {"arc_invalidated": 0, "saga_invalidated": 0}
    if bool(payload.get("retcon_rebuild")) and chapter_from:
        invalidation = _invalidate_from_chapter(conn, int(story_id), chapter_from)

    rows = _load_clean_snapshots(conn, int(story_id), chapter_ids)
    if not rows:
        return {
            "status": "NO_APPROVED_SNAPSHOT",
            "scope_type": scope_type,
            "scope_key": scope_key,
            "chapter_from": chapter_from,
            "chapter_to": chapter_to,
            "source_snapshot_ids": [],
            "invalidation": invalidation,
        }

    source_snapshot_ids: List[int] = []
    chapter_ids_effective: List[str] = []
    arc_milestones: List[Dict[str, Any]] = []
    theme_threads: List[Dict[str, Any]] = []
    unresolved_lore_debt: List[Dict[str, Any]] = []
    for row in rows:
        chapter_id = str(row.get("chapter_id") or "").strip()
        snap_id = int(row.get("snapshot_id") or 0)
        snap = _safe_json(row.get("snapshot_json"))
        if not chapter_id or snap_id <= 0:
            continue
        source_snapshot_ids.append(snap_id)
        chapter_ids_effective.append(chapter_id)
        arc_point = _extract_arc_points(snap)
        unresolved_lore_debt.extend(_collect_lore_debt(chapter_id, snap))
        arc_milestones.append(
            {
                "chapter_id": chapter_id,
                "emotional_target": arc_point.get("emotional_target"),
                "narrative_score": arc_point.get("narrative_score"),
                "lore_debt": bool(arc_point.get("lore_debt")),
                "open_loops": arc_point.get("open_loops"),
                "fact_points": arc_point.get("fact_points"),
            }
        )
        for lp in arc_point.get("open_loops") or []:
            if not isinstance(lp, dict):
                continue
            desc = str(lp.get("description") or "").strip()
            if desc:
                theme_threads.append(
                    {
                        "chapter_id": chapter_id,
                        "description": desc[:220],
                        "urgency": float(lp.get("urgency") or 0.0),
                    }
                )

    chapter_ids_effective = sorted(set(chapter_ids_effective), key=lambda x: (_chapter_no(x), x))
    chapter_from = chapter_ids_effective[0]
    chapter_to = chapter_ids_effective[-1]
    coverage_total = len(chapter_ids) if chapter_ids else len(chapter_ids_effective)
    coverage_approved = len(chapter_ids_effective)
    missing = [x for x in chapter_ids if x not in set(chapter_ids_effective)]
    overlap_dedup_ratio = float(payload.get("overlap_dedup_ratio") or 0.0)
    overlap_dropped = int(payload.get("arc_items_dropped_as_overlap") or 0)
    retained_delta_items = max(0, len(theme_threads) + len(arc_milestones) - overlap_dropped)
    validation_flags = _validation_flags(
        arc_milestones=arc_milestones,
        theme_threads=theme_threads,
        lore_debt_items=unresolved_lore_debt,
        overlap_dedup_ratio=overlap_dedup_ratio,
    )
    llm_arc = {}
    if _llm_enabled():
        try:
            llm_arc = _run_arc_rollup_llm(
                chapter_from=chapter_from,
                chapter_to=chapter_to,
                arc_milestones=arc_milestones,
                theme_threads=theme_threads,
                overlap_dedup_ratio=overlap_dedup_ratio,
            )
        except Exception:
            llm_arc = {}
    llm_hooks = llm_arc.get("carry_forward_hooks") if isinstance(llm_arc.get("carry_forward_hooks"), list) else []
    llm_constraints = llm_arc.get("constraints") if isinstance(llm_arc.get("constraints"), list) else []
    llm_flags_raw = llm_arc.get("validation_flags") if isinstance(llm_arc.get("validation_flags"), list) else []
    llm_flags = [str(x).strip() for x in llm_flags_raw if str(x).strip() in ALLOWED_VALIDATION_FLAGS]
    validation_flags = sorted(set(validation_flags + llm_flags))
    subplots_open = [
        {
            "id": (str(x.get("id") or "").strip() or f"subplot_{idx+1}"),
            "description": str(x.get("description") or "").strip()[:220],
            "chapter_id": str(x.get("chapter_id") or "").strip() or None,
            "urgency": float(x.get("urgency") or 0.0),
        }
        for idx, x in enumerate(theme_threads[:24])
        if str(x.get("description") or "").strip()
    ]
    avg_score = (
        sum(float(x.get("narrative_score") or 0.0) for x in arc_milestones) / max(1, len(arc_milestones))
    )
    conflict_state = (
        "Escalating"
        if (len(subplots_open) >= 4 or avg_score >= 0.45)
        else "Developing"
        if len(subplots_open) > 0
        else "Stable"
    )
    confidence = max(0.1, min(0.98, float(round(avg_score + 0.5, 4))))

    summary_json = {
        "schema_version": "arc_memory_v5",
        "prompt_profile": ARC_ROLLUP_V5_DELTA_PROMPT,
        "rollup_mode": rollup_mode,
        "scope_type": scope_type,
        "scope_key": scope_key,
        "arc_window": {
            "chapter_from": chapter_from,
            "chapter_to": chapter_to,
            "chapter_ids": chapter_ids_effective,
        },
        "arc_milestones": arc_milestones[-ARC_WINDOW_CHAPTERS:],
        "subplots_open": subplots_open,
        "subplots_resolved": [],
        "conflict_state": conflict_state,
        "subplots": theme_threads[:24],
        "overlap_report": {
            "dedup_ratio": round(overlap_dedup_ratio, 4),
            "dropped_items": int(overlap_dropped),
            "retained_delta_items": int(retained_delta_items),
        },
        "quality": {
            "score": 0,
            "confidence": confidence,
            "validation_flags": validation_flags,
        },
        "pacing_state": {
            "avg_narrative_score": round(avg_score, 4),
            "loop_count": len(theme_threads),
        },
        "carry_forward_hooks": ([str(x)[:240] for x in llm_hooks if str(x).strip()] or [x.get("description") for x in sorted(theme_threads, key=lambda t: float(t.get("urgency") or 0.0), reverse=True)[:8]]),
        "constraints": ([str(x)[:240] for x in llm_constraints if str(x).strip()] or [x.get("description") for x in sorted(theme_threads, key=lambda t: float(t.get("urgency") or 0.0), reverse=True)[:4]]),
        "constraints_for_next_chapter": ([str(x)[:240] for x in llm_constraints if str(x).strip()] or [x.get("description") for x in sorted(theme_threads, key=lambda t: float(t.get("urgency") or 0.0), reverse=True)[:4]]),
        "source_snapshot_ids": source_snapshot_ids,
        "coverage": {"total": coverage_total, "approved": coverage_approved, "missing": missing},
        "retcon_invalidation": invalidation,
        "llm_rollup_used": bool(llm_arc),
    }
    source_hash = hashlib.sha256(json.dumps(summary_json, ensure_ascii=True, sort_keys=True).encode("utf-8")).hexdigest()
    quality_score = min(1.0, (len(arc_milestones) * 0.5 + len(theme_threads) * 0.2 + 1.0) / 20.0)
    summary_json["quality"]["score"] = float(round(quality_score, 4))

    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            INSERT INTO public.story_milestone
              (story_id, chapter_from, chapter_to, summary_json, source_hash, quality_score, created_by, is_stale, stale_reason, updated_at)
            VALUES
              (%s, %s, %s, %s::jsonb, %s, %s, %s, false, NULL, now())
            ON CONFLICT (story_id, chapter_from, chapter_to, source_hash)
            WHERE source_hash IS NOT NULL AND source_hash <> ''
            DO UPDATE SET
              summary_json = EXCLUDED.summary_json,
              quality_score = EXCLUDED.quality_score,
              created_by = EXCLUDED.created_by,
              is_stale = false,
              stale_reason = NULL,
              updated_at = now()
            RETURNING id
            """,
            (
                int(story_id),
                chapter_from,
                chapter_to,
                json.dumps(summary_json),
                source_hash,
                float(round(quality_score, 4)),
                created_by,
            ),
        )
        row = cur.fetchone() or {}
        milestone_id = int(row.get("id") or 0)

        block_size = _parse_block_size()
        latest_no = _chapter_no(chapter_to)
        manual_force = bool(payload.get("force_saga_promote") or payload.get("manual_force_saga_rebuild"))
        if scope_type in ("arc", "story", "batch") and str(payload.get("created_by") or "").strip() == "analysis_console":
            manual_force = True
        arc_completed = bool(payload.get("arc_completed"))
        chapter_block = latest_no > 0 and latest_no % block_size == 0
        create_saga = manual_force or arc_completed or chapter_block
        saga_rebuild_reason = (
            "MANUAL_FORCE" if manual_force
            else "ARC_COMPLETED" if arc_completed
            else "CHAPTER_BLOCK" if chapter_block
            else None
        )
        saga_snapshot_id = 0
        if create_saga:
            lore_debt_sorted = sorted(unresolved_lore_debt, key=lambda x: float(x.get("urgency") or 0.0), reverse=True)
            llm_saga = {}
            if _llm_enabled():
                try:
                    llm_saga = _run_saga_rollup_llm(
                        chapter_from=chapter_from,
                        chapter_to=chapter_to,
                        arc_milestones=arc_milestones,
                        theme_threads=theme_threads,
                        unresolved_lore_debt=lore_debt_sorted,
                    )
                except Exception:
                    llm_saga = {}
            saga_json = {
                "schema_version": "saga_memory_v5",
                "prompt_profile": SAGA_ROLLUP_V5_CANON_PROMPT,
                "rebuild_reason": saga_rebuild_reason,
                "global_milestones": (
                    [str(x)[:260] for x in (llm_saga.get("global_milestones") or []) if str(x).strip()]
                    if isinstance(llm_saga.get("global_milestones"), list)
                    else arc_milestones[-ARC_WINDOW_CHAPTERS:]
                ),
                "theme_threads": (
                    [str(x)[:260] for x in (llm_saga.get("theme_threads") or []) if str(x).strip()]
                    if isinstance(llm_saga.get("theme_threads"), list)
                    else sorted(theme_threads, key=lambda t: float(t.get("urgency") or 0.0), reverse=True)[:20]
                ),
                "character_long_arcs": [],
                "canon_risks": (
                    [str(x)[:260] for x in (llm_saga.get("canon_risks") or []) if str(x).strip()]
                    if isinstance(llm_saga.get("canon_risks"), list)
                    else [flag for flag in validation_flags if flag in ("CONFLICT_DETECTED", "CHARACTER_DRIFT", "LORE_DEBT_ACCUMULATING")]
                ),
                "next_chapter_guardrails": (
                    [str(x)[:260] for x in (llm_saga.get("next_chapter_guardrails") or []) if str(x).strip()]
                    if isinstance(llm_saga.get("next_chapter_guardrails"), list)
                    else [x.get("description") for x in lore_debt_sorted[:4]]
                ),
                "unresolved_lore_debt": (
                    llm_saga.get("unresolved_lore_debt")
                    if isinstance(llm_saga.get("unresolved_lore_debt"), list)
                    else lore_debt_sorted[:20]
                ),
                "lore_debt_summary": {
                    "open_count": len(lore_debt_sorted),
                    "high_urgency_count": len([x for x in lore_debt_sorted if float(x.get("urgency") or 0.0) >= 0.7]),
                    "oldest_debt_chapter": (sorted(lore_debt_sorted, key=lambda x: _chapter_no(str(x.get("origin_chapter_id") or "")))[0].get("origin_chapter_id") if lore_debt_sorted else None),
                },
                "resolved_vs_open_threads": {
                    "open": len(theme_threads),
                    "resolved_hint": 0,
                },
                "source_arc_ranges": [{"chapter_from": chapter_from, "chapter_to": chapter_to, "milestone_id": milestone_id}],
                "source_snapshot_ids": source_snapshot_ids,
                "llm_rollup_used": bool(llm_saga),
            }
            cur.execute(
                """
                INSERT INTO public.writing_scope_snapshot_v1
                  (story_id, scope_type, scope_key, source_snapshot_ids, coverage_json, fact_status, ready_for_writing, degraded_mode, narrative_score, emotional_target, snapshot_json, created_by, approval_status, is_stale, stale_reason)
                VALUES
                  (%s, 'story', 'story:all', %s::jsonb, %s::jsonb, 'CLEAN', true, false, %s, %s, %s::jsonb, %s, 'DRAFT', false, NULL)
                RETURNING id
                """,
                (
                    int(story_id),
                    json.dumps(source_snapshot_ids),
                    json.dumps(summary_json.get("coverage") or {}),
                    float(round(quality_score, 4)),
                    str((arc_milestones[-1].get("emotional_target") if arc_milestones else "Mixed") or "Mixed"),
                    json.dumps(saga_json),
                    created_by,
                ),
            )
            srow = cur.fetchone() or {}
            saga_snapshot_id = int(srow.get("id") or 0)

        return {
            "status": "OK",
            "milestone_id": milestone_id,
            "saga_snapshot_id": saga_snapshot_id,
            "saga_rebuild_reason": saga_rebuild_reason,
            "chapter_from": chapter_from,
            "chapter_to": chapter_to,
            "scope_type": scope_type,
            "scope_key": scope_key,
            "rollup_mode": rollup_mode,
            "source_snapshot_ids": source_snapshot_ids,
            "source_hash": source_hash,
            "quality_score": round(quality_score, 4),
            "coverage": summary_json.get("coverage"),
            "invalidation": invalidation,
        }
    finally:
        cur.close()

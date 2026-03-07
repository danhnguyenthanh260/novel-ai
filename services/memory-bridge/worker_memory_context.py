from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from psycopg2.extras import RealDictCursor


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


def _norm_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    return text[:300]


def _normalize_fact_key(item: Dict[str, Any]) -> str:
    return "||".join(
        [
            _norm_text(item.get("subject")),
            _norm_text(item.get("predicate")),
            _norm_text(item.get("object")),
        ]
    )


def _normalize_hook_key(item: Dict[str, Any]) -> str:
    hook_id = _norm_text(item.get("id"))
    if hook_id:
        return f"id::{hook_id}"
    return f"desc::{_norm_text(item.get('description') or item.get('text') or item.get('hook'))}"


def _normalize_world_rule_key(item: Dict[str, Any]) -> str:
    return f"rule::{_norm_text(item.get('label') or item.get('name') or item.get('detail'))}"


def load_recent_chapter_structured(
    conn,
    story_id: int,
    chapter_id: Optional[str],
    *,
    window: int = 3,
) -> Dict[str, Any]:
    chapter_num = _chapter_no(chapter_id)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        params: List[Any] = [int(story_id)]
        where_scope = ""
        if chapter_num > 0:
            where_scope = """
              AND NULLIF(regexp_replace(a.chapter_id, '[^0-9]', '', 'g'), '')::int < %s
            """
            params.append(chapter_num)
        cur.execute(
            f"""
            SELECT
              a.chapter_id,
              s.id AS snapshot_id,
              s.snapshot_json
            FROM public.story_active_analysis_snapshot a
            JOIN public.writing_snapshot_v3 s
              ON s.id = a.snapshot_id
             AND s.story_id = a.story_id
            WHERE a.story_id = %s
              {where_scope}
              AND s.approval_status = 'APPROVED'
              AND s.ready_for_writing = true
              AND s.degraded_mode = false
              AND s.fact_status = 'CLEAN'
            ORDER BY
              NULLIF(regexp_replace(a.chapter_id, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
              a.chapter_id DESC
            LIMIT %s
            """,
            params + [max(1, int(window))],
        )
        rows = cur.fetchall() or []
        chapters: List[Dict[str, Any]] = []
        for row in rows:
            chapter = str((row or {}).get("chapter_id") or "").strip()
            snapshot_json = _safe_json((row or {}).get("snapshot_json"))
            facts_raw = snapshot_json.get("facts") if isinstance(snapshot_json.get("facts"), list) else []
            loops_raw = snapshot_json.get("open_loops") if isinstance(snapshot_json.get("open_loops"), list) else []
            world_raw = snapshot_json.get("world_rules") if isinstance(snapshot_json.get("world_rules"), list) else []
            facts = [
                {
                    "subject": str(x.get("subject") or "").strip()[:120],
                    "predicate": str(x.get("predicate") or "").strip()[:120],
                    "object": str(x.get("object") or "").strip()[:220],
                }
                for x in facts_raw[:20]
                if isinstance(x, dict)
            ]
            hooks = [
                {
                    "id": str(x.get("id") or "").strip()[:80] or None,
                    "description": str(x.get("description") or "").strip()[:220],
                    "urgency": float(x.get("urgency") or 0.0),
                }
                for x in loops_raw[:16]
                if isinstance(x, dict) and str(x.get("description") or "").strip()
            ]
            world_rules = [
                {
                    "label": str(x.get("label") or "").strip()[:120],
                    "detail": str(x.get("detail") or "").strip()[:220],
                }
                for x in world_raw[:16]
                if isinstance(x, dict) and (str(x.get("label") or "").strip() or str(x.get("detail") or "").strip())
            ]
            chapters.append(
                {
                    "chapter_id": chapter,
                    "snapshot_id": int((row or {}).get("snapshot_id") or 0),
                    "facts": facts,
                    "open_loops": hooks,
                    "world_rules": world_rules,
                }
            )
        return {
            "layer": "recent_structured",
            "window": max(1, int(window)),
            "chapter_ids": [x.get("chapter_id") for x in chapters if x.get("chapter_id")],
            "chapters": chapters,
        }
    finally:
        cur.close()


def load_working_memory(
    conn,
    story_id: int,
    chapter_id: Optional[str],
    window: int = 3,
) -> Dict[str, Any]:
    chapter_num = _chapter_no(chapter_id)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        params: List[Any] = [int(story_id)]
        where_scope = ""
        if chapter_num > 0:
            where_scope = """
              AND NULLIF(regexp_replace(s.chapter_id, '[^0-9]', '', 'g'), '')::int < %s
            """
            params.append(chapter_num)
        cur.execute(
            f"""
            SELECT
              s.chapter_id,
              s.idx AS scene_idx,
              COALESCE(s.title, '') AS scene_title,
              COALESCE(v.text_content, '') AS text_content
            FROM public.narrative_scene s
            LEFT JOIN public.narrative_scene_version v ON v.id = s.current_version_id
            WHERE s.story_id = %s
              AND s.is_verified = true
              AND s.status <> 'ARCHIVED'
              {where_scope}
            ORDER BY
              NULLIF(regexp_replace(s.chapter_id, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
              s.idx DESC,
              s.id DESC
            LIMIT %s
            """,
            params + [max(1, int(window)) * 8],
        )
        rows = cur.fetchall() or []
        chapter_order: List[str] = []
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for row in rows:
            ch = str((row or {}).get("chapter_id") or "").strip()
            if not ch:
                continue
            if ch not in grouped:
                grouped[ch] = []
                chapter_order.append(ch)
            grouped[ch].append(
                {
                    "scene_idx": int((row or {}).get("scene_idx") or 0),
                    "scene_title": str((row or {}).get("scene_title") or "").strip()[:120],
                    "text": str((row or {}).get("text_content") or "").strip()[:1800],
                }
            )
        chapter_order = chapter_order[: max(1, int(window))]
        chapters = [
            {
                "chapter_id": ch,
                "scenes": sorted(grouped.get(ch) or [], key=lambda x: int(x.get("scene_idx") or 0)),
            }
            for ch in chapter_order
        ]
        return {
            "layer": "working",
            "window": max(1, int(window)),
            "chapters": chapters,
            "chapter_ids": [x.get("chapter_id") for x in chapters if x.get("chapter_id")],
        }
    finally:
        cur.close()


def load_arc_memory(
    conn,
    story_id: int,
    chapter_id: Optional[str],
    arc_id: Optional[int] = None,
    limit: int = 15,
) -> Dict[str, Any]:
    chapter_num = _chapter_no(chapter_id)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        params: List[Any] = [int(story_id)]
        arc_filter = ""
        if arc_id and int(arc_id) > 0:
            arc_filter = "AND arc_id = %s"
            params.append(int(arc_id))
        chapter_filter = ""
        if chapter_num > 0:
            chapter_filter = "AND NULLIF(regexp_replace(chapter_to, '[^0-9]', '', 'g'), '')::int < %s"
            params.append(chapter_num)
        cur.execute(
            f"""
            SELECT id, chapter_from, chapter_to, summary_json, quality_score, source_hash
            FROM public.story_milestone
            WHERE story_id = %s
              {arc_filter}
              {chapter_filter}
              AND COALESCE(is_stale, false) = false
            ORDER BY
              NULLIF(regexp_replace(chapter_to, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
              created_at DESC,
              id DESC
            LIMIT %s
            """,
            params + [max(1, min(30, int(limit)))],
        )
        rows = cur.fetchall() or []
        milestones: List[Dict[str, Any]] = []
        for row in rows:
            milestones.append(
                {
                    "id": int((row or {}).get("id") or 0),
                    "chapter_from": str((row or {}).get("chapter_from") or "").strip(),
                    "chapter_to": str((row or {}).get("chapter_to") or "").strip(),
                    "quality_score": float((row or {}).get("quality_score") or 0.0),
                    "source_hash": str((row or {}).get("source_hash") or "").strip(),
                    "summary_json": _safe_json((row or {}).get("summary_json")),
                }
            )
        return {
            "layer": "arc",
            "limit": max(1, min(30, int(limit))),
            "milestones": milestones,
        }
    finally:
        cur.close()


def _dedup_arc_against_recent_structured(
    arc_memory: Dict[str, Any],
    recent_structured: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    milestones = arc_memory.get("milestones") if isinstance(arc_memory.get("milestones"), list) else []
    recent_chapters = recent_structured.get("chapters") if isinstance(recent_structured.get("chapters"), list) else []
    if not milestones or not recent_chapters:
        return arc_memory, {"dedup_ratio": 0.0, "dropped_items": 0, "retained_delta_items": 0}

    fact_keys: Set[str] = set()
    fact_text_keys: Set[str] = set()
    hook_keys: Set[str] = set()
    world_keys: Set[str] = set()
    for chapter in recent_chapters:
        if not isinstance(chapter, dict):
            continue
        for fact in chapter.get("facts") if isinstance(chapter.get("facts"), list) else []:
            if not isinstance(fact, dict):
                continue
            k = _normalize_fact_key(fact)
            if k and k != "||||":
                fact_keys.add(k)
                fact_text_keys.add(_norm_text(" ".join([str(fact.get("subject") or ""), str(fact.get("predicate") or ""), str(fact.get("object") or "")])))
        for hook in chapter.get("open_loops") if isinstance(chapter.get("open_loops"), list) else []:
            if not isinstance(hook, dict):
                continue
            k = _normalize_hook_key(hook)
            if k and k != "desc::":
                hook_keys.add(k)
        for rule in chapter.get("world_rules") if isinstance(chapter.get("world_rules"), list) else []:
            if not isinstance(rule, dict):
                continue
            k = _normalize_world_rule_key(rule)
            if k and k != "rule::":
                world_keys.add(k)

    total_considered = 0
    dropped = 0
    deduped_milestones: List[Dict[str, Any]] = []
    for row in milestones:
        if not isinstance(row, dict):
            continue
        summary_json = _safe_json(row.get("summary_json"))
        next_summary = dict(summary_json)

        hooks = summary_json.get("carry_forward_hooks") if isinstance(summary_json.get("carry_forward_hooks"), list) else []
        kept_hooks: List[Any] = []
        for item in hooks:
            text = _norm_text(item if isinstance(item, str) else "")
            if not text:
                continue
            total_considered += 1
            hk = f"desc::{text}"
            if hk in hook_keys:
                dropped += 1
                continue
            kept_hooks.append(item)
        if hooks:
            next_summary["carry_forward_hooks"] = kept_hooks

        subplots = summary_json.get("subplots") if isinstance(summary_json.get("subplots"), list) else []
        kept_subplots: List[Any] = []
        for item in subplots:
            if not isinstance(item, dict):
                continue
            total_considered += 1
            hk = _normalize_hook_key(item)
            if hk in hook_keys:
                dropped += 1
                continue
            kept_subplots.append(item)
        if subplots:
            next_summary["subplots"] = kept_subplots

        arc_points = summary_json.get("arc_milestones") if isinstance(summary_json.get("arc_milestones"), list) else []
        if arc_points:
            rewritten_points: List[Any] = []
            for point in arc_points:
                if not isinstance(point, dict):
                    continue
                fact_points = point.get("fact_points") if isinstance(point.get("fact_points"), list) else []
                kept_fact_points: List[str] = []
                for fp in fact_points:
                    text = _norm_text(fp)
                    if not text:
                        continue
                    total_considered += 1
                    if text in fact_text_keys:
                        dropped += 1
                        continue
                    kept_fact_points.append(str(fp))
                next_point = dict(point)
                next_point["fact_points"] = kept_fact_points
                rewritten_points.append(next_point)
            next_summary["arc_milestones"] = rewritten_points

        rules = summary_json.get("constraints") if isinstance(summary_json.get("constraints"), list) else []
        if rules:
            kept_rules: List[Any] = []
            for item in rules:
                text = _norm_text(item if isinstance(item, str) else "")
                if not text:
                    continue
                total_considered += 1
                rk = f"rule::{text}"
                if rk in world_keys:
                    dropped += 1
                    continue
                kept_rules.append(item)
            next_summary["constraints"] = kept_rules

        deduped_row = dict(row)
        deduped_row["summary_json"] = next_summary
        deduped_milestones.append(deduped_row)

    retained = max(0, total_considered - dropped)
    ratio = float(dropped) / float(total_considered) if total_considered > 0 else 0.0
    return {
        "layer": arc_memory.get("layer") or "arc",
        "limit": arc_memory.get("limit") or 15,
        "milestones": deduped_milestones,
    }, {
        "dedup_ratio": round(ratio, 4),
        "dropped_items": int(dropped),
        "retained_delta_items": int(retained),
    }


def load_saga_memory(conn, story_id: int) -> Dict[str, Any]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT id, snapshot_json, fact_status, ready_for_writing, narrative_score, updated_at
            FROM public.writing_scope_snapshot_v1
            WHERE story_id = %s
              AND scope_type = 'story'
              AND approval_status = 'APPROVED'
              AND COALESCE(is_stale, false) = false
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (int(story_id),),
        )
        row = cur.fetchone() or {}
        if not row:
            return {
                "layer": "saga",
                "snapshot_id": None,
                "snapshot_json": {},
                "ready_for_writing": False,
                "fact_status": "UNVETTED",
                "narrative_score": 0.0,
                "rebuild_reason": None,
            }
        snapshot_json = _safe_json(row.get("snapshot_json"))
        return {
            "layer": "saga",
            "snapshot_id": int(row.get("id") or 0),
            "snapshot_json": snapshot_json,
            "ready_for_writing": bool(row.get("ready_for_writing")),
            "fact_status": str(row.get("fact_status") or "UNVETTED"),
            "narrative_score": float(row.get("narrative_score") or 0.0),
            "updated_at": str(row.get("updated_at") or ""),
            "rebuild_reason": str(snapshot_json.get("rebuild_reason") or "").strip() or None,
        }
    finally:
        cur.close()


def _merge_unique(
    base: List[Dict[str, Any]],
    incoming: List[Dict[str, Any]],
    *,
    limit: int,
    key_fields: List[str],
) -> List[Dict[str, Any]]:
    if len(base) >= limit:
        return base[:limit]
    seen = {
        "||".join(str(item.get(field) or "").strip().lower() for field in key_fields)
        for item in base
    }
    out = list(base)
    for item in incoming:
        key = "||".join(str(item.get(field) or "").strip().lower() for field in key_fields)
        if not key or key in seen:
            continue
        out.append(item)
        seen.add(key)
        if len(out) >= limit:
            break
    return out


def load_core_lookup(conn, story_id: int, query_pack: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    q = query_pack if isinstance(query_pack, dict) else {}
    keyword_text = " ".join(
        [str(q.get("chapter_goal") or ""), str(q.get("instructions") or ""), str(q.get("keywords") or "")]
    ).strip()
    keyword = ""
    if keyword_text:
        keyword = re.sub(r"[^a-zA-Z0-9_ ]+", " ", keyword_text).strip().split(" ")[0][:60]

    cur = conn.cursor(cursor_factory=RealDictCursor)
    facts_limit = 25
    anchors_limit = 12
    try:
        like_arg = f"%{keyword}%"

        def _fetch_canon_facts(status_sql: str, status_args: List[Any]) -> List[Dict[str, Any]]:
            where_keyword = ""
            params: List[Any] = [int(story_id), *status_args]
            if keyword:
                where_keyword = """
                  AND (
                    lower(f.subject) LIKE lower(%s)
                    OR lower(f.predicate) LIKE lower(%s)
                    OR lower(f.object) LIKE lower(%s)
                  )
                """
                params.extend([like_arg, like_arg, like_arg])
            else:
                where_keyword = """
                  AND (
                    COALESCE(f.is_static, false) = true
                    OR UPPER(COALESCE(f.classification, '')) = 'STATIC'
                  )
                """
            cur.execute(
                f"""
                SELECT
                  f.subject,
                  f.predicate,
                  f.object,
                  f.confidence,
                  f.entity_type,
                  'CANON_FACT'::text AS source_kind
                FROM public.canon_fact f
                LEFT JOIN public.core_memory_vetting_state v
                  ON v.story_id = f.story_id
                 AND v.source_kind = 'CANON_FACT'
                 AND v.source_id = f.id
                WHERE f.story_id = %s
                  AND ({status_sql})
                  {where_keyword}
                ORDER BY f.created_at DESC, f.id DESC
                LIMIT {facts_limit}
                """,
                params,
            )
            return [dict(x) for x in (cur.fetchall() or [])]

        def _fetch_story_canon(status_sql: str, status_args: List[Any]) -> List[Dict[str, Any]]:
            where_keyword = ""
            params: List[Any] = [int(story_id), *status_args]
            if keyword:
                where_keyword = "AND lower(scf.content) LIKE lower(%s)"
                params.append(like_arg)
            cur.execute(
                f"""
                SELECT
                  scf.category AS subject,
                  'states'::text AS predicate,
                  scf.content AS object,
                  LEAST(1::float8, GREATEST(0.2::float8, COALESCE(scf.importance, 3)::float8 / 5::float8)) AS confidence,
                  'LEGACY'::text AS entity_type,
                  'STORY_CANON_FACT'::text AS source_kind
                FROM public.story_canon_fact scf
                LEFT JOIN public.core_memory_vetting_state v
                  ON v.story_id = scf.story_id
                 AND v.source_kind = 'STORY_CANON_FACT'
                 AND v.source_id = scf.id
                WHERE scf.story_id = %s
                  AND ({status_sql})
                  {where_keyword}
                ORDER BY scf.updated_at DESC, scf.id DESC
                LIMIT {facts_limit}
                """,
                params,
            )
            return [dict(x) for x in (cur.fetchall() or [])]

        def _fetch_timeline(status_sql: str, status_args: List[Any]) -> List[Dict[str, Any]]:
            where_keyword = ""
            params: List[Any] = [int(story_id), *status_args]
            if keyword:
                where_keyword = """
                  AND (
                    lower(t.event_label) LIKE lower(%s)
                    OR lower(COALESCE(t.location, '')) LIKE lower(%s)
                  )
                """
                params.extend([like_arg, like_arg])
            cur.execute(
                f"""
                SELECT
                  t.event_label,
                  t.participants,
                  t.location,
                  'TIMELINE_ANCHOR'::text AS source_kind
                FROM public.timeline_anchor t
                LEFT JOIN public.core_memory_vetting_state v
                  ON v.story_id = t.story_id
                 AND v.source_kind = 'TIMELINE_ANCHOR'
                 AND v.source_id = t.id
                WHERE t.story_id = %s
                  AND ({status_sql})
                  {where_keyword}
                ORDER BY t.created_at DESC, t.id DESC
                LIMIT {anchors_limit}
                """,
                params,
            )
            return [dict(x) for x in (cur.fetchall() or [])]

        approved_canon = _fetch_canon_facts("COALESCE(v.review_status, 'PENDING') = %s", ["APPROVED"])
        approved_legacy = _fetch_story_canon("COALESCE(v.review_status, 'PENDING') = %s", ["APPROVED"])
        approved_anchors = _fetch_timeline("COALESCE(v.review_status, 'PENDING') = %s", ["APPROVED"])

        facts = _merge_unique(approved_canon, approved_legacy, limit=facts_limit, key_fields=["subject", "predicate", "object"])
        anchors = list(approved_anchors[:anchors_limit])
        hits_by_lane = {"approved": {"facts": len(facts), "anchors": len(anchors)}, "auto": {"facts": 0, "anchors": 0}, "legacy": {"facts": 0, "anchors": 0}}

        if len(facts) < facts_limit:
            auto_canon = _fetch_canon_facts("COALESCE(v.review_status, 'PENDING') <> %s", ["REJECTED"])
            merged = _merge_unique(facts, auto_canon, limit=facts_limit, key_fields=["subject", "predicate", "object"])
            hits_by_lane["auto"]["facts"] = max(0, len(merged) - len(facts))
            facts = merged

        if len(anchors) < anchors_limit:
            auto_anchors = _fetch_timeline("COALESCE(v.review_status, 'PENDING') <> %s", ["REJECTED"])
            merged_anchors = _merge_unique(anchors, auto_anchors, limit=anchors_limit, key_fields=["event_label", "location"])
            hits_by_lane["auto"]["anchors"] = max(0, len(merged_anchors) - len(anchors))
            anchors = merged_anchors

        if len(facts) < facts_limit:
            legacy_pending = _fetch_story_canon("COALESCE(v.review_status, 'PENDING') <> %s", ["REJECTED"])
            merged = _merge_unique(facts, legacy_pending, limit=facts_limit, key_fields=["subject", "predicate", "object"])
            hits_by_lane["legacy"]["facts"] = max(0, len(merged) - len(facts))
            facts = merged

        degraded_core_mode = (hits_by_lane["auto"]["facts"] + hits_by_lane["auto"]["anchors"] + hits_by_lane["legacy"]["facts"]) > 0
        return {
            "layer": "core_db",
            "keyword": keyword,
            "policy": "approved_auto_legacy_v1",
            "facts": facts,
            "anchors": anchors,
            "hits": {"facts": len(facts), "anchors": len(anchors)},
            "hits_by_lane": hits_by_lane,
            "degraded_core_mode": degraded_core_mode,
        }
    except Exception:
        # Backward-compatible fallback before overlay migration exists.
        if keyword:
            cur.execute(
                """
                SELECT subject, predicate, object, confidence, entity_type
                FROM public.canon_fact
                WHERE story_id = %s
                  AND (
                    lower(subject) LIKE lower(%s)
                    OR lower(predicate) LIKE lower(%s)
                    OR lower(object) LIKE lower(%s)
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT 25
                """,
                (int(story_id), f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"),
            )
        else:
            cur.execute(
                """
                SELECT subject, predicate, object, confidence, entity_type
                FROM public.canon_fact
                WHERE story_id = %s
                  AND (
                    COALESCE(is_static, false) = true
                    OR UPPER(COALESCE(classification, '')) = 'STATIC'
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT 25
                """,
                (int(story_id),),
            )
        facts = cur.fetchall() or []
        cur.execute(
            """
            SELECT event_label, participants, location
            FROM public.timeline_anchor
            WHERE story_id = %s
            ORDER BY created_at DESC
            LIMIT 12
            """,
            (int(story_id),),
        )
        anchors = cur.fetchall() or []
        return {
            "layer": "core_db",
            "keyword": keyword,
            "policy": "approved_auto_legacy_v1",
            "facts": [dict(x) for x in facts],
            "anchors": [dict(x) for x in anchors],
            "hits": {"facts": len(facts), "anchors": len(anchors)},
            "hits_by_lane": {"approved": {"facts": 0, "anchors": 0}, "auto": {"facts": len(facts), "anchors": len(anchors)}, "legacy": {"facts": 0, "anchors": 0}},
            "degraded_core_mode": True,
        }
    finally:
        cur.close()


def build_planning_context_v4(
    conn,
    story_id: int,
    chapter_id: Optional[str],
    instructions: str,
    *,
    arc_id: Optional[int] = None,
) -> Dict[str, Any]:
    return build_planning_context_v5(
        conn,
        story_id,
        chapter_id,
        instructions,
        arc_id=arc_id,
    )


def build_planning_context_v5(
    conn,
    story_id: int,
    chapter_id: Optional[str],
    instructions: str,
    *,
    arc_id: Optional[int] = None,
) -> Dict[str, Any]:
    recent_structured = load_recent_chapter_structured(conn, story_id, chapter_id, window=3)
    arc_memory_raw = load_arc_memory(conn, story_id, chapter_id, arc_id=arc_id, limit=15)
    arc_memory, overlap_report = _dedup_arc_against_recent_structured(arc_memory_raw, recent_structured)
    saga_memory = load_saga_memory(conn, story_id)
    core_lookup = load_core_lookup(
        conn,
        story_id,
        {"chapter_goal": "", "instructions": instructions, "keywords": chapter_id or ""},
    )
    recent_chapters = recent_structured.get("chapters") if isinstance(recent_structured.get("chapters"), list) else []
    recent_kept = recent_chapters[:3]
    milestones = arc_memory.get("milestones") if isinstance(arc_memory.get("milestones"), list) else []
    capped_milestones: List[Dict[str, Any]] = []
    arc_hook_count = 0
    saga_guardrails = []
    saga_json = saga_memory.get("snapshot_json") if isinstance(saga_memory.get("snapshot_json"), dict) else {}
    if isinstance(saga_json.get("next_chapter_guardrails"), list):
        saga_guardrails = [x for x in saga_json.get("next_chapter_guardrails") if isinstance(x, str) and str(x).strip()][:8]
    for row in milestones[:8]:
        if not isinstance(row, dict):
            continue
        summary_json = _safe_json(row.get("summary_json"))
        hooks = summary_json.get("carry_forward_hooks") if isinstance(summary_json.get("carry_forward_hooks"), list) else []
        hooks = [str(x).strip() for x in hooks if str(x).strip()][:10]
        arc_hook_count += len(hooks)
        next_summary = dict(summary_json)
        next_summary["carry_forward_hooks"] = hooks
        capped = dict(row)
        capped["summary_json"] = next_summary
        capped_milestones.append(capped)
    core_facts = core_lookup.get("facts") if isinstance(core_lookup.get("facts"), list) else []
    core_anchors = core_lookup.get("anchors") if isinstance(core_lookup.get("anchors"), list) else []
    core_lookup_capped = dict(core_lookup)
    core_lookup_capped["facts"] = core_facts[:12]
    core_lookup_capped["anchors"] = core_anchors[:8]
    used_counts = {
        "recent_structured_chapters": len(recent_kept),
        "arc_milestones": len(capped_milestones),
        "arc_hooks": arc_hook_count,
        "saga_guardrails": len(saga_guardrails),
        "core_facts": len(core_lookup_capped.get("facts") or []),
        "core_anchors": len(core_lookup_capped.get("anchors") or []),
    }
    dropped_counts = {
        "recent_structured_chapters": max(0, len(recent_chapters) - len(recent_kept)),
        "arc_milestones": max(0, len(milestones) - len(capped_milestones)),
        "core_facts": max(0, len(core_facts) - len(core_lookup_capped.get("facts") or [])),
        "core_anchors": max(0, len(core_anchors) - len(core_lookup_capped.get("anchors") or [])),
    }
    degraded_reasons: List[str] = []
    if not capped_milestones:
        degraded_reasons.append("ARC_DELTA_UNAVAILABLE")
    if not saga_memory.get("snapshot_id"):
        degraded_reasons.append("SAGA_STALE_OR_MISSING")
    if bool(core_lookup_capped.get("degraded_core_mode")):
        degraded_reasons.append("CORE_APPROVED_LOW_COVERAGE")
    return {
        "memory_contract_version": "v5",
        "layer_priority": ["recent_structured", "arc", "saga", "core_db"],
        "recent_chapter_structured": {
            **recent_structured,
            "chapters": recent_kept,
            "chapter_ids": [x.get("chapter_id") for x in recent_kept if isinstance(x, dict) and x.get("chapter_id")],
        },
        "arc_memory": {
            **arc_memory,
            "milestones": capped_milestones,
        },
        "saga_memory": saga_memory,
        "core_lookup": core_lookup_capped,
        "memory_runtime": {
            "overlap_dedup_ratio": float(overlap_report.get("dedup_ratio") or 0.0),
            "arc_items_dropped_as_overlap": int(overlap_report.get("dropped_items") or 0),
            "layer_priority_effective": ["recent_structured", "arc", "saga", "core_db"],
            "used_counts_by_layer": used_counts,
            "dropped_counts_by_layer": dropped_counts,
            "degraded_reasons": degraded_reasons,
        },
    }


def build_prose_context_v4(
    conn,
    story_id: int,
    chapter_id: Optional[str],
    instructions: str,
    *,
    working_window: int = 3,
) -> Dict[str, Any]:
    return build_prose_context_v5(
        conn,
        story_id,
        chapter_id,
        instructions,
        working_window=working_window,
    )


def build_prose_context_v5(
    conn,
    story_id: int,
    chapter_id: Optional[str],
    instructions: str,
    *,
    working_window: int = 3,
) -> Dict[str, Any]:
    working_memory = load_working_memory(conn, story_id, chapter_id, window=working_window)
    recent_structured = load_recent_chapter_structured(conn, story_id, chapter_id, window=3)
    saga_memory = load_saga_memory(conn, story_id)
    core_lookup = load_core_lookup(
        conn,
        story_id,
        {"chapter_goal": chapter_id or "", "instructions": instructions, "keywords": chapter_id or ""},
    )
    working_chapters = working_memory.get("chapters") if isinstance(working_memory.get("chapters"), list) else []
    recent_chapters = recent_structured.get("chapters") if isinstance(recent_structured.get("chapters"), list) else []
    working_kept = working_chapters[:3]
    recent_kept = recent_chapters[:2]
    saga_json = saga_memory.get("snapshot_json") if isinstance(saga_memory.get("snapshot_json"), dict) else {}
    guardrails = [x for x in (saga_json.get("next_chapter_guardrails") if isinstance(saga_json.get("next_chapter_guardrails"), list) else []) if isinstance(x, str) and str(x).strip()][:5]
    core_facts = core_lookup.get("facts") if isinstance(core_lookup.get("facts"), list) else []
    core_anchors = core_lookup.get("anchors") if isinstance(core_lookup.get("anchors"), list) else []
    core_lookup_capped = dict(core_lookup)
    core_lookup_capped["facts"] = core_facts[:8]
    core_lookup_capped["anchors"] = core_anchors[:4]
    degraded_reasons: List[str] = []
    if not saga_memory.get("snapshot_id"):
        degraded_reasons.append("SAGA_STALE_OR_MISSING")
    if bool(core_lookup_capped.get("degraded_core_mode")):
        degraded_reasons.append("CORE_APPROVED_LOW_COVERAGE")
    return {
        "memory_contract_version": "v5",
        "layer_priority": ["working", "recent_structured", "saga", "core_db"],
        "working_memory": {
            **working_memory,
            "chapters": working_kept,
            "chapter_ids": [x.get("chapter_id") for x in working_kept if isinstance(x, dict) and x.get("chapter_id")],
        },
        "recent_chapter_structured": {
            **recent_structured,
            "chapters": recent_kept,
            "chapter_ids": [x.get("chapter_id") for x in recent_kept if isinstance(x, dict) and x.get("chapter_id")],
        },
        "saga_memory": {
            **saga_memory,
            "guardrails": guardrails,
        },
        "core_lookup": core_lookup_capped,
        "memory_runtime": {
            "layer_priority_effective": ["working", "recent_structured", "saga", "core_db"],
            "used_counts_by_layer": {
                "working_chapters": len(working_kept),
                "recent_structured_chapters": len(recent_kept),
                "saga_guardrails": len(guardrails),
                "core_facts": len(core_lookup_capped.get("facts") or []),
                "core_anchors": len(core_lookup_capped.get("anchors") or []),
            },
            "dropped_counts_by_layer": {
                "working_chapters": max(0, len(working_chapters) - len(working_kept)),
                "recent_structured_chapters": max(0, len(recent_chapters) - len(recent_kept)),
                "core_facts": max(0, len(core_facts) - len(core_lookup_capped.get("facts") or [])),
                "core_anchors": max(0, len(core_anchors) - len(core_lookup_capped.get("anchors") or [])),
            },
            "degraded_reasons": degraded_reasons,
        },
    }

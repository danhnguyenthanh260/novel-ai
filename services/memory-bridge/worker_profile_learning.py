from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from psycopg2.extras import Json, RealDictCursor


def _prompt_integrity_v1_enabled() -> bool:
    return str(os.getenv("SPLIT_PROMPT_INTEGRITY_V1_ENABLED", "1")).strip().lower() in ("1", "true", "yes", "on")


def strategy_keys() -> List[str]:
    return ["S0_BASE", "S1_STRICT_BOUNDARY", "S1_TARGETED_WINDOW_REPAIR", "S2_MERGE_FIX", "S3_SEMANTIC_RESPLIT"]


def safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        n = float(value)
        if not (n == n):
            return fallback
        return n
    except Exception:
        return fallback


def load_dictionary_rules(conn, story_id: int, tier: str, chapter_no: Optional[int] = None, context_text: Optional[str] = None) -> str:
    from psycopg2.extras import RealDictCursor
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # 1. Base query with basic filters (is_active, tier, story_id)
        query = """
            SELECT term_key, definition, agent_instructions, aliases, priority, valid_from_chapter, valid_to_chapter
            FROM public.story_dictionary
            WHERE (story_id = %s OR story_id IS NULL)
              AND tier = %s
              AND is_active = true
        """
        params = [story_id, tier]
        
        # 2. Filter by Chapter Lifecycle (Phase 8.1)
        if chapter_no is not None:
            query += " AND (valid_from_chapter IS NULL OR valid_from_chapter <= %s)"
            query += " AND (valid_to_chapter IS NULL OR valid_to_chapter >= %s)"
            params.extend([chapter_no, chapter_no])
            
        cur.execute(query, params)
        rows = cur.fetchall()
        if not rows:
            return ""

        # 3. Relevance Scoring (Phase 8.1 RAG Lite)
        scored_rules = []
        for r in rows:
            score = float(r.get('priority') or 5)
            
            # Boost if keywords or aliases appear in context_text
            if context_text:
                context_lower = context_text.lower()
                # Check term_key
                if r['term_key'].lower() in context_lower:
                    score += 10.0
                
                # Check aliases (Phase 8.3)
                aliases = r.get('aliases')
                if isinstance(aliases, list):
                    for alias in aliases:
                        if str(alias).lower() in context_lower:
                            score += 10.0
                elif isinstance(aliases, str):
                    try:
                        al_list = json.loads(aliases)
                        for alias in al_list:
                            if str(alias).lower() in context_lower:
                                score += 10.0
                    except: pass

            scored_rules.append((score, r))

        # Sort by score DESC
        scored_rules.sort(key=lambda x: x[0], reverse=True)
        
        # Limit to Top 10 to avoid Prompt Bloat (Phase 8.1 & Mentor 12)
        top_rules = scored_rules[:10]
        
        rules_str = []
        for score, r in top_rules:
            rules_str.append(f"- [{r['term_key']}] ({r['definition']}): {r['agent_instructions']}")
            
        return "\n".join(rules_str)
    except Exception as e:
        print(f"Error loading dictionary rules: {e}")
        return ""
    finally:
        cur.close()


def load_split_strategy_profile(conn, story_id: int, chapter_id: str, parse_jsonb) -> Dict[str, Any]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT profile_json
            FROM public.split_strategy_profile
            WHERE story_id = %s
              AND chapter_id = %s
            LIMIT 1
            """,
            (story_id, chapter_id),
        )
        row = cur.fetchone()
        if not row:
            return {}
        return parse_jsonb(row.get("profile_json"))
    except Exception:
        return {}
    finally:
        cur.close()


def save_split_strategy_profile(conn, story_id: int, chapter_id: str, profile: Dict[str, Any]) -> int:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO public.split_strategy_profile (story_id, chapter_id, profile_json, updated_at, profile_version)
            VALUES (%s, %s, %s::jsonb, now(), 1)
            ON CONFLICT (story_id, chapter_id)
            DO UPDATE SET
              profile_json = EXCLUDED.profile_json,
              updated_at = now(),
              profile_version = public.split_strategy_profile.profile_version + 1
            RETURNING profile_version
            """,
            (story_id, chapter_id, Json(profile)),
        )
        row = cur.fetchone()
        if row and row[0] is not None:
            return int(row[0])
        return 0
    except Exception:
        return 0
    finally:
        cur.close()


def load_profile_stats(profile: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
    raw = profile.get("strategy_stats")
    stats: Dict[str, Dict[str, float]] = {}
    if isinstance(raw, dict):
        for key in strategy_keys():
            node = raw.get(key)
            node_obj = node if isinstance(node, dict) else {}
            total_runs = max(0.0, safe_float(node_obj.get("total_runs"), 0.0))
            win_count = max(0.0, safe_float(node_obj.get("win_count"), 0.0))
            total_boundaries = max(0.0, safe_float(node_obj.get("total_boundaries"), 0.0))
            total_hard_flags = max(0.0, safe_float(node_obj.get("total_hard_flags"), 0.0))
            score = (win_count + 1.0) / (total_runs + 2.0) if total_runs >= 0 else 0.5
            stats[key] = {
                "total_runs": total_runs,
                "win_count": win_count,
                "total_boundaries": total_boundaries,
                "total_hard_flags": total_hard_flags,
                "score": score,
            }
    if stats:
        return stats
    for key in strategy_keys():
        stats[key] = {
            "total_runs": 0.0,
            "win_count": 0.0,
            "total_boundaries": 0.0,
            "total_hard_flags": 0.0,
            "score": 0.5,
        }
    history = profile.get("history")
    if isinstance(history, list):
        for row in history:
            if not isinstance(row, dict):
                continue
            strategy = str(row.get("strategy") or "")
            if strategy not in stats:
                continue
            total_runs = 1.0
            win = 1.0
            boundaries = max(1.0, safe_float(row.get("scene_total"), 0.0) - 1.0)
            hard_flags = max(
                safe_float(row.get("mid_word_cut_count"), 0.0) + safe_float(row.get("abbrev_or_name_cut_count"), 0.0),
                0.0,
            )
            stats[strategy]["total_runs"] += total_runs
            stats[strategy]["win_count"] += win
            stats[strategy]["total_boundaries"] += boundaries
            stats[strategy]["total_hard_flags"] += hard_flags
    for key in strategy_keys():
        tr = stats[key]["total_runs"]
        wc = stats[key]["win_count"]
        stats[key]["score"] = (wc + 1.0) / (tr + 2.0)
    return stats


def profile_confident(
    stats: Dict[str, Dict[str, float]],
    split_profile_chapter_min_runs: int,
    split_profile_chapter_min_boundaries: int,
    split_profile_chapter_min_hard_flags: int,
) -> bool:
    total_runs = sum(safe_float(v.get("total_runs"), 0.0) for v in stats.values())
    total_boundaries = sum(safe_float(v.get("total_boundaries"), 0.0) for v in stats.values())
    total_hard_flags = sum(safe_float(v.get("total_hard_flags"), 0.0) for v in stats.values())
    return (
        total_runs >= float(split_profile_chapter_min_runs)
        and total_boundaries >= float(split_profile_chapter_min_boundaries)
        and total_hard_flags >= float(split_profile_chapter_min_hard_flags)
    )


def best_strategy_from_stats(stats: Dict[str, Dict[str, float]]) -> Optional[str]:
    best_key: Optional[str] = None
    best_score = -10.0
    for key in strategy_keys():
        row = stats.get(key) or {}
        score = safe_float(row.get("score"), 0.5)
        total_runs = safe_float(row.get("total_runs"), 0.0)
        eff = score + min(0.05, total_runs * 0.001)
        if best_key is None or eff > best_score:
            best_key = key
            best_score = eff
    return best_key


def update_profile_stats(
    stats: Dict[str, Dict[str, float]],
    winning_strategy: str,
    boundaries_run: int,
    hard_flags_run: int,
    learning_rate: float,
    win_reward: float = 1.0,
) -> Dict[str, Dict[str, float]]:
    out = {k: dict(v) for k, v in stats.items()}
    if winning_strategy not in out:
        out[winning_strategy] = {
            "total_runs": 0.0,
            "win_count": 0.0,
            "total_boundaries": 0.0,
            "total_hard_flags": 0.0,
            "score": 0.5,
        }
    row = out[winning_strategy]
    lr = max(0.0, float(learning_rate))
    reward = max(0.0, min(1.0, float(win_reward)))
    row["total_runs"] = safe_float(row.get("total_runs"), 0.0) + lr
    row["win_count"] = safe_float(row.get("win_count"), 0.0) + (lr * reward)
    row["total_boundaries"] = safe_float(row.get("total_boundaries"), 0.0) + max(0.0, float(boundaries_run)) * lr
    row["total_hard_flags"] = safe_float(row.get("total_hard_flags"), 0.0) + max(0.0, float(hard_flags_run)) * lr
    for key in list(out.keys()):
        tr = safe_float(out[key].get("total_runs"), 0.0)
        wc = safe_float(out[key].get("win_count"), 0.0)
        out[key]["score"] = (wc + 1.0) / (tr + 2.0)
    return out


# ---------------------------------------------------------------------------
# Maturity Switch: select optimal strategy config based on story maturity.
# ---------------------------------------------------------------------------
MATURITY_THRESHOLD_RUNS = 8
MATURITY_THRESHOLD_HUMAN_FB = 3
MATURITY_WIN_RATE = 0.65


def _parse_jsonb_safe(value: Any) -> Any:
    import json as _json
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    try:
        return _json.loads(str(value))
    except Exception:
        return {}


def compute_story_maturity(conn, story_id: int, global_profile_key: str) -> Dict[str, Any]:
    """Compute maturity signals from global split profile and feedback."""
    profile = load_split_strategy_profile(conn, story_id, global_profile_key, _parse_jsonb_safe)
    stats = load_profile_stats(profile)
    total_runs = sum(safe_float(v.get("total_runs"), 0.0) for v in stats.values())
    total_wins = sum(safe_float(v.get("win_count"), 0.0) for v in stats.values())
    global_win_rate = (total_wins + 1.0) / (total_runs + 2.0)

    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT COUNT(*) FILTER (WHERE user_note NOT LIKE 'SYSTEM AUTO-REJECT:%%') AS human_fb_count,
                   COUNT(*) FILTER (WHERE rating < 0) AS negative_count,
                   COUNT(*) FILTER (WHERE rating > 0) AS positive_count
            FROM public.split_feedback
            WHERE story_id = %s AND created_at >= now() - interval '60 days'
            """,
            (story_id,),
        )
        row = cur.fetchone() or {}
    except Exception:
        row = {}
    finally:
        cur.close()

    human_fb = int(row.get("human_fb_count") or 0)
    neg = int(row.get("negative_count") or 0)
    pos = int(row.get("positive_count") or 0)
    fb_quality = (pos + 1.0) / (neg + pos + 2.0) if (neg + pos) > 0 else 0.5

    is_mature = (
        total_runs >= MATURITY_THRESHOLD_RUNS
        and human_fb >= MATURITY_THRESHOLD_HUMAN_FB
        and global_win_rate >= MATURITY_WIN_RATE
    )
    return {
        "is_mature": is_mature,
        "total_runs": total_runs,
        "global_win_rate": round(global_win_rate, 3),
        "human_feedback_count": human_fb,
        "feedback_quality_ratio": round(fb_quality, 3),
    }


def select_production_strategy(conn, story_id: int, global_profile_key: str) -> Dict[str, Any]:
    """Return split_controls config based on story maturity.

    Exploration Mode (immature): S0_BASE leads, collects signal.
    Production Mode (mature): S3_SEMANTIC_RESPLIT + forced_dictionary_override=True.
    """
    maturity = compute_story_maturity(conn, story_id, global_profile_key)
    if not maturity["is_mature"]:
        return {
            "mode": "exploration",
            "maturity": maturity,
            "split_controls": {
                "auto_retry_enabled": True,
                "self_healing_enabled": True,
                "forced_strategy": None,
                "forced_dictionary_override": False,
                "max_llm_calls": 6,
            },
        }
    return {
        "mode": "production",
        "maturity": maturity,
        "split_controls": {
            "auto_retry_enabled": True,
            "self_healing_enabled": True,
            "forced_strategy": "S3_SEMANTIC_RESPLIT",
            "forced_dictionary_override": True,
            "max_llm_calls": 4,
        },
    }


def load_split_feedback_penalties(conn, story_id: int, chapter_id: str) -> Dict[str, float]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT strategy,
                   COUNT(*) FILTER (WHERE rating < 0)::int AS bad_count,
                   COUNT(*) FILTER (WHERE rating > 0)::int AS good_count
            FROM public.split_feedback
            WHERE story_id = %s
              AND chapter_id = %s
              AND strategy IS NOT NULL
              AND created_at >= now() - interval '30 days'
            GROUP BY strategy
            """,
            (story_id, chapter_id),
        )
        penalties: Dict[str, float] = {}
        for row in cur.fetchall() or []:
            strategy = str(row.get("strategy") or "").strip()
            if not strategy:
                continue
            bad = int(row.get("bad_count") or 0)
            good = int(row.get("good_count") or 0)
            penalties[strategy] = float(bad - good)
        return penalties
    except Exception:
        return {}
    finally:
        cur.close()


def load_supervisor_strategy_bias(conn, story_id: int, chapter_id: str) -> Dict[str, float]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            WITH chapter_scope AS (
              SELECT strategy_selected,
                     COUNT(*) FILTER (WHERE label IN ('SUCCESS_NO_REPROCESS', 'SUCCESS_AFTER_REPROCESS'))::int AS success_count,
                     COUNT(*) FILTER (WHERE label = 'FAILED_PATTERN')::int AS failed_count
              FROM public.supervisor_memory
              WHERE story_id = %s
                AND chapter_id = %s
                AND strategy_selected IS NOT NULL
                AND created_at >= now() - interval '60 days'
              GROUP BY strategy_selected
            ),
            story_scope AS (
              SELECT strategy_selected,
                     COUNT(*) FILTER (WHERE label IN ('SUCCESS_NO_REPROCESS', 'SUCCESS_AFTER_REPROCESS'))::int AS success_count,
                     COUNT(*) FILTER (WHERE label = 'FAILED_PATTERN')::int AS failed_count
              FROM public.supervisor_memory
              WHERE story_id = %s
                AND strategy_selected IS NOT NULL
                AND created_at >= now() - interval '60 days'
              GROUP BY strategy_selected
            )
            SELECT
              COALESCE(c.strategy_selected, s.strategy_selected) AS strategy_selected,
              COALESCE(c.success_count, 0) AS chapter_success,
              COALESCE(c.failed_count, 0) AS chapter_failed,
              COALESCE(s.success_count, 0) AS story_success,
              COALESCE(s.failed_count, 0) AS story_failed
            FROM chapter_scope c
            FULL OUTER JOIN story_scope s
              ON s.strategy_selected = c.strategy_selected
            """,
            (story_id, chapter_id, story_id),
        )
        out: Dict[str, float] = {}
        for row in cur.fetchall() or []:
            strategy = str(row.get("strategy_selected") or "").strip()
            if not strategy:
                continue
            chapter_success = int(row.get("chapter_success") or 0)
            chapter_failed = int(row.get("chapter_failed") or 0)
            story_success = int(row.get("story_success") or 0)
            story_failed = int(row.get("story_failed") or 0)
            chapter_signal = float(chapter_failed) - float(chapter_success)
            story_signal = float(story_failed) - float(story_success)
            combined = (chapter_signal * 0.9) + (story_signal * 0.25)
            out[strategy] = max(-4.0, min(4.0, combined))
        return out
    except Exception:
        return {}
    finally:
        cur.close()


def infer_issue_hints_from_note(note: str) -> Dict[str, float]:
    text = (note or "").strip()
    if not text:
        return {}
    out: Dict[str, float] = {}

    # Split by common separators if mixed mode is suspected (e.g. "Helpful: ... Not Helpful: ...")
    # or just process as one block.
    # Split by common separators (colon or period). 
    # Use negative lookbehind (?<!Not ) to prevent "Helpful" matching inside "Not Helpful"
    parts = re.split(r"(?i)(?=(?:Not Helpful|(?<!Not )Helpful|Excellent|Mature|Error|Failure|Success|Victory)[:.])", text)
    processed_parts = [p.strip() for p in parts if p.strip()]

    for part in processed_parts:
        part_lower = part.lower()
        # Default sign: positive (issue/penalty)
        sign = 1.0
        if re.match(r"(?i)^(Helpful|Excellent|Mature|Success|Victory)[:.]", part):
            sign = -1.0 # Reward
        elif re.match(r"(?i)^(Not Helpful|Error|Failure)[:.]", part):
            sign = 1.0 # Penalty
        

        def hit(code: str, weight: float = 1.0) -> None:
            out[code] = out.get(code, 0.0) + (weight * sign)

        # Keyword mapping (Technical English tokens)
        if re.search(r"\bmid[\s_-]?word\b|\bcut between words?\b", part_lower):
            hit("MID_WORD_CUT", 1.4)
        if re.search(r"\bmr\.\b|\bdr\.\b|\bms\.\b|\bmrs\.\b|\bproper name\b", part_lower):
            hit("ABBREV_OR_NAME_CUT", 1.3)
        if re.search(r"\bsystemic[_\s-]?entity[_\s-]?split\b|\bentity split\b", part_lower):
            hit("SYSTEMIC_ENTITY_SPLIT", 1.4)
        if re.search(r"\bquote\b|\bdialogue\b|\bquote split\b|\bdialogue integrity\b", part_lower):
            hit("QUOTE_CONTINUITY_BREAK", 1.1)
        if re.search(r"\bfragment(ed|ation)?\b|\bcutting too small\b|\bvun\b", part_lower):
            hit("SCENE_SPLIT_TOO_FRAGMENTED", 1.2)
        if re.search(r"\btoo wide\b|\btoo long\b", part_lower):
            hit("SCENE_SPLIT_TOO_WIDE", 1.0)
        if re.search(r"\bboundary\b|\bsyntax\b", part_lower):
            hit("BOUNDARY_QUALITY", 1.1)
        if re.search(r"\bmerge\b", part_lower):
            hit("SCENE_MERGE_NEEDED", 1.0)
        
        # New technical codes (Phase 2 & 8)
        if re.search(r"\bconjunction[_\s-]?heads?\b|\bsentence[_\s-]?starts?\b|\bleading[_\s-]?conjunctions?\b", part_lower):
            hit("CONJUNCTION_HEAD", 1.5)
        if re.search(r"\bpov[_\s-]?shifts?\b|\bperspective[_\s-]?switch(es)?\b|\bgoc nhin\b", part_lower):
            hit("POV_SHIFT", 1.2)
        if re.search(r"\bnarrative[_\s-]?weights?\b|\bsouls?\b|\bflow\b", part_lower):
            hit("NARRATIVE_WEIGHT", 1.3)

        if re.search(r"\bscene\s*#?\s*\d+\b|\bboundary\b|\boffset\b|\bchars?\b", part_lower):
            for k in list(out.keys()):
                out[k] = out[k] + (0.4 * sign)
    return out


def _extract_arc_tag(text: str) -> str:
    raw = str(text or "").strip()
    if not raw:
        return ""
    m = re.search(r"(?i)\barc\s*[:=_-]?\s*([a-z0-9][a-z0-9_-]{0,40})", raw)
    if m:
        return str(m.group(1) or "").strip().lower()
    m2 = re.search(r"(?i)\b([a-z]+[0-9]{1,3})\b", raw)
    if m2 and str(m2.group(1)).lower().startswith("arc"):
        return str(m2.group(1)).strip().lower()
    return ""


def _sanitize_constraint_text(raw: str, max_len: int = 500) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # Block prompt-injection-like directives from reviewer note surface.
    bad_patterns = (
        r"(?i)\bignore\s+(all|previous|prior)\s+instructions?\b",
        r"(?i)\boverride\s+(system|developer|prompt)\b",
        r"(?i)\bact\s+as\s+",
        r"(?i)\breturn\s+json\s+only\b",
        r"(?i)\bsystem\s*prompt\b",
    )
    for pat in bad_patterns:
        text = re.sub(pat, " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if max_len > 0 and len(text) > max_len:
        text = _truncate_at_boundary(text, max_len=max_len)
    return text


def _truncate_at_boundary(text: str, max_len: int) -> str:
    raw = str(text or "")
    if max_len <= 0 or len(raw) <= max_len:
        return raw
    if max_len < 24:
        return raw[:max_len].rstrip()
    # Reserve room for marker.
    marker = " ...[TRUNCATED]"
    cap = max(1, int(max_len) - len(marker))
    head = raw[:cap]
    candidates = [
        head.rfind(". "),
        head.rfind("; "),
        head.rfind(": "),
        head.rfind("\n"),
        head.rfind(" "),
    ]
    cut = max(candidates)
    if cut < int(cap * 0.65):
        cut = cap
    trimmed = head[:cut].rstrip(" \t\r\n.;:")
    if not trimmed:
        trimmed = head.rstrip()
    return f"{trimmed}{marker}".strip()


def _split_rules_as_blocks(tech_rules_text: str) -> List[str]:
    text = str(tech_rules_text or "").replace("\r\n", "\n")
    if not text.strip():
        return []
    lines = text.split("\n")
    blocks: List[str] = []
    cur: List[str] = []
    bullet_or_num = re.compile(r"^\s*(?:[-*]\s+|\d+[.)]\s+)")
    for raw in lines:
        line = str(raw or "").rstrip()
        if not line.strip():
            if cur:
                cur.append("")
            continue
        if bullet_or_num.match(line):
            if cur:
                block = "\n".join(cur).strip()
                if block:
                    blocks.append(block)
            cur = [line]
            continue
        if cur:
            cur.append(line)
        else:
            cur = [line]
    if cur:
        block = "\n".join(cur).strip()
        if block:
            blocks.append(block)
    out: List[str] = []
    for b in blocks:
        # Keep sentence continuity but normalize noise spaces.
        norm = re.sub(r"[ \t]+", " ", b)
        norm = re.sub(r"\n{3,}", "\n\n", norm).strip()
        if norm:
            out.append(norm)
    return out


def _canonical_constraint_text(raw: str, max_len: int = 500) -> str:
    text = _sanitize_constraint_text(raw, max_len=max_len).lower()
    if not text:
        return ""
    text = re.sub(r"[\W_]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _constraint_metadata(text: str) -> Dict[str, str]:
    t = str(text or "").lower()
    category = "other"
    severity = "low"
    if re.search(r"\b(temporal|timeline|time|before|after|anchor|class that week)\b", t):
        category = "temporal"
        severity = "high"
    elif re.search(r"\b(coverage|outline|missing span|missing text|full cover)\b", t):
        category = "coverage"
        severity = "hard"
    elif re.search(r"\b(lore|archive|world[-\s]?building|snapshot)\b", t):
        category = "lore"
        severity = "medium"
    elif re.search(r"\b(structural|conjunction|sentence start|dangling|and|but|because)\b", t):
        category = "structural"
        severity = "medium"
    if re.search(r"\b(must|never|absolute|always|required|hard)\b", t):
        if severity == "low":
            severity = "medium"
        elif severity == "medium":
            severity = "high"
    return {"category": category, "severity": severity}


def _constraint_score(meta: Dict[str, str], *, source: str, text: str) -> float:
    severity_score = {"hard": 100.0, "high": 80.0, "medium": 55.0, "low": 30.0}
    category_boost = {"coverage": 10.0, "temporal": 8.0, "structural": 3.0, "lore": 1.0, "other": 0.0}
    score = severity_score.get(meta.get("severity") or "low", 30.0) + category_boost.get(meta.get("category") or "other", 0.0)
    if source == "active_constraints":
        score += 12.0
    if re.search(r"\b(chapter|scene|anchor|coverage)\b", str(text or "").lower()):
        score += 2.0
    return float(score)


def load_split_latency_window(conn, story_id: int, *, sample_size: int = 20) -> Dict[str, float]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT latency_ms
            FROM public.agent_run_trace
            WHERE story_id = %s
              AND agent_name = 'SPLITTER'
              AND status = 'DONE'
              AND latency_ms IS NOT NULL
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (int(story_id), max(5, int(sample_size or 20))),
        )
        vals: List[float] = []
        for row in cur.fetchall() or []:
            n = safe_float((row or {}).get("latency_ms"), -1.0)
            if n > 0:
                vals.append(float(n))
        vals.sort()
        if not vals:
            return {"sample_size": 0.0, "p50_ms": 0.0, "p75_ms": 0.0}

        def _pct(p: float) -> float:
            if not vals:
                return 0.0
            idx = int(round((len(vals) - 1) * p))
            idx = max(0, min(len(vals) - 1, idx))
            return float(vals[idx])

        return {
            "sample_size": float(len(vals)),
            "p50_ms": _pct(0.5),
            "p75_ms": _pct(0.75),
        }
    except Exception:
        return {"sample_size": 0.0, "p50_ms": 0.0, "p75_ms": 0.0}
    finally:
        cur.close()


def build_split_constraint_pack(
    *,
    tech_rules_text: str,
    active_constraints: List[str],
    chapter_chars: int,
    latency_window: Optional[Dict[str, float]] = None,
    retry_profile_used: Optional[str] = None,
    budget_recovery_guard_applied: bool = False,
    artifact_recovery_requested: bool = False,
) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    seen: set[str] = set()
    tech_blocks_raw_count = 0
    tech_blocks_truncated_count = 0
    rule_fragmentation_detected = False

    def _add_row(text: str, source: str) -> None:
        nonlocal tech_blocks_truncated_count
        limit = 1500 if source == "tech_rules" else 500
        raw_txt = str(text or "").strip()
        clean = _sanitize_constraint_text(raw_txt, max_len=limit)
        if not clean:
            return
        if source == "tech_rules" and "[TRUNCATED]" in clean:
            tech_blocks_truncated_count += 1
        canonical = _canonical_constraint_text(clean, max_len=limit)
        if not canonical or canonical in seen:
            return
        seen.add(canonical)
        meta = _constraint_metadata(clean)
        rows.append(
            {
                "text": clean,
                "canonical": canonical,
                "source": source,
                "category": meta["category"],
                "severity": meta["severity"],
                "score": _constraint_score(meta, source=source, text=clean),
            }
        )

    integrity_enabled = _prompt_integrity_v1_enabled()
    tech_blocks = _split_rules_as_blocks(tech_rules_text) if integrity_enabled else [
        str(line).strip() for line in str(tech_rules_text or "").splitlines() if str(line).strip()
    ]
    tech_blocks_raw_count = len(tech_blocks)
    if tech_blocks_raw_count > 0:
        short_blocks = [b for b in tech_blocks if len(str(b)) < 24]
        # Heuristic: too many tiny blocks likely indicates fragmentation in source.
        if len(short_blocks) >= max(3, int(tech_blocks_raw_count * 0.6)):
            rule_fragmentation_detected = True
    for block in tech_blocks:
        _add_row(block, "tech_rules")
    for c in active_constraints or []:
        _add_row(str(c), "active_constraints")

    raw_constraints_count = len([x for x in (active_constraints or []) if _sanitize_constraint_text(str(x))])
    dedup_constraints_count = len(rows)

    mode = "full"
    if chapter_chars > 10000:
        mode = "minimal_long_chapter"
    elif chapter_chars > 7000:
        mode = "trimmed"

    latency_adaptive_triggered = False
    lw = latency_window if isinstance(latency_window, dict) else {}
    sample_size = int(safe_float(lw.get("sample_size"), 0.0))
    p50_ms = safe_float(lw.get("p50_ms"), 0.0)
    p75_ms = safe_float(lw.get("p75_ms"), 0.0)
    if sample_size >= 8 and (p75_ms >= 260000.0 or p50_ms >= 180000.0):
        latency_adaptive_triggered = True
        if mode == "full":
            mode = "trimmed"
        elif mode == "trimmed":
            mode = "minimal_long_chapter"

    retry_profile_norm = str(retry_profile_used or "").strip()
    if retry_profile_norm == "auto_recovery_budget":
        if mode == "full":
            mode = "trimmed"
        elif mode == "trimmed":
            mode = "minimal_long_chapter"

    prompt_tier_used = "compact_first_pass"
    if (
        retry_profile_norm in ("auto_recovery_budget", "auto_recovery_artifact")
        or bool(budget_recovery_guard_applied)
        or bool(artifact_recovery_requested)
    ):
        prompt_tier_used = "recovery_extended"

    limits = {
        "full": {"tech": 10, "active": 8},
        "trimmed": {"tech": 6, "active": 5},
        "minimal_long_chapter": {"tech": 4, "active": 3},
    }[mode]
    if prompt_tier_used == "compact_first_pass":
        # Keep first-pass lean to reduce latency and budget preemption risk.
        limits = {
            "tech": min(int(limits.get("tech") or 4), 3),
            "active": min(int(limits.get("active") or 3), 2),
        }
    else:
        # Recovery tier allows richer guidance, still bounded.
        limits = {
            "tech": min(int(limits.get("tech") or 10), 8),
            "active": min(int(limits.get("active") or 8), 6),
        }

    def _is_chapter_specific_constraint(text: str) -> bool:
        t = str(text or "").lower()
        signals = (
            "[scene ",
            "ai ignores the clear time break point",
            "that afternoon, they went to the old library",
            "chapter 00",
            "chapter 0",
            "chapter ",
        )
        return any(sig in t for sig in signals)

    rows.sort(key=lambda r: (-float(r.get("score") or 0.0), str(r.get("text") or "")))
    lock_categories = {"temporal", "coverage"}
    locked = [r for r in rows if str(r.get("category")) in lock_categories]
    active_rows = [r for r in rows if str(r.get("source")) == "active_constraints"]
    tech_rows = [r for r in rows if str(r.get("source")) == "tech_rules"]

    def _select(source_rows: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
        chosen: List[Dict[str, Any]] = []
        for r in source_rows:
            if len(chosen) >= limit:
                break
            chosen.append(r)
        return chosen

    selected_active = _select(active_rows, limits["active"])
    selected_tech = _select(tech_rows, limits["tech"])

    # Anti-drift lock: keep at least one temporal and one coverage rule if available.
    selected_all = {x["canonical"]: x for x in (selected_active + selected_tech)}
    for category in ("temporal", "coverage"):
        candidate = next((x for x in locked if x.get("category") == category), None)
        if not candidate:
            continue
        if candidate["canonical"] in selected_all:
            continue
        # Prefer placing lock rule into active bucket first.
        if len(selected_active) < limits["active"]:
            selected_active.append(candidate)
        elif len(selected_tech) < limits["tech"]:
            selected_tech.append(candidate)
        else:
            # Replace lowest score from same source bucket.
            target = selected_active if str(candidate.get("source")) == "active_constraints" else selected_tech
            target.sort(key=lambda r: float(r.get("score") or 0.0))
            if target:
                target[0] = candidate
        selected_all[candidate["canonical"]] = candidate

    selected_active = list({x["canonical"]: x for x in selected_active}.values())
    selected_tech = list({x["canonical"]: x for x in selected_tech}.values())
    if prompt_tier_used == "compact_first_pass":
        # De-prioritize chapter-specific constraints in compact tier.
        selected_active = [x for x in selected_active if not _is_chapter_specific_constraint(str(x.get("text") or ""))]
        selected_tech = [x for x in selected_tech if not _is_chapter_specific_constraint(str(x.get("text") or ""))]
    else:
        # Allow chapter-specific constraints in recovery tier, but cap to avoid bloat.
        chapter_specific = [
            x for x in (selected_active + selected_tech)
            if _is_chapter_specific_constraint(str(x.get("text") or ""))
        ]
        chapter_specific_limit = 3
        if len(chapter_specific) > chapter_specific_limit:
            keep = {x["canonical"] for x in chapter_specific[:chapter_specific_limit]}
            selected_active = [
                x for x in selected_active
                if not _is_chapter_specific_constraint(str(x.get("text") or "")) or x["canonical"] in keep
            ]
            selected_tech = [
                x for x in selected_tech
                if not _is_chapter_specific_constraint(str(x.get("text") or "")) or x["canonical"] in keep
            ]

    selected_active.sort(key=lambda r: (-float(r.get("score") or 0.0), str(r.get("text") or "")))
    selected_tech.sort(key=lambda r: (-float(r.get("score") or 0.0), str(r.get("text") or "")))

    packed_active = [str(x.get("text") or "") for x in selected_active if str(x.get("text") or "")]
    packed_tech = [str(x.get("text") or "") for x in selected_tech if str(x.get("text") or "")]
    tech_rules_packed = "\n".join(f"- {line}" if not str(line).startswith("-") else str(line) for line in packed_tech)
    max_prompt_chars = 3200 if prompt_tier_used == "compact_first_pass" else 7000
    if len(tech_rules_packed) > max_prompt_chars:
        tech_rules_packed = tech_rules_packed[: max_prompt_chars - 20].rstrip() + "\n[TRUNCATED]"
    injected_constraints_count = len(packed_active) + len(packed_tech)
    dropped_low_priority_count = max(0, dedup_constraints_count - injected_constraints_count)
    prompt_rule_count = int(injected_constraints_count)
    prompt_chars_rule_section = int(len(tech_rules_packed))

    return {
        "mode": mode,
        "prompt_tier_used": prompt_tier_used,
        "tech_rules_text": tech_rules_packed,
        "active_constraints": packed_active,
        "prompt_rule_count": prompt_rule_count,
        "prompt_chars_rule_section": prompt_chars_rule_section,
        "rule_fragmentation_detected": bool(rule_fragmentation_detected),
        "latency_adaptive_triggered": bool(latency_adaptive_triggered),
        "latency_source_window": {
            "sample_size": int(sample_size),
            "p50_ms": round(float(p50_ms), 2),
            "p75_ms": round(float(p75_ms), 2),
        },
        "stats": {
            "raw_constraints_count": int(raw_constraints_count),
            "dedup_constraints_count": int(dedup_constraints_count),
            "injected_constraints_count": int(injected_constraints_count),
            "dropped_low_priority_count": int(dropped_low_priority_count),
            "tech_blocks_raw_count": int(tech_blocks_raw_count),
            "tech_blocks_packed_count": int(len(packed_tech)),
            "tech_blocks_truncated_count": int(tech_blocks_truncated_count),
        },
    }


def load_actionable_constraints(conn, story_id: int, chapter_id: str, arc_context: Optional[str] = None) -> List[str]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        current_arc_tag = _extract_arc_tag(arc_context) or _extract_arc_tag(chapter_id)
        cur.execute(
            """
            SELECT chapter_id, note, structured_tags, rating, 
                   EXTRACT(EPOCH FROM (now() - created_at))/86400.0 AS days_old
            FROM public.split_feedback
            WHERE story_id = %s
              AND created_at >= now() - interval '30 days'
            ORDER BY created_at DESC
            """,
            (story_id,),
        )
        constraints = []
        for row in cur.fetchall() or []:
            if int(row.get("rating") or 0) >= 0:
                continue
            
            row_chapter_id = str(row.get("chapter_id") or "")
            note_raw = str(row.get("note") or "")
            days_old = float(row.get("days_old") or 0.0)
            
            relevance_weight = 1.0 if row_chapter_id in (chapter_id, "GLOBAL") else 0.5
            time_weight = max(0.2, 1.0 - (days_old * 0.05))
            row_arc_tag = _extract_arc_tag(row_chapter_id)
            arc_weight = 1.0
            if current_arc_tag and row_arc_tag and current_arc_tag != row_arc_tag:
                arc_weight = 0.35

            tags = row.get("structured_tags") or {}
            if isinstance(tags, str):
                import json
                import re
                try:
                    cleaned = tags.strip()
                    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, flags=re.IGNORECASE)
                    if m:
                        cleaned = m.group(1).strip()
                    tags = json.loads(cleaned)
                    if not isinstance(tags, dict):
                        tags = {}
                except Exception:
                    tags = {}
            
            findings = tags.get("findings")
            if isinstance(findings, list):
                for f in findings:
                    details = _sanitize_constraint_text(f.get("details") or "")
                    base_impact = safe_float(f.get("impact_score"), 0.0)
                    effective_impact = base_impact * time_weight * relevance_weight * arc_weight
                    if details and effective_impact >= 0.3:
                        constraints.append((effective_impact, details))
            elif note_raw:
                fallback_details = _sanitize_constraint_text(note_raw)
                if fallback_details:
                    fallback_impact = 0.4 * time_weight * relevance_weight * arc_weight
                    if fallback_impact >= 0.3:
                        constraints.append((fallback_impact, fallback_details))
        
        constraints.sort(key=lambda x: x[0], reverse=True)
        seen = set()
        final_list = []
        for _, det in constraints:
            lower_det = det.lower()
            if lower_det not in seen:
                seen.add(lower_det)
                final_list.append(det)
                if len(final_list) >= 5:
                    break
        return final_list
    except Exception as e:
        print(f"Error loading actionable constraints: {e}")
        return []
    finally:
        cur.close()


def load_split_issue_hints(conn, story_id: int, chapter_id: str) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float]]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT issue_code, note, rating,
                   boundary_scene_idx_left,
                   boundary_scene_idx_right,
                   boundary_char_offset,
                   feedback_quality_score,
                   structured_tags,
                   EXTRACT(EPOCH FROM (now() - created_at)) / 86400 AS days_old
            FROM public.split_feedback
            WHERE story_id = %s
              AND chapter_id = %s
              AND created_at >= now() - interval '30 days'
            """,
            (story_id, chapter_id),
        )
        explicit: Dict[str, float] = {}
        inferred: Dict[str, float] = {}
        for row in cur.fetchall() or []:
            rating = int(row.get("rating") or 0)
            if rating == 0:
                continue
            sign = 1.0 if rating < 0 else -1.0
            has_boundary_ref = bool(
                row.get("boundary_scene_idx_left") is not None
                or row.get("boundary_scene_idx_right") is not None
                or row.get("boundary_char_offset") is not None
            )
            ref_weight = 3.0 if has_boundary_ref else 1.0
            quality_weight = max(0.2, min(1.0, safe_float(row.get("feedback_quality_score"), 0.5)))
            days_old = max(0.0, float(row.get("days_old") or 0.0))
            time_decay = max(0.2, 1.0 - (days_old / 30.0))
            total_weight = ref_weight * quality_weight * time_decay

            tags = row.get("structured_tags") or {}
            if isinstance(tags, str):
                import json
                import re
                try:
                    cleaned = tags.strip()
                    # User's recommended strict stripping regex
                    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, flags=re.IGNORECASE)
                    if m:
                        cleaned = m.group(1).strip()
                    elif cleaned.startswith("{") or cleaned.startswith("["):
                        pass
                    else:
                        raise ValueError("Not JSON")
                    tags = json.loads(cleaned)
                    if not isinstance(tags, dict):
                        tags = {}
                except Exception:
                    tags = {}

            severity = str(tags.get("severity") or "").lower()
            if severity == "system_rule" or tags.get("priority") is True:
                total_weight *= 2.0  # Priority conflict resolution

            code = str(row.get("issue_code") or "").strip().upper()
            if code and code != "OTHER":
                explicit[code] = explicit.get(code, 0.0) + sign * total_weight

            findings = tags.get("findings")
            inferred_hits: Dict[str, float] = {}

            if isinstance(findings, list) and findings:
                # [Industrial-Grade] Process multiple structured findings
                for f in findings:
                    cat = str(f.get("category") or "").lower()
                    details = str(f.get("details") or "").lower()
                    score = max(0.1, min(1.0, float(safe_float(f.get("impact_score"), 0.5))))
                    f_weight = score * 1.5 # Base scale for structured findings

                    hits: Dict[str, float] = {}
                    if cat == "dialogue_rule":
                        hits["QUOTE_CONTINUITY_BREAK"] = 1.0
                        if "conjunction" in details:
                            hits["CONJUNCTION_HEAD"] = 1.2
                    elif cat == "entity_protection":
                        hits["SYSTEMIC_ENTITY_SPLIT"] = 1.0
                        hits["ABBREV_OR_NAME_CUT"] = 0.8
                    elif cat == "context_error":
                        hits["POV_SHIFT"] = 1.0
                        hits["NARRATIVE_WEIGHT"] = 1.1
                        hits["BOUNDARY_QUALITY"] = 0.8
                    elif cat == "pacing":
                        if "fragment" in details or "too many" in details:
                            hits["SCENE_SPLIT_TOO_FRAGMENTED"] = 1.2
                        if "wide" in details or "long" in details:
                            hits["SCENE_SPLIT_TOO_WIDE"] = 1.0
                        if "merge" in details or "consolidate" in details:
                            hits["SCENE_MERGE_NEEDED"] = 1.2
                    
                    for k, v in hits.items():
                        inferred_hits[k] = inferred_hits.get(k, 0.0) + (v * f_weight)
            else:
                # [Legacy/Fallback] Single-tag or raw note analysis
                cat = str(tags.get("category") or "").lower()
                if cat == "dialogue_rule":
                    inferred_hits = {"QUOTE_CONTINUITY_BREAK": 1.5}
                elif cat == "entity_protection":
                    inferred_hits = {"SYSTEMIC_ENTITY_SPLIT": 1.5, "ABBREV_OR_NAME_CUT": 1.0}
                elif cat == "context_error":
                    inferred_hits = {"BOUNDARY_QUALITY": 1.2}
                elif cat == "pacing":
                    inferred_hits = {"SCENE_SPLIT_TOO_WIDE": 1.0, "SCENE_SPLIT_TOO_FRAGMENTED": 1.0}
                else:
                    note = str(row.get("note") or "")
                    inferred_hits = infer_issue_hints_from_note(note)

            for issue_code, w in inferred_hits.items():
                # Apply the rating sign (Negative rating -> Penalty, Positive rating -> Reward)
                inferred[issue_code] = inferred.get(issue_code, 0.0) + total_weight * float(w) * sign

        combined: Dict[str, float] = {}
        keys = set(explicit.keys()) | set(inferred.keys())
        for k in keys:
            combined[k] = float(explicit.get(k, 0.0)) + float(inferred.get(k, 0.0))
        return explicit, inferred, combined
    except Exception:
        return {}, {}, {}
    finally:
        cur.close()


def boundary_type_from_issue(issue_code: str) -> str:
    code = issue_code.strip().upper()
    if code in {"MID_WORD_CUT", "ABBREV_OR_NAME_CUT", "SYSTEMIC_ENTITY_SPLIT", "BOUNDARY_QUALITY", "CONJUNCTION_HEAD"}:
        return "hard_structure"
    if code in {"QUOTE_CONTINUITY_BREAK"}:
        return "dialogue_continuity"
    if code in {"SCENE_SPLIT_TOO_FRAGMENTED", "SCENE_MERGE_NEEDED"}:
        return "fragmentation"
    if code in {"SCENE_SPLIT_TOO_WIDE"}:
        return "wide_split"
    if code in {"POV_SHIFT", "NARRATIVE_WEIGHT"}:
        return "semantic_transition"
    return "generic"


def aggregate_boundary_type_hints(issue_hints: Dict[str, float]) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for issue_code, score in issue_hints.items():
        t = boundary_type_from_issue(issue_code)
        out[t] = out.get(t, 0.0) + float(score or 0.0)
    return out


def issue_strategy_bias(issue_hints: Dict[str, float]) -> Dict[str, float]:
    bias: Dict[str, float] = {}

    def prefer(issue_code: str, strategy: str, weight: float) -> None:
        signal = float(issue_hints.get(issue_code) or 0.0)
        if signal <= 0:
            return
        bias[strategy] = bias.get(strategy, 0.0) - min(4.0, signal * weight)

    prefer("SYSTEMIC_ENTITY_SPLIT", "S1_TARGETED_WINDOW_REPAIR", 1.2)
    prefer("SYSTEMIC_ENTITY_SPLIT", "S1_STRICT_BOUNDARY", 1.0)
    prefer("SYSTEMIC_ENTITY_SPLIT", "S3_SEMANTIC_RESPLIT", 0.4)
    prefer("ABBREV_OR_NAME_CUT", "S1_STRICT_BOUNDARY", 1.0)
    prefer("ABBREV_OR_NAME_CUT", "S1_TARGETED_WINDOW_REPAIR", 1.1)
    prefer("ABBREV_OR_NAME_CUT", "S3_SEMANTIC_RESPLIT", 0.6)
    prefer("QUOTE_CONTINUITY_BREAK", "S2_MERGE_FIX", 1.0)
    prefer("QUOTE_CONTINUITY_BREAK", "S3_SEMANTIC_RESPLIT", 0.6)
    prefer("MID_WORD_CUT", "S1_STRICT_BOUNDARY", 0.9)
    prefer("MID_WORD_CUT", "S1_TARGETED_WINDOW_REPAIR", 1.1)
    prefer("MID_WORD_CUT", "S3_SEMANTIC_RESPLIT", 0.5)
    prefer("BOUNDARY_QUALITY", "S1_STRICT_BOUNDARY", 0.7)
    prefer("BOUNDARY_QUALITY", "S1_TARGETED_WINDOW_REPAIR", 0.9)
    prefer("BOUNDARY_QUALITY", "S2_MERGE_FIX", 0.5)
    prefer("SCENE_SPLIT_TOO_WIDE", "S3_SEMANTIC_RESPLIT", 0.8)
    prefer("SCENE_SPLIT_TOO_FRAGMENTED", "S2_MERGE_FIX", 1.0)
    prefer("SCENE_SPLIT_TOO_FRAGMENTED", "S3_SEMANTIC_RESPLIT", 0.4)
    
    # New biases
    prefer("CONJUNCTION_HEAD", "S1_STRICT_BOUNDARY", 1.2)
    prefer("CONJUNCTION_HEAD", "S3_SEMANTIC_RESPLIT", 0.8)
    prefer("POV_SHIFT", "S3_SEMANTIC_RESPLIT", 1.0)
    prefer("NARRATIVE_WEIGHT", "S3_SEMANTIC_RESPLIT", 1.2)
    return bias


def boundary_type_strategy_bias(boundary_type_hints: Dict[str, float]) -> Dict[str, float]:
    bias: Dict[str, float] = {}

    def prefer(boundary_type: str, strategy: str, weight: float) -> None:
        signal = float(boundary_type_hints.get(boundary_type) or 0.0)
        if signal <= 0:
            return
        bias[strategy] = bias.get(strategy, 0.0) - min(4.0, signal * weight)

    prefer("hard_structure", "S1_TARGETED_WINDOW_REPAIR", 1.4)
    prefer("hard_structure", "S1_STRICT_BOUNDARY", 1.2)
    prefer("hard_structure", "S3_SEMANTIC_RESPLIT", 0.6)
    prefer("dialogue_continuity", "S2_MERGE_FIX", 1.0)
    prefer("dialogue_continuity", "S3_SEMANTIC_RESPLIT", 0.5)
    prefer("fragmentation", "S2_MERGE_FIX", 1.2)
    prefer("fragmentation", "S3_SEMANTIC_RESPLIT", 0.4)
    prefer("wide_split", "S3_SEMANTIC_RESPLIT", 1.0)
    prefer("semantic_transition", "S3_SEMANTIC_RESPLIT", 1.2)
    return bias


def forced_strategy_from_issue_hints(issue_hints: Dict[str, float]) -> Optional[str]:
    systemic_signal = float(issue_hints.get("SYSTEMIC_ENTITY_SPLIT") or 0.0)
    if systemic_signal >= 2.0:
        return "S1_TARGETED_WINDOW_REPAIR"
    structure_signal = max(
        float(issue_hints.get("MID_WORD_CUT") or 0.0),
        float(issue_hints.get("ABBREV_OR_NAME_CUT") or 0.0),
    )
    if structure_signal >= 2.0:
        return "S1_TARGETED_WINDOW_REPAIR"
    return None

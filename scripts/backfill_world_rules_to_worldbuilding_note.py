#!/usr/bin/env python3
"""Backfill: project existing writing_snapshot_v3 world_rules into
story_worldbuilding_note (injection_mode='CORE').

Context (issue #196): world/setting rules are extracted by analysis and stored
in writing_snapshot_v3.snapshot_json->'world_rules', but the writer's CORE
world-context channel (storyContextBuilder.ts) reads story_worldbuilding_note,
which the analysis pipeline historically never wrote to -> world drift.

Going forward, process_writing_analysis_task projects world rules at
analysis-persist time (_project_world_rules_to_core_notes in
services/memory-bridge/worker_task_handlers.py). This script backfills snapshots
that were analyzed before that bridge existed.

Idempotent and mirrors the worker helper exactly:
  content    = "label: detail"  (or just "label" when detail empty), capped 500 chars
  category   = 'world_rule', importance = 4, injection_mode = 'CORE', tags = {world_rule}
  dedup key  = (story_id, category, content) via WHERE NOT EXISTS

Examples:
  # All stories (dry run first)
  python3 backfill_world_rules_to_worldbuilding_note.py --dry-run
  python3 backfill_world_rules_to_worldbuilding_note.py

  # Single story
  python3 backfill_world_rules_to_worldbuilding_note.py --story-id 2
"""

from __future__ import annotations

import argparse
import os
import sys

import psycopg2
import psycopg2.extras


def _resolve_dsn() -> str:
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        print("ERROR: DATABASE_URL not set (e.g. postgresql://novel:novelpass@localhost:5433/novel)", file=sys.stderr)
        sys.exit(2)
    return dsn


def _rule_content(rule) -> str:
    """Mirror _project_world_rules_to_core_notes content shaping."""
    if isinstance(rule, dict):
        label = str(rule.get("label") or rule.get("rule") or "").strip()
        detail = str(rule.get("detail") or rule.get("description") or "").strip()
    else:
        label = str(rule or "").strip()
        detail = ""
    if not label:
        return ""
    content = f"{label}: {detail}" if detail else label
    return content[:500]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--story-id", type=int, default=None, help="Limit to a single story id.")
    ap.add_argument("--dry-run", action="store_true", help="Report what would be inserted without writing.")
    args = ap.parse_args()

    conn = psycopg2.connect(_resolve_dsn())
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    where = "jsonb_typeof(snapshot_json->'world_rules') = 'array'"
    params: list = []
    if args.story_id is not None:
        where += " AND story_id = %s"
        params.append(args.story_id)

    cur.execute(
        f"""
        SELECT story_id, snapshot_json->'world_rules' AS world_rules
        FROM public.writing_snapshot_v3
        WHERE {where}
        ORDER BY story_id, chapter_id
        """,
        params,
    )
    rows = cur.fetchall()

    inserted = 0
    scanned_rules = 0
    per_story: dict[int, int] = {}
    for row in rows:
        story_id = int(row["story_id"])
        rules = row["world_rules"] or []
        if not isinstance(rules, list):
            continue
        seen_this_row: set[str] = set()
        for rule in rules:
            scanned_rules += 1
            content = _rule_content(rule)
            if not content or content in seen_this_row:
                continue
            seen_this_row.add(content)
            if args.dry_run:
                cur.execute(
                    """
                    SELECT 1 FROM public.story_worldbuilding_note
                    WHERE story_id = %s AND category = 'world_rule' AND content = %s
                    """,
                    (story_id, content),
                )
                if cur.fetchone() is None:
                    inserted += 1
                    per_story[story_id] = per_story.get(story_id, 0) + 1
                continue
            cur.execute(
                """
                INSERT INTO public.story_worldbuilding_note
                  (story_id, category, content, importance, injection_mode, tags)
                SELECT %s, 'world_rule', %s, 4, 'CORE', ARRAY['world_rule']::text[]
                WHERE NOT EXISTS (
                  SELECT 1 FROM public.story_worldbuilding_note
                  WHERE story_id = %s AND category = 'world_rule' AND content = %s
                )
                """,
                (story_id, content, story_id, content),
            )
            n = int(cur.rowcount or 0)
            inserted += n
            if n:
                per_story[story_id] = per_story.get(story_id, 0) + n

    if args.dry_run:
        conn.rollback()
        verb = "would insert"
    else:
        conn.commit()
        verb = "inserted"

    print(f"Scanned {len(rows)} snapshot rows, {scanned_rules} rule entries.")
    print(f"{verb} {inserted} CORE world_rule notes.")
    for sid in sorted(per_story):
        print(f"  story {sid}: {verb} {per_story[sid]}")

    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

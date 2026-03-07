#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, Optional

import psycopg2
from psycopg2.extras import RealDictCursor


LEGACY_PROMPTS: Dict[str, Dict[str, Any]] = {
    "NARRATIVE_STYLIST": {
        "system_prompt": """
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

### 2. STORY CONTEXT
{{context_block}}

### 3. BEAT SPECIFICATION
[BEAT {{beat_idx}}: {{beat_label}}]
Description: {{beat_description}}
Characters: {{beat_characters}}
Location: {{beat_location}}
Target words for this beat: {{target_words}} (acceptable range: {{min_words}}-{{max_words}})

### 4. OUTPUT INSTRUCTIONS
- Output ONLY the prose text.
- Keep output length within {{min_words}}-{{max_words}} words.
{{memory_block}}
""".strip(),
        "output_contract_json": {
            "schema_version": 1,
            "type": "raw_text",
            "required_fields": [],
            "max_output_chars": 12000,
            "strict": True,
            "notes": "raw prose only, no preamble/postamble",
        },
        "guardrail_json": {
            "meta_leak_block": True,
            "word_budget_min": 120,
            "word_budget_max": 1200,
            "entity_lock": True,
            "max_retries": 1,
        },
        "change_note": "legacy-code-seed: stylist fallback prompt",
    },
    "NARRATIVE_CRITIC": {
        "system_prompt": """
You are the EDITORIAL CRITIC AGENT. Review the DRAFT PROSE below.
Output JSON: { "summary": "...", "patches": ["..."] }

### BEAT SPEC
{{beat_description}}

### DRAFT PROSE
{{draft_prose}}
""".strip(),
        "output_contract_json": {
            "schema_version": 1,
            "type": "json",
            "required_fields": ["summary", "patches"],
            "max_output_chars": 12000,
            "strict": True,
        },
        "guardrail_json": {
            "meta_leak_block": True,
            "max_retries": 1,
        },
        "change_note": "legacy-code-seed: critic fallback prompt",
    },
    "NARRATIVE_REFINE": {
        "system_prompt": """
Revise this prose based on feedback: {{critic_summary}}

DRAFT:
{{draft_prose}}
""".strip(),
        "output_contract_json": {
            "schema_version": 1,
            "type": "raw_text",
            "required_fields": [],
            "max_output_chars": 12000,
            "strict": True,
            "notes": "return revised prose only",
        },
        "guardrail_json": {
            "meta_leak_block": True,
            "entity_lock": True,
            "max_retries": 1,
        },
        "change_note": "legacy-code-seed: refine fallback prompt",
    },
    # Split-side placeholders for governance visibility.
    "SPLITTER": {
        "system_prompt": """
You are SPLITTER. Produce chapter split proposal with coherent scene boundaries.
Output must preserve chronology and entity continuity.
""".strip(),
        "output_contract_json": {"schema_version": 1, "type": "json", "required_fields": [], "strict": True},
        "guardrail_json": {"entity_lock": True, "max_retries": 1},
        "change_note": "seed: split agent governance baseline",
    },
    "SPLIT_CRITIC": {
        "system_prompt": """
You are SPLIT_CRITIC. Review split quality and return strict, actionable quality findings.
""".strip(),
        "output_contract_json": {"schema_version": 1, "type": "json", "required_fields": [], "strict": True},
        "guardrail_json": {"max_retries": 1},
        "change_note": "seed: split critic governance baseline",
    },
    "SUPERVISOR": {
        "system_prompt": """
You are SUPERVISOR. Decide pass/retry/manual_review from split quality and policy constraints.
""".strip(),
        "output_contract_json": {"schema_version": 1, "type": "json", "required_fields": [], "strict": True},
        "guardrail_json": {"max_retries": 1},
        "change_note": "seed: supervisor governance baseline",
    },
}


def _dsn() -> str:
    return (
        os.getenv("DB_DSN")
        or os.getenv("DATABASE_URL")
        or "postgresql://novel:novelpass@localhost:5433/novel"
    )


def _story_id(conn, slug: str) -> int:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id FROM public.story_series WHERE slug = %s LIMIT 1", (slug,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"STORY_NOT_FOUND:{slug}")
        return int(row["id"])
    finally:
        cur.close()


def _get_profile_id(
    conn, *, agent_name: str, scope: str, story_id: Optional[int], chapter_id: Optional[str], created_by: str
) -> int:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT id
            FROM public.agent_prompt_profile
            WHERE agent_name = %s
              AND scope = %s
              AND COALESCE(story_id, 0) = COALESCE(%s, 0)
              AND COALESCE(chapter_id, '') = COALESCE(%s, '')
            LIMIT 1
            """,
            (agent_name, scope, story_id, chapter_id),
        )
        row = cur.fetchone()
        if row:
            return int(row["id"])
        cur.execute(
            """
            INSERT INTO public.agent_prompt_profile
              (agent_name, scope, story_id, chapter_id, status, created_by)
            VALUES
              (%s, %s, %s, %s, 'ACTIVE', %s)
            RETURNING id
            """,
            (agent_name, scope, story_id, chapter_id, created_by),
        )
        return int(cur.fetchone()["id"])
    finally:
        cur.close()


def _has_any_version(conn, profile_id: int) -> bool:
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM public.agent_prompt_version WHERE profile_id = %s LIMIT 1", (profile_id,))
        return cur.fetchone() is not None
    finally:
        cur.close()


def _next_version_no(conn, profile_id: int) -> int:
    cur = conn.cursor()
    try:
        cur.execute("SELECT COALESCE(MAX(version_no), 0) + 1 FROM public.agent_prompt_version WHERE profile_id = %s", (profile_id,))
        return int(cur.fetchone()[0] or 1)
    finally:
        cur.close()


def _insert_active_version(
    conn,
    *,
    profile_id: int,
    version_no: int,
    spec: Dict[str, Any],
    created_by: str,
) -> int:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.agent_prompt_version SET status = 'ARCHIVED' WHERE profile_id = %s AND status = 'ACTIVE'",
            (profile_id,),
        )
        cur.execute(
            """
            INSERT INTO public.agent_prompt_version
              (profile_id, version_no, system_prompt, developer_prompt, output_contract_json, guardrail_json, change_note, status, created_by)
            VALUES
              (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, 'ACTIVE', %s)
            RETURNING id
            """,
            (
                profile_id,
                version_no,
                str(spec.get("system_prompt") or "").strip(),
                None,
                json.dumps(spec.get("output_contract_json") or {}),
                json.dumps(spec.get("guardrail_json") or {}),
                str(spec.get("change_note") or "seed legacy prompt"),
                created_by,
            ),
        )
        return int(cur.fetchone()["id"])
    finally:
        cur.close()


def _insert_tuning_event(
    conn,
    *,
    agent_name: str,
    to_version_id: int,
    author: str,
) -> None:
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO public.agent_tuning_event
              (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
            VALUES
              (%s, NULL, %s, 'PROMOTE_ACTIVE', 'SEED_LEGACY_PROMPT_IMPORT', %s, %s)
            """,
            (agent_name, to_version_id, author, author),
        )
    finally:
        cur.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed agent prompt registry from legacy code prompts.")
    parser.add_argument("--story-slug", required=True, help="story slug for scope=story profiles")
    parser.add_argument("--created-by", default="seed-script", help="created_by/author value")
    parser.add_argument(
        "--update-existing",
        action="store_true",
        help="also create a new ACTIVE version for profiles that already have versions",
    )
    args = parser.parse_args()

    conn = psycopg2.connect(_dsn())
    inserted = 0
    skipped = 0
    try:
        conn.autocommit = False
        story_id = _story_id(conn, args.story_slug)
        for agent_name, spec in LEGACY_PROMPTS.items():
            profile_id = _get_profile_id(
                conn,
                agent_name=agent_name,
                scope="story",
                story_id=story_id,
                chapter_id=None,
                created_by=args.created_by,
            )
            has_versions = _has_any_version(conn, profile_id)
            if has_versions and not args.update_existing:
                skipped += 1
                print(f"[seed] skip existing profile agent={agent_name} profile_id={profile_id}")
                continue
            version_no = _next_version_no(conn, profile_id)
            version_id = _insert_active_version(
                conn,
                profile_id=profile_id,
                version_no=version_no,
                spec=spec,
                created_by=args.created_by,
            )
            _insert_tuning_event(conn, agent_name=agent_name, to_version_id=version_id, author=args.created_by)
            inserted += 1
            print(f"[seed] inserted agent={agent_name} profile_id={profile_id} version_id={version_id} version_no={version_no}")
        conn.commit()
        print(f"[seed] done inserted={inserted} skipped={skipped} story_slug={args.story_slug}")
        return 0
    except Exception as err:
        conn.rollback()
        print(f"[seed] failed: {err}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())

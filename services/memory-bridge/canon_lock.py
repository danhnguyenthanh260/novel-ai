#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
canon_lock.py (FIXED TARGET, OVERWRITE)
- Mục tiêu: UPSERT chapter_memory (JSON) vào public.canon_chapter.
- Conflict policy: overwrite toàn bộ chapter_memory.
- created_at: dùng DEFAULT của DB (không set thủ công).
- updated_at: luôn set NOW() khi insert/update.
- DSN mặc định: postgresql://novel:novelpass@localhost:5433/novel
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict

import psycopg2


DEFAULT_DSN = "postgresql://novel:novelpass@localhost:5433/novel"


def _connect(dsn: str):
    return psycopg2.connect(dsn)


def _load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _ensure_chapter_id_matches(chapter_id: str, chapter_memory: Dict[str, Any]) -> None:
    mem_id = chapter_memory.get("chapter_id")
    if mem_id is None:
        raise ValueError("chapter_memory thiếu key 'chapter_id'.")
    if str(mem_id) != str(chapter_id):
        raise ValueError(
            f"chapter_id arg='{chapter_id}' nhưng chapter_memory.chapter_id='{mem_id}' (không khớp)."
        )


UPSERT_SQL = """
INSERT INTO public.canon_chapter (chapter_id, chapter_memory)
VALUES (%s, %s::jsonb)
ON CONFLICT (chapter_id)
DO UPDATE SET
  chapter_memory = EXCLUDED.chapter_memory,
  updated_at = NOW();
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="Canon Lock (fixed target: public.canon_chapter, overwrite).")
    ap.add_argument("--dsn", default=os.getenv("DB_DSN", DEFAULT_DSN), help="Postgres DSN")
    ap.add_argument("--chapter-id", required=True, help="Chapter ID (ví dụ: ch01_test)")
    ap.add_argument("--json", required=True, help="Đường dẫn file chapter_memory.json")
    ap.add_argument("--dry-run", action="store_true", help="Chỉ validate, không ghi DB")
    ap.add_argument("--print", dest="do_print", action="store_true", help="In payload JSON sẽ ghi DB")
    args = ap.parse_args()

    chapter_memory = _load_json(args.json)
    _ensure_chapter_id_matches(args.chapter_id, chapter_memory)

    payload = json.dumps(chapter_memory, ensure_ascii=False)

    if args.do_print:
        print(payload)

    if args.dry_run:
        print("🧪 Dry-run OK. Không ghi DB.")
        return 0

    conn = _connect(args.dsn)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(UPSERT_SQL, (args.chapter_id, payload))
        conn.commit()
        print(f"💾 Canon locked (UPSERT/overwrite) for chapter_id='{args.chapter_id}'.")
        return 0
    except Exception as e:
        conn.rollback()
        print(f"❌ Canon lock failed: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from typing import List, Optional

import psycopg2

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MEMORY_BRIDGE_DIR = os.path.dirname(SCRIPT_DIR)
if MEMORY_BRIDGE_DIR not in sys.path:
    sys.path.insert(0, MEMORY_BRIDGE_DIR)

from worker_common import call_llm_embedding
from worker_runtime_config import get_llm_timeout
from worker_constants import DEFAULT_DSN


def embed_text_hash(text: str, dim: int = 96) -> List[float]:
    vec = [0.0] * max(8, int(dim))
    toks = [t for t in "".join(ch.lower() if ch.isalnum() else " " for ch in (text or "")).split() if t]
    if not toks:
        return vec
    for tok in toks:
        h = hashlib.sha256(tok.encode("utf-8")).digest()
        idx = int.from_bytes(h[:2], "big") % len(vec)
        sign = 1.0 if (h[2] % 2 == 0) else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def semantic_with_fallback(text: str) -> List[float]:
    v = call_llm_embedding(text, timeout_sec=get_llm_timeout("embedding"))
    if isinstance(v, list) and len(v) >= 16:
        norm = math.sqrt(sum(float(x) * float(x) for x in v)) or 1.0
        return [float(x) / norm for x in v]
    return embed_text_hash(text, dim=96)


def parse_embedding_len(raw) -> int:
    if not isinstance(raw, list):
        return 0
    out = 0
    for x in raw:
        if isinstance(x, (int, float)):
            out += 1
        else:
            return 0
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Backfill agent_memory_vector.embedding_json using embedding provider with fallback.")
    ap.add_argument("--dsn", default=os.getenv("DB_DSN", os.getenv("DATABASE_URL", DEFAULT_DSN)))
    ap.add_argument("--story-id", type=int, default=0)
    ap.add_argument("--agent-name", default="")
    ap.add_argument("--batch-size", type=int, default=100)
    ap.add_argument("--max-rows", type=int, default=1000)
    ap.add_argument("--reembed-dim", type=int, default=96, help="Also re-embed rows currently at this dim (default 96 hash vectors).")
    args = ap.parse_args()

    conn = psycopg2.connect(args.dsn)
    conn.autocommit = False
    processed = 0
    updated = 0
    try:
        while processed < args.max_rows:
            cur = conn.cursor()
            try:
                where = []
                params: List[object] = []
                if args.story_id > 0:
                    params.append(args.story_id)
                    where.append(f"story_id = %s")
                if args.agent_name.strip():
                    params.append(args.agent_name.strip())
                    where.append(f"agent_name = %s")
                where_sql = f"WHERE {' AND '.join(where)}" if where else ""

                cur.execute(
                    f"""
                    SELECT id, memory_text, embedding_json
                    FROM public.agent_memory_vector
                    {where_sql}
                    ORDER BY id ASC
                    LIMIT %s
                    """,
                    (*params, args.batch_size),
                )
                rows = cur.fetchall() or []
            finally:
                cur.close()

            if not rows:
                break

            for row in rows:
                if processed >= args.max_rows:
                    break
                mem_id = int(row[0])
                text = str(row[1] or "").strip()
                emb_raw = row[2]
                emb_existing = emb_raw if isinstance(emb_raw, list) else []
                emb_len = parse_embedding_len(emb_existing)
                needs = (emb_len == 0) or (emb_len == int(args.reembed_dim))
                processed += 1
                if not needs or not text:
                    continue

                new_emb = semantic_with_fallback(text)
                cur2 = conn.cursor()
                try:
                    cur2.execute(
                        """
                        UPDATE public.agent_memory_vector
                        SET embedding_json = %s::jsonb
                        WHERE id = %s
                        """,
                        (json.dumps(new_emb), mem_id),
                    )
                finally:
                    cur2.close()
                updated += 1

            conn.commit()
            print(f"[backfill] processed={processed} updated={updated}", flush=True)

        print(f"[backfill] done processed={processed} updated={updated}", flush=True)
        return 0
    except Exception as err:
        conn.rollback()
        print(f"[backfill] failed: {err}", file=sys.stderr, flush=True)
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())

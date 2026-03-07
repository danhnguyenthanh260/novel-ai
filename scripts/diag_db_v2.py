
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import json

def check():
    # Use accurate DSN from .env.local
    dsn = "postgresql://novel:novelpass@localhost:5433/novel"
    print(f"Connecting to: {dsn}")
    try:
        conn = psycopg2.connect(dsn)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        print("--- Task 1301 Status ---")
        cur.execute("SELECT id, status, task_type, payload_json::text as payload, result_json::text as result, error FROM public.ingest_task WHERE id = 1301")
        row = cur.fetchone()
        if row:
            print(f"ID: {row['id']}")
            print(f"Status: {row['status']}")
            print(f"Type: {row['task_type']}")
            res_str = str(row['result'])
            print(f"Result (len={len(res_str)}): {res_str[:500]}...")
            print(f"Error: {row['error']}")
        else:
            print("Task 1301 not found.")

        print("\n--- Recent Tasks (Last 5) ---")
        cur.execute("SELECT id, status, task_type, updated_at FROM public.ingest_task ORDER BY id DESC LIMIT 5")
        for r in cur.fetchall():
            print(f"{r['id']} | {r['status']} | {r['task_type']} | {r['updated_at']}")

        print("\n--- Writing Snapshots Count ---")
        try:
            cur.execute("SELECT count(*) as count FROM public.writing_snapshot_v3")
            print(f"writing_snapshot_v3: {cur.fetchone()['count']}")
        except Exception as e:
            print(f"writing_snapshot_v3 check failed: {e}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Database Connection Error: {e}")

if __name__ == "__main__":
    check()

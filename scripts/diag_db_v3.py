
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import json

def check():
    dsn = "postgresql://novel:novelpass@localhost:5433/novel"
    try:
        conn = psycopg2.connect(dsn)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        print("\n--- Recent WRITING_ANALYSIS Tasks ---")
        cur.execute("""
            SELECT id, status, updated_at, 
                   payload_json::text as payload, 
                   result_json::text as result, 
                   error 
            FROM public.ingest_task 
            WHERE task_type = 'WRITING_ANALYSIS'
            ORDER BY id DESC LIMIT 5
        """)
        for r in cur.fetchall():
            print(f"ID: {r['id']} | Status: {r['status']} | Updated: {r['updated_at']}")
            print(f"  Error: {r['error']}")
            res = str(r['result'] or "")
            print(f"  Result Preview: {res[:300]}...")
            print("-" * 20)

        print("\n--- Snapshots Count ---")
        cur.execute("SELECT count(*) as count FROM public.writing_snapshot_v3")
        print(f"writing_snapshot_v3 count: {cur.fetchone()['count']}")

        print("\n--- Checking for Migrations ---")
        cur.execute("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'writing_%'")
        for r in cur.fetchall():
            print(f"Table exists: {r['tablename']}")
            # Check columns of writing_snapshot_v3
            if r['tablename'] == 'writing_snapshot_v3':
                cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'writing_snapshot_v3'")
                cols = [c['column_name'] for c in cur.fetchall()]
                print(f"  Columns: {', '.join(cols)}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check()

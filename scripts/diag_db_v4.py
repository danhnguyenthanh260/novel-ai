
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import json

def check():
    dsn = "postgresql://novel:novelpass@localhost:5433/novel"
    try:
        conn = psycopg2.connect(dsn)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        print("\n--- Detailed Column Check: writing_snapshot_v3 ---")
        cur.execute("""
            SELECT column_name, is_nullable, column_default, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'writing_snapshot_v3'
            ORDER BY ordinal_position
        """)
        for r in cur.fetchall():
            print(f"Col: {r['column_name']} | Nullable: {r['is_nullable']} | Default: {r['column_default']} | Type: {r['data_type']}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check()

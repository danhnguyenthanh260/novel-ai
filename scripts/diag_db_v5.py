
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import json

def check():
    dsn = "postgresql://novel:novelpass@localhost:5433/novel"
    try:
        conn = psycopg2.connect(dsn)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        tables = ['writing_analysis_staging', 'writing_snapshot_v3', 'writing_scope_snapshot_v1']
        for table in tables:
            try:
                cur.execute(f"SELECT count(*) as count FROM public.{table}")
                print(f"Table: {table} | Row Count: {cur.fetchone()['count']}")
            except Exception as e:
                print(f"Table: {table} | Error: {e}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check()

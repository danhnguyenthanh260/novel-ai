import psycopg2
from services.memory_bridge.worker_constants import DEFAULT_DSN

conn = psycopg2.connect(DEFAULT_DSN)
cur = conn.cursor()
cur.execute("SELECT id, rule_text FROM dictionary_rule WHERE rule_text ILIKE '%These markers serve%';")
rows = cur.fetchall()
for row in rows:
    print(f"ID: {row[0]}")
    print(f"TEXT: {row[1]}")
cur.close()
conn.close()

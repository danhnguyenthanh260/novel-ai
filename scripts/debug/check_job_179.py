import os
import psycopg2
from psycopg2.extras import RealDictCursor
import json

def check():
    # Corrected DSN based on .env.local
    dsn = "postgresql://novel:novelpass@localhost:5433/novel"
    try:
        conn = psycopg2.connect(dsn)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        print("--- Job 109 Status ---")
        cur.execute("SELECT id, status, story_id, ingest_run_id, total_tasks, completed_tasks FROM public.ingest_job WHERE id = 109")
        job = cur.fetchone()
        if job:
            print(json.dumps(job, indent=2, default=str))
        else:
            print("Job 109 not found.")

        print("\n--- Task 179 Status ---")
        cur.execute("SELECT id, job_id, status, task_type, human_outcome, result_json::text as result FROM public.ingest_task WHERE id = 179")
        task = cur.fetchone()
        if task:
            print(f"ID: {task['id']}")
            print(f"Job ID: {task['job_id']}")
            print(f"Status: {task['status']}")
            print(f"Type: {task['task_type']}")
            print(f"Human Outcome: {task['human_outcome']}")
            res = json.loads(task['result'])
            print(f"Result safe_to_approve: {res.get('safe_to_approve')}")
            print(f"Supervisor Decision: {res.get('supervisor_decision')}")
        else:
            print("Task 179 not found.")

        print("\n--- All Split Tasks for Job 109 ---")
        cur.execute("SELECT id, status, task_type, human_outcome FROM public.ingest_task WHERE job_id = 109 AND task_type = 'CHAPTER_SPLIT_LLM'")
        for t in cur.fetchall():
            print(f"{t['id']} | {t['status']} | {t['human_outcome']}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check()

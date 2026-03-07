
import psycopg2
import worker_constants as C

def reset_attempts(job_id):
    print(f"Connecting to DB: {C.DEFAULT_DSN}")
    conn = psycopg2.connect(C.DEFAULT_DSN)
    cur = conn.cursor()
    try:
        print(f"Resetting attempts for failed tasks in Job {job_id}...")
        cur.execute("""
            UPDATE public.ingest_task
            SET attempts = 0
            WHERE job_id = %s
              AND status = 'FAILED'
              AND attempts >= 8;
        """, (job_id,))
        count = cur.rowcount
        conn.commit()
        print(f"Reset {count} tasks.")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    # Job ID from user report is 127
    reset_attempts(127)

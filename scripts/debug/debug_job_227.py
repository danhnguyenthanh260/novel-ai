import psycopg2
import json
import os
import sys

dsn = os.environ.get("DATABASE_URL")
if not dsn:
    print("No DATABASE_URL")
    sys.exit(1)

conn = psycopg2.connect(dsn)
cur = conn.cursor()

try:
    # Get the chapter_id for job_id 227, seq_no 8
    cur.execute("SELECT id, story_id, seq_no, payload_json->>'chapter_id' as chapter_id FROM public.ingest_task WHERE job_id = 227 AND seq_no = 8;")
    row = cur.fetchone()
    if row:
        task_id, story_id, seq_no, chapter_id = row
        print(f"Job 227 seq 8 -> task_id: {task_id}, story_id: {story_id}, chapter_id: {chapter_id}")
        
        # Check split_feedback table
        cur.execute("SELECT id, rating, structured_tags FROM public.split_feedback WHERE story_id = %s AND chapter_id = %s", (story_id, chapter_id))
        feedbacks = cur.fetchall()
        print(f"Found {len(feedbacks)} feedbacks for chapter {chapter_id}")
        for fb in feedbacks:
            print(f"  Feedback {fb[0]}: rating={fb[1]}, tags={fb[2]}")
            
    else:
        print("No task found for job 227 seq 8")
finally:
    cur.close()
    conn.close()

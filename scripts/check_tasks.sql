SELECT id, task_type, status, error, payload_json->>'chapter_id' as chapter_id FROM public.ingest_task WHERE job_id = 1;

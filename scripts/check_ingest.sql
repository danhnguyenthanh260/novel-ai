SELECT id, story_id, status, config_json FROM public.ingest_job WHERE story_id = 2;
SELECT id, job_id, chapter_id, task_type, status, error_report FROM public.ingest_task WHERE job_id IN (SELECT id FROM public.ingest_job WHERE story_id = 2);

SELECT id, task_type, status, 
       (result_json->'scenes') IS NOT NULL as has_scenes,
       jsonb_array_length(result_json->'scenes') as scene_count,
       human_outcome
FROM public.ingest_task WHERE id = 5;

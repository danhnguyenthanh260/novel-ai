-- Historian Analysis lane observability
-- Scope: WRITING_ANALYSIS only

-- 1) Throughput by hour
SELECT
  date_trunc('hour', t.updated_at) AS hour_bucket,
  COUNT(*)::int AS done_tasks
FROM public.ingest_task t
WHERE t.task_type = 'WRITING_ANALYSIS'
  AND t.status = 'DONE'
  AND t.updated_at >= now() - interval '48 hours'
GROUP BY 1
ORDER BY 1 DESC;

-- 2) p95 latency (seconds) from pipeline events (RUNNING -> DONE)
WITH started AS (
  SELECT task_id, min(created_at) AS started_at
  FROM public.pipeline_node_event
  WHERE flow_type = 'WRITING_ANALYSIS'
    AND status = 'RUNNING'
    AND created_at >= now() - interval '48 hours'
  GROUP BY task_id
),
finished AS (
  SELECT task_id, max(created_at) AS finished_at
  FROM public.pipeline_node_event
  WHERE flow_type = 'WRITING_ANALYSIS'
    AND status = 'DONE'
    AND created_at >= now() - interval '48 hours'
  GROUP BY task_id
)
SELECT
  percentile_cont(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (f.finished_at - s.started_at))
  ) AS p95_seconds
FROM started s
JOIN finished f ON f.task_id = s.task_id
WHERE f.finished_at >= s.started_at;

-- 3) Degraded mode rate
SELECT
  COUNT(*) FILTER (WHERE COALESCE((result_json->>'degraded_mode')::boolean, false))::int AS degraded_count,
  COUNT(*)::int AS total_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE COALESCE((result_json->>'degraded_mode')::boolean, false))
    / NULLIF(COUNT(*), 0),
    2
  ) AS degraded_pct
FROM public.ingest_task
WHERE task_type = 'WRITING_ANALYSIS'
  AND status = 'DONE'
  AND updated_at >= now() - interval '48 hours';

-- 4) Fact conflict profile from staging vetting
SELECT
  COALESCE(status, 'UNKNOWN') AS analysis_status,
  COUNT(*)::int AS runs
FROM public.writing_analysis_staging
WHERE created_at >= now() - interval '7 days'
GROUP BY 1
ORDER BY runs DESC;

-- 5) External adapter errors
SELECT
  SUM(CASE WHEN COALESCE(vetting_json->'external_signals'->'qdrant'->>'status', 'disabled') = 'error' THEN 1 ELSE 0 END)::int AS qdrant_error_runs,
  SUM(CASE WHEN COALESCE(vetting_json->'external_signals'->'neo4j'->>'status', 'disabled') = 'error' THEN 1 ELSE 0 END)::int AS neo4j_error_runs,
  COUNT(*)::int AS total_runs
FROM public.writing_analysis_staging
WHERE created_at >= now() - interval '48 hours';

-- 6) Hydration trace completeness for WRITING_ANALYSIS
SELECT
  COUNT(*)::int AS analysis_runs,
  COUNT(ht.id)::int AS hydration_rows,
  ROUND(100.0 * COUNT(ht.id) / NULLIF(COUNT(*), 0), 2) AS hydration_coverage_pct
FROM public.ingest_task t
LEFT JOIN public.agent_run_trace rt
  ON rt.task_id = t.id
  AND rt.agent_name = 'WRITING_ANALYSIS'
LEFT JOIN public.agent_prompt_hydration_trace ht
  ON ht.run_trace_id = rt.id
WHERE t.task_type = 'WRITING_ANALYSIS'
  AND t.status = 'DONE'
  AND t.updated_at >= now() - interval '48 hours';

-- 7) Neo4j projection health from MEMORY_ROLLUP results
SELECT
  COALESCE(result_json->'neo4j_projection'->>'status', 'missing') AS neo4j_projection_status,
  count(*)::int AS runs
FROM public.ingest_task
WHERE task_type = 'MEMORY_ROLLUP'
  AND status = 'DONE'
  AND updated_at >= now() - interval '7 days'
GROUP BY 1
ORDER BY runs DESC;

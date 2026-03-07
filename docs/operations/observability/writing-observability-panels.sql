-- Grafana Panel Bundle: Writing (AutoWrite v2)
-- Datasource: PostgreSQL (novel)
-- Scope: ingest_job.mode = 'AUTO_CHAPTER'

-- Panel 1: Writing Jobs by Status (7d) [Bar/Table]
SELECT
  j.status AS metric,
  COUNT(*)::bigint AS value
FROM public.ingest_job j
WHERE j.mode = 'AUTO_CHAPTER'
  AND j.created_at >= NOW() - INTERVAL '7 days'
GROUP BY j.status
ORDER BY value DESC, metric;

-- Panel 2: Success Rate (7d, non-cancelled) [Stat]
WITH d AS (
  SELECT
    COUNT(*) FILTER (WHERE status <> 'CANCELLED')::numeric AS total_non_cancelled,
    COUNT(*) FILTER (WHERE status = 'DONE')::numeric AS done_count
  FROM public.ingest_job
  WHERE mode = 'AUTO_CHAPTER'
    AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  total_non_cancelled::bigint AS total_non_cancelled,
  done_count::bigint AS done_count,
  CASE
    WHEN total_non_cancelled > 0
      THEN ROUND((done_count / total_non_cancelled) * 100.0, 2)
    ELSE 0
  END AS success_rate_pct
FROM d;

-- Panel 3: End-to-End Latency p50/p95 by Day [Time series]
SELECT
  date_trunc('day', j.updated_at) AS "time",
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (j.updated_at - j.created_at)) * 1000), 2) AS p50_latency_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (j.updated_at - j.created_at)) * 1000), 2) AS p95_latency_ms
FROM public.ingest_job j
WHERE j.mode = 'AUTO_CHAPTER'
  AND j.status = 'DONE'
  AND $__timeFilter(j.updated_at)
GROUP BY 1
ORDER BY 1;

-- Panel 4: Failed Task Distribution (7d) [Bar/Table]
SELECT
  t.task_type AS metric,
  COUNT(*)::bigint AS value
FROM public.ingest_task t
JOIN public.ingest_job j ON j.id = t.job_id
WHERE j.mode = 'AUTO_CHAPTER'
  AND t.status = 'FAILED'
  AND t.updated_at >= NOW() - INTERVAL '7 days'
GROUP BY t.task_type
ORDER BY value DESC, metric;

-- Panel 5: Stuck RUNNING Jobs (> 20 minutes) [Table]
SELECT
  j.id AS job_id,
  j.story_id,
  COALESCE(j.config_json->>'chapter_id', '-') AS chapter_id,
  j.status,
  EXTRACT(EPOCH FROM (NOW() - j.updated_at))::bigint AS age_sec,
  j.created_at,
  j.updated_at
FROM public.ingest_job j
WHERE j.mode = 'AUTO_CHAPTER'
  AND j.status = 'RUNNING'
  AND j.updated_at < NOW() - INTERVAL '20 minutes'
ORDER BY j.updated_at ASC;

-- Panel 6: Attempts Heatmap by Task Type (7d) [Table]
SELECT
  t.task_type,
  t.attempts,
  COUNT(*)::bigint AS total
FROM public.ingest_task t
JOIN public.ingest_job j ON j.id = t.job_id
WHERE j.mode = 'AUTO_CHAPTER'
  AND t.updated_at >= NOW() - INTERVAL '7 days'
GROUP BY t.task_type, t.attempts
ORDER BY t.task_type, t.attempts;

-- Panel 7: LLM Tokens (placeholder until adapter emits usage) [Stat/Table]
SELECT
  COUNT(*) FILTER (WHERE t.result_json ? 'llm_tokens')::bigint AS rows_with_llm_tokens,
  COALESCE(SUM((t.result_json->>'llm_tokens')::bigint), 0)::bigint AS llm_tokens_total
FROM public.ingest_task t
JOIN public.ingest_job j ON j.id = t.job_id
WHERE j.mode = 'AUTO_CHAPTER'
  AND t.task_type LIKE 'NARRATIVE_%'
  AND t.status = 'DONE'
  AND t.updated_at >= NOW() - INTERVAL '7 days';

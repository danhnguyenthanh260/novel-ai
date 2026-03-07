-- Historian Go/No-Go Panels (Tiered Memory)

-- 1) WRITING_ANALYSIS p95 latency (seconds)
SELECT
  percentile_cont(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at))
  ) AS p95_latency_sec,
  count(*) AS sample_size
FROM public.ingest_task
WHERE task_type = 'WRITING_ANALYSIS'
  AND status = 'DONE'
  AND created_at >= now() - interval '7 days';

-- 2) Entity accuracy proxy from staging vetting
SELECT
  COALESCE(sum((vetting_json->'vetting_report'->>'clean_count')::numeric), 0) AS total_clean,
  COALESCE(sum(jsonb_array_length(COALESCE(vetting_json->'vetting_report'->'entity_type_conflicts', '[]'::jsonb))), 0) AS total_entity_conflicts,
  CASE
    WHEN COALESCE(sum((vetting_json->'vetting_report'->>'clean_count')::numeric), 0) <= 0 THEN 0
    ELSE 1 - (
      COALESCE(sum(jsonb_array_length(COALESCE(vetting_json->'vetting_report'->'entity_type_conflicts', '[]'::jsonb))), 0)
      /
      COALESCE(sum((vetting_json->'vetting_report'->>'clean_count')::numeric), 1)
    )
  END AS entity_accuracy_proxy
FROM public.writing_analysis_staging
WHERE updated_at >= now() - interval '7 days';

-- 3) EPHEMERAL leak guard into static lane
SELECT
  count(*) FILTER (
    WHERE UPPER(COALESCE(classification, '')) = 'EPHEMERAL'
      AND COALESCE(is_static, false) = true
  ) AS ephemeral_leak_count,
  count(*) FILTER (
    WHERE UPPER(COALESCE(classification, '')) = 'STATIC'
       OR COALESCE(is_static, false) = true
  ) AS total_static_candidates
FROM public.canon_fact;

-- 4) Coverage health for scope snapshots
SELECT
  scope_type,
  scope_key,
  approval_status,
  fact_status,
  ready_for_writing,
  COALESCE((coverage_json->>'approved')::int, 0) AS approved_count,
  COALESCE((coverage_json->>'total')::int, 0) AS total_count,
  CASE
    WHEN COALESCE((coverage_json->>'total')::int, 0) > 0
      THEN round(
        (COALESCE((coverage_json->>'approved')::numeric, 0) / (coverage_json->>'total')::numeric) * 100,
        2
      )
    ELSE 0
  END AS coverage_pct
FROM public.writing_scope_snapshot_v1
ORDER BY created_at DESC
LIMIT 100;

-- 5) Reliability gate summary (DONE/FAILED/STALE over 7d)
SELECT
  count(*) FILTER (WHERE status = 'DONE')::int AS done_count,
  count(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
  count(*) FILTER (WHERE status = 'FAILED' AND COALESCE(error, '') ILIKE 'FAILED_STALE:%')::int AS failed_stale_count,
  count(*) FILTER (WHERE status = 'RUNNING')::int AS running_count,
  count(*)::int AS total_count,
  ROUND(100.0 * count(*) FILTER (WHERE status = 'DONE') / NULLIF(count(*), 0), 2) AS done_rate_pct
FROM public.ingest_task
WHERE task_type = 'WRITING_ANALYSIS'
  AND created_at >= now() - interval '7 days';

-- 6) Timeout failure profile (WRITING_ANALYSIS)
SELECT
  count(*) FILTER (WHERE status = 'FAILED' AND COALESCE(error, '') ILIKE '%timed out%')::int AS timeout_failed_count,
  count(*) FILTER (WHERE status = 'FAILED' AND COALESCE(error, '') ILIKE '%LLM_REQUEST_FAILED%')::int AS llm_request_failed_count,
  count(*) FILTER (WHERE status = 'FAILED' AND COALESCE(error, '') ILIKE '%LLM_%')::int AS llm_failed_count
FROM public.ingest_task
WHERE task_type = 'WRITING_ANALYSIS'
  AND created_at >= now() - interval '7 days';

-- 7) Prompt token reduction gate (requires baseline env number provided at dashboard query time)
-- Replace :baseline_tokens with a numeric literal in dashboard variable (e.g. 1200).
WITH sample AS (
  SELECT
    AVG(
      NULLIF(
        COALESCE(
          (ht.llm_request_meta_json->>'prompt_tokens_est')::numeric,
          (length(COALESCE(ht.hydration_output_text, '')) / 4.0)
        ),
        0
      )
    ) AS avg_prompt_tokens_est,
    count(*)::int AS sample_size
  FROM public.agent_prompt_hydration_trace ht
  WHERE ht.agent_name = 'WRITING_ANALYSIS'
    AND ht.created_at >= now() - interval '7 days'
)
SELECT
  avg_prompt_tokens_est,
  sample_size,
  :baseline_tokens::numeric AS baseline_tokens,
  CASE
    WHEN :baseline_tokens::numeric > 0 AND avg_prompt_tokens_est IS NOT NULL
      THEN ROUND(((:baseline_tokens::numeric - avg_prompt_tokens_est) / :baseline_tokens::numeric) * 100.0, 2)
    ELSE NULL
  END AS reduction_pct;

-- Grafana Panel Bundle: Split Self-Healing KPI
-- Datasource: PostgreSQL (novel)
-- Usage:
--  1) Create panel -> switch to Code mode
--  2) Paste one query below
--  3) Choose visualization as suggested

-- Panel 1: Final Decision Trend by Day [Time series]
SELECT
  date_trunc('day', t.updated_at) AS "time",
  COUNT(*)::bigint AS value,
  COALESCE(t.result_json->>'supervisor_decision', 'unknown') AS metric
FROM public.ingest_task t
WHERE t.task_type = 'CHAPTER_SPLIT_LLM'
  AND t.status = 'DONE'
  AND $__timeFilter(t.updated_at)
GROUP BY 1, 3
ORDER BY 1, 3;

-- Panel 2: Manual Review Rate (7d) [Stat]
WITH d AS (
  SELECT
    COUNT(*)::numeric AS total,
    COUNT(*) FILTER (
      WHERE COALESCE(result_json->>'supervisor_decision', '') = 'manual_review'
    )::numeric AS manual_count
  FROM public.ingest_task
  WHERE task_type = 'CHAPTER_SPLIT_LLM'
    AND status = 'DONE'
    AND updated_at >= NOW() - INTERVAL '7 days'
)
SELECT
  total::bigint AS total_chapters,
  manual_count::bigint AS manual_review_chapters,
  CASE WHEN total > 0 THEN ROUND((manual_count / total) * 100.0, 2) ELSE 0 END AS manual_review_rate_pct
FROM d;

-- Panel 3: Strategy Win Rate (14d) [Bar chart/Table]
SELECT
  COALESCE(t.result_json->>'strategy_selected', 'unknown') AS strategy,
  COUNT(*)::bigint AS wins
FROM public.ingest_task t
WHERE t.task_type = 'CHAPTER_SPLIT_LLM'
  AND t.status = 'DONE'
  AND t.updated_at >= NOW() - INTERVAL '14 days'
GROUP BY 1
ORDER BY wins DESC, strategy;

-- Panel 4: LLM Calls per Chapter vs Budget (14d) [Time series]
SELECT
  date_trunc('day', t.updated_at) AS "time",
  ROUND(AVG(COALESCE((t.result_json->>'llm_calls_used')::numeric, 0)), 2) AS avg_llm_calls_used,
  ROUND(AVG(COALESCE((t.result_json->>'llm_calls_budget')::numeric, 0)), 2) AS avg_llm_calls_budget
FROM public.ingest_task t
WHERE t.task_type = 'CHAPTER_SPLIT_LLM'
  AND t.status = 'DONE'
  AND $__timeFilter(t.updated_at)
GROUP BY 1
ORDER BY 1;

-- Panel 5: Window Rerun Effect (14d) [Table]
SELECT
  t.id AS chapter_task_id,
  t.job_id,
  t.result_json->>'chapter_id' AS chapter_id,
  COALESCE(t.result_json->>'strategy_selected', '-') AS strategy_selected,
  COALESCE((t.result_json->'window_rerun_report'->>'windows')::int, 0) AS windows,
  COALESCE((t.result_json->'window_rerun_report'->>'moved')::int, 0) AS moved,
  COALESCE((t.result_json->'window_rerun_report'->>'llm_calls_used')::int, 0) AS window_llm_calls,
  COALESCE((t.result_json->'quality_report'->>'flagged_pct')::numeric, 0) AS flagged_pct,
  t.updated_at
FROM public.ingest_task t
WHERE t.task_type = 'CHAPTER_SPLIT_LLM'
  AND t.status = 'DONE'
  AND t.updated_at >= NOW() - INTERVAL '14 days'
ORDER BY t.updated_at DESC
LIMIT 200;

-- Panel 6: Feedback Volume by Day [Time series]
SELECT
  date_trunc('day', f.created_at) AS "time",
  COUNT(*)::bigint AS value,
  CASE WHEN f.rating > 0 THEN 'helpful' ELSE 'not_helpful' END AS metric
FROM public.split_feedback f
WHERE $__timeFilter(f.created_at)
GROUP BY 1, 3
ORDER BY 1, 3;

-- Panel 7: Feedback Impact by Strategy (30d) [Bar chart/Table]
SELECT
  COALESCE(strategy, 'unknown') AS strategy,
  COUNT(*) FILTER (WHERE rating > 0)::bigint AS good_count,
  COUNT(*) FILTER (WHERE rating < 0)::bigint AS bad_count,
  (COUNT(*) FILTER (WHERE rating > 0) - COUNT(*) FILTER (WHERE rating < 0))::bigint AS net_score
FROM public.split_feedback
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY net_score DESC, strategy;

-- Panel 8: Current Risk Chapters (latest decision) [Table]
WITH last_split AS (
  SELECT
    t.story_id,
    t.result_json->>'chapter_id' AS chapter_id,
    t.result_json->>'supervisor_decision' AS supervisor_decision,
    COALESCE((t.result_json->'quality_report'->>'flagged_pct')::numeric, 0) AS flagged_pct,
    COALESCE((t.result_json->'quality_report'->>'mid_word_cut_count')::int, 0) AS mid_word_cut_count,
    t.updated_at,
    row_number() OVER (
      PARTITION BY t.story_id, (t.result_json->>'chapter_id')
      ORDER BY t.updated_at DESC, t.id DESC
    ) AS rn
  FROM public.ingest_task t
  WHERE t.task_type = 'CHAPTER_SPLIT_LLM'
    AND t.status = 'DONE'
)
SELECT
  ss.slug AS story_slug,
  ls.chapter_id,
  ls.supervisor_decision,
  ls.flagged_pct,
  ls.mid_word_cut_count,
  ls.updated_at
FROM last_split ls
JOIN public.story_series ss ON ss.id = ls.story_id
WHERE ls.rn = 1
ORDER BY
  CASE WHEN ls.supervisor_decision = 'manual_review' THEN 0 ELSE 1 END,
  ls.flagged_pct DESC,
  ls.updated_at DESC;


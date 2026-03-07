-- Grafana Panel Bundle: Memory + Retention
-- Datasource: PostgreSQL (novel)
-- Tip:
--  - Time range selector works best with queries using $__timeFilter(...)
--  - For table panels, use "Format: Table"
--  - For time series panels, return columns: time, value, metric(optional)

-- Panel 1: Memory Task Status (7d) [Table/Bar]
SELECT
  status,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percent
FROM public.memory_enrich_task
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY status
ORDER BY status;

-- Panel 2: Memory Retry Stats (7d) [Stat/Table]
SELECT
  ROUND(AVG(retry_count), 2) AS avg_retry,
  MAX(retry_count) AS max_retry,
  COUNT(*) FILTER (WHERE retry_count > 0) AS tasks_with_retry
FROM public.memory_enrich_task
WHERE created_at >= NOW() - INTERVAL '7 days';

-- Panel 3: Memory Processing Time by Day [Time series]
SELECT
  date_trunc('day', updated_at) AS "time",
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))), 2) AS avg_seconds
FROM public.memory_enrich_task
WHERE status = 'DONE'
  AND $__timeFilter(updated_at)
GROUP BY 1
ORDER BY 1;

-- Panel 4: Current Queue Backlog [Stat/Table]
SELECT
  status,
  COUNT(*) AS total
FROM public.ingest_task
WHERE status IN ('READY', 'PENDING', 'RUNNING')
GROUP BY status
ORDER BY status;

-- Panel 5: Memory Output Volume by Day [Time series]
WITH d AS (
  SELECT date_trunc('day', created_at) AS time, COUNT(*)::bigint AS value, 'canon_fact'::text AS metric
  FROM public.canon_fact
  WHERE $__timeFilter(created_at)
  GROUP BY 1
  UNION ALL
  SELECT date_trunc('day', created_at) AS time, COUNT(*)::bigint AS value, 'timeline_anchor'::text AS metric
  FROM public.timeline_anchor
  WHERE $__timeFilter(created_at)
  GROUP BY 1
  UNION ALL
  SELECT date_trunc('day', created_at) AS time, COUNT(*)::bigint AS value, 'style_profile_scene'::text AS metric
  FROM public.style_profile_scene
  WHERE $__timeFilter(created_at)
  GROUP BY 1
)
SELECT time, value, metric
FROM d
ORDER BY time, metric;

-- Panel 6: Orphan Scene Version Candidates [Stat]
WITH ranked AS (
  SELECT
    v.id,
    v.scene_id,
    v.created_at,
    s.current_version_id,
    row_number() OVER (PARTITION BY v.scene_id ORDER BY v.version_no DESC, v.id DESC) AS rn
  FROM public.narrative_scene_version v
  JOIN public.narrative_scene s ON s.id = v.scene_id
)
SELECT COUNT(*) AS orphan_candidates
FROM ranked
WHERE rn > 5
  AND id <> current_version_id
  AND created_at < NOW() - INTERVAL '30 days';

-- Panel 7: Non-Current Memory Candidates (Gate-Aware) [Table]
WITH eligible_scene AS (
  SELECT s.id AS scene_id, s.current_version_id
  FROM public.narrative_scene s
  WHERE EXISTS (
    SELECT 1
    FROM public.memory_enrich_task mt_cur
    WHERE mt_cur.scene_version_id = s.current_version_id
      AND mt_cur.status = 'DONE'
  )
),
canon AS (
  SELECT COUNT(*)::bigint AS n
  FROM public.canon_fact cf
  JOIN eligible_scene es ON es.scene_id = cf.scene_id
  WHERE cf.scene_version_id <> es.current_version_id
    AND cf.created_at < NOW() - INTERVAL '30 days'
),
timeline AS (
  SELECT COUNT(*)::bigint AS n
  FROM public.timeline_anchor ta
  JOIN eligible_scene es ON es.scene_id = ta.scene_id
  WHERE ta.scene_version_id <> es.current_version_id
    AND ta.created_at < NOW() - INTERVAL '30 days'
),
style AS (
  SELECT COUNT(*)::bigint AS n
  FROM public.style_profile_scene sp
  JOIN eligible_scene es ON es.scene_id = sp.scene_id
  WHERE sp.scene_version_id <> es.current_version_id
    AND sp.created_at < NOW() - INTERVAL '30 days'
),
task AS (
  SELECT COUNT(*)::bigint AS n
  FROM public.memory_enrich_task mt
  JOIN eligible_scene es ON es.scene_id = mt.scene_id
  WHERE mt.scene_version_id <> es.current_version_id
    AND mt.created_at < NOW() - INTERVAL '30 days'
    AND mt.status IN ('DONE', 'FAILED')
)
SELECT * FROM (
  SELECT 'canon_fact'::text AS target, (SELECT n FROM canon) AS candidate_count
  UNION ALL
  SELECT 'timeline_anchor', (SELECT n FROM timeline)
  UNION ALL
  SELECT 'style_profile_scene', (SELECT n FROM style)
  UNION ALL
  SELECT 'memory_enrich_task', (SELECT n FROM task)
) t
ORDER BY target;

-- Panel 8: source_doc Growth by Story [Table]
SELECT
  ss.slug,
  ss.status AS story_status,
  COUNT(*) AS source_docs,
  SUM(sd.char_len)::bigint AS total_chars,
  MAX(sd.created_at) AS latest_doc_at
FROM public.source_doc sd
JOIN public.story_series ss ON ss.id = sd.story_id
GROUP BY ss.slug, ss.status
ORDER BY total_chars DESC, source_docs DESC;

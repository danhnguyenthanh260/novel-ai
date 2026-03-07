import { Client } from "pg";

const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";

function parseArgs() {
  const args = process.argv.slice(2);
  let storySlug = "";
  let processLegacy = false;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--story" && args[i + 1]) {
      storySlug = String(args[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === "--process-legacy") {
      processLegacy = true;
    }
  }
  if (!storySlug) {
    throw new Error("Missing --story <slug>");
  }
  return { storySlug, processLegacy };
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPct(num, den) {
  if (den <= 0) return 0;
  return Math.round((num * 10000) / den) / 100;
}

async function resolveStoryId(db, storySlug) {
  const res = await db.query(
    `SELECT id
     FROM public.story_series
     WHERE slug = $1
     LIMIT 1`,
    [storySlug]
  );
  const id = Number(res.rows[0]?.id ?? 0);
  if (!id) throw new Error("STORY_NOT_FOUND");
  return id;
}

async function processLegacySplitData(db, storyId) {
  const res = await db.query(
    `
    WITH split_rows AS (
      SELECT
        t.id,
        t.result_json,
        t.payload_json,
        t.job_id,
        t.human_outcome,
        t.human_verdict_by,
        t.human_verdict_at,
        CASE
          WHEN j.status = 'REJECTED' THEN 'FAILED_HUMAN_REJECTED'
          WHEN EXISTS (
            SELECT 1
            FROM public.ingest_task s
            WHERE s.job_id = t.job_id
              AND s.story_id = t.story_id
              AND s.task_type = 'SCENE_CREATE'
              AND s.payload_json->>'chapter_task_id' = t.id::text
          ) THEN 'APPROVED_HUMAN'
          ELSE NULL
        END AS inferred_human_outcome
      FROM public.ingest_task t
      JOIN public.ingest_job j ON j.id = t.job_id AND j.story_id = t.story_id
      WHERE t.story_id = $1
        AND t.task_type = 'CHAPTER_SPLIT_LLM'
        AND t.status = 'DONE'
    ),
    candidates AS (
      SELECT id, result_json, payload_json, inferred_human_outcome, human_outcome, human_verdict_by, human_verdict_at
      FROM split_rows
      WHERE (
        COALESCE(NULLIF(result_json->>'strategy_selected',''),'') = ''
        OR COALESCE(NULLIF(result_json->>'supervisor_decision',''),'') = ''
        OR NOT (result_json ? 'safe_to_approve')
        OR NOT (result_json ? 'supervisor_retry_used')
        OR (
          COALESCE(NULLIF(human_outcome,''), NULLIF(result_json->>'human_outcome',''), '') = ''
          AND inferred_human_outcome IS NOT NULL
        )
      )
    ),
    patched AS (
      UPDATE public.ingest_task t
      SET result_json = jsonb_strip_nulls(
        CASE
          WHEN c.inferred_human_outcome IS NULL THEN base_json
          ELSE jsonb_set(base_json, '{human_outcome}', to_jsonb(c.inferred_human_outcome), true)
        END
      ),
      human_outcome = COALESCE(t.human_outcome, c.inferred_human_outcome),
      human_verdict_by = COALESCE(
        t.human_verdict_by,
        NULLIF(t.result_json->>'human_verdict_by',''),
        CASE WHEN c.inferred_human_outcome IS NULL THEN NULL ELSE 'legacy-backfill' END
      ),
      human_verdict_at = COALESCE(
        t.human_verdict_at,
        NULLIF(t.result_json->>'human_verdict_at','')::timestamptz,
        CASE WHEN c.inferred_human_outcome IS NULL THEN NULL ELSE now() END
      ),
      updated_at = now()
      FROM (
        SELECT
          id,
          inferred_human_outcome,
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  result_json,
                  '{strategy_selected}',
                  to_jsonb(COALESCE(NULLIF(result_json->>'strategy_selected',''), 'LEGACY_BASE')),
                  true
                ),
                '{supervisor_decision}',
                to_jsonb(COALESCE(NULLIF(result_json->>'supervisor_decision',''), 'auto_pass')),
                true
              ),
              '{supervisor_retry_used}',
              to_jsonb(
                CASE
                  WHEN lower(COALESCE(result_json->>'supervisor_retry_used','')) = 'true' THEN true
                  WHEN lower(COALESCE(result_json->>'supervisor_retry_used','')) = 'false' THEN false
                  ELSE false
                END
              ),
              true
            ),
            '{safe_to_approve}',
            to_jsonb(
              CASE
                WHEN lower(COALESCE(result_json->>'safe_to_approve','')) = 'true' THEN true
                WHEN lower(COALESCE(result_json->>'safe_to_approve','')) = 'false' THEN false
                ELSE COALESCE(NULLIF(result_json->>'supervisor_decision',''),'auto_pass') = 'auto_pass'
              END
            ),
            true
          ) AS base_json
        FROM candidates
      ) c
      WHERE t.id = c.id
      RETURNING 1
    )
    SELECT COUNT(*)::int AS updated_rows FROM patched
    `,
    [storyId]
  );
  return Number(res.rows[0]?.updated_rows ?? 0);
}

async function fetchWindow(db, storyId, days) {
  const res = await db.query(
    `
    SELECT
      COUNT(*)::int AS done_runs,
      COUNT(*) FILTER (WHERE lower(COALESCE(result_json->>'safe_to_approve','false')) = 'true')::int AS machine_pass_runs,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = 'APPROVED_HUMAN'
      )::int AS human_pass_runs,
      COUNT(*) FILTER (
        WHERE lower(COALESCE(result_json->>'safe_to_approve','false')) = 'true'
          AND COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = ''
      )::int AS pending_human_runs,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = 'FAILED_HUMAN_REJECTED'
      )::int AS human_reject_runs,
      COUNT(*) FILTER (WHERE COALESCE(result_json->>'supervisor_decision','auto_pass') = 'manual_review')::int AS manual_review_runs,
      COUNT(*) FILTER (WHERE lower(COALESCE(result_json->>'supervisor_retry_used','false')) = 'true')::int AS retry_runs,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = 'APPROVED_HUMAN'
          AND lower(COALESCE(result_json->>'supervisor_retry_used','false')) <> 'true'
      )::int AS first_pass_success_runs,
      COUNT(*) FILTER (WHERE lower(COALESCE(result_json->>'exploration_used','false')) = 'true')::int AS exploration_runs,
      COUNT(*) FILTER (WHERE lower(COALESCE(result_json->>'strategy_switched','false')) = 'true')::int AS strategy_switch_runs,
      COALESCE(ROUND(AVG(COALESCE((result_json->'quality_report'->>'flagged_pct')::numeric, 0)), 2), 0) AS avg_flagged_pct,
      COALESCE(ROUND(AVG(COALESCE((result_json->'quality_report'->>'fragmentation_score')::numeric, 0)), 2), 0) AS avg_fragmentation,
      COUNT(DISTINCT COALESCE(NULLIF(result_json->>'strategy_selected',''), '(none)'))::int AS strategy_diversity
    FROM public.ingest_task
    WHERE story_id = $1
      AND task_type = 'CHAPTER_SPLIT_LLM'
      AND status = 'DONE'
      AND updated_at >= now() - ($2::text || ' days')::interval
    `,
    [storyId, String(days)]
  );
  const row = res.rows[0] || {};
  const doneRuns = toNumber(row.done_runs);
  const machinePassRuns = toNumber(row.machine_pass_runs);
  const humanPassRuns = toNumber(row.human_pass_runs);
  const pendingHumanRuns = toNumber(row.pending_human_runs);
  const humanRejectRuns = toNumber(row.human_reject_runs);
  const manualReviewRuns = toNumber(row.manual_review_runs);
  const retryRuns = toNumber(row.retry_runs);
  const firstPassRuns = toNumber(row.first_pass_success_runs);
  const explorationRuns = toNumber(row.exploration_runs);
  const strategySwitchRuns = toNumber(row.strategy_switch_runs);
  return {
    days,
    done_runs: doneRuns,
    machine_pass_rate: toPct(machinePassRuns, doneRuns),
    human_pass_rate: toPct(humanPassRuns, doneRuns),
    pending_human_rate: toPct(pendingHumanRuns, doneRuns),
    human_reject_rate: toPct(humanRejectRuns, doneRuns),
    manual_review_rate: toPct(manualReviewRuns, doneRuns),
    retry_rate: toPct(retryRuns, doneRuns),
    first_pass_success_rate: toPct(firstPassRuns, doneRuns),
    exploration_rate: toPct(explorationRuns, doneRuns),
    strategy_switch_rate: toPct(strategySwitchRuns, doneRuns),
    avg_flagged_pct: toNumber(row.avg_flagged_pct),
    avg_fragmentation: toNumber(row.avg_fragmentation),
    strategy_diversity: toNumber(row.strategy_diversity),
  };
}

async function main() {
  const { storySlug, processLegacy } = parseArgs();
  const db = new Client({ connectionString: DB_DSN });
  await db.connect();
  try {
    const storyId = await resolveStoryId(db, storySlug);
    await db.query("BEGIN");
    const legacyRowsUpdated = processLegacy ? await processLegacySplitData(db, storyId) : 0;
    const windows = [];
    for (const days of [7, 14, 30]) {
      windows.push(await fetchWindow(db, storyId, days));
    }
    await db.query("COMMIT");
    const result = {
      ok: true,
      story_slug: storySlug,
      story_id: storyId,
      process_legacy: processLegacy,
      legacy_rows_updated: legacyRowsUpdated,
      windows,
      generated_at: new Date().toISOString(),
    };
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    console.error("[doctor-split-maturity] FAIL", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();

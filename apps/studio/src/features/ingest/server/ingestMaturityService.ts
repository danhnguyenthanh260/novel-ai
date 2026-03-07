import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

type WindowDays = 7 | 14 | 30;

type MaturityWindow = {
  days: WindowDays;
  done_runs: number;
  machine_pass_rate: number;
  human_pass_rate: number;
  pending_human_rate: number;
  human_reject_rate: number;
  manual_review_rate: number;
  retry_rate: number;
  first_pass_success_rate: number;
  exploration_rate: number;
  strategy_switch_rate: number;
  avg_flagged_pct: number;
  avg_fragmentation: number;
  strategy_diversity: number;
};

type MaturityReportResponse = {
  ok: true;
  story_id: number;
  process_legacy: boolean;
  legacy_rows_updated: number;
  windows: MaturityWindow[];
  generated_at: string;
};

function asBool(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num * 10000) / den) / 100;
}

async function processLegacySplitData(client: PoolClient, storyId: number): Promise<number> {
  const res = await client.query<{ updated_rows: string }>(
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
    SELECT COUNT(*)::text AS updated_rows FROM patched
    `,
    [storyId]
  );
  return Number(res.rows[0]?.updated_rows ?? 0);
}

async function fetchWindowMetrics(client: PoolClient, storyId: number, days: WindowDays): Promise<MaturityWindow> {
  const res = await client.query<{
    done_runs: string;
    machine_pass_runs: string;
    human_pass_runs: string;
    pending_human_runs: string;
    human_reject_runs: string;
    manual_review_runs: string;
    retry_runs: string;
    first_pass_success_runs: string;
    exploration_runs: string;
    strategy_switch_runs: string;
    avg_flagged_pct: string;
    avg_fragmentation: string;
    strategy_diversity: string;
  }>(
    `
    SELECT
      COUNT(*)::text AS done_runs,
      COUNT(*) FILTER (WHERE lower(COALESCE(result_json->>'safe_to_approve','false')) = 'true')::text AS machine_pass_runs,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = 'APPROVED_HUMAN'
      )::text AS human_pass_runs,
      COUNT(*) FILTER (
        WHERE lower(COALESCE(result_json->>'safe_to_approve','false')) = 'true'
          AND COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = ''
      )::text AS pending_human_runs,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = 'FAILED_HUMAN_REJECTED'
      )::text AS human_reject_runs,
      COUNT(*) FILTER (WHERE COALESCE(result_json->>'supervisor_decision','auto_pass') = 'manual_review')::text AS manual_review_runs,
      COUNT(*) FILTER (WHERE lower(COALESCE(result_json->>'supervisor_retry_used','false')) = 'true')::text AS retry_runs,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = 'APPROVED_HUMAN'
          AND lower(COALESCE(result_json->>'supervisor_retry_used','false')) <> 'true'
      )::text AS first_pass_success_runs,
      COUNT(*) FILTER (WHERE lower(COALESCE(result_json->>'exploration_used','false')) = 'true')::text AS exploration_runs,
      COUNT(*) FILTER (WHERE lower(COALESCE(result_json->>'strategy_switched','false')) = 'true')::text AS strategy_switch_runs,
      COALESCE(ROUND(AVG(COALESCE((result_json->'quality_report'->>'flagged_pct')::numeric, 0)), 2), 0)::text AS avg_flagged_pct,
      COALESCE(ROUND(AVG(COALESCE((result_json->'quality_report'->>'fragmentation_score')::numeric, 0)), 2), 0)::text AS avg_fragmentation,
      COUNT(DISTINCT COALESCE(NULLIF(result_json->>'strategy_selected',''), '(none)'))::text AS strategy_diversity
    FROM public.ingest_task
    WHERE story_id = $1
      AND task_type = 'CHAPTER_SPLIT_LLM'
      AND status = 'DONE'
      AND updated_at >= now() - ($2::text || ' days')::interval
    `,
    [storyId, String(days)]
  );

  const row = res.rows[0];
  const doneRuns = asNumber(row?.done_runs);
  const machinePassRuns = asNumber(row?.machine_pass_runs);
  const humanPassRuns = asNumber(row?.human_pass_runs);
  const pendingHumanRuns = asNumber(row?.pending_human_runs);
  const humanRejectRuns = asNumber(row?.human_reject_runs);
  const manualReviewRuns = asNumber(row?.manual_review_runs);
  const retryRuns = asNumber(row?.retry_runs);
  const firstPassRuns = asNumber(row?.first_pass_success_runs);
  const explorationRuns = asNumber(row?.exploration_runs);
  const strategySwitchRuns = asNumber(row?.strategy_switch_runs);
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
    avg_flagged_pct: asNumber(row?.avg_flagged_pct),
    avg_fragmentation: asNumber(row?.avg_fragmentation),
    strategy_diversity: asNumber(row?.strategy_diversity),
  };
}

function parseMaturityBody(value: unknown): { processLegacy: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { processLegacy: false };
  const obj = value as Record<string, unknown>;
  return {
    processLegacy: asBool(obj.process_legacy),
  };
}

export async function postIngestMaturityReportResponse(
  req: NextRequest,
  storySlug: string
): Promise<NextResponse<MaturityReportResponse | { ok: false; error: string }>> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = parseMaturityBody(await req.json().catch(() => ({})));
    let legacyRowsUpdated = 0;

    await client.query("BEGIN");
    if (body.processLegacy) {
      legacyRowsUpdated = await processLegacySplitData(client, storyId);
    }
    const windows = await Promise.all(
      [7, 14, 30].map((days) => fetchWindowMetrics(client, storyId, days as WindowDays))
    );
    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      process_legacy: body.processLegacy,
      legacy_rows_updated: legacyRowsUpdated,
      windows,
      generated_at: new Date().toISOString(),
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "INGEST_MATURITY_REPORT_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

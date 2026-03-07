import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { validateAndNormalizeInput } from "@/features/ingest/server/inputContract";
import { parseIngestRequest } from "@/features/ingest/server/uploadParser";
import { reconcileTerminalJobTasks } from "@/features/ingest/server/ingestTaskReconcileService";

type StrategyKey =
  | "S0_BASE"
  | "S1_STRICT_BOUNDARY"
  | "S1_TARGETED_WINDOW_REPAIR"
  | "S2_MERGE_FIX"
  | "S3_SEMANTIC_RESPLIT";

type StrategyStat = {
  total_runs: number;
  win_count: number;
  total_boundaries: number;
  total_hard_flags: number;
  score: number;
};

const STRATEGY_KEYS: StrategyKey[] = [
  "S0_BASE",
  "S1_STRICT_BOUNDARY",
  "S1_TARGETED_WINDOW_REPAIR",
  "S2_MERGE_FIX",
  "S3_SEMANTIC_RESPLIT",
];

function parseJobId(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_JOB_ID");
  return Math.floor(n);
}

function parseReason(raw: unknown): string | null {
  const x = typeof raw === "string" ? raw.trim() : "";
  return x ? x.slice(0, 2000) : null;
}

function normalizeCreatedBy(raw: unknown): string {
  const x = typeof raw === "string" ? raw.trim() : "";
  return x ? x.slice(0, 120) : "ui";
}

function parseSplitMode(value: unknown): "auto" | "manual" {
  return value === "auto" ? "auto" : "manual";
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function emptyStat(): StrategyStat {
  return {
    total_runs: 0,
    win_count: 0,
    total_boundaries: 0,
    total_hard_flags: 0,
    score: 0.5,
  };
}

function buildInitialStats(): Record<StrategyKey, StrategyStat> {
  return {
    S0_BASE: emptyStat(),
    S1_STRICT_BOUNDARY: emptyStat(),
    S1_TARGETED_WINDOW_REPAIR: emptyStat(),
    S2_MERGE_FIX: emptyStat(),
    S3_SEMANTIC_RESPLIT: emptyStat(),
  };
}

function normalizeScores(stats: Record<StrategyKey, StrategyStat>): Record<StrategyKey, StrategyStat> {
  for (const key of STRATEGY_KEYS) {
    const row = stats[key];
    const tr = Math.max(0, toNumber(row.total_runs));
    const wc = Math.max(0, toNumber(row.win_count));
    row.total_runs = tr;
    row.win_count = wc;
    row.total_boundaries = Math.max(0, toNumber(row.total_boundaries));
    row.total_hard_flags = Math.max(0, toNumber(row.total_hard_flags));
    row.score = (wc + 1.0) / (tr + 2.0);
  }
  return stats;
}

function bestStrategy(stats: Record<StrategyKey, StrategyStat>): StrategyKey {
  let best: StrategyKey = "S0_BASE";
  let bestScore = -1;
  for (const key of STRATEGY_KEYS) {
    const row = stats[key];
    const eff = row.score + Math.min(0.05, row.total_runs * 0.001);
    if (eff > bestScore) {
      bestScore = eff;
      best = key;
    }
  }
  return best;
}

export async function rejectSplitResponse(
  req: NextRequest,
  storySlug: string,
  rawJobId: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const jobId = parseJobId(rawJobId);
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown; created_by?: unknown };
    const reason = parseReason(body.reason);
    const createdBy = normalizeCreatedBy(body.created_by);

    await client.query("BEGIN");
    const jobRes = await client.query<{ status: string }>(
      `SELECT status
       FROM public.ingest_job
       WHERE id = $1 AND story_id = $2
       FOR UPDATE`,
      [jobId, storyId]
    );
    if (jobRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    await client.query(
      `DELETE FROM public.ingest_task
       WHERE job_id = $1
         AND story_id = $2
         AND task_type = 'SCENE_CREATE'
         AND status IN ('READY', 'PENDING')`,
      [jobId, storyId]
    );
    await client.query(
      `DELETE FROM public.ingest_task
       WHERE job_id = $1
         AND story_id = $2
         AND task_type = 'CHAPTER_SPLIT_LLM'
         AND status IN ('READY', 'PENDING')`,
      [jobId, storyId]
    );

    await client.query(
      `UPDATE public.ingest_job
       SET status = 'CANCELLED',
           split_draft_json = jsonb_build_object(
             'rejected_at', now(),
             'rejected_by', $3::text,
             'reason', $4::text,
             'human_outcome', 'FAILED_HUMAN_REJECTED'
           ),
           updated_at = now()
       WHERE id = $1 AND story_id = $2`,
      [jobId, storyId, createdBy, reason]
    );
    await reconcileTerminalJobTasks(client, storyId, jobId, "JOB_CANCELLED_BY_SPLIT_REJECT");
    await client.query(
      `UPDATE public.ingest_task
       SET result_json = jsonb_set(
         jsonb_set(
           jsonb_set(
             COALESCE(result_json, '{}'::jsonb),
             '{human_outcome}',
             to_jsonb('FAILED_HUMAN_REJECTED'::text),
             true
           ),
           '{human_verdict_by}',
           to_jsonb($3::text),
           true
         ),
           '{human_verdict_at}',
           to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')),
           true
         ),
       human_outcome = 'FAILED_HUMAN_REJECTED',
       human_verdict_by = $3::text,
       human_verdict_at = now(),
       updated_at = now()
       WHERE job_id = $1
         AND story_id = $2
         AND task_type = 'CHAPTER_SPLIT_LLM'
         AND status = 'DONE'`,
      [jobId, storyId, createdBy]
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      job_id: jobId,
      story_id: storyId,
      status: "CANCELLED",
      reason,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "INGEST_REJECT_SPLIT_FAILED";
    const status = msg.includes("INVALID_JOB_ID") ? 400 : msg.includes("STORY_ARCHIVED") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

export async function validateIngestResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const parsed = await parseIngestRequest(req);
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const splitMode = parseSplitMode(parsed.splitMode);
    const result = validateAndNormalizeInput(parsed.payload, { splitMode });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          story_id: storyId,
          effective_split_mode: splitMode,
          errors: result.errors,
          summary: result.summary,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      effective_split_mode: splitMode,
      summary: result.summary,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "INGEST_VALIDATE_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function rebuildGlobalProfileResponse(storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    await client.query("BEGIN");

    const rowsRes = await client.query<{ chapter_id: string; profile_json: unknown }>(
      `SELECT chapter_id, profile_json
         FROM public.split_strategy_profile
        WHERE story_id = $1
          AND chapter_id <> '__global__'`,
      [storyId]
    );

    const stats = buildInitialStats();
    const signatureVotes: Record<string, Record<StrategyKey, number>> = {};
    const mergedHistory: Array<Record<string, unknown>> = [];

    for (const row of rowsRes.rows) {
      const profile = toObject(row.profile_json);
      const strategyStats = toObject(profile.strategy_stats);
      let statsRowsSeen = 0;
      for (const key of STRATEGY_KEYS) {
        const node = toObject(strategyStats[key]);
        if (Object.keys(node).length > 0) statsRowsSeen += 1;
        stats[key].total_runs += toNumber(node.total_runs);
        stats[key].win_count += toNumber(node.win_count);
        stats[key].total_boundaries += toNumber(node.total_boundaries);
        stats[key].total_hard_flags += toNumber(node.total_hard_flags);
      }

      const bestBySignature = toObject(profile.best_by_signature);
      for (const [sig, pick] of Object.entries(bestBySignature)) {
        if (typeof pick !== "string") continue;
        if (!STRATEGY_KEYS.includes(pick as StrategyKey)) continue;
        const k = pick as StrategyKey;
        signatureVotes[sig] = signatureVotes[sig] ?? {
          S0_BASE: 0,
          S1_STRICT_BOUNDARY: 0,
          S1_TARGETED_WINDOW_REPAIR: 0,
          S2_MERGE_FIX: 0,
          S3_SEMANTIC_RESPLIT: 0,
        };
        signatureVotes[sig][k] += 1;
      }

      const history = Array.isArray(profile.history) ? profile.history : [];
      for (const item of history) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const h = item as Record<string, unknown>;
        mergedHistory.push({ chapter_id: row.chapter_id, ...h });
        if (statsRowsSeen > 0) continue;
        const strategy = typeof h.strategy === "string" ? (h.strategy as StrategyKey) : null;
        if (!strategy || !STRATEGY_KEYS.includes(strategy)) continue;
        const sceneTotal = Math.max(0, toNumber(h.scene_total));
        const boundaries = Math.max(1, sceneTotal - 1);
        const hardFlags = Math.max(0, toNumber(h.mid_word_cut_count) + toNumber(h.abbrev_or_name_cut_count));
        stats[strategy].total_runs += 1;
        stats[strategy].win_count += 1;
        stats[strategy].total_boundaries += boundaries;
        stats[strategy].total_hard_flags += hardFlags;
      }
    }

    normalizeScores(stats);
    const globalBest = bestStrategy(stats);
    const bestBySignature: Record<string, string> = { LAST_BEST: globalBest };
    for (const [sig, votes] of Object.entries(signatureVotes)) {
      let pick: StrategyKey = globalBest;
      let voteMax = -1;
      for (const key of STRATEGY_KEYS) {
        const v = toNumber(votes[key]);
        if (v > voteMax) {
          voteMax = v;
          pick = key;
        }
      }
      bestBySignature[sig] = pick;
    }

    mergedHistory.sort((a, b) => toNumber(a.ts) - toNumber(b.ts));
    const trimmedHistory = mergedHistory.slice(-30);

    const profileJson = {
      best_by_signature: bestBySignature,
      history: trimmedHistory,
      strategy_stats: stats,
      rebuilt_at: Math.floor(Date.now() / 1000),
      rebuilt_from_chapters: rowsRes.rows.length,
    };

    await client.query(
      `INSERT INTO public.split_strategy_profile (story_id, chapter_id, profile_json, updated_at, profile_version)
       VALUES ($1, '__global__', $2::jsonb, now(), 1)
       ON CONFLICT (story_id, chapter_id)
       DO UPDATE SET
         profile_json = EXCLUDED.profile_json,
         updated_at = now(),
         profile_version = public.split_strategy_profile.profile_version + 1`,
      [storyId, JSON.stringify(profileJson)]
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      story_id: storyId,
      chapter_profiles: rowsRes.rows.length,
      global_best: globalBest,
      strategy_stats: stats,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "REBUILD_GLOBAL_PROFILE_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  } finally {
    client.release();
  }
}

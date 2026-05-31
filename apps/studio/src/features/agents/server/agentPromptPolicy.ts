/* eslint-disable complexity */
import type { PoolClient } from "pg";

export const ALLOWED_SCOPES = new Set(["global", "story", "chapter"]);
export const MIN_CANARY_SAMPLES = 20;
export const MAX_FAILURE_RATE_DELTA = 0.02;
export const MAX_META_LEAK_RATE_DELTA = 0.01;
export const MAX_GOLDEN_FAILURE_RATE_DELTA = 0.01;
export const DEFAULT_PROMOTE_LOOKBACK_HOURS = 168;
export const SHADOW_REQUIRE_FOR_PROMOTION =
  String(process.env.AGENT_PROMOTE_REQUIRE_SHADOW ?? "").toLowerCase() === "true";
export const SHADOW_MIN_SAMPLES = (() => {
  const raw = Number(process.env.AGENT_PROMOTE_SHADOW_MIN_SAMPLES ?? 20);
  return Number.isFinite(raw) ? Math.max(1, Math.min(10000, Math.floor(raw))) : 20;
})();
export const SHADOW_MAX_FAILURE_RATE_DELTA = (() => {
  const raw = Number(process.env.AGENT_PROMOTE_SHADOW_MAX_FAILURE_RATE_DELTA ?? 0.01);
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.01;
})();
export const SHADOW_MAX_LATENCY_DELTA_MS = (() => {
  const raw = Number(process.env.AGENT_PROMOTE_SHADOW_MAX_LATENCY_DELTA_MS ?? 250);
  return Number.isFinite(raw) ? Math.max(0, Math.min(60000, Math.floor(raw))) : 250;
})();
export const ALLOWED_PROMOTION_REASON_TEMPLATE = new Set([
  "CANARY_SUCCESS",
  "QUALITY_FIX",
  "INCIDENT_MITIGATION",
  "MANUAL_OVERRIDE",
]);

const CONTRACT_ALLOWED_KEYS = new Set(["schema_version", "type", "required_fields", "max_output_chars", "notes", "strict"]);
const GUARDRAIL_ALLOWED_KEYS = new Set(["meta_leak_block", "max_retries", "entity_lock", "word_budget_min", "word_budget_max", "notes"]);

function parseGoldenChaptersEnv(): string[] {
  const raw = process.env.AGENT_PROMOTE_GOLDEN_CHAPTERS ?? "";
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => Boolean(x));
}

function parseGoldenMinRunsEnv(): number {
  const minGoldenRunsRaw = Number(process.env.AGENT_PROMOTE_GOLDEN_MIN_RUNS ?? 5);
  return Number.isFinite(minGoldenRunsRaw) ? Math.max(1, Math.min(1000, Math.floor(minGoldenRunsRaw))) : 5;
}

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01");
}

export async function loadGoldenPolicyByStory(client: PoolClient, storyId: number): Promise<{
  chapterIds: string[];
  minRuns: number;
  source: "story_policy" | "env_fallback";
}> {
  try {
    const res = await client.query<{ golden_chapter_ids: unknown; golden_min_runs: number }>(
      `SELECT golden_chapter_ids, golden_min_runs
       FROM public.story_quality_policy
       WHERE story_id = $1
       LIMIT 1`,
      [storyId],
    );
    if ((res.rowCount ?? 0) > 0) {
      const row = res.rows[0];
      const chapterIds = Array.isArray(row.golden_chapter_ids)
        ? row.golden_chapter_ids.map((x) => String(x || "").trim()).filter((x) => Boolean(x))
        : [];
      const minRunsRaw = Number(row.golden_min_runs ?? 5);
      const minRuns = Number.isFinite(minRunsRaw) ? Math.max(1, Math.min(1000, Math.floor(minRunsRaw))) : 5;
      return { chapterIds, minRuns, source: "story_policy" };
    }
  } catch (error: unknown) {
    if (!isUndefinedTableError(error)) throw error;
  }

  return {
    chapterIds: parseGoldenChaptersEnv(),
    minRuns: parseGoldenMinRunsEnv(),
    source: "env_fallback",
  };
}

export async function loadGoldenRegressionPerf(
  client: PoolClient,
  args: {
    storyId: number;
    candidateVersionId: number;
    baselineVersionId: number | null;
    lookbackHours: number;
    chapterIds: string[];
  },
): Promise<{
  candidateRuns: number;
  candidateFailureRate: number;
  baselineRuns: number;
  baselineFailureRate: number;
}> {
  const { storyId, candidateVersionId, baselineVersionId, lookbackHours, chapterIds } = args;
  if (!baselineVersionId || chapterIds.length === 0) {
    return {
      candidateRuns: 0,
      candidateFailureRate: 0,
      baselineRuns: 0,
      baselineFailureRate: 0,
    };
  }
  const perfRes = await client.query<{
    prompt_version_id: number;
    total_runs: string;
    failed_runs: string;
  }>(
    `SELECT
       prompt_version_id,
       COUNT(*)::text AS total_runs,
       COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_runs
     FROM public.agent_run_trace
     WHERE story_id = $1
       AND prompt_version_id IN ($2, $3)
       AND chapter_id = ANY($4::text[])
       AND created_at >= NOW() - make_interval(hours => $5::int)
     GROUP BY prompt_version_id`,
    [storyId, baselineVersionId, candidateVersionId, chapterIds, lookbackHours],
  );
  const byVersion = new Map<number, { total: number; failed: number }>();
  for (const row of perfRes.rows) {
    byVersion.set(Number(row.prompt_version_id), {
      total: Number(row.total_runs || 0),
      failed: Number(row.failed_runs || 0),
    });
  }
  const candidate = byVersion.get(candidateVersionId) || { total: 0, failed: 0 };
  const baseline = byVersion.get(baselineVersionId) || { total: 0, failed: 0 };
  return {
    candidateRuns: candidate.total,
    candidateFailureRate: candidate.total > 0 ? candidate.failed / candidate.total : 1,
    baselineRuns: baseline.total,
    baselineFailureRate: baseline.total > 0 ? baseline.failed / baseline.total : 0,
  };
}

export async function loadShadowPromotionPerf(
  client: PoolClient,
  args: {
    storyId: number;
    candidateVersionId: number;
    baselineVersionId: number | null;
    lookbackHours: number;
  },
): Promise<{
  sampleCount: number;
  candidateFailureRate: number;
  baselineFailureRate: number;
  avgLatencyDeltaMs: number | null;
}> {
  const { storyId, candidateVersionId, baselineVersionId, lookbackHours } = args;
  if (!baselineVersionId) {
    return {
      sampleCount: 0,
      candidateFailureRate: 0,
      baselineFailureRate: 0,
      avgLatencyDeltaMs: null,
    };
  }
  try {
    const res = await client.query<{
      sample_count: string;
      candidate_failed: string;
      baseline_failed: string;
      avg_latency_delta_ms: string | null;
    }>(
      `WITH paired AS (
         SELECT
           srp.id,
           ar_active.status AS active_status,
           ar_shadow.status AS shadow_status,
           ar_active.latency_ms AS active_latency_ms,
           ar_shadow.latency_ms AS shadow_latency_ms
         FROM public.shadow_run_pair srp
         JOIN public.agent_run_trace ar_shadow ON ar_shadow.id = srp.shadow_run_trace_id
         LEFT JOIN public.agent_run_trace ar_active ON ar_active.id = srp.active_run_trace_id
         WHERE srp.story_id = $1
           AND srp.shadow_prompt_version_id = $2
           AND ar_shadow.prompt_version_id = $2
           AND (
             srp.active_prompt_version_id IS NULL
             OR srp.active_prompt_version_id = $3
           )
           AND (ar_active.id IS NULL OR ar_active.prompt_version_id = $3)
           AND srp.pair_status IN ('PAIRED', 'COMPARED')
           AND srp.created_at >= NOW() - make_interval(hours => $4::int)
       )
       SELECT
         COUNT(*)::text AS sample_count,
         COUNT(*) FILTER (WHERE COALESCE(upper(shadow_status), '') = 'FAILED')::text AS candidate_failed,
         COUNT(*) FILTER (WHERE COALESCE(upper(active_status), '') = 'FAILED')::text AS baseline_failed,
         AVG(
           CASE
             WHEN shadow_latency_ms IS NOT NULL AND active_latency_ms IS NOT NULL
               THEN (shadow_latency_ms - active_latency_ms)::numeric
             ELSE NULL
           END
         )::text AS avg_latency_delta_ms
       FROM paired`,
      [storyId, candidateVersionId, baselineVersionId, lookbackHours],
    );
    const row = res.rows[0];
    const sampleCount = Number(row?.sample_count || 0);
    if (sampleCount <= 0) {
      return {
        sampleCount: 0,
        candidateFailureRate: 0,
        baselineFailureRate: 0,
        avgLatencyDeltaMs: null,
      };
    }
    const candidateFailed = Number(row?.candidate_failed || 0);
    const baselineFailed = Number(row?.baseline_failed || 0);
    const avgLatencyDeltaMsRaw = Number(row?.avg_latency_delta_ms ?? NaN);
    return {
      sampleCount,
      candidateFailureRate: candidateFailed / Math.max(1, sampleCount),
      baselineFailureRate: baselineFailed / Math.max(1, sampleCount),
      avgLatencyDeltaMs: Number.isFinite(avgLatencyDeltaMsRaw) ? avgLatencyDeltaMsRaw : null,
    };
  } catch (error: unknown) {
    if (isUndefinedTableError(error)) {
      return {
        sampleCount: 0,
        candidateFailureRate: 0,
        baselineFailureRate: 0,
        avgLatencyDeltaMs: null,
      };
    }
    throw error;
  }
}

export function validatePromptContracts(
  agentName: string,
  outputContract: Record<string, unknown>,
  guardrail: Record<string, unknown>
): string | null {
  for (const key of Object.keys(outputContract)) {
    if (!CONTRACT_ALLOWED_KEYS.has(key)) return `OUTPUT_CONTRACT_KEY_NOT_ALLOWED:${key}`;
  }
  for (const key of Object.keys(guardrail)) {
    if (!GUARDRAIL_ALLOWED_KEYS.has(key)) return `GUARDRAIL_KEY_NOT_ALLOWED:${key}`;
  }
  if ("required_fields" in outputContract) {
    const required = outputContract.required_fields;
    if (!Array.isArray(required) || required.some((x) => typeof x !== "string" || !x.trim())) {
      return "OUTPUT_CONTRACT_REQUIRED_FIELDS_INVALID";
    }
  }
  if ("max_output_chars" in outputContract) {
    const maxChars = Number(outputContract.max_output_chars);
    if (!Number.isFinite(maxChars) || maxChars <= 0) return "OUTPUT_CONTRACT_MAX_OUTPUT_CHARS_INVALID";
  }
  if (agentName === "NARRATIVE_CRITIC") {
    const required = Array.isArray(outputContract.required_fields) ? outputContract.required_fields.map((x) => String(x)) : [];
    if (!required.includes("summary") || !required.includes("patches")) {
      return "CRITIC_CONTRACT_REQUIRED_FIELDS_MISSING";
    }
  }
  return null;
}

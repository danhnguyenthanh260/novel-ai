/* eslint-disable complexity */
import { pool } from "@/server/db/pool";
import {
  type ShadowPairRow,
  type ShadowRunTraceLiteRow,
  isPlainObject,
  parseNumber,
} from "@/features/agents/server/agentDrawerUtils";

export type AgentDrawerShadowCompareItem = {
  pair_id: number;
  pair_status: string;
  active_run_trace_id: number | null;
  shadow_run_trace_id: number | null;
  active_prompt_version_id: number | null;
  shadow_prompt_version_id: number | null;
  delta_latency_ms: number | null;
  delta_token_in: number | null;
  delta_token_out: number | null;
  active_hard_fail: boolean | null;
  shadow_hard_fail: boolean | null;
  active_flagged_pct: number | null;
  shadow_flagged_pct: number | null;
  compare_json: Record<string, unknown>;
  created_at: string;
};

export async function loadAgentDrawerShadowCompare(
  storyId: number,
  taskId: number
): Promise<{ shadowPairs: ShadowPairRow[]; shadowCompare: AgentDrawerShadowCompareItem[] }> {
  let shadowPairs: ShadowPairRow[] = [];
  try {
    const shadowRes = await pool.query<ShadowPairRow>(
      `SELECT
         id,
         pair_status,
         active_run_trace_id,
         shadow_run_trace_id,
         active_prompt_version_id,
         shadow_prompt_version_id,
         compare_json,
         created_at::text
       FROM public.shadow_run_pair
       WHERE story_id = $1
         AND task_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [storyId, taskId],
    );
    shadowPairs = shadowRes.rows;
  } catch (error: unknown) {
    if (!error || typeof error !== "object" || !["42P01", "42703"].includes((error as { code?: string }).code || "")) {
      throw error;
    }
  }

  if (shadowPairs.length === 0) {
    return { shadowPairs, shadowCompare: [] };
  }

  const ids = Array.from(
    new Set(
      shadowPairs
        .flatMap((x) => [x.active_run_trace_id, x.shadow_run_trace_id])
        .filter((x): x is number => Number.isFinite(Number(x)) && Number(x) > 0),
    ),
  );
  let runById = new Map<number, ShadowRunTraceLiteRow>();
  if (ids.length > 0) {
    const runRes = await pool.query<ShadowRunTraceLiteRow>(
      `SELECT id, status, latency_ms, token_in, token_out, quality_json
       FROM public.agent_run_trace
       WHERE story_id = $1
         AND id = ANY($2::bigint[])`,
      [storyId, ids],
    );
    runById = new Map(runRes.rows.map((r) => [Number(r.id), r]));
  }

  const shadowCompare = shadowPairs.map((p) => {
    const active = p.active_run_trace_id ? runById.get(Number(p.active_run_trace_id)) : undefined;
    const shadow = p.shadow_run_trace_id ? runById.get(Number(p.shadow_run_trace_id)) : undefined;
    const activeQ = active?.quality_json && isPlainObject(active.quality_json) ? active.quality_json : {};
    const shadowQ = shadow?.quality_json && isPlainObject(shadow.quality_json) ? shadow.quality_json : {};
    const activeLatency = parseNumber(active?.latency_ms);
    const shadowLatency = parseNumber(shadow?.latency_ms);
    const activeIn = parseNumber(active?.token_in);
    const shadowIn = parseNumber(shadow?.token_in);
    const activeOut = parseNumber(active?.token_out);
    const shadowOut = parseNumber(shadow?.token_out);
    return {
      pair_id: p.id,
      pair_status: p.pair_status,
      active_run_trace_id: p.active_run_trace_id,
      shadow_run_trace_id: p.shadow_run_trace_id,
      active_prompt_version_id: p.active_prompt_version_id,
      shadow_prompt_version_id: p.shadow_prompt_version_id,
      delta_latency_ms: activeLatency != null && shadowLatency != null ? shadowLatency - activeLatency : null,
      delta_token_in: activeIn != null && shadowIn != null ? shadowIn - activeIn : null,
      delta_token_out: activeOut != null && shadowOut != null ? shadowOut - activeOut : null,
      active_hard_fail: typeof activeQ.hard_fail === "boolean" ? activeQ.hard_fail : null,
      shadow_hard_fail: typeof shadowQ.hard_fail === "boolean" ? shadowQ.hard_fail : null,
      active_flagged_pct: parseNumber(activeQ.flagged_pct),
      shadow_flagged_pct: parseNumber(shadowQ.flagged_pct),
      compare_json: isPlainObject(p.compare_json) ? p.compare_json : {},
      created_at: p.created_at,
    };
  });

  return { shadowPairs, shadowCompare };
}

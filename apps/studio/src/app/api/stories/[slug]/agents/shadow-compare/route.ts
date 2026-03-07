import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";

export const runtime = "nodejs";

async function resolveStoryId(slug: string): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  const id = Number(res.rows[0]?.id ?? 0);
  if (!id) throw new Error("NOT_FOUND");
  return id;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const storyId = await resolveStoryId(slug);
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 50);
    const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();

    const pairRes = await pool.query<{
      id: number;
      task_id: number | null;
      agent_name: string;
      pair_status: string;
      active_run_trace_id: number | null;
      shadow_run_trace_id: number | null;
      active_prompt_version_id: number | null;
      shadow_prompt_version_id: number | null;
      compare_json: unknown;
      created_at: string;
    }>(
      `SELECT
         id, task_id, agent_name, pair_status, active_run_trace_id, shadow_run_trace_id,
         active_prompt_version_id, shadow_prompt_version_id, compare_json, created_at::text
       FROM public.shadow_run_pair
       WHERE story_id = $1
         AND ($2 = '' OR agent_name = $2)
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [storyId, agentName, limit],
    );

    const ids = Array.from(
      new Set(
        pairRes.rows
          .flatMap((x) => [x.active_run_trace_id, x.shadow_run_trace_id])
          .filter((x): x is number => Number.isFinite(Number(x)) && Number(x) > 0),
      ),
    );
    const traceById = new Map<number, { id: number; latency_ms: number | null; token_in: number | null; token_out: number | null; quality_json: unknown; status: string }>();
    if (ids.length > 0) {
      const traceRes = await pool.query<{
        id: number;
        latency_ms: number | null;
        token_in: number | null;
        token_out: number | null;
        quality_json: unknown;
        status: string;
      }>(
        `SELECT id, latency_ms, token_in, token_out, quality_json, status
         FROM public.agent_run_trace
         WHERE story_id = $1
           AND id = ANY($2::bigint[])`,
        [storyId, ids],
      );
      for (const row of traceRes.rows) traceById.set(Number(row.id), row);
    }

    const items = pairRes.rows.map((p) => {
      const a = p.active_run_trace_id ? traceById.get(Number(p.active_run_trace_id)) : undefined;
      const s = p.shadow_run_trace_id ? traceById.get(Number(p.shadow_run_trace_id)) : undefined;
      const aq = a?.quality_json && isPlainObject(a.quality_json) ? a.quality_json : {};
      const sq = s?.quality_json && isPlainObject(s.quality_json) ? s.quality_json : {};
      const aLatency = parseNumber(a?.latency_ms);
      const sLatency = parseNumber(s?.latency_ms);
      const aIn = parseNumber(a?.token_in);
      const sIn = parseNumber(s?.token_in);
      const aOut = parseNumber(a?.token_out);
      const sOut = parseNumber(s?.token_out);
      return {
        id: p.id,
        task_id: p.task_id,
        agent_name: p.agent_name,
        pair_status: p.pair_status,
        active_run_trace_id: p.active_run_trace_id,
        shadow_run_trace_id: p.shadow_run_trace_id,
        active_prompt_version_id: p.active_prompt_version_id,
        shadow_prompt_version_id: p.shadow_prompt_version_id,
        active_status: a?.status ?? null,
        shadow_status: s?.status ?? null,
        delta_latency_ms: aLatency != null && sLatency != null ? sLatency - aLatency : null,
        delta_token_in: aIn != null && sIn != null ? sIn - aIn : null,
        delta_token_out: aOut != null && sOut != null ? sOut - aOut : null,
        active_hard_fail: typeof aq.hard_fail === "boolean" ? aq.hard_fail : null,
        shadow_hard_fail: typeof sq.hard_fail === "boolean" ? sq.hard_fail : null,
        active_flagged_pct: parseNumber(aq.flagged_pct),
        shadow_flagged_pct: parseNumber(sq.flagged_pct),
        compare_json: isPlainObject(p.compare_json) ? p.compare_json : {},
        created_at: p.created_at,
      };
    });

    return NextResponse.json({ ok: true, story_id: storyId, items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_SHADOW_COMPARE_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: msg === "NOT_FOUND" ? 404 : 500 });
  }
}


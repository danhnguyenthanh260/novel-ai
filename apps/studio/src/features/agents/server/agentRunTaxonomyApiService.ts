
/* eslint-disable complexity, max-lines-per-function */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";

type AgentErrorTaxonomyRow = {
  taxonomy: string;
  hit_count: string;
};

type AgentErrorTaxonomyAgentRow = {
  taxonomy: string;
  agent_name: string;
  hit_count: string;
};

const TAXONOMY_ORDER = ["META_LEAK", "EMPTY_OUTPUT", "ENTITY_DRIFT", "BUDGET_MISS"] as const;

export async function getAgentErrorTaxonomyResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const from = (req.nextUrl.searchParams.get("from") ?? "").trim();
    const to = (req.nextUrl.searchParams.get("to") ?? "").trim();
    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];
    if (from) {
      params.push(from);
      where.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`created_at <= $${params.length}::timestamptz`);
    }

    const classify = `
      CASE
        WHEN COALESCE((quality_json->>'meta_leak')::boolean, false)
             OR COALESCE(error_code, '') ILIKE '%META_LEAK%'
        THEN 'META_LEAK'
        WHEN COALESCE(error_code, '') ILIKE '%EMPTY%'
             OR COALESCE((quality_json->>'empty_output')::boolean, false)
        THEN 'EMPTY_OUTPUT'
        WHEN COALESCE(error_code, '') ILIKE '%ENTITY%'
             OR COALESCE((quality_json->>'entity_drift')::boolean, false)
             OR COALESCE((quality_json->>'character_drift_detected')::boolean, false)
        THEN 'ENTITY_DRIFT'
        WHEN COALESCE(error_code, '') ILIKE '%WORD_BUDGET%'
             OR COALESCE(error_code, '') ILIKE '%BUDGET%'
             OR COALESCE((quality_json->>'word_budget_underflow')::boolean, false)
             OR COALESCE((quality_json->>'word_budget_overflow')::boolean, false)
        THEN 'BUDGET_MISS'
        ELSE NULL
      END
    `;

    const totalRows = await pool.query<{ total_runs: string }>(
      `SELECT COUNT(*)::text AS total_runs
       FROM public.agent_run_trace
       WHERE ${where.join(" AND ")}`,
      params
    );
    const totalRuns = Number(totalRows.rows[0]?.total_runs ?? 0);

    const rows = await pool.query<AgentErrorTaxonomyRow>(
      `SELECT taxonomy, COUNT(*)::text AS hit_count
       FROM (
         SELECT ${classify} AS taxonomy
         FROM public.agent_run_trace
         WHERE ${where.join(" AND ")}
       ) x
       WHERE taxonomy IS NOT NULL
       GROUP BY taxonomy`,
      params
    );

    const byAgentRows = await pool.query<AgentErrorTaxonomyAgentRow>(
      `SELECT taxonomy, agent_name, COUNT(*)::text AS hit_count
       FROM (
         SELECT
           agent_name,
           ${classify} AS taxonomy
         FROM public.agent_run_trace
         WHERE ${where.join(" AND ")}
       ) x
       WHERE taxonomy IS NOT NULL
       GROUP BY taxonomy, agent_name`,
      params
    );

    const countMap = new Map<string, number>();
    for (const row of rows.rows) {
      countMap.set(row.taxonomy, Number(row.hit_count || 0));
    }

    const byTaxonomyAgent = new Map<string, Array<{ agent_name: string; hit_count: number }>>();
    for (const row of byAgentRows.rows) {
      const list = byTaxonomyAgent.get(row.taxonomy) ?? [];
      list.push({ agent_name: row.agent_name, hit_count: Number(row.hit_count || 0) });
      byTaxonomyAgent.set(row.taxonomy, list);
    }
    for (const [k, list] of byTaxonomyAgent.entries()) {
      list.sort((a, b) => b.hit_count - a.hit_count || a.agent_name.localeCompare(b.agent_name));
      byTaxonomyAgent.set(k, list.slice(0, 5));
    }

    const items = TAXONOMY_ORDER.map((taxonomy) => {
      const count = countMap.get(taxonomy) ?? 0;
      return {
        taxonomy,
        hit_count: count,
        hit_rate: totalRuns > 0 ? count / totalRuns : 0,
        top_agents: byTaxonomyAgent.get(taxonomy) ?? [],
      };
    });

    return NextResponse.json({
      ok: true,
      summary: {
        total_runs: totalRuns,
        total_hits: items.reduce((acc, x) => acc + x.hit_count, 0),
      },
      items,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_ERROR_TAXONOMY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentPromptImpactRow = {
  agent_name: string;
  prompt_version_id: number | null;
  total_runs: string;
  done_runs: string;
  failed_runs: string;
  avg_latency_ms: string | null;
  p95_latency_ms: string | null;
  meta_leak_runs: string;
};

export async function getAgentPromptImpactResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const from = (req.nextUrl.searchParams.get("from") ?? "").trim();
    const to = (req.nextUrl.searchParams.get("to") ?? "").trim();

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];
    if (from) {
      params.push(from);
      where.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`created_at <= $${params.length}::timestamptz`);
    }

    const rows = await pool.query<AgentPromptImpactRow>(
      `SELECT
         agent_name,
         prompt_version_id,
         COUNT(*)::text AS total_runs,
         COUNT(*) FILTER (WHERE status = 'DONE')::text AS done_runs,
         COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_runs,
         ROUND(AVG(latency_ms)::numeric, 2)::text AS avg_latency_ms,
         ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2)::text AS p95_latency_ms,
         COUNT(*) FILTER (WHERE COALESCE((quality_json->>'meta_leak')::boolean, false))::text AS meta_leak_runs
       FROM public.agent_run_trace
       WHERE ${where.join(" AND ")}
       GROUP BY agent_name, prompt_version_id
       ORDER BY COUNT(*) DESC, agent_name ASC
       LIMIT 300`,
      params
    );

    const items = rows.rows.map((r) => {
      const total = Number(r.total_runs || 0);
      const done = Number(r.done_runs || 0);
      const failed = Number(r.failed_runs || 0);
      const meta = Number(r.meta_leak_runs || 0);
      return {
        agent_name: r.agent_name,
        prompt_version_id: r.prompt_version_id,
        total_runs: total,
        success_rate: total > 0 ? done / total : 0,
        failure_rate: total > 0 ? failed / total : 0,
        meta_leak_rate: total > 0 ? meta / total : 0,
        avg_latency_ms: r.avg_latency_ms ? Number(r.avg_latency_ms) : null,
        p95_latency_ms: r.p95_latency_ms ? Number(r.p95_latency_ms) : null,
      };
    });
    return NextResponse.json({ ok: true, items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_PROMPT_IMPACT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

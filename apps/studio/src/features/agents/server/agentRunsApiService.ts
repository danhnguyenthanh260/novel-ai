
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";

type AgentRunRow = {
  id: number;
  job_id: number | null;
  task_id: number | null;
  story_id: number;
  chapter_id: string | null;
  agent_name: string;
  prompt_version_id: number | null;
  model_name: string | null;
  input_hash: string;
  output_hash: string | null;
  latency_ms: number | null;
  token_in: number | null;
  token_out: number | null;
  status: string;
  error_code: string | null;
  quality_json: unknown;
  context_snapshot_id: number | null;
  strategy_profile_version_id: number | null;
  rationale_summary: string | null;
  created_at: string;
};

export async function getAgentRunsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const chapterId = (req.nextUrl.searchParams.get("chapter_id") ?? "").trim();
    const status = (req.nextUrl.searchParams.get("status") ?? "").trim().toUpperCase();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];

    if (agentName) {
      params.push(agentName);
      where.push(`agent_name = $${params.length}`);
    }
    if (chapterId) {
      params.push(chapterId);
      where.push(`chapter_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    params.push(limit);

    const sql = `
      SELECT
        id, job_id, task_id, story_id, chapter_id, agent_name, prompt_version_id, model_name,
        input_hash, output_hash, latency_ms, token_in, token_out, status, error_code,
        quality_json, context_snapshot_id, strategy_profile_version_id, rationale_summary, created_at::text
      FROM public.agent_run_trace
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `;
    const rows = await pool.query<AgentRunRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_RUNS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function getAgentRunDetailResponse(
  _req: NextRequest,
  storySlug: string,
  runIdRaw: string
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const runId = Number(runIdRaw || 0);
    if (!runId) return NextResponse.json({ ok: false, error: "INVALID_RUN_ID" }, { status: 400 });

    const row = await pool.query<AgentRunRow>(
      `SELECT
         id, job_id, task_id, story_id, chapter_id, agent_name, prompt_version_id, model_name,
         input_hash, output_hash, latency_ms, token_in, token_out, status, error_code,
         quality_json, context_snapshot_id, strategy_profile_version_id, rationale_summary, created_at::text
       FROM public.agent_run_trace
       WHERE id = $1
         AND story_id = $2
       LIMIT 1`,
      [runId, storyId]
    );
    if (!row.rowCount) return NextResponse.json({ ok: false, error: "RUN_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, item: row.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_RUN_DETAIL_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentMetricRow = {
  agent_name: string;
  total_runs: string;
  done_runs: string;
  failed_runs: string;
  timeout_runs: string;
  avg_latency_ms: string | null;
  meta_leak_runs: string;
};

export async function getAgentMetricsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
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

    const sql = `
      SELECT
        agent_name,
        COUNT(*)::text AS total_runs,
        COUNT(*) FILTER (WHERE status = 'DONE')::text AS done_runs,
        COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_runs,
        COUNT(*) FILTER (WHERE status = 'TIMEOUT')::text AS timeout_runs,
        ROUND(AVG(latency_ms)::numeric, 2)::text AS avg_latency_ms,
        COUNT(*) FILTER (WHERE COALESCE((quality_json->>'meta_leak')::boolean, false))::text AS meta_leak_runs
      FROM public.agent_run_trace
      WHERE ${where.join(" AND ")}
      GROUP BY agent_name
      ORDER BY agent_name ASC
    `;
    const rows = await pool.query<AgentMetricRow>(sql, params);

    const items = rows.rows.map((r) => {
      const total = Number(r.total_runs || 0);
      const done = Number(r.done_runs || 0);
      const failed = Number(r.failed_runs || 0);
      const timeout = Number(r.timeout_runs || 0);
      const metaLeak = Number(r.meta_leak_runs || 0);
      return {
        agent_name: r.agent_name,
        total_runs: total,
        done_runs: done,
        failed_runs: failed,
        timeout_runs: timeout,
        success_rate: total > 0 ? done / total : 0,
        failure_rate: total > 0 ? failed / total : 0,
        timeout_rate: total > 0 ? timeout / total : 0,
        avg_latency_ms: r.avg_latency_ms ? Number(r.avg_latency_ms) : null,
        meta_leak_rate: total > 0 ? metaLeak / total : 0,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_METRICS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

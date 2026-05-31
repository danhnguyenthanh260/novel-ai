
/* eslint-disable complexity, max-lines-per-function */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";

type AgentCoverageItem = {
  agent_name: string;
  expected_count: number;
  traced_count: number;
  coverage_rate: number;
  below_threshold: boolean;
};

export async function getAgentCoverageHealthResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const from = (req.nextUrl.searchParams.get("from") ?? "").trim();
    const to = (req.nextUrl.searchParams.get("to") ?? "").trim();
    const thresholdRaw = Number(req.nextUrl.searchParams.get("threshold") ?? 0.99);
    const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, Math.min(1, thresholdRaw)) : 0.99;

    const taskWhere: string[] = ["story_id = $1"];
    const traceWhere: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];

    if (from) {
      params.push(from);
      taskWhere.push(`created_at >= $${params.length}::timestamptz`);
      traceWhere.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      taskWhere.push(`created_at <= $${params.length}::timestamptz`);
      traceWhere.push(`created_at <= $${params.length}::timestamptz`);
    }

    const sql = `
      WITH expected_raw AS (
        SELECT 'NARRATIVE_START'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_START'
        UNION ALL
        SELECT 'NARRATIVE_STYLIST'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_STYLIST'
        UNION ALL
        SELECT 'NARRATIVE_CRITIC'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_CRITIC'
        UNION ALL
        SELECT 'NARRATIVE_REFINE'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_REFINE'
        UNION ALL
        SELECT 'NARRATIVE_FINALIZE'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_FINALIZE'
        UNION ALL
        SELECT 'SPLITTER'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'CHAPTER_SPLIT_LLM'
        UNION ALL
        SELECT 'SPLIT_CRITIC'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'CHAPTER_SPLIT_LLM'
        UNION ALL
        SELECT 'SUPERVISOR'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'CHAPTER_SPLIT_LLM'
      ),
      traced AS (
        SELECT agent_name, COUNT(DISTINCT task_id)::int AS traced_count
        FROM public.agent_run_trace
        WHERE ${traceWhere.join(" AND ")}
          AND agent_name IN (
            'NARRATIVE_START',
            'NARRATIVE_STYLIST',
            'NARRATIVE_CRITIC',
            'NARRATIVE_REFINE',
            'NARRATIVE_FINALIZE',
            'SPLITTER',
            'SPLIT_CRITIC',
            'SUPERVISOR'
          )
          AND task_id IS NOT NULL
        GROUP BY agent_name
      )
      SELECT
        e.agent_name,
        e.expected_count,
        COALESCE(t.traced_count, 0)::int AS traced_count
      FROM expected_raw e
      LEFT JOIN traced t ON t.agent_name = e.agent_name
      ORDER BY e.agent_name ASC
    `;

    const rows = await pool.query<{ agent_name: string; expected_count: number; traced_count: number }>(sql, params);
    const items: AgentCoverageItem[] = rows.rows.map((r) => {
      const expected = Number(r.expected_count || 0);
      const traced = Number(r.traced_count || 0);
      const coverageRate = expected > 0 ? traced / expected : 1;
      return {
        agent_name: r.agent_name,
        expected_count: expected,
        traced_count: traced,
        coverage_rate: coverageRate,
        below_threshold: expected > 0 && coverageRate < threshold,
      };
    });

    const overallExpected = items.reduce((acc, x) => acc + x.expected_count, 0);
    const overallTraced = items.reduce((acc, x) => acc + x.traced_count, 0);
    const overallCoverage = overallExpected > 0 ? overallTraced / overallExpected : 1;
    const alerts = items.filter((x) => x.below_threshold);

    return NextResponse.json({
      ok: true,
      threshold,
      summary: {
        overall_expected: overallExpected,
        overall_traced: overallTraced,
        overall_coverage: overallCoverage,
        alert_count: alerts.length,
      },
      items,
      alerts,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_COVERAGE_HEALTH_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentAlertItem = {
  alert_type: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  agent_name: string | null;
  metric_name: string;
  metric_value: number;
  threshold: number;
  message: string;
};

export async function getAgentAlertsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const from = (req.nextUrl.searchParams.get("from") ?? "").trim();
    const to = (req.nextUrl.searchParams.get("to") ?? "").trim();
    const failureSpikeThreshold = Number(req.nextUrl.searchParams.get("failure_spike_threshold") ?? 3);
    const timeoutRateThreshold = Number(req.nextUrl.searchParams.get("timeout_rate_threshold") ?? 0.1);
    const metaLeakRateThreshold = Number(req.nextUrl.searchParams.get("meta_leak_rate_threshold") ?? 0.01);

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

    const failureRows = await pool.query<{ agent_name: string; error_code: string | null; c: string }>(
      `SELECT agent_name, error_code, COUNT(*)::text AS c
       FROM public.agent_run_trace
       WHERE ${where.join(" AND ")}
         AND status = 'FAILED'
       GROUP BY agent_name, error_code
       HAVING COUNT(*) >= $${params.length + 1}
       ORDER BY COUNT(*) DESC
       LIMIT 40`,
      [...params, Math.max(1, Math.floor(failureSpikeThreshold))]
    );

    const rateRows = await pool.query<{ agent_name: string; total_runs: string; timeout_runs: string; meta_leak_runs: string }>(
      `SELECT
         agent_name,
         COUNT(*)::text AS total_runs,
         COUNT(*) FILTER (WHERE status = 'TIMEOUT')::text AS timeout_runs,
         COUNT(*) FILTER (WHERE COALESCE((quality_json->>'meta_leak')::boolean, false))::text AS meta_leak_runs
       FROM public.agent_run_trace
       WHERE ${where.join(" AND ")}
       GROUP BY agent_name
       ORDER BY agent_name ASC`,
      params
    );

    const items: AgentAlertItem[] = [];
    for (const r of failureRows.rows) {
      const count = Number(r.c || 0);
      const sev: AgentAlertItem["severity"] = count >= 10 ? "CRITICAL" : count >= 5 ? "WARN" : "INFO";
      items.push({
        alert_type: "ERROR_SPIKE",
        severity: sev,
        agent_name: r.agent_name,
        metric_name: `error_code:${r.error_code || "UNKNOWN"}`,
        metric_value: count,
        threshold: Math.max(1, Math.floor(failureSpikeThreshold)),
        message: `${r.agent_name} error spike (${r.error_code || "UNKNOWN"}): ${count}`,
      });
    }

    for (const r of rateRows.rows) {
      const total = Number(r.total_runs || 0);
      if (total <= 0) continue;
      const timeoutRate = Number(r.timeout_runs || 0) / total;
      const metaLeakRate = Number(r.meta_leak_runs || 0) / total;
      if (timeoutRate >= timeoutRateThreshold) {
        items.push({
          alert_type: "TIMEOUT_RATE",
          severity: timeoutRate >= timeoutRateThreshold * 2 ? "CRITICAL" : "WARN",
          agent_name: r.agent_name,
          metric_name: "timeout_rate",
          metric_value: timeoutRate,
          threshold: timeoutRateThreshold,
          message: `${r.agent_name} timeout rate ${(timeoutRate * 100).toFixed(1)}%`,
        });
      }
      if (metaLeakRate >= metaLeakRateThreshold) {
        items.push({
          alert_type: "META_LEAK_RATE",
          severity: metaLeakRate >= metaLeakRateThreshold * 3 ? "CRITICAL" : "WARN",
          agent_name: r.agent_name,
          metric_name: "meta_leak_rate",
          metric_value: metaLeakRate,
          threshold: metaLeakRateThreshold,
          message: `${r.agent_name} meta leak rate ${(metaLeakRate * 100).toFixed(2)}%`,
        });
      }
    }

    items.sort((a, b) => {
      const rank = { CRITICAL: 3, WARN: 2, INFO: 1 };
      const ra = rank[a.severity];
      const rb = rank[b.severity];
      if (ra !== rb) return rb - ra;
      return b.metric_value - a.metric_value;
    });
    return NextResponse.json({ ok: true, items: items.slice(0, 60) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_ALERTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

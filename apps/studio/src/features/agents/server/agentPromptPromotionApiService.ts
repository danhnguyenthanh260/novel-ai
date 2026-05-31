
/* eslint-disable complexity, max-lines-per-function */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";
import {
  ALLOWED_PROMOTION_REASON_TEMPLATE,
  DEFAULT_PROMOTE_LOOKBACK_HOURS,
  MAX_FAILURE_RATE_DELTA,
  MAX_GOLDEN_FAILURE_RATE_DELTA,
  MAX_META_LEAK_RATE_DELTA,
  MIN_CANARY_SAMPLES,
  SHADOW_MAX_FAILURE_RATE_DELTA,
  SHADOW_MAX_LATENCY_DELTA_MS,
  SHADOW_MIN_SAMPLES,
  SHADOW_REQUIRE_FOR_PROMOTION,
  loadGoldenPolicyByStory,
  loadGoldenRegressionPerf,
  loadShadowPromotionPerf,
} from "@/features/agents/server/agentPromptPolicy";

export async function postAgentPromptPromoteActiveResponse(
  req: NextRequest,
  storySlug: string,
  versionIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryId(storySlug);
    const versionId = Number(versionIdRaw || 0);
    if (!versionId) return NextResponse.json({ ok: false, error: "INVALID_VERSION_ID" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const author = typeof body.author === "string" && body.author.trim() ? body.author.trim() : "studio";
    const approvedBy = typeof body.approved_by === "string" ? body.approved_by.trim() : "";
    const reasonTemplateRaw = typeof body.reason_template === "string" ? body.reason_template.trim().toUpperCase() : "CANARY_SUCCESS";
    const reasonTemplate = reasonTemplateRaw || "CANARY_SUCCESS";
    const reasonNote = typeof body.reason === "string" ? body.reason.trim() : "";
    const lookbackHoursRaw = Number(body.lookback_hours ?? DEFAULT_PROMOTE_LOOKBACK_HOURS);
    const lookbackHours = Number.isFinite(lookbackHoursRaw) ? Math.max(1, Math.min(24 * 30, Math.floor(lookbackHoursRaw))) : DEFAULT_PROMOTE_LOOKBACK_HOURS;
    const minCandidateSamplesRaw = Number(body.min_candidate_samples ?? MIN_CANARY_SAMPLES);
    const minCandidateSamples = Number.isFinite(minCandidateSamplesRaw) ? Math.max(1, Math.min(10000, Math.floor(minCandidateSamplesRaw))) : MIN_CANARY_SAMPLES;
    const goldenPolicy = await loadGoldenPolicyByStory(client, storyId);
    const goldenChapterIds = goldenPolicy.chapterIds;
    const minGoldenRuns = goldenPolicy.minRuns;

    if (!approvedBy) return NextResponse.json({ ok: false, error: "APPROVED_BY_REQUIRED" }, { status: 400 });
    if (!ALLOWED_PROMOTION_REASON_TEMPLATE.has(reasonTemplate)) {
      return NextResponse.json({ ok: false, error: "INVALID_REASON_TEMPLATE" }, { status: 400 });
    }

    await client.query("BEGIN");
    const rowRes = await client.query<{ profile_id: number; agent_name: string; status: string }>(
      `SELECT apv.profile_id, app.agent_name, apv.status
       FROM public.agent_prompt_version apv
       JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
       WHERE apv.id = $1
       LIMIT 1`,
      [versionId]
    );
    if (!rowRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    }
    const profileId = Number(rowRes.rows[0].profile_id);
    const agentName = rowRes.rows[0].agent_name;
    const candidateStatus = String(rowRes.rows[0].status || "").toUpperCase();

    const baselineRes = await client.query<{ id: number }>(
      `SELECT id
       FROM public.agent_prompt_version
       WHERE profile_id = $1
         AND status = 'ACTIVE'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [profileId]
    );
    const baselineVersionId = baselineRes.rowCount ? Number(baselineRes.rows[0].id) : null;
    const isBootstrap = !baselineVersionId;
    if (baselineVersionId === versionId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "ALREADY_ACTIVE" }, { status: 409 });
    }
    if (candidateStatus === "ARCHIVED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CANDIDATE_ARCHIVED" }, { status: 409 });
    }

    const perfRes = await client.query<{
      prompt_version_id: number;
      total_runs: string;
      failed_runs: string;
      meta_leak_runs: string;
    }>(
      `SELECT
         prompt_version_id,
         COUNT(*)::text AS total_runs,
         COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_runs,
         COUNT(*) FILTER (WHERE COALESCE((quality_json->>'meta_leak')::boolean, false))::text AS meta_leak_runs
       FROM public.agent_run_trace
       WHERE prompt_version_id IN ($1, $2)
         AND created_at >= NOW() - make_interval(hours => $3::int)
       GROUP BY prompt_version_id`,
      [baselineVersionId ?? -1, versionId, lookbackHours]
    );
    const perf = new Map<number, { total: number; failed: number; metaLeak: number }>();
    for (const row of perfRes.rows) {
      perf.set(Number(row.prompt_version_id), {
        total: Number(row.total_runs || 0),
        failed: Number(row.failed_runs || 0),
        metaLeak: Number(row.meta_leak_runs || 0),
      });
    }
    const candidate = perf.get(versionId) || { total: 0, failed: 0, metaLeak: 0 };
    const baseline = baselineVersionId
      ? perf.get(baselineVersionId) || { total: 0, failed: 0, metaLeak: 0 }
      : { total: 0, failed: 0, metaLeak: 0 };
    const allowBootstrapManualOverride = isBootstrap && reasonTemplate === "MANUAL_OVERRIDE";
    if (!allowBootstrapManualOverride && candidate.total < minCandidateSamples) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_MIN_SAMPLE",
          details: { candidate_runs: candidate.total, required: minCandidateSamples, lookback_hours: lookbackHours },
        },
        { status: 409 }
      );
    }
    const candidateFailureRate = candidate.total > 0 ? candidate.failed / candidate.total : 1;
    const baselineFailureRate = baseline.total > 0 ? baseline.failed / baseline.total : 0;
    if (!isBootstrap && candidateFailureRate > baselineFailureRate + MAX_FAILURE_RATE_DELTA) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_FAILURE_RATE_REGRESSION",
          details: { candidate_failure_rate: candidateFailureRate, baseline_failure_rate: baselineFailureRate },
        },
        { status: 409 }
      );
    }
    const candidateMetaLeakRate = candidate.total > 0 ? candidate.metaLeak / candidate.total : 1;
    const baselineMetaLeakRate = baseline.total > 0 ? baseline.metaLeak / baseline.total : 0;
    if (!isBootstrap && candidateMetaLeakRate > baselineMetaLeakRate + MAX_META_LEAK_RATE_DELTA) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_META_LEAK_REGRESSION",
          details: { candidate_meta_leak_rate: candidateMetaLeakRate, baseline_meta_leak_rate: baselineMetaLeakRate },
        },
        { status: 409 }
      );
    }
    const goldenPerf = await loadGoldenRegressionPerf(client, {
      storyId,
      candidateVersionId: versionId,
      baselineVersionId,
      lookbackHours,
      chapterIds: goldenChapterIds,
    });
    if (
      !isBootstrap &&
      goldenChapterIds.length > 0 &&
      (goldenPerf.candidateRuns < minGoldenRuns || goldenPerf.baselineRuns < minGoldenRuns)
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_GOLDEN_MIN_SAMPLE",
          details: {
            golden_chapters: goldenChapterIds,
            candidate_runs: goldenPerf.candidateRuns,
            baseline_runs: goldenPerf.baselineRuns,
            required: minGoldenRuns,
          },
        },
        { status: 409 },
      );
    }
    if (
      !isBootstrap &&
      goldenChapterIds.length > 0 &&
      goldenPerf.candidateFailureRate > goldenPerf.baselineFailureRate + MAX_GOLDEN_FAILURE_RATE_DELTA
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_GOLDEN_REGRESSION",
          details: {
            golden_chapters: goldenChapterIds,
            candidate_failure_rate: goldenPerf.candidateFailureRate,
            baseline_failure_rate: goldenPerf.baselineFailureRate,
          },
        },
        { status: 409 },
      );
    }
    const shadowPerf = await loadShadowPromotionPerf(client, {
      storyId,
      candidateVersionId: versionId,
      baselineVersionId,
      lookbackHours,
    });
    if (
      !isBootstrap &&
      SHADOW_REQUIRE_FOR_PROMOTION &&
      shadowPerf.sampleCount < SHADOW_MIN_SAMPLES
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_SHADOW_MIN_SAMPLE",
          details: {
            shadow_samples: shadowPerf.sampleCount,
            required: SHADOW_MIN_SAMPLES,
          },
        },
        { status: 409 },
      );
    }
    if (
      !isBootstrap &&
      shadowPerf.sampleCount > 0 &&
      shadowPerf.candidateFailureRate > shadowPerf.baselineFailureRate + SHADOW_MAX_FAILURE_RATE_DELTA
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_SHADOW_FAILURE_REGRESSION",
          details: {
            shadow_candidate_failure_rate: shadowPerf.candidateFailureRate,
            shadow_baseline_failure_rate: shadowPerf.baselineFailureRate,
            shadow_samples: shadowPerf.sampleCount,
          },
        },
        { status: 409 },
      );
    }
    if (
      !isBootstrap &&
      shadowPerf.sampleCount > 0 &&
      shadowPerf.avgLatencyDeltaMs != null &&
      shadowPerf.avgLatencyDeltaMs > SHADOW_MAX_LATENCY_DELTA_MS
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_SHADOW_LATENCY_REGRESSION",
          details: {
            shadow_avg_latency_delta_ms: shadowPerf.avgLatencyDeltaMs,
            threshold_ms: SHADOW_MAX_LATENCY_DELTA_MS,
            shadow_samples: shadowPerf.sampleCount,
          },
        },
        { status: 409 },
      );
    }

    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ARCHIVED'
       WHERE profile_id = $1
         AND status = 'ACTIVE'`,
      [profileId]
    );
    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ACTIVE'
       WHERE id = $1`,
      [versionId]
    );
    await client.query(
      `UPDATE public.agent_prompt_experiment
       SET status = 'COMPLETED', end_at = now()
       WHERE (baseline_version_id = $1 OR candidate_version_id = $1)
         AND status = 'RUNNING'`,
      [versionId]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'PROMOTE_ACTIVE', $4, $5, $6)`,
      [
        agentName,
        baselineVersionId,
        versionId,
        `${reasonTemplate}${reasonNote ? ` | ${reasonNote}` : ""}`,
        author,
        approvedBy,
      ]
    );
    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      version_id: versionId,
      status: "ACTIVE",
      guardrail: {
        lookback_hours: lookbackHours,
        min_candidate_samples: minCandidateSamples,
        candidate_runs: candidate.total,
        candidate_failure_rate: candidateFailureRate,
        baseline_failure_rate: baselineFailureRate,
        candidate_meta_leak_rate: candidateMetaLeakRate,
        baseline_meta_leak_rate: baselineMetaLeakRate,
        golden_chapters: goldenChapterIds,
        golden_candidate_runs: goldenPerf.candidateRuns,
        golden_baseline_runs: goldenPerf.baselineRuns,
        golden_candidate_failure_rate: goldenPerf.candidateFailureRate,
        golden_baseline_failure_rate: goldenPerf.baselineFailureRate,
        golden_policy_source: goldenPolicy.source,
        shadow_required: SHADOW_REQUIRE_FOR_PROMOTION,
        shadow_min_samples: SHADOW_MIN_SAMPLES,
        shadow_samples: shadowPerf.sampleCount,
        shadow_candidate_failure_rate: shadowPerf.candidateFailureRate,
        shadow_baseline_failure_rate: shadowPerf.baselineFailureRate,
        shadow_avg_latency_delta_ms: shadowPerf.avgLatencyDeltaMs,
        shadow_max_failure_rate_delta: SHADOW_MAX_FAILURE_RATE_DELTA,
        shadow_max_latency_delta_ms: SHADOW_MAX_LATENCY_DELTA_MS,
      },
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "PROMOTE_AGENT_PROMPT_ACTIVE_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

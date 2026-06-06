/* eslint-disable complexity, max-lines-per-function */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";
import { loadAgentDrawerShadowCompare } from "@/features/agents/server/agentDrawerShadow";
import {
  type AgentDrawerFeedbackRow,
  type AgentDrawerHydrationRow,
  type AgentDrawerIdentityRow,
  type AgentDrawerMemoryRow,
  type AgentDrawerProfileEventRow,
  type AgentDrawerPromptRow,
  type AgentDrawerRunRow,
  type AgentDrawerTuningRow,
  type TruthConflictRow,
  isPlainObject,
  sanitizeVisualProfile,
} from "@/features/agents/server/agentDrawerUtils";

export async function getAgentDrawerResponse(
  req: NextRequest,
  storySlug: string,
  agentNameRaw: string
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = decodeURIComponent(agentNameRaw || "").trim();
    if (!agentName) {
      return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    }
    const lookbackHoursRaw = Number(req.nextUrl.searchParams.get("lookback_hours") ?? 24);
    const lookbackHours = Number.isFinite(lookbackHoursRaw) ? Math.max(1, Math.min(24 * 14, Math.floor(lookbackHoursRaw))) : 24;

    let identity: AgentDrawerIdentityRow = {
      profile_id: null,
      species_name: agentName,
      nick_name: agentName,
      level: null,
      experience_pts: "0",
      is_sealed: null,
      visual_profile_json: {},
    };

    try {
      const identityRes = await pool.query<AgentDrawerIdentityRow>(
        `SELECT
           id AS profile_id,
           species_name,
           nick_name,
           level,
           experience_pts::text,
           is_sealed,
           visual_profile_json
         FROM public.agent_profiles
         WHERE species_name = $1
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
        [agentName]
      );
      if ((identityRes.rowCount ?? 0) > 0) identity = identityRes.rows[0];
    } catch (error: unknown) {
      if (!error || typeof error !== "object" || (error as { code?: string }).code !== "42703") throw error;
      const identityResFallback = await pool.query<{
        profile_id: number;
        species_name: string;
        nick_name: string;
        level: number;
        experience_pts: string;
        is_sealed: boolean;
      }>(
        `SELECT
           id AS profile_id,
           species_name,
           nick_name,
           level,
           experience_pts::text,
           is_sealed
         FROM public.agent_profiles
         WHERE species_name = $1
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
        [agentName]
      );
      if ((identityResFallback.rowCount ?? 0) > 0) {
        identity = {
          ...identityResFallback.rows[0],
          visual_profile_json: {},
        };
      }
    }

    const [promptRes, runsRes, memoryRes, feedbackRes, tuningRes, profileEventRes] = await Promise.all([
      pool.query<AgentDrawerPromptRow>(
        `SELECT apv.id AS version_id, apv.status, apv.version_no, apv.created_at::text, apv.change_note, apv.system_prompt, apv.developer_prompt
         FROM public.agent_prompt_profile app
         JOIN public.agent_prompt_version apv ON apv.profile_id = app.id
         WHERE app.agent_name = $1
           AND (app.story_id = $2 OR app.story_id IS NULL)
         ORDER BY (apv.status = 'ACTIVE') DESC, (apv.status = 'CANARY') DESC, apv.created_at DESC
         LIMIT 10`,
        [agentName, storyId]
      ),
      pool.query<AgentDrawerRunRow>(
        `SELECT id, job_id, task_id, status, error_code, prompt_version_id, model_name, latency_ms, token_in, token_out, quality_json, created_at::text
         FROM public.agent_run_trace
         WHERE story_id = $1
           AND agent_name = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 60`,
        [storyId, agentName]
      ),
      pool.query<AgentDrawerMemoryRow>(
        `SELECT id, memory_type, memory_text, score::text, created_at::text
         FROM public.agent_memory_vector
         WHERE story_id = $1
           AND agent_name = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 8`,
        [storyId, agentName]
      ),
      pool.query<AgentDrawerFeedbackRow>(
        `SELECT id, feedback_type, feedback_source, feedback_text, status, created_at::text
         FROM public.agent_feedback_loop
         WHERE story_id = $1
           AND agent_name = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 8`,
        [storyId, agentName]
      ),
      pool.query<AgentDrawerTuningRow>(
        `SELECT id, action, reason, created_at::text
         FROM public.agent_tuning_event
         WHERE agent_name = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 8`,
        [agentName]
      ),
      pool.query<AgentDrawerProfileEventRow>(
        `SELECT id, action, details_json, created_at::text
         FROM public.agent_profile_event
         WHERE agent_profile_id = $1
           AND (story_id = $2 OR story_id IS NULL)
         ORDER BY created_at DESC, id DESC
         LIMIT 8`,
        [Number(identity.profile_id || 0), storyId]
      ),
    ]);

    let hydrationLatest: AgentDrawerHydrationRow | null = null;
    let hydrationRecent: AgentDrawerHydrationRow[] = [];
    try {
      const hydrationRes = await pool.query<AgentDrawerHydrationRow>(
        `SELECT id, run_trace_id, task_type, prompt_version_id, hydration_output_hash, hydration_output_text,
                hydration_render_steps_json,
                llm_request_meta_json, tokens_prompt_base, tokens_rules_injected, tokens_memory_injected,
                tokens_feedback_injected, tokens_truncated, created_at::text
         FROM public.agent_prompt_hydration_trace
         WHERE story_id = $1
           AND agent_name = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 10`,
        [storyId, agentName]
      );
      hydrationRecent = hydrationRes.rows;
      hydrationLatest = hydrationRecent[0] ?? null;
    } catch (error: unknown) {
      if (!error || typeof error !== "object" || !["42P01", "42703"].includes((error as { code?: string }).code || "")) {
        throw error;
      }
    }

    const nowMs = Date.now();
    const lookbackMs = lookbackHours * 60 * 60 * 1000;
    const runs = runsRes.rows;
    const recentRuns = runs.filter((r) => nowMs - new Date(r.created_at).getTime() <= lookbackMs);
    const latestRun = runs[0] ?? null;
    const recentTotal = recentRuns.length;
    const recentFailed = recentRuns.filter((r) => String(r.status || "").toUpperCase() === "FAILED").length;
    const successRate = recentTotal > 0 ? (recentTotal - recentFailed) / recentTotal : 1;
    const avgLatency = recentRuns.length > 0
      ? Math.round(recentRuns.reduce((acc, x) => acc + Number(x.latency_ms || 0), 0) / Math.max(1, recentRuns.length))
      : null;
    const runtimeState = recentFailed >= 5
      ? "BLOCKED"
      : recentFailed >= 2
        ? "DEGRADED"
        : recentRuns.some((r) => ["RUNNING", "READY"].includes(String(r.status || "").toUpperCase()))
          ? "RUNNING"
          : "IDLE";
    const activePrompt = promptRes.rows.find((p) => String(p.status).toUpperCase() === "ACTIVE") ?? null;
    const canaryPrompt = promptRes.rows.find((p) => String(p.status).toUpperCase() === "CANARY") ?? null;
    const latestQuality = (latestRun?.quality_json && isPlainObject(latestRun.quality_json))
      ? (latestRun.quality_json as Record<string, unknown>)
      : {};
    let truthConflicts: TruthConflictRow[] = [];
    if (latestRun?.task_id) {
      try {
        const conflictRes = await pool.query<TruthConflictRow>(
          `SELECT id, conflict_id, losing_rule_ref, winning_rule_ref, resolution_mode, resolution_reason, payload_json, created_at::text
           FROM public.truth_conflict_registry
           WHERE story_id = $1
             AND task_id = $2
           ORDER BY created_at DESC, id DESC
           LIMIT 20`,
          [storyId, latestRun.task_id],
        );
        truthConflicts = conflictRes.rows;
      } catch (error: unknown) {
        if (!error || typeof error !== "object" || !["42P01", "42703"].includes((error as { code?: string }).code || "")) {
          throw error;
        }
      }
    }
    const { shadowPairs, shadowCompare } = latestRun?.task_id
      ? await loadAgentDrawerShadowCompare(storyId, latestRun.task_id)
      : { shadowPairs: [], shadowCompare: [] };

    const activityEvents = [
      ...runs.slice(0, 6).map((r) => ({
        event_type: "RUN",
        id: r.id,
        status: r.status,
        message: `${agentName} run #${r.id} ${String(r.status || "").toUpperCase()}`,
        created_at: r.created_at,
        meta: { run_id: r.id, prompt_version_id: r.prompt_version_id, error_code: r.error_code, xp_delta: Math.max(0, Number(r.token_in || 0)) + Math.max(0, Number(r.token_out || 0)) },
      })),
      ...tuningRes.rows.map((e) => ({
        event_type: "TUNING",
        id: e.id,
        status: e.action,
        message: `${e.action}: ${e.reason}`,
        created_at: e.created_at,
        meta: { tuning_event_id: e.id },
      })),
      ...profileEventRes.rows.map((e) => {
        const details = isPlainObject(e.details_json) ? e.details_json : {};
        return {
          event_type: "GROWTH",
          id: e.id,
          status: e.action,
          message: `${e.action}`,
          created_at: e.created_at,
          meta: { profile_event_id: e.id, ...details },
        };
      }),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 12);

    return NextResponse.json({
      ok: true,
      agent_name: agentName,
      identity: {
        profile_id: identity.profile_id,
        species_name: identity.species_name ?? agentName,
        nick_name: identity.nick_name ?? agentName,
        level: identity.level ?? 1,
        experience_pts: Number(identity.experience_pts ?? 0),
        is_sealed: Boolean(identity.is_sealed),
      },
      runtime_summary: {
        state: runtimeState,
        lookback_hours: lookbackHours,
        recent_total_runs: recentTotal,
        recent_failed_runs: recentFailed,
        success_rate: successRate,
        avg_latency_ms: avgLatency,
        latest_run: latestRun,
      },
      ops_meta: {
        strategy_selected: typeof latestQuality.strategy_selected === "string" ? latestQuality.strategy_selected : null,
        learning_mode: typeof latestQuality.learning_mode === "string" ? latestQuality.learning_mode : null,
        learning_applied: Boolean(latestQuality.learning_applied),
        learning_lr: (latestQuality.learning_lr && isPlainObject(latestQuality.learning_lr))
          ? (latestQuality.learning_lr as Record<string, unknown>)
          : {},
        profile_decay_factor: typeof latestQuality.profile_decay_factor === "number" ? latestQuality.profile_decay_factor : null,
        profile_reset_scope: typeof latestQuality.profile_reset_scope === "string" ? latestQuality.profile_reset_scope : null,
        profile_reset_applied: (latestQuality.profile_reset_applied && isPlainObject(latestQuality.profile_reset_applied))
          ? (latestQuality.profile_reset_applied as Record<string, unknown>)
          : {},
        truth_resolution: (latestQuality.truth_resolution && isPlainObject(latestQuality.truth_resolution))
          ? (latestQuality.truth_resolution as Record<string, unknown>)
          : {},
        truth_conflicts: truthConflicts,
        shadow_pairs: shadowPairs,
        shadow_compare: shadowCompare,
      },
      prompt_summary: {
        active: activePrompt,
        canary: canaryPrompt,
        recent: promptRes.rows,
        hydration_latest: hydrationLatest
          ? {
              id: hydrationLatest.id,
              run_trace_id: hydrationLatest.run_trace_id,
              task_type: hydrationLatest.task_type,
              prompt_version_id: hydrationLatest.prompt_version_id,
              hydration_output_hash: hydrationLatest.hydration_output_hash,
              hydration_output_text: hydrationLatest.hydration_output_text,
              hydration_render_steps_json: isPlainObject(hydrationLatest.hydration_render_steps_json)
                ? hydrationLatest.hydration_render_steps_json
                : {},
              llm_request_meta_json: isPlainObject(hydrationLatest.llm_request_meta_json) ? hydrationLatest.llm_request_meta_json : {},
              tokens_prompt_base: hydrationLatest.tokens_prompt_base,
              tokens_rules_injected: hydrationLatest.tokens_rules_injected,
              tokens_memory_injected: hydrationLatest.tokens_memory_injected,
              tokens_feedback_injected: hydrationLatest.tokens_feedback_injected,
              tokens_truncated: hydrationLatest.tokens_truncated,
              created_at: hydrationLatest.created_at,
            }
          : null,
        hydration_recent: hydrationRecent.map((x) => ({
          id: x.id,
          run_trace_id: x.run_trace_id,
          task_type: x.task_type,
          prompt_version_id: x.prompt_version_id,
          hydration_output_hash: x.hydration_output_hash,
          hydration_output_text: x.hydration_output_text,
          hydration_render_steps_json: isPlainObject(x.hydration_render_steps_json) ? x.hydration_render_steps_json : {},
          llm_request_meta_json: isPlainObject(x.llm_request_meta_json) ? x.llm_request_meta_json : {},
          tokens_prompt_base: x.tokens_prompt_base,
          tokens_rules_injected: x.tokens_rules_injected,
          tokens_memory_injected: x.tokens_memory_injected,
          tokens_feedback_injected: x.tokens_feedback_injected,
          tokens_truncated: x.tokens_truncated,
          created_at: x.created_at,
        })),
      },
      memory_summary: { items: memoryRes.rows },
      feedback_summary: { items: feedbackRes.rows },
      config_snapshot: {
        model_name: latestRun?.model_name ?? null,
        prompt_version_id: latestRun?.prompt_version_id ?? null,
        timeout_seconds: null,
        retry_budget: null,
      },
      activity_events: activityEvents,
      visual_profile: sanitizeVisualProfile(identity.visual_profile_json),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_DRAWER_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

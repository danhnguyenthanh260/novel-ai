import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";
import {
  CLAIMABLE_JOB_STATUSES,
  NODE_TRACE_AGENT_MAP,
  getFlowNodes,
  nodeTimeoutSeconds,
  pickFlowType,
  reduceNodeStatus,
  type NodeStatus,
} from "./pipelineNodeConfig";
import { TERMINAL_JOB_STATUSES } from "./ingestTaskReconcileService";

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01");
}

type TraceRow = {
  id: number;
  task_id: number | null;
  agent_name: string;
  status: string;
  error_code: string | null;
  latency_ms: number | null;
  prompt_version_id: number | null;
  context_snapshot_id: number | null;
  strategy_profile_version_id: number | null;
  quality_json: Record<string, unknown> | null;
  created_at: string;
};

type EventRow = {
  id: number;
  status: string;
  message: string | null;
  error_code: string | null;
  task_id: number | null;
  payload_json: Record<string, unknown>;
  created_at: string;
};

type TaskRow = {
  id: number;
  task_type: string;
  status: string;
  error: string | null;
  attempts: number;
  payload_json: Record<string, unknown> | null;
  result_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type TruthConflictRow = {
  id: number;
  conflict_id: string;
  losing_rule_ref: string;
  winning_rule_ref: string;
  resolution_mode: string;
  resolution_reason: string;
  payload_json: Record<string, unknown>;
  created_at: string;
};

type ShadowPairRow = {
  id: number;
  pair_status: string;
  active_run_trace_id: number | null;
  shadow_run_trace_id: number | null;
  active_prompt_version_id: number | null;
  shadow_prompt_version_id: number | null;
  compare_json: Record<string, unknown>;
  created_at: string;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickConfig(payload: Record<string, unknown> | null, nodeKey: string): Record<string, unknown> {
  const llm = payload && typeof payload.llm === "object" && payload.llm ? (payload.llm as Record<string, unknown>) : null;
  const model =
    (typeof payload?.model === "string" && payload.model) ||
    (typeof payload?.llm_model === "string" && payload.llm_model) ||
    (typeof llm?.model === "string" && llm.model) ||
    null;
  const temperature =
    parseNumber(payload?.temperature) ?? parseNumber(payload?.temp) ?? parseNumber(llm?.temperature) ?? parseNumber(llm?.temp) ?? null;
  const topP = parseNumber(payload?.top_p) ?? parseNumber(llm?.top_p) ?? null;
  return {
    model,
    temperature,
    top_p: topP,
    timeout_seconds: nodeTimeoutSeconds(nodeKey),
  };
}

async function loadTraceRows(storyId: number, jobId: number, traceAgents: string[], limit: number): Promise<TraceRow[]> {
  if (traceAgents.length === 0) return [];
  const traceRes = await pool.query<TraceRow>(
    `SELECT id, task_id, agent_name, status, error_code, latency_ms, prompt_version_id, context_snapshot_id, strategy_profile_version_id, quality_json, created_at::text
     FROM public.agent_run_trace
     WHERE story_id = $1 AND job_id = $2 AND agent_name = ANY($3::text[])
     ORDER BY id DESC
     LIMIT $4`,
    [storyId, jobId, traceAgents, limit],
  );
  return traceRes.rows;
}

async function loadEventRows(storyId: number, jobId: number, nodeKey: string, limit: number): Promise<{ source: string; items: EventRow[] }> {
  try {
    const eventRes = await pool.query<EventRow>(
      `SELECT id, status, message, error_code, task_id, payload_json, created_at::text
       FROM public.pipeline_node_event
       WHERE story_id = $1 AND job_id = $2 AND node_key = $3
       ORDER BY id DESC
       LIMIT $4`,
      [storyId, jobId, nodeKey, limit],
    );
    return { source: "pipeline_node_event", items: eventRes.rows };
  } catch (error: unknown) {
    if (!isUndefinedTableError(error)) throw error;
  }

  const taskRes = await pool.query<{
    id: number;
    status: string;
    error: string | null;
    payload_json: Record<string, unknown> | null;
    result_json: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, status, error, payload_json, result_json, created_at::text, updated_at::text
     FROM public.ingest_task
     WHERE story_id = $1 AND job_id = $2 AND task_type = $3
     ORDER BY id DESC
     LIMIT $4`,
    [storyId, jobId, nodeKey, limit],
  );
  return {
    source: "ingest_task_fallback",
    items: taskRes.rows.map((row) => ({
      id: row.id,
      task_id: row.id,
      status: row.status,
      message: null,
      error_code: row.error,
      payload_json: {
        payload_json: row.payload_json || {},
        result_json: row.result_json || {},
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      created_at: row.updated_at,
    })),
  };
}

function reduceNodeStatusWithGate(tasks: TaskRow[], nodeKey: string, claimableByWorker: boolean): NodeStatus {
  const matching = tasks.filter((row) => String(row.task_type || "") === nodeKey);
  const hasBlockedReady = !claimableByWorker && matching.some((row) => String(row.status || "").toUpperCase() === "READY");
  if (hasBlockedReady) return "BLOCKED";
  return reduceNodeStatus(matching.map((row) => row.status));
}

export async function getPipelineNodeLogsResponse(
  req: NextRequest,
  storySlug: string,
  rawJobId: string,
  nodeKey: string,
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const jobId = Number(rawJobId);
    const key = String(nodeKey || "").trim().toUpperCase();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 100);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 100, 1), 300);

    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_JOB_ID" }, { status: 400 });
    }
    if (!key) {
      return NextResponse.json({ ok: false, error: "INVALID_NODE_KEY" }, { status: 400 });
    }
    const traceAgents = NODE_TRACE_AGENT_MAP[key] || [];
    const traceItems = await loadTraceRows(storyId, jobId, traceAgents, limit);
    const eventData = await loadEventRows(storyId, jobId, key, limit);
    return NextResponse.json({
      ok: true,
      story_id: storyId,
      job_id: jobId,
      node_key: key,
      source: eventData.source,
      trace_items: traceItems,
      items: eventData.items,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "PIPELINE_NODE_LOGS_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function getPipelineNodeInspectorLiteResponse(
  req: NextRequest,
  storySlug: string,
  rawJobId: string,
  nodeKey: string,
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const jobId = Number(rawJobId);
    const key = String(nodeKey || "").trim().toUpperCase();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 50);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50, 1), 120);

    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_JOB_ID" }, { status: 400 });
    }
    if (!key) {
      return NextResponse.json({ ok: false, error: "INVALID_NODE_KEY" }, { status: 400 });
    }

    const jobRes = await pool.query<{ status: string }>(
      `SELECT status FROM public.ingest_job WHERE id = $1 AND story_id = $2 LIMIT 1`,
      [jobId, storyId],
    );
    if (jobRes.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }
    const jobStatus = String(jobRes.rows[0]?.status || "").toUpperCase();
    const isTerminalJob = TERMINAL_JOB_STATUSES.has(jobStatus);
    const claimableByWorker = CLAIMABLE_JOB_STATUSES.has(jobStatus);

    const tasksRes = await pool.query<TaskRow>(
      `SELECT id, task_type, status, error, attempts, payload_json, result_json, created_at::text, updated_at::text
       FROM public.ingest_task
       WHERE story_id = $1 AND job_id = $2
       ORDER BY id ASC`,
      [storyId, jobId],
    );
    const hasReprocessHint = tasksRes.rows.some((row) => Boolean((row.payload_json || {}).reprocess_reason_code));
    const taskTypes = tasksRes.rows.map((row) => String(row.task_type || ""));
    const flowType = pickFlowType(taskTypes, hasReprocessHint);
    const nodeOrder = getFlowNodes(flowType);
    const nodeStatusMap = new Map(nodeOrder.map((x) => [x, reduceNodeStatusWithGate(tasksRes.rows, x, claimableByWorker)]));
    const currentNode = isTerminalJob
      ? null
      : nodeOrder.find((x) => (nodeStatusMap.get(x) || "PENDING") === "RUNNING") ||
        nodeOrder.find((x) => (nodeStatusMap.get(x) || "PENDING") === "FAILED") ||
        nodeOrder.find((x) => (nodeStatusMap.get(x) || "PENDING") === "READY") ||
        nodeOrder.find((x) => (nodeStatusMap.get(x) || "PENDING") === "WAIT_REVIEW") ||
        null;
    const nextNode =
      isTerminalJob
        ? null
        : nodeOrder.find((x) => {
            const s = nodeStatusMap.get(x) || "PENDING";
            return s === "PENDING" || s === "READY" || s === "WAIT_REVIEW";
          }) || null;
    const lastNode = [...nodeOrder].reverse().find((x) => (nodeStatusMap.get(x) || "PENDING") === "DONE") || null;

    const matching = tasksRes.rows.filter((row) => String(row.task_type || "") === key);
    const latestTask = matching.length > 0 ? matching[matching.length - 1] : null;
    const traceAgents = NODE_TRACE_AGENT_MAP[key] || [];
    const traceItems = await loadTraceRows(storyId, jobId, traceAgents, limit);
    const latestTrace = traceItems.length > 0 ? traceItems[0] : null;
    const eventData = await loadEventRows(storyId, jobId, key, limit);

    const fallbackMarkers: string[] = [];
    if (!latestTrace?.prompt_version_id) fallbackMarkers.push("FALLBACK_USED");
    const memoryInjected = parseNumber(latestTrace?.quality_json?.memory_injected_count);
    if (memoryInjected === 0) fallbackMarkers.push("NO_SIMILAR_MEMORY");
    if (!latestTask && !latestTrace) fallbackMarkers.push("NOT_RESOLVED");

    const promptVersionId = latestTrace?.prompt_version_id ?? null;
    const runTraceId = latestTrace?.id ?? null;
    const contextSnapshotId = latestTrace?.context_snapshot_id ?? null;
    const strategyProfileVersionId = latestTrace?.strategy_profile_version_id ?? null;
    let truthConflicts: TruthConflictRow[] = [];
    let shadowPairs: ShadowPairRow[] = [];
    if (latestTask?.id) {
      try {
        const conflictRes = await pool.query<TruthConflictRow>(
          `SELECT
             id,
             conflict_id,
             losing_rule_ref,
             winning_rule_ref,
             resolution_mode,
             resolution_reason,
             payload_json,
             created_at::text
           FROM public.truth_conflict_registry
           WHERE story_id = $1
             AND job_id = $2
             AND task_id = $3
           ORDER BY created_at DESC, id DESC
           LIMIT 20`,
          [storyId, jobId, latestTask.id],
        );
        truthConflicts = conflictRes.rows;
      } catch (error: unknown) {
        if (!isUndefinedTableError(error)) throw error;
      }
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
             AND job_id = $2
             AND task_id = $3
           ORDER BY created_at DESC, id DESC
           LIMIT 20`,
          [storyId, jobId, latestTask.id],
        );
        shadowPairs = shadowRes.rows;
      } catch (error: unknown) {
        if (!isUndefinedTableError(error)) throw error;
      }
    }
    const latestQuality = (latestTrace?.quality_json || {}) as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      story_slug: storySlug,
      job_id: jobId,
      node_key: key,
      source: eventData.source,
      narrative: {
        just_did_summary: lastNode,
        doing_now_summary: currentNode,
        will_do_next_summary: nextNode,
      },
      identity: {
        task_id: latestTask?.id ?? null,
        task_status: latestTask?.status ?? null,
        attempts: latestTask?.attempts ?? null,
      },
      data: {
        input_snapshot_ref: latestTask?.payload_json ?? {},
        output_snapshot_ref: latestTask?.result_json ?? {},
        latest_error: latestTask?.error ?? null,
      },
      config: pickConfig(latestTask?.payload_json ?? null, key),
      runtime_refs: {
        prompt_version_id: promptVersionId,
        run_trace_id: runTraceId,
        context_snapshot_id: contextSnapshotId,
        strategy_profile_version_id: strategyProfileVersionId,
      },
      ops_meta: {
        strategy_selected: typeof latestQuality.strategy_selected === "string" ? latestQuality.strategy_selected : null,
        learning_mode: typeof latestQuality.learning_mode === "string" ? latestQuality.learning_mode : null,
        learning_applied: Boolean(latestQuality.learning_applied),
        learning_lr: (latestQuality.learning_lr && typeof latestQuality.learning_lr === "object")
          ? (latestQuality.learning_lr as Record<string, unknown>)
          : {},
        profile_decay_factor: parseNumber(latestQuality.profile_decay_factor),
        profile_reset_scope: typeof latestQuality.profile_reset_scope === "string" ? latestQuality.profile_reset_scope : null,
        profile_reset_applied: (latestQuality.profile_reset_applied && typeof latestQuality.profile_reset_applied === "object")
          ? (latestQuality.profile_reset_applied as Record<string, unknown>)
          : {},
        truth_resolution: (latestQuality.truth_resolution && typeof latestQuality.truth_resolution === "object")
          ? (latestQuality.truth_resolution as Record<string, unknown>)
          : {},
        truth_conflicts: truthConflicts,
        shadow_pairs: shadowPairs,
      },
      fallback_markers: fallbackMarkers,
      links: {
        pipeline_job_url: `/stories/${encodeURIComponent(storySlug)}/pipelines/${jobId}?node=${encodeURIComponent(key)}`,
        run_trace_url:
          runTraceId != null
            ? `/stories/${encodeURIComponent(storySlug)}/agents?tab=runs&run_id=${runTraceId}`
            : null,
        prompt_registry_url:
          promptVersionId != null
            ? `/stories/${encodeURIComponent(storySlug)}/agents?tab=prompts&version_id=${promptVersionId}`
            : `/stories/${encodeURIComponent(storySlug)}/agents?tab=prompts`,
      },
      items: eventData.items,
      trace_items: traceItems,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "PIPELINE_NODE_INSPECTOR_LITE_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import {
  CLAIMABLE_JOB_STATUSES,
  RETRYABLE_NODE_KEYS,
  getFlowNodes,
  maxRetryAttempts,
  nodeTimeoutSeconds,
  pickFlowType,
  readyStalledThresholdSeconds,
  reduceNodeStatus,
  type FlowType,
  type NodeStatus,
} from "./pipelineNodeConfig";
import { TERMINAL_JOB_STATUSES } from "./ingestTaskReconcileService";
export { getPipelineNodeLogsResponse } from "./pipelineNodeLogsService";

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01");
}

async function insertPipelineAuditEvent(args: {
  storyId: number;
  jobId: number;
  taskId: number | null;
  flowType: FlowType;
  nodeKey: string;
  status: NodeStatus;
  message: string;
  errorCode?: string | null;
  payloadJson?: Record<string, unknown>;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO public.pipeline_node_event
        (story_id, job_id, task_id, flow_type, node_key, status, message, error_code, payload_json)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        args.storyId,
        args.jobId,
        args.taskId,
        args.flowType,
        args.nodeKey,
        args.status,
        args.message,
        args.errorCode ?? null,
        JSON.stringify(args.payloadJson || {}),
      ],
    );
  } catch (error: unknown) {
    if (!isUndefinedTableError(error)) {
      console.warn("pipeline audit event failed", error);
    }
  }
}

export async function getPipelineJobSummaryResponse(
  req: NextRequest,
  storySlug: string,
  rawJobId: string,
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const jobId = Number(rawJobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_JOB_ID" }, { status: 400 });
    }

    const jobRes = await pool.query<{
      id: number;
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, status, created_at::text, updated_at::text
       FROM public.ingest_job
       WHERE id = $1 AND story_id = $2
       LIMIT 1`,
      [jobId, storyId],
    );
    if (jobRes.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const taskRes = await pool.query<{
      id: number;
      task_type: string;
      status: string;
      error: string | null;
      attempts: number;
      created_at: string;
      updated_at: string;
      payload_json: Record<string, unknown> | null;
    }>(
      `SELECT id, task_type, status, error,
              attempts, created_at::text, updated_at::text, payload_json
       FROM public.ingest_task
       WHERE story_id = $1 AND job_id = $2
       ORDER BY id ASC`,
      [storyId, jobId],
    );
    const nowMs = Date.now();

    const hasReprocessHint = taskRes.rows.some((row) => Boolean((row.payload_json || {}).reprocess_reason_code));
    const taskTypes = taskRes.rows.map((row) => String(row.task_type || ""));
    const flowType = pickFlowType(taskTypes, hasReprocessHint);
    const nodeOrder = getFlowNodes(flowType);
    const jobStatus = String(jobRes.rows[0]?.status || "").toUpperCase();
    const isTerminalJob = TERMINAL_JOB_STATUSES.has(jobStatus);
    const claimableByWorker = CLAIMABLE_JOB_STATUSES.has(jobStatus);
    const blockedReadyTasks = taskRes.rows.filter((row) => row.status === "READY");

    const nodeSummaries = nodeOrder.map((nodeKey) => {
      if (nodeKey === "AWAIT_APPROVAL") {
        const status: NodeStatus = jobStatus === "AWAIT_APPROVAL" ? "WAIT_REVIEW" : jobStatus === "DONE" ? "DONE" : isTerminalJob ? "SKIPPED" : "PENDING";
        return { node_key: nodeKey, status, total_tasks: 0 };
      }
      const matching = taskRes.rows.filter((row) => String(row.task_type || "") === nodeKey);
      const hasBlockedReady = !claimableByWorker && matching.some((row) => row.status === "READY");
      return {
        node_key: nodeKey,
        status: hasBlockedReady ? "BLOCKED" : reduceNodeStatus(matching.map((x) => x.status)),
        total_tasks: matching.length,
      };
    });
    const timeoutAlerts = nodeOrder
      .map((nodeKey) => {
        const matchingRunning = taskRes.rows.filter(
          (row) => String(row.task_type || "") === nodeKey && String(row.status || "").toUpperCase() === "RUNNING",
        );
        if (matchingRunning.length === 0) return null;
        const thresholdSec = nodeTimeoutSeconds(nodeKey);
        const maxRunningSec = Math.max(
          ...matchingRunning.map((row) => {
            const t = Date.parse(String(row.updated_at || row.created_at || ""));
            if (!Number.isFinite(t)) return 0;
            return Math.max(0, Math.floor((nowMs - t) / 1000));
          }),
        );
        if (maxRunningSec <= thresholdSec) return null;
        return {
          node_key: nodeKey,
          alert_type: "RUNNING_TOO_LONG",
          running_seconds: maxRunningSec,
          threshold_seconds: thresholdSec,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const hasAnyRunning = taskRes.rows.some((row) => String(row.status || "").toUpperCase() === "RUNNING");
    const readyStalledThreshold = readyStalledThresholdSeconds();
    const readyStalledAlerts = isTerminalJob
      ? []
      : nodeOrder
      .map((nodeKey) => {
        const matchingReady = taskRes.rows.filter(
          (row) => String(row.task_type || "") === nodeKey && String(row.status || "").toUpperCase() === "READY",
        );
        if (matchingReady.length === 0 || hasAnyRunning) return null;
        const maxReadySec = Math.max(
          ...matchingReady.map((row) => {
            const t = Date.parse(String(row.updated_at || row.created_at || ""));
            if (!Number.isFinite(t)) return 0;
            return Math.max(0, Math.floor((nowMs - t) / 1000));
          }),
        );
        if (maxReadySec <= readyStalledThreshold) return null;
        return {
          node_key: nodeKey,
          alert_type: "READY_STALLED",
          ready_seconds: maxReadySec,
          threshold_seconds: readyStalledThreshold,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const retryLimit = maxRetryAttempts();
    const retryExhaustedAlerts = nodeOrder
      .map((nodeKey) => {
        const exhaustedFailed = taskRes.rows.filter(
          (row) =>
            String(row.task_type || "") === nodeKey &&
            String(row.status || "").toUpperCase() === "FAILED" &&
            Number(row.attempts || 0) >= retryLimit,
        );
        if (exhaustedFailed.length === 0) return null;
        const maxAttemptsSeen = Math.max(...exhaustedFailed.map((row) => Number(row.attempts || 0)));
        return {
          node_key: nodeKey,
          alert_type: "RETRY_EXHAUSTED",
          attempts: maxAttemptsSeen,
          threshold_attempts: retryLimit,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const alerts = [...timeoutAlerts, ...readyStalledAlerts, ...retryExhaustedAlerts];

    const currentNode = isTerminalJob
      ? null
      : nodeSummaries.find((n) => n.status === "RUNNING")?.node_key ||
        nodeSummaries.find((n) => n.status === "FAILED")?.node_key ||
        nodeSummaries.find((n) => n.status === "READY")?.node_key ||
        nodeSummaries.find((n) => n.status === "WAIT_REVIEW")?.node_key ||
        null;

    const failedTask = [...taskRes.rows].reverse().find((row) => row.status === "FAILED");
    const blockedReason = isTerminalJob && blockedReadyTasks.length > 0
      ? `JOB_${jobStatus}_WITH_PENDING_TASKS`
      : isTerminalJob
        ? `JOB_${jobStatus}`
      : retryExhaustedAlerts.length > 0
      ? `RETRY_EXHAUSTED:${retryExhaustedAlerts[0].node_key}`
      : failedTask
        ? "NODE_FAILED"
        : timeoutAlerts.length > 0
          ? `RUNNING_TOO_LONG:${timeoutAlerts[0].node_key}`
        : readyStalledAlerts.length > 0
          ? `READY_STALLED:${readyStalledAlerts[0].node_key}`
        : blockedReadyTasks.length > 0 && !claimableByWorker
          ? `JOB_STATUS_GATE:${jobStatus}`
          : null;
    const doneCount = nodeSummaries.filter((n) => n.status === "DONE").length;
    const progressPct = nodeSummaries.length > 0 ? Math.round((doneCount / nodeSummaries.length) * 100) : 0;

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      job_id: jobId,
      flow_type: flowType,
      job_status: jobStatus || "UNKNOWN",
      current_node: currentNode,
      blocking_reason: blockedReason,
      last_error: failedTask?.error || null,
      progress_pct: progressPct,
      blocked_nodes:
        blockedReason && blockedReason.startsWith("JOB_STATUS_GATE:")
          ? nodeSummaries.filter((n) => n.status === "BLOCKED").map((n) => n.node_key)
          : [],
      alerts,
      timeout_alerts: timeoutAlerts,
      ready_stalled_alerts: readyStalledAlerts,
      retry_exhausted_alerts: retryExhaustedAlerts,
      nodes: nodeSummaries,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "PIPELINE_SUMMARY_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function postPipelineNodeRetryResponse(
  req: NextRequest,
  storySlug: string,
  rawJobId: string,
  nodeKey: string,
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const jobId = Number(rawJobId);
    const key = String(nodeKey || "").trim().toUpperCase();
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_JOB_ID" }, { status: 400 });
    }
    if (!RETRYABLE_NODE_KEYS.has(key)) {
      return NextResponse.json({ ok: false, error: "NODE_NOT_RETRYABLE" }, { status: 409 });
    }

    const body = (await req.json().catch(() => ({}))) as { reason?: unknown; author?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const author = typeof body.author === "string" && body.author.trim() ? body.author.trim().slice(0, 120) : "ui";
    if (!reason) {
      return NextResponse.json({ ok: false, error: "RETRY_REASON_REQUIRED" }, { status: 400 });
    }

    await client.query("BEGIN");
    const jobRes = await client.query<{ status: string }>(
      `SELECT status FROM public.ingest_job WHERE id = $1 AND story_id = $2 FOR UPDATE`,
      [jobId, storyId],
    );
    if (jobRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }
    const jobStatus = String(jobRes.rows[0]?.status || "").toUpperCase();
    if (TERMINAL_JOB_STATUSES.has(jobStatus)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "JOB_TERMINAL_RETRY_BLOCKED" }, { status: 409 });
    }
    const taskRes = await client.query<{
      id: number;
      status: string;
      attempts: number;
      payload_json: Record<string, unknown> | null;
    }>(
      `SELECT id, status, attempts, payload_json
       FROM public.ingest_task
       WHERE story_id = $1
         AND job_id = $2
         AND task_type = $3
         AND status IN ('FAILED', 'READY')
         AND attempts < 8
       ORDER BY id DESC`,
      [storyId, jobId, key],
    );

    if (taskRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "NO_RETRYABLE_TASKS_FOR_NODE" }, { status: 409 });
    }

    const ids = taskRes.rows.map((r) => r.id);
    await client.query(
      `UPDATE public.ingest_task
       SET status = 'PENDING',
           error = NULL,
           updated_at = now()
       WHERE id = ANY($1::bigint[])`,
      [ids],
    );
    await client.query(
      `UPDATE public.ingest_job
       SET status = 'RUNNING',
           updated_at = now()
       WHERE id = $1`,
      [jobId],
    );
    await client.query("COMMIT");

    const flowType: FlowType = key.startsWith("NARRATIVE_")
      ? "AUTOWRITE"
      : key === "SPLIT_PROFILE_CORRECTION"
        ? "REPROCESS_SPLIT"
        : "INGEST_SPLIT";
    await insertPipelineAuditEvent({
      storyId,
      jobId,
      taskId: ids[0] ?? null,
      flowType,
      nodeKey: key,
      status: "READY",
      message: `Manual retry requested for node ${key}`,
      payloadJson: {
        reason,
        author,
        retried_task_ids: ids,
      },
    });

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      job_id: jobId,
      node_key: key,
      retried_tasks: ids.length,
      reason,
      author,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "PIPELINE_NODE_RETRY_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

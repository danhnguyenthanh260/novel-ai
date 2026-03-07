import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";
import {
  CLAIMABLE_JOB_STATUSES,
  getFlowNodes,
  getFlowRegistry,
  nodeTimeoutSeconds,
  pickFlowType,
  reduceNodeStatus,
  type NodeStatus,
} from "./pipelineNodeConfig";
import { buildIngestVisualGraph } from "./pipelineGraphOrchestrator";
import { TERMINAL_JOB_STATUSES } from "./ingestTaskReconcileService";

type TaskRow = {
  id: number;
  task_type: string;
  status: string;
  error: string | null;
  human_outcome: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  payload_json: Record<string, unknown> | null;
  result_json: Record<string, unknown> | null;
};

type NarrativeStatus = "DONE" | "RUNNING" | "WAIT_REVIEW" | "READY" | "PENDING" | "FAILED" | "BLOCKED";

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

function mapEdgeStatus(source: NodeStatus, target: NodeStatus): NodeStatus {
  if (source === "FAILED" || source === "BLOCKED" || target === "FAILED" || target === "BLOCKED") return "BLOCKED";
  if (source === "RUNNING" || target === "RUNNING") return "RUNNING";
  if (source === "DONE" && target === "DONE") return "DONE";
  if (source === "DONE" && (target === "READY" || target === "PENDING" || target === "WAIT_REVIEW")) return "READY";
  return "PENDING";
}

function pickCurrentPhase(flowType: string, splitTask: TaskRow | null): string | null {
  if (!splitTask) return null;
  const status = String(splitTask.status || "").toUpperCase();
  const chosenStrategy = typeof splitTask.result_json?.chosen_strategy === "string" ? splitTask.result_json.chosen_strategy : null;
  if (flowType === "AUTOWRITE") return null;
  if (status === "RUNNING") return "SPLIT_ORCHESTRATOR_RUNNING";
  if (status === "FAILED") return "SPLIT_ORCHESTRATOR_FAILED";
  if (status === "DONE") return chosenStrategy ? `SPLIT_STRATEGY:${chosenStrategy}` : "SPLIT_ORCHESTRATOR_DONE";
  return null;
}

function pickDecisionReason(splitTask: TaskRow | null): string | null {
  if (!splitTask) return null;
  const result = splitTask.result_json || {};
  const payload = splitTask.payload_json || {};
  const supervisorDecision = typeof result.supervisor_decision === "string" ? result.supervisor_decision : null;
  const chosenStrategy = typeof result.chosen_strategy === "string" ? result.chosen_strategy : null;
  const rerunReason = typeof result.rerun_reason === "string" ? result.rerun_reason : null;
  const reprocessReason = typeof payload.reprocess_reason_code === "string" ? payload.reprocess_reason_code : null;
  if (supervisorDecision && chosenStrategy) return `${supervisorDecision} via ${chosenStrategy}`;
  if (supervisorDecision) return supervisorDecision;
  if (rerunReason) return rerunReason;
  if (reprocessReason) return `REPROCESS:${reprocessReason}`;
  return null;
}

function pickBlockReason(tasks: TaskRow[]): string | null {
  const failed = tasks.find((t) => String(t.status || "").toUpperCase() === "FAILED");
  if (failed) return failed.error || "NODE_FAILED";
  const running = tasks.find((t) => String(t.status || "").toUpperCase() === "RUNNING");
  if (running) return null;
  return null;
}

export async function getPipelineGraphResponse(
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

    const jobRes = await pool.query<{ id: number; status: string; created_at: string; updated_at: string }>(
      `SELECT id, status, created_at::text, updated_at::text
       FROM public.ingest_job
       WHERE id = $1 AND story_id = $2
       LIMIT 1`,
      [jobId, storyId],
    );
    if (jobRes.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const tasksRes = await pool.query<TaskRow>(
      `SELECT id, task_type, status, error, human_outcome, attempts, created_at::text, updated_at::text, payload_json, result_json
       FROM public.ingest_task
       WHERE story_id = $1 AND job_id = $2
       ORDER BY id ASC`,
      [storyId, jobId],
    );

    const hasReprocessHint = tasksRes.rows.some((row) => Boolean((row.payload_json || {}).reprocess_reason_code));
    const taskTypes = tasksRes.rows.map((row) => String(row.task_type || ""));
    const flowType = pickFlowType(taskTypes, hasReprocessHint);
    const flow = getFlowRegistry(flowType);
    const jobStatus = String(jobRes.rows[0]?.status || "").toUpperCase();
    const isTerminalJob = TERMINAL_JOB_STATUSES.has(jobStatus);
    const claimableByWorker = CLAIMABLE_JOB_STATUSES.has(jobStatus);

    const nodeMap = new Map<string, { status: NodeStatus; total_tasks: number; task_ids: number[]; inspector: Record<string, unknown> }>();
    for (const node of flow.nodes) {
      if (node.kind === "GROUP") continue;
      if (node.key === "AWAIT_APPROVAL") {
        const gateStatus: NodeStatus =
          jobStatus === "AWAIT_APPROVAL" ? "WAIT_REVIEW" : jobStatus === "DONE" ? "DONE" : isTerminalJob ? "SKIPPED" : "PENDING";
        nodeMap.set(node.key, {
          status: gateStatus,
          total_tasks: 0,
          task_ids: [],
          inspector: { config: { gate_status: jobStatus } },
        });
        continue;
      }
      const matching = tasksRes.rows.filter((row) => String(row.task_type || "") === node.key);
      const hasBlockedReady = !claimableByWorker && matching.some((row) => String(row.status || "").toUpperCase() === "READY");
      const status = hasBlockedReady ? "BLOCKED" : reduceNodeStatus(matching.map((row) => row.status));
      const latest = matching.length > 0 ? matching[matching.length - 1] : null;
      nodeMap.set(node.key, {
        status,
        total_tasks: matching.length,
        task_ids: matching.map((row) => row.id),
        inspector: {
          latest_task_id: latest?.id ?? null,
          latest_updated_at: latest?.updated_at ?? null,
          latest_error: latest?.error ?? null,
          latest_attempts: latest?.attempts ?? null,
          data: {
            payload_json: latest?.payload_json ?? {},
            result_json: latest?.result_json ?? {},
          },
          config: pickConfig(latest?.payload_json ?? null, node.key),
        },
      });
    }

    const splitTask =
      tasksRes.rows
        .filter((row) => String(row.task_type || "") === "CHAPTER_SPLIT_LLM")
        .slice(-1)[0] ?? null;
    const hasIngestOpsFlow = flowType === "INGEST_SPLIT" || flowType === "REPROCESS_SPLIT";
    const defaultGroupNodes = flow.groups.map((group) => {
      const childStatuses = group.node_keys
        .map((key) => nodeMap.get(key)?.status || "PENDING")
        .filter(Boolean) as NodeStatus[];
      return {
        key: group.key,
        label: group.label,
        kind: "GROUP",
        collapsed: true,
        status: reduceNodeStatus(childStatuses),
        child_keys: group.node_keys,
      };
    });

    const defaultNodes = [
      ...flow.nodes
        .filter((node) => node.kind !== "GROUP")
        .map((node) => ({
          key: node.key,
          label: node.label,
          kind: node.kind,
          group_key: node.group_key || null,
          status: nodeMap.get(node.key)?.status || "PENDING",
          total_tasks: nodeMap.get(node.key)?.total_tasks || 0,
          task_ids: nodeMap.get(node.key)?.task_ids || [],
          inspector: nodeMap.get(node.key)?.inspector || {},
        })),
      ...defaultGroupNodes,
    ];
    const defaultNodeStatusLookup = new Map(defaultNodes.map((node) => [node.key, node.status as NodeStatus]));
    const defaultEdges = flow.edges.map((edge) => ({
      key: edge.key,
      source: edge.source,
      target: edge.target,
      status: mapEdgeStatus(defaultNodeStatusLookup.get(edge.source) || "PENDING", defaultNodeStatusLookup.get(edge.target) || "PENDING"),
    }));
    const ingestVisual = hasIngestOpsFlow ? buildIngestVisualGraph(flowType, jobStatus, nodeMap, splitTask) : null;
    const nodes = ingestVisual?.nodes || defaultNodes;
    const edges = ingestVisual?.edges || defaultEdges;
    const groups = ingestVisual?.groups || flow.groups;
    const nodeOrder = ingestVisual?.order || getFlowNodes(flowType);

    const graphNodeStatus = new Map(nodes.map((node) => [node.key, node.status as NodeStatus]));
    const currentNode = isTerminalJob
      ? null
      : nodeOrder.find((key) => (graphNodeStatus.get(key) || "PENDING") === "RUNNING") ||
        nodeOrder.find((key) => (graphNodeStatus.get(key) || "PENDING") === "FAILED") ||
        nodeOrder.find((key) => (graphNodeStatus.get(key) || "PENDING") === "READY") ||
        nodeOrder.find((key) => (graphNodeStatus.get(key) || "PENDING") === "WAIT_REVIEW") ||
        null;
    const firstPendingNode = isTerminalJob
      ? null
      : nodeOrder.find((key) => {
          const s = graphNodeStatus.get(key) || "PENDING";
          return s === "PENDING" || s === "READY" || s === "WAIT_REVIEW";
        });
    const lastDoneNode = [...nodeOrder].reverse().find((key) => (graphNodeStatus.get(key) || "PENDING") === "DONE") || null;
    const currentPhase = isTerminalJob ? null : pickCurrentPhase(flowType, splitTask);
    const decisionReason = pickDecisionReason(splitTask);
    const hasPendingWork = tasksRes.rows.some((row) => {
      const s = String(row.status || "").toUpperCase();
      return s === "READY" || s === "PENDING" || s === "RUNNING" || s === "WAIT_REVIEW";
    });
    const blockReason = isTerminalJob ? (hasPendingWork ? `JOB_${jobStatus}_WITH_PENDING_TASKS` : `JOB_${jobStatus}`) : pickBlockReason(tasksRes.rows);
    const narrative: {
      last_node_key: string | null;
      current_node_key: string | null;
      next_node_key: string | null;
      current_phase: string | null;
      decision_reason: string | null;
      block_reason: string | null;
      status: NarrativeStatus;
    } = {
      last_node_key: lastDoneNode,
      current_node_key: currentNode,
      next_node_key: firstPendingNode || null,
      current_phase: currentPhase,
      decision_reason: decisionReason,
      block_reason: blockReason,
      status: (currentNode ? (graphNodeStatus.get(currentNode) || "PENDING") : "PENDING") as NarrativeStatus,
    };

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      job_id: jobId,
      flow_type: flowType,
      job_status: jobStatus || "UNKNOWN",
      current_node: currentNode,
      execution_narrative: narrative,
      graph: {
        nodes,
        edges,
        groups,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "PIPELINE_GRAPH_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

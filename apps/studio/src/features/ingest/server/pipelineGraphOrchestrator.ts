import { reduceNodeStatus, type NodeStatus } from "./pipelineNodeConfig";

export type PipelineNodeStateEntry = {
  status: NodeStatus;
  total_tasks: number;
  task_ids: number[];
  inspector: Record<string, unknown>;
};

export type GraphNode = {
  key: string;
  label: string;
  kind: "TASK" | "GATE" | "GROUP";
  group_key: string | null;
  status: NodeStatus;
  total_tasks: number;
  task_ids: number[];
  interactive: boolean;
  inspector: Record<string, unknown>;
};

export type GraphEdge = {
  key: string;
  source: string;
  target: string;
  status: NodeStatus;
};

function mapEdgeStatus(source: NodeStatus, target: NodeStatus): NodeStatus {
  if (source === "FAILED" || source === "BLOCKED" || target === "FAILED" || target === "BLOCKED") return "BLOCKED";
  if (source === "RUNNING" || target === "RUNNING") return "RUNNING";
  if (source === "DONE" && target === "DONE") return "DONE";
  if (source === "DONE" && (target === "READY" || target === "PENDING" || target === "WAIT_REVIEW")) return "READY";
  return "PENDING";
}

function deriveSyntheticStepStatus(splitStatus: NodeStatus, profileStatus: NodeStatus): NodeStatus {
  if (profileStatus === "RUNNING") return "RUNNING";
  if (profileStatus === "DONE") return "DONE";
  if (profileStatus === "FAILED" || profileStatus === "BLOCKED") return "BLOCKED";
  if (splitStatus === "RUNNING") return "RUNNING";
  if (splitStatus === "DONE" || splitStatus === "FAILED") return "DONE";
  if (splitStatus === "READY") return "READY";
  return "PENDING";
}

export function buildIngestVisualGraph(
  flowType: string,
  jobStatus: string,
  nodeMap: Map<string, PipelineNodeStateEntry>,
  splitTask: { human_outcome: string | null; result_json: Record<string, unknown> | null } | null,
): { nodes: GraphNode[]; edges: GraphEdge[]; groups: Array<{ key: string; label: string; node_keys: string[]; collapsible: boolean }>; order: string[] } {
  const split = nodeMap.get("CHAPTER_SPLIT_LLM");
  const profile = nodeMap.get("SPLIT_PROFILE_CORRECTION");
  const awaitApproval = nodeMap.get("AWAIT_APPROVAL");
  const sceneCreate = nodeMap.get("SCENE_CREATE");
  const memoryEnrich = nodeMap.get("MEMORY_ENRICH");
  const splitStatus = split?.status || "PENDING";
  const profileStatus = profile?.status || "PENDING";
  const isTerminalCancelled = jobStatus === "CANCELLED" || jobStatus === "FAILED" || jobStatus === "REJECTED";
  const splitOutcome =
    (splitTask?.human_outcome && splitTask.human_outcome.trim()) ||
    (typeof splitTask?.result_json?.human_outcome === "string" ? splitTask.result_json.human_outcome : null);
  const approved = splitOutcome === "APPROVED_HUMAN" || jobStatus === "APPROVED" || jobStatus === "DONE";
  const rejected = splitOutcome === "FAILED_HUMAN_REJECTED" || jobStatus === "REJECTED";
  const feedbackStatus: NodeStatus = rejected ? "DONE" : approved || isTerminalCancelled ? "SKIPPED" : "PENDING";
  const sourceSelectorStatus: NodeStatus =
    splitStatus === "RUNNING" || splitStatus === "DONE" || splitStatus === "FAILED" || splitStatus === "READY" ? "DONE" : "PENDING";
  const inputGuardStatus: NodeStatus = split || profile || awaitApproval || sceneCreate || memoryEnrich ? "DONE" : "PENDING";
  const baseSplitStep = isTerminalCancelled && splitStatus === "DONE" ? "DONE" : deriveSyntheticStepStatus(splitStatus, profileStatus);
  const strategySelectorStatus = baseSplitStep;
  const boundaryPlannerStatus = baseSplitStep;
  const boundaryNormalizerStatus = baseSplitStep;
  const qualityJudgeStatus = baseSplitStep;
  const retryGateStatus: NodeStatus =
    profileStatus === "RUNNING"
      ? "RUNNING"
      : profileStatus === "DONE"
        ? "DONE"
        : profileStatus === "FAILED"
          ? "FAILED"
          : splitStatus === "FAILED"
            ? "READY"
            : "PENDING";
  const selfHealStatus = profileStatus;
  const profileLearnerStatus = profileStatus;
  const splitOrchestratorStatus = reduceNodeStatus([
    strategySelectorStatus,
    boundaryPlannerStatus,
    boundaryNormalizerStatus,
    qualityJudgeStatus,
    retryGateStatus,
    selfHealStatus,
    profileLearnerStatus,
  ]);
  const awaitApprovalStatus = isTerminalCancelled ? "SKIPPED" : awaitApproval?.status || "PENDING";
  const sceneCreateStatus = isTerminalCancelled ? "SKIPPED" : sceneCreate?.status || (approved ? "READY" : rejected ? "SKIPPED" : "PENDING");
  const memoryEnrichStatus = isTerminalCancelled ? "SKIPPED" : memoryEnrich?.status || (sceneCreateStatus === "DONE" ? "READY" : "PENDING");
  const orchestratorStatus = reduceNodeStatus([
    inputGuardStatus,
    sourceSelectorStatus,
    splitOrchestratorStatus,
    awaitApprovalStatus,
    sceneCreateStatus,
    memoryEnrichStatus,
    feedbackStatus,
  ]);

  const nodes: GraphNode[] = [
    {
      key: "INGEST_ORCHESTRATOR",
      label: "Ingest Orchestrator",
      kind: "TASK",
      group_key: null,
      status: orchestratorStatus,
      total_tasks: 0,
      task_ids: [],
      interactive: false,
      inspector: { config: { role: "root_controller", flow_type: flowType } },
    },
    {
      key: "INGEST_INPUT_GUARD",
      label: "Input Guard",
      kind: "TASK",
      group_key: null,
      status: inputGuardStatus,
      total_tasks: 0,
      task_ids: [],
      interactive: false,
      inspector: { config: { role: "guard", job_status: jobStatus } },
    },
    {
      key: "SOURCE_SELECTOR",
      label: "Source Selector",
      kind: "TASK",
      group_key: null,
      status: sourceSelectorStatus,
      total_tasks: 0,
      task_ids: [],
      interactive: false,
      inspector: { data: { split_outcome: splitOutcome || null } },
    },
    {
      key: "SPLIT_ORCHESTRATOR",
      label: "Split Orchestrator",
      kind: "TASK",
      group_key: null,
      status: splitOrchestratorStatus,
      total_tasks: 0,
      task_ids: [],
      interactive: false,
      inspector: { config: { role: "group_controller" } },
    },
    {
      key: "STRATEGY_SELECTOR",
      label: "Strategy Selector",
      kind: "TASK",
      group_key: "SPLIT_ORCHESTRATOR",
      status: strategySelectorStatus,
      total_tasks: split?.total_tasks || 0,
      task_ids: split?.task_ids || [],
      interactive: true,
      inspector: split?.inspector || {},
    },
    {
      key: "BOUNDARY_PLANNER",
      label: "Boundary Planner",
      kind: "TASK",
      group_key: "SPLIT_ORCHESTRATOR",
      status: boundaryPlannerStatus,
      total_tasks: split?.total_tasks || 0,
      task_ids: split?.task_ids || [],
      interactive: false,
      inspector: split?.inspector || {},
    },
    {
      key: "BOUNDARY_NORMALIZER",
      label: "Boundary Normalizer",
      kind: "TASK",
      group_key: "SPLIT_ORCHESTRATOR",
      status: boundaryNormalizerStatus,
      total_tasks: split?.total_tasks || 0,
      task_ids: split?.task_ids || [],
      interactive: false,
      inspector: split?.inspector || {},
    },
    {
      key: "QUALITY_JUDGE",
      label: "Quality Judge",
      kind: "TASK",
      group_key: "SPLIT_ORCHESTRATOR",
      status: qualityJudgeStatus,
      total_tasks: split?.total_tasks || 0,
      task_ids: split?.task_ids || [],
      interactive: false,
      inspector: split?.inspector || {},
    },
    {
      key: "RETRY_POLICY_GATE",
      label: "Retry Policy Gate",
      kind: "TASK",
      group_key: "SPLIT_ORCHESTRATOR",
      status: retryGateStatus,
      total_tasks: profile?.total_tasks || 0,
      task_ids: profile?.task_ids || [],
      interactive: false,
      inspector: profile?.inspector || {},
    },
    {
      key: "SELF_HEAL_WINDOW",
      label: "Self Heal Window",
      kind: "TASK",
      group_key: "SPLIT_ORCHESTRATOR",
      status: selfHealStatus,
      total_tasks: profile?.total_tasks || 0,
      task_ids: profile?.task_ids || [],
      interactive: false,
      inspector: profile?.inspector || {},
    },
    {
      key: "PROFILE_LEARNER",
      label: "Profile Learner",
      kind: "TASK",
      group_key: "SPLIT_ORCHESTRATOR",
      status: profileLearnerStatus,
      total_tasks: profile?.total_tasks || 0,
      task_ids: profile?.task_ids || [],
      interactive: true,
      inspector: profile?.inspector || {},
    },
    {
      key: "AWAIT_APPROVAL",
      label: "Await Approval",
      kind: "GATE",
      group_key: null,
      status: awaitApprovalStatus,
      total_tasks: 0,
      task_ids: [],
      interactive: false,
      inspector: awaitApproval?.inspector || {},
    },
    {
      key: "SCENE_CREATE",
      label: "Scene Create",
      kind: "TASK",
      group_key: null,
      status: sceneCreateStatus,
      total_tasks: sceneCreate?.total_tasks || 0,
      task_ids: sceneCreate?.task_ids || [],
      interactive: true,
      inspector: sceneCreate?.inspector || {},
    },
    {
      key: "MEMORY_ENRICH",
      label: "Memory Enrich",
      kind: "TASK",
      group_key: null,
      status: memoryEnrichStatus,
      total_tasks: memoryEnrich?.total_tasks || 0,
      task_ids: memoryEnrich?.task_ids || [],
      interactive: true,
      inspector: memoryEnrich?.inspector || {},
    },
    {
      key: "SUPERVISOR_FEEDBACK_ANALYSIS",
      label: "Supervisor Feedback Analysis",
      kind: "TASK",
      group_key: null,
      status: feedbackStatus,
      total_tasks: 0,
      task_ids: [],
      interactive: false,
      inspector: { data: { branch: rejected ? "reject_feedback" : approved ? "approve" : "pending_review" } },
    },
  ];

  const edgeDefs = [
    ["E_ROOT_TO_GUARD", "INGEST_ORCHESTRATOR", "INGEST_INPUT_GUARD"],
    ["E_GUARD_TO_SOURCE", "INGEST_INPUT_GUARD", "SOURCE_SELECTOR"],
    ["E_SOURCE_TO_SPLIT_ROOT", "SOURCE_SELECTOR", "SPLIT_ORCHESTRATOR"],
    ["E_SPLIT_ROOT_TO_STRATEGY", "SPLIT_ORCHESTRATOR", "STRATEGY_SELECTOR"],
    ["E_STRATEGY_TO_PLANNER", "STRATEGY_SELECTOR", "BOUNDARY_PLANNER"],
    ["E_PLANNER_TO_NORMALIZER", "BOUNDARY_PLANNER", "BOUNDARY_NORMALIZER"],
    ["E_NORMALIZER_TO_QUALITY", "BOUNDARY_NORMALIZER", "QUALITY_JUDGE"],
    ["E_QUALITY_TO_RETRY", "QUALITY_JUDGE", "RETRY_POLICY_GATE"],
    ["E_RETRY_TO_SELF_HEAL", "RETRY_POLICY_GATE", "SELF_HEAL_WINDOW"],
    ["E_SELF_HEAL_TO_PROFILE", "SELF_HEAL_WINDOW", "PROFILE_LEARNER"],
    ["E_PROFILE_TO_APPROVAL", "PROFILE_LEARNER", "AWAIT_APPROVAL"],
    ["E_APPROVAL_TO_SCENE", "AWAIT_APPROVAL", "SCENE_CREATE"],
    ["E_SCENE_TO_MEMORY", "SCENE_CREATE", "MEMORY_ENRICH"],
    ["E_APPROVAL_TO_FEEDBACK", "AWAIT_APPROVAL", "SUPERVISOR_FEEDBACK_ANALYSIS"],
  ] as const;
  const statusByKey = new Map(nodes.map((node) => [node.key, node.status]));
  const edges: GraphEdge[] = edgeDefs.map(([key, source, target]) => ({
    key,
    source,
    target,
    status: mapEdgeStatus(statusByKey.get(source) || "PENDING", statusByKey.get(target) || "PENDING"),
  }));
  const groups = [
    {
      key: "SPLIT_ORCHESTRATOR",
      label: "Split Orchestrator",
      node_keys: ["STRATEGY_SELECTOR", "BOUNDARY_PLANNER", "BOUNDARY_NORMALIZER", "QUALITY_JUDGE", "RETRY_POLICY_GATE", "SELF_HEAL_WINDOW", "PROFILE_LEARNER"],
      collapsible: true,
    },
  ];
  const order = nodes.map((node) => node.key);
  return { nodes, edges, groups, order };
}

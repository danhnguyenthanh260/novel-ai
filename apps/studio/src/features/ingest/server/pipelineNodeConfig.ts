export type NodeStatus = "PENDING" | "READY" | "RUNNING" | "WAIT_REVIEW" | "DONE" | "FAILED" | "BLOCKED" | "SKIPPED";
export type FlowType = "INGEST_SPLIT" | "REPROCESS_SPLIT" | "AUTOWRITE";
export type FlowNodeKind = "TASK" | "GATE" | "GROUP";
export type FlowNodeDef = {
  key: string;
  label: string;
  kind: FlowNodeKind;
  group_key?: string;
};
export type FlowEdgeDef = {
  key: string;
  source: string;
  target: string;
};
export type FlowGroupDef = {
  key: string;
  label: string;
  node_keys: string[];
  collapsible?: boolean;
};
export type FlowRegistry = {
  flow_type: FlowType;
  nodes: FlowNodeDef[];
  edges: FlowEdgeDef[];
  groups: FlowGroupDef[];
};

export const CLAIMABLE_JOB_STATUSES = new Set(["PENDING", "RUNNING", "SPLIT_DRAFT", "APPROVED"]);

export const RETRYABLE_NODE_KEYS = new Set([
  "CHAPTER_INGEST",
  "CHAPTER_SPLIT_LLM",
  "SCENE_CREATE",
  "SPLIT_PROFILE_CORRECTION",
  "CHAPTER_WRITE_V3",
  "CHAPTER_LEDGER_EXTRACT",
  "MEMORY_ROLLUP_V3",
  "NARRATIVE_START",
  "NARRATIVE_STYLIST",
  "NARRATIVE_CRITIC",
  "NARRATIVE_REFINE",
  "NARRATIVE_FINALIZE",
]);

export const NODE_TRACE_AGENT_MAP: Record<string, string[]> = {
  CHAPTER_SPLIT_LLM: ["SPLITTER", "SPLIT_CRITIC", "SUPERVISOR"],
  CHAPTER_WRITE_V3: ["CHAPTER_WRITE_V3"],
  CHAPTER_LEDGER_EXTRACT: ["CHAPTER_LEDGER_EXTRACT"],
  MEMORY_ROLLUP_V3: ["MEMORY_ROLLUP_V3"],
  NARRATIVE_START: ["NARRATIVE_START"],
  NARRATIVE_STYLIST: ["NARRATIVE_STYLIST"],
  NARRATIVE_CRITIC: ["NARRATIVE_CRITIC"],
  NARRATIVE_REFINE: ["NARRATIVE_REFINE"],
  NARRATIVE_FINALIZE: ["NARRATIVE_FINALIZE"],
};

const FLOW_REGISTRY: Record<FlowType, FlowRegistry> = {
  INGEST_SPLIT: {
    flow_type: "INGEST_SPLIT",
    nodes: [
      { key: "CHAPTER_INGEST", label: "Chapter Ingest", kind: "TASK" },
      { key: "CHAPTER_SPLIT_LLM", label: "Chapter Split", kind: "TASK" },
      { key: "AWAIT_APPROVAL", label: "Await Approval", kind: "GATE" },
      { key: "SCENE_CREATE", label: "Scene Create", kind: "TASK" },
      { key: "MEMORY_ENRICH", label: "Memory Enrich", kind: "TASK" },
    ],
    edges: [
      { key: "E_INGEST_TO_SPLIT", source: "CHAPTER_INGEST", target: "CHAPTER_SPLIT_LLM" },
      { key: "E_SPLIT_TO_APPROVAL", source: "CHAPTER_SPLIT_LLM", target: "AWAIT_APPROVAL" },
      { key: "E_APPROVAL_TO_SCENE", source: "AWAIT_APPROVAL", target: "SCENE_CREATE" },
      { key: "E_SCENE_TO_MEMORY", source: "SCENE_CREATE", target: "MEMORY_ENRICH" },
    ],
    groups: [],
  },
  REPROCESS_SPLIT: {
    flow_type: "REPROCESS_SPLIT",
    nodes: [
      { key: "CHAPTER_SPLIT_LLM", label: "Chapter Split", kind: "TASK" },
      { key: "SPLIT_PROFILE_CORRECTION", label: "Profile Correction", kind: "TASK" },
      { key: "AWAIT_APPROVAL", label: "Await Approval", kind: "GATE" },
    ],
    edges: [
      { key: "E_SPLIT_TO_PROFILE", source: "CHAPTER_SPLIT_LLM", target: "SPLIT_PROFILE_CORRECTION" },
      { key: "E_PROFILE_TO_APPROVAL", source: "SPLIT_PROFILE_CORRECTION", target: "AWAIT_APPROVAL" },
    ],
    groups: [],
  },
  AUTOWRITE: {
    flow_type: "AUTOWRITE",
    nodes: [
      { key: "AUTOWRITE_V3_GROUP", label: "Write Chapter V3", kind: "GROUP" },
      { key: "CHAPTER_WRITE_V3", label: "Chapter Write", kind: "TASK", group_key: "AUTOWRITE_V3_GROUP" },
      { key: "CHAPTER_LEDGER_EXTRACT", label: "Ledger Extract", kind: "TASK", group_key: "AUTOWRITE_V3_GROUP" },
      { key: "MEMORY_ROLLUP_V3", label: "Memory Rollup", kind: "TASK", group_key: "AUTOWRITE_V3_GROUP" },
      { key: "AUTOWRITE_LEGACY_GROUP", label: "Legacy Narrative", kind: "GROUP" },
      { key: "NARRATIVE_START", label: "Start", kind: "TASK", group_key: "AUTOWRITE_LEGACY_GROUP" },
      { key: "NARRATIVE_STYLIST", label: "Stylist", kind: "TASK", group_key: "AUTOWRITE_LEGACY_GROUP" },
      { key: "NARRATIVE_CRITIC", label: "Critic", kind: "TASK", group_key: "AUTOWRITE_LEGACY_GROUP" },
      { key: "NARRATIVE_REFINE", label: "Refine", kind: "TASK", group_key: "AUTOWRITE_LEGACY_GROUP" },
      { key: "NARRATIVE_FINALIZE", label: "Finalize", kind: "TASK", group_key: "AUTOWRITE_LEGACY_GROUP" },
    ],
    edges: [
      { key: "E_CHAPTER_WRITE_TO_LEDGER", source: "CHAPTER_WRITE_V3", target: "CHAPTER_LEDGER_EXTRACT" },
      { key: "E_LEDGER_TO_MEMORY_ROLLUP", source: "CHAPTER_LEDGER_EXTRACT", target: "MEMORY_ROLLUP_V3" },
      { key: "E_START_TO_STYLIST", source: "NARRATIVE_START", target: "NARRATIVE_STYLIST" },
      { key: "E_STYLIST_TO_CRITIC", source: "NARRATIVE_STYLIST", target: "NARRATIVE_CRITIC" },
      { key: "E_CRITIC_TO_REFINE", source: "NARRATIVE_CRITIC", target: "NARRATIVE_REFINE" },
      { key: "E_REFINE_TO_FINALIZE", source: "NARRATIVE_REFINE", target: "NARRATIVE_FINALIZE" },
    ],
    groups: [
      {
        key: "AUTOWRITE_V3_GROUP",
        label: "Write Chapter V3",
        node_keys: ["CHAPTER_WRITE_V3", "CHAPTER_LEDGER_EXTRACT", "MEMORY_ROLLUP_V3"],
        collapsible: true,
      },
      {
        key: "AUTOWRITE_LEGACY_GROUP",
        label: "Legacy Narrative",
        node_keys: ["NARRATIVE_START", "NARRATIVE_STYLIST", "NARRATIVE_CRITIC", "NARRATIVE_REFINE", "NARRATIVE_FINALIZE"],
        collapsible: true,
      },
    ],
  },
};

export function getFlowNodes(flowType: FlowType): string[] {
  const registry = FLOW_REGISTRY[flowType] || FLOW_REGISTRY.INGEST_SPLIT;
  return registry.nodes.filter((node) => node.kind !== "GROUP").map((node) => node.key);
}

export function getFlowRegistry(flowType: FlowType): FlowRegistry {
  return FLOW_REGISTRY[flowType] || FLOW_REGISTRY.INGEST_SPLIT;
}

export function pickFlowType(taskTypes: string[], hasReprocessHint: boolean): FlowType {
  if (taskTypes.some((x) => x === "CHAPTER_WRITE_V3" || x === "CHAPTER_LEDGER_EXTRACT" || x === "MEMORY_ROLLUP_V3")) return "AUTOWRITE";
  if (taskTypes.some((x) => x.startsWith("NARRATIVE_"))) return "AUTOWRITE";
  if (taskTypes.includes("SPLIT_PROFILE_CORRECTION") || hasReprocessHint) return "REPROCESS_SPLIT";
  return "INGEST_SPLIT";
}

export function reduceNodeStatus(statuses: string[]): NodeStatus {
  if (statuses.length === 0) return "PENDING";
  const s = statuses.map((x) => String(x || "").toUpperCase());
  if (s.includes("FAILED")) return "FAILED";
  if (s.includes("RUNNING")) return "RUNNING";
  if (s.includes("WAIT_REVIEW")) return "WAIT_REVIEW";
  if (s.every((x) => x === "DONE")) return "DONE";
  if (s.includes("READY")) return "READY";
  if (s.includes("PENDING")) return "PENDING";
  return "BLOCKED";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function readyStalledThresholdSeconds(): number {
  return parsePositiveInt(process.env.PIPELINE_READY_STALLED_SECONDS, 120);
}

export function maxRetryAttempts(): number {
  return parsePositiveInt(process.env.PIPELINE_MAX_RETRY_ATTEMPTS, 8);
}

export function nodeTimeoutSeconds(nodeKey: string): number {
  switch (nodeKey) {
    case "CHAPTER_WRITE_V3":
      return parsePositiveInt(process.env.LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS, 300);
    case "CHAPTER_LEDGER_EXTRACT":
      return parsePositiveInt(process.env.LLM_TIMEOUT_CHAPTER_LEDGER_EXTRACT_SECONDS, 90);
    case "MEMORY_ROLLUP_V3":
      return parsePositiveInt(process.env.LLM_TIMEOUT_MEMORY_ROLLUP_V3_SECONDS, 90);
    case "NARRATIVE_START":
      return parsePositiveInt(process.env.LLM_TIMEOUT_NARRATIVE_START, 60);
    case "NARRATIVE_STYLIST":
      return parsePositiveInt(process.env.LLM_TIMEOUT_NARRATIVE_STYLIST, 120);
    case "NARRATIVE_CRITIC":
      return parsePositiveInt(process.env.LLM_TIMEOUT_NARRATIVE_CRITIC, 90);
    case "NARRATIVE_REFINE":
      return parsePositiveInt(process.env.LLM_TIMEOUT_NARRATIVE_REFINE, 120);
    case "NARRATIVE_FINALIZE":
      return parsePositiveInt(process.env.LLM_TIMEOUT_NARRATIVE_FINALIZE, 90);
    default:
      return parsePositiveInt(process.env.LLM_TIMEOUT_DEFAULT, 90);
  }
}

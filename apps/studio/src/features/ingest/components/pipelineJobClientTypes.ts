export type PipelineNode = {
  node_key: string;
  status: string;
  total_tasks: number;
};

export type PipelineSummary = {
  ok: boolean;
  flow_type: string;
  job_status: string;
  current_node: string | null;
  blocking_reason: string | null;
  blocked_nodes?: string[];
  alerts?: Array<{
    node_key: string;
    alert_type: string;
    running_seconds?: number;
    ready_seconds?: number;
    threshold_seconds?: number;
    attempts?: number;
    threshold_attempts?: number;
  }>;
  timeout_alerts?: Array<{
    node_key: string;
    alert_type: string;
    running_seconds: number;
    threshold_seconds: number;
  }>;
  last_error: string | null;
  progress_pct: number;
  nodes: PipelineNode[];
};

export type PipelineGraphNode = {
  key: string;
  label: string;
  kind: "TASK" | "GATE" | "GROUP";
  group_key?: string | null;
  status: string;
  interactive?: boolean;
  total_tasks?: number;
  task_ids?: number[];
  collapsed?: boolean;
  child_keys?: string[];
  inspector?: {
    latest_task_id?: number | null;
    latest_updated_at?: string | null;
    latest_error?: string | null;
    latest_attempts?: number | null;
    data?: {
      payload_json?: Record<string, unknown>;
      result_json?: Record<string, unknown>;
    };
    config?: Record<string, unknown>;
  };
};

export type PipelineGraphEdge = {
  key: string;
  source: string;
  target: string;
  status: string;
};

export type PipelineGraph = {
  nodes: PipelineGraphNode[];
  edges: PipelineGraphEdge[];
  groups?: Array<{
    key: string;
    label: string;
    node_keys: string[];
  }>;
};

export type PipelineExecutionNarrative = {
  last_node_key: string | null;
  current_node_key: string | null;
  next_node_key: string | null;
  current_phase: string | null;
  decision_reason: string | null;
  block_reason: string | null;
  status: string;
};

export type PipelineLogItem = {
  id: number;
  status: string;
  message: string | null;
  error_code: string | null;
  task_id: number | null;
  created_at: string;
  payload_json?: Record<string, unknown>;
};

export type AgentTraceItem = {
  id: number;
  task_id: number | null;
  agent_name: string;
  status: string;
  error_code: string | null;
  latency_ms: number | null;
  prompt_version_id: number | null;
  strategy_profile_version_id?: number | null;
  created_at: string;
};

export type PipelineNodeInspectorLite = {
  ok: boolean;
  story_id: number;
  story_slug: string;
  job_id: number;
  node_key: string;
  source: string;
  narrative: {
    just_did_summary: string | null;
    doing_now_summary: string | null;
    will_do_next_summary: string | null;
  };
  identity: {
    task_id: number | null;
    task_status: string | null;
    attempts: number | null;
  };
  data: {
    input_snapshot_ref: Record<string, unknown>;
    output_snapshot_ref: Record<string, unknown>;
    latest_error: string | null;
  };
  config: Record<string, unknown>;
  runtime_refs: {
    prompt_version_id: number | null;
    run_trace_id: number | null;
    context_snapshot_id: number | null;
    strategy_profile_version_id?: number | null;
  };
  ops_meta?: {
    strategy_selected: string | null;
    learning_mode: string | null;
    learning_applied: boolean;
    learning_lr: Record<string, unknown>;
    profile_decay_factor: number | null;
    profile_reset_scope: string | null;
    profile_reset_applied: Record<string, unknown>;
    truth_resolution: Record<string, unknown>;
    truth_conflicts: Array<{
      id: number;
      conflict_id: string;
      losing_rule_ref: string;
      winning_rule_ref: string;
      resolution_mode: string;
      resolution_reason: string;
      payload_json?: Record<string, unknown>;
      created_at: string;
    }>;
    shadow_pairs?: Array<{
      id: number;
      pair_status: string;
      active_run_trace_id: number | null;
      shadow_run_trace_id: number | null;
      active_prompt_version_id: number | null;
      shadow_prompt_version_id: number | null;
      compare_json?: Record<string, unknown>;
      created_at: string;
    }>;
  };
  fallback_markers: string[];
  links: {
    pipeline_job_url: string;
    run_trace_url: string | null;
    prompt_registry_url: string;
  };
  items: PipelineLogItem[];
  trace_items: AgentTraceItem[];
};

export async function readJson(res: Response): Promise<unknown> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error || `HTTP_${res.status}`);
  return json;
}

export function formatAlertMessage(alert: NonNullable<PipelineSummary["alerts"]>[number]): string {
  if (alert.alert_type === "RUNNING_TOO_LONG") {
    return `${alert.node_key}: running ${alert.running_seconds ?? 0}s (threshold ${alert.threshold_seconds ?? 0}s)`;
  }
  if (alert.alert_type === "READY_STALLED") {
    return `${alert.node_key}: ready ${alert.ready_seconds ?? 0}s (threshold ${alert.threshold_seconds ?? 0}s)`;
  }
  if (alert.alert_type === "RETRY_EXHAUSTED") {
    return `${alert.node_key}: attempts ${alert.attempts ?? 0} (limit ${alert.threshold_attempts ?? 0})`;
  }
  return `${alert.node_key}: ${alert.alert_type}`;
}

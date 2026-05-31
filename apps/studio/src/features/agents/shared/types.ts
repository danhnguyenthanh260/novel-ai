export type AgentMetric = {
  agent_name: string;
  total_runs: number;
  done_runs: number;
  failed_runs: number;
  timeout_runs: number;
  success_rate: number;
  failure_rate: number;
  timeout_rate: number;
  avg_latency_ms: number | null;
  meta_leak_rate: number;
};

export type AgentRun = {
  id: number;
  agent_name: string;
  chapter_id: string | null;
  status: string;
  error_code: string | null;
  prompt_version_id: number | null;
  context_snapshot_id: number | null;
  latency_ms: number | null;
  created_at: string;
  quality_json?: Record<string, unknown>;
};

export type AgentPrompt = {
  version_id: number;
  profile_id: number;
  agent_name: string;
  scope: string;
  chapter_id: string | null;
  version_no: number;
  status: string;
  created_by: string;
  created_at: string;
  change_note: string | null;
  system_prompt: string;
};

export type AgentExperiment = {
  id: number;
  agent_name: string;
  scope: string;
  chapter_id: string | null;
  baseline_version_id: number;
  candidate_version_id: number;
  traffic_percent: number;
  status: string;
  start_at: string;
  end_at: string | null;
};

export type PromptDiffChunk = {
  added: boolean;
  removed: boolean;
  value: string;
  count: number;
};

export type AgentFeedback = {
  id: number;
  agent_name: string;
  chapter_id: string | null;
  feedback_source: string;
  feedback_type: string;
  feedback_text: string;
  weight: string;
  status: string;
  created_at: string;
};

export type AgentMemory = {
  id: number;
  agent_name: string;
  chapter_id: string | null;
  memory_type: string;
  memory_text: string;
  score: string;
  similarity?: number;
  created_at: string;
};

export type AgentRunDetail = {
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
  rationale_summary: string | null;
  created_at: string;
};

export type AgentProfile = {
  id: number;
  species_name: string;
  nick_name: string;
  base_dna_id: number | null;
  experience_pts: number;
  level: number;
  is_sealed: boolean;
  active_slot_count: number;
  created_at: string;
  updated_at: string;
};

export type AgentProfileSlot = {
  id: number;
  slot_type: string;
  artifact_ref_type: string;
  artifact_id: string;
  is_active: boolean;
  stats_mod: Record<string, unknown>;
  updated_at: string;
};

export type AgentProfileEvent = {
  id: number;
  action: string;
  actor: string;
  details_json: Record<string, unknown>;
  created_at: string;
};

export type DrawerEvent = {
  event_type: "RUN" | "TUNING" | "GROWTH";
  id: number;
  status: string;
  message: string;
  created_at: string;
  meta: Record<string, unknown>;
};

export type AgentDrawerData = {
  agent_name: string;
  identity: {
    profile_id: number | null;
    species_name: string;
    nick_name: string;
    level: number;
    experience_pts: number;
    is_sealed: boolean;
  };
  runtime_summary: {
    state: "IDLE" | "RUNNING" | "DEGRADED" | "BLOCKED";
    lookback_hours: number;
    recent_total_runs: number;
    recent_failed_runs: number;
    success_rate: number;
    avg_latency_ms: number | null;
    latest_run: {
      id: number;
      status: string;
      error_code: string | null;
      prompt_version_id: number | null;
      model_name: string | null;
      latency_ms: number | null;
      created_at: string;
    } | null;
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
    shadow_compare?: Array<{
      pair_id: number;
      pair_status: string;
      active_run_trace_id: number | null;
      shadow_run_trace_id: number | null;
      active_prompt_version_id: number | null;
      shadow_prompt_version_id: number | null;
      delta_latency_ms: number | null;
      delta_token_in: number | null;
      delta_token_out: number | null;
      active_hard_fail: boolean | null;
      shadow_hard_fail: boolean | null;
      active_flagged_pct: number | null;
      shadow_flagged_pct: number | null;
      compare_json?: Record<string, unknown>;
      created_at: string;
    }>;
  };
  prompt_summary: {
    active: {
      version_id: number;
      status: string;
      version_no: number;
      created_at: string;
      change_note: string | null;
      system_prompt: string;
      developer_prompt: string | null;
    } | null;
    canary: {
      version_id: number;
      status: string;
      version_no: number;
      created_at: string;
      change_note: string | null;
      system_prompt: string;
      developer_prompt: string | null;
    } | null;
    recent?: Array<{
      version_id: number;
      status: string;
      version_no: number;
      created_at: string;
      change_note: string | null;
      system_prompt: string;
      developer_prompt: string | null;
    }>;
    hydration_latest?: {
      id: number;
      run_trace_id: number | null;
      task_type: string;
      prompt_version_id: number | null;
      hydration_output_hash: string | null;
      hydration_output_text: string | null;
      hydration_render_steps_json: Record<string, unknown>;
      llm_request_meta_json: Record<string, unknown>;
      tokens_prompt_base: number | null;
      tokens_rules_injected: number | null;
      tokens_memory_injected: number | null;
      tokens_feedback_injected: number | null;
      tokens_truncated: number | null;
      created_at: string;
    } | null;
    hydration_recent?: Array<{
      id: number;
      run_trace_id: number | null;
      task_type: string;
      prompt_version_id: number | null;
      hydration_output_hash: string | null;
      hydration_output_text: string | null;
      hydration_render_steps_json: Record<string, unknown>;
      llm_request_meta_json: Record<string, unknown>;
      tokens_prompt_base: number | null;
      tokens_rules_injected: number | null;
      tokens_memory_injected: number | null;
      tokens_feedback_injected: number | null;
      tokens_truncated: number | null;
      created_at: string;
    }>;
  };
  memory_summary: {
    items: Array<{ id: number; memory_type: string; memory_text: string; score: string; created_at: string }>;
  };
  feedback_summary: {
    items: Array<{ id: number; feedback_type: string; feedback_source: string; feedback_text: string; status: string; created_at: string }>;
  };
  config_snapshot: {
    model_name: string | null;
    prompt_version_id: number | null;
    timeout_seconds: number | null;
    retry_budget: number | null;
  };
  activity_events: DrawerEvent[];
  visual_profile: {
    skin: string;
    frame: string;
    badge: string;
    title: string;
    fx_level: string;
  };
};

export type AgentTuningEvent = {
  id: number;
  agent_name: string;
  from_version_id: number | null;
  to_version_id: number;
  action: string;
  reason: string;
  author: string;
  approved_by: string | null;
  created_at: string;
};

export type AgentCoverage = {
  agent_name: string;
  expected_count: number;
  traced_count: number;
  coverage_rate: number;
  below_threshold: boolean;
};

export type AgentControlTab = "overview" | "runs" | "prompts" | "experiments" | "feedback" | "memory";
export type AgentDrawerTab = "overview" | "prompt" | "memory" | "feedback" | "config";
export type AgentTabGroup = {
  label: string;
  description: string;
  tabs: Array<[AgentControlTab, string]>;
};

export type AgentAlert = {
  alert_type: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  agent_name: string | null;
  metric_name: string;
  metric_value: number;
  threshold: number;
  message: string;
};
export type AgentPromptImpact = {
  agent_name: string;
  prompt_version_id: number | null;
  total_runs: number;
  success_rate: number;
  failure_rate: number;
  meta_leak_rate: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
};

export type AgentShadowCompare = {
  id: number;
  task_id: number | null;
  agent_name: string;
  pair_status: string;
  active_run_trace_id: number | null;
  shadow_run_trace_id: number | null;
  active_prompt_version_id: number | null;
  shadow_prompt_version_id: number | null;
  active_status: string | null;
  shadow_status: string | null;
  delta_latency_ms: number | null;
  delta_token_in: number | null;
  delta_token_out: number | null;
  active_hard_fail: boolean | null;
  shadow_hard_fail: boolean | null;
  active_flagged_pct: number | null;
  shadow_flagged_pct: number | null;
  compare_json?: Record<string, unknown>;
  created_at: string;
};

export type AgentErrorTaxonomy = {
  taxonomy: "META_LEAK" | "EMPTY_OUTPUT" | "ENTITY_DRIFT" | "BUDGET_MISS";
  hit_count: number;
  hit_rate: number;
  top_agents: Array<{ agent_name: string; hit_count: number }>;
};

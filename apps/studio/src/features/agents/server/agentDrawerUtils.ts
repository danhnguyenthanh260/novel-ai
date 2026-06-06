export type AgentDrawerIdentityRow = {
  profile_id: number | null;
  species_name: string | null;
  nick_name: string | null;
  level: number | null;
  experience_pts: string | null;
  is_sealed: boolean | null;
  visual_profile_json: unknown;
};

export type AgentDrawerPromptRow = {
  version_id: number;
  status: string;
  version_no: number;
  created_at: string;
  change_note: string | null;
  system_prompt: string;
  developer_prompt: string | null;
};

export type AgentDrawerRunRow = {
  id: number;
  job_id: number | null;
  task_id: number | null;
  status: string;
  error_code: string | null;
  prompt_version_id: number | null;
  model_name: string | null;
  latency_ms: number | null;
  token_in: number | null;
  token_out: number | null;
  quality_json: unknown;
  created_at: string;
};

export type AgentDrawerMemoryRow = {
  id: number;
  memory_type: string;
  memory_text: string;
  score: string;
  created_at: string;
};

export type AgentDrawerFeedbackRow = {
  id: number;
  feedback_type: string;
  feedback_source: string;
  feedback_text: string;
  status: string;
  created_at: string;
};

export type AgentDrawerTuningRow = {
  id: number;
  action: string;
  reason: string;
  created_at: string;
};

export type AgentDrawerProfileEventRow = {
  id: number;
  action: string;
  details_json: unknown;
  created_at: string;
};

export type AgentDrawerHydrationRow = {
  id: number;
  run_trace_id: number | null;
  task_type: string;
  prompt_version_id: number | null;
  hydration_output_hash: string | null;
  hydration_output_text: string | null;
  hydration_render_steps_json: unknown;
  llm_request_meta_json: unknown;
  tokens_prompt_base: number | null;
  tokens_rules_injected: number | null;
  tokens_memory_injected: number | null;
  tokens_feedback_injected: number | null;
  tokens_truncated: number | null;
  created_at: string;
};

export type TruthConflictRow = {
  id: number;
  conflict_id: string;
  losing_rule_ref: string;
  winning_rule_ref: string;
  resolution_mode: string;
  resolution_reason: string;
  payload_json: Record<string, unknown>;
  created_at: string;
};

export type ShadowPairRow = {
  id: number;
  pair_status: string;
  active_run_trace_id: number | null;
  shadow_run_trace_id: number | null;
  active_prompt_version_id: number | null;
  shadow_prompt_version_id: number | null;
  compare_json: Record<string, unknown>;
  created_at: string;
};

export type ShadowRunTraceLiteRow = {
  id: number;
  status: string;
  latency_ms: number | null;
  token_in: number | null;
  token_out: number | null;
  quality_json: unknown;
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function sanitizeVisualProfile(input: unknown): Record<string, string> {
  const obj = isPlainObject(input) ? input : {};
  const pick = (key: string, fallback: string): string => {
    const raw = obj[key];
    return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 80) : fallback;
  };
  return {
    skin: pick("skin", "mint_core"),
    frame: pick("frame", "bronze_ring"),
    badge: pick("badge", "split_master"),
    title: pick("title", ""),
    fx_level: pick("fx_level", "low"),
  };
}

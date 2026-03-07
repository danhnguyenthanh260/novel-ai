export type IngestJob = {
  id: number;
  mode: "AUTO_LOCK" | "REVIEW_GATE";
  status:
  | "PENDING"
  | "RUNNING"
  | "DONE"
  | "FAILED"
  | "CANCELLED"
  | "SPLIT_DRAFT"
  | "AWAIT_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "AWAITING_DATA_APPROVAL";
  total_tasks: number;
  completed_tasks: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IngestTask = {
  id: number;
  job_id: number;
  task_type: "LEGACY" | "LEGACY_CHAPTER_PARSE" | "LEGACY_SCENE_INDEX" | "CHAPTER_INGEST" | "CHAPTER_SPLIT_LLM" | "SCENE_CREATE" | "CHAPTER_VALIDATE" | "SPLIT_PROFILE_CORRECTION" | "WRITING_ANALYSIS" | "MEMORY_ROLLUP" | "WRITING_PLANNING" | "WRITING_PROSE" | "WRITING_CONTINUITY" | "WRITING_SUPERVISOR";
  unit_type: "chapter" | "scene" | "split_draft" | "chapter_ingest" | "chapter_validate" | "memory_rollup" | "writing_continuity";
  source_path: string | null;
  seq_no: number;
  status: "PENDING" | "READY" | "RUNNING" | "WAIT_REVIEW" | "DONE" | "FAILED";
  attempts: number;
  error: string | null;
  updated_at: string;
  chapter_task_id?: string | null;
  approved_scene_idx?: string | null;
  payload_json?: Record<string, unknown> | null;
  result_json?: (Record<string, unknown> & {
    memory_runtime?: {
      memory_contract_version?: string;
      arc_memory_id?: number | null;
      saga_snapshot_id?: number | null;
      working_memory_chapters?: string[];
      core_lookup_hits?: Record<string, number>;
      degraded_memory_mode?: boolean;
      reason?: string | null;
      [key: string]: unknown;
    };
  }) | null;
};

export type SplitDraftScene = {
  idx: number;
  start: number;
  end: number;
  title: string | null;
  summary: string | null;
  reason: string | null;
  head_excerpt?: string | null;
  tail_excerpt?: string | null;
  scene_text?: string | null;
  scene_text_sha256?: string | null;
  flags?: string[];
  boundary_debug?: Record<string, unknown> | null;
};

export type SplitDraftData = {
  status: IngestJob["status"];
  is_mature?: boolean;
  feedback_health?: {
    total_feedback: number;
    valid_feedback: number;
    mismatch_feedback: number;
    data_coverage_pct: number;
    mode_changed_feedback?: number;
  };
  scenes: SplitDraftScene[];
  chapter_text_stats: { chars?: number };
  chapters: Array<{
    task_id: number;
    seq_no: number;
    status: string;
    source_path: string | null;
    source_doc_id?: string | null;
    source_doc_sha256?: string | null;
    source_type?: string | null;
    source_role?: string | null;
    chapter_id?: string | null;
    chapter_title?: string | null;
    text_basis?: string;
    repair_report?: Record<string, unknown>;
    autofix_report?: Record<string, unknown>;
    quality_report?: Record<string, unknown>;
    previous_quality_report?: Record<string, unknown>;
    quality_delta?: Record<string, unknown>;
    hard_fail?: boolean;
    safe_to_approve?: boolean;
    rerun_reason?: string;
    decision_reason_codes?: string[];
    strategy_selected?: string | null;
    profile_scope?: string | null;
    strategy_attempts?: Array<{
      strategy: string;
      quality_report?: Record<string, unknown>;
      llm_calls_used?: number | null;
      semantic_guard_report?: Record<string, unknown>;
      targeted_window_report?: Record<string, unknown>;
      hard_fail?: boolean;
      rerun_reason?: string;
      forced_retry_gate?: boolean;
      exploration_retry?: boolean;
    }>;
    llm_calls_used?: number | null;
    llm_calls_budget?: number | null;
    strategy_profile?: Record<string, unknown>;
    window_rerun_report?: Record<string, unknown>;
    feedback_summary?: Record<string, unknown>;
    feedback_penalties?: Record<string, unknown>;
    issue_hints?: Record<string, unknown>;
    issue_hints_explicit?: Record<string, unknown>;
    issue_hints_inferred?: Record<string, unknown>;
    boundary_type_hints?: Record<string, unknown>;
    strategy_bias?: Record<string, unknown>;
    supervisor_decision?: "auto_pass" | "auto_retry_once" | "manual_review";
    supervisor_retry_used?: boolean;
    prompt_version_id?: number | null;
    hydration_output_hash?: string | null;
    hydration_output_text?: string | null;
    prompt_trace_phase?: string | null;
    prompt_trace_status?: string | null;
    prompt_trace_source?: string | null;
    prompt_trace_created_at?: string | null;
    prompt_unavailable_reason?: string | null;
    chunk_prompt_trace?: Array<Record<string, unknown>>;
    boundary_evidence?: Array<Record<string, unknown>>;
    context_window?: Record<string, unknown>;
    context_hash?: string | null;
    context_pack_version?: string | null;
    preference_rule_version?: string | null;
    decision_evidence?: Record<string, unknown>;
    split_mode: "manual" | "auto";
    split_controls?: Record<string, unknown>;
    split_runtime?: {
      phase_timing?: {
        outline_sec?: number;
        primary_sec?: number;
        recursion_sec?: number;
        repair_sec?: number;
        total_sec?: number;
      };
      phase_budget?: {
        outline_budget_sec?: number;
        primary_budget_sec?: number;
        repair_budget_sec?: number;
        total_budget_sec?: number;
      };
      phase_stop_reason?: string | null;
      budget_profile?: string | null;
      retry_profile_used?: string | null;
      root_cause_class?: string | null;
      root_cause_confidence?: number | null;
      recommended_action_code?: string | null;
      runbook_hint_code?: string | null;
      pipeline_version?: "v1" | "v2" | string | null;
      degrade_path_taken?: boolean;
      degrade_reason_code?: string | null;
      deterministic_fallback_applied?: boolean;
      deterministic_fallback_notes?: string[];
      repair_summary?: {
        attempted?: boolean;
        repaired_chunks?: number;
        remaining_violations?: number;
      };
      duration_sec?: number;
      [key: string]: unknown;
    };
    analysis_chunk_artifact?: {
      status?: string | null;
      diagnostics?: {
        oversized_count?: number;
        max_chunk_chars_observed?: number;
        repair_attempted?: boolean;
        repair_exhausted?: boolean;
      };
      [key: string]: unknown;
    };
    analysis_chunk_diagnostics?: {
      oversized_count?: number;
      max_chunk_chars_observed?: number;
      repair_attempted?: boolean;
      repair_exhausted?: boolean;
      [key: string]: unknown;
    };
    operational_state?: "READY_FOR_ANALYSIS" | "NEEDS_RETRY" | null;
    operational_state_reason?: string | null;
    chapter_text_stats: { chars?: number };
    scenes: SplitDraftScene[];
    is_stable?: boolean;
    version?: number | null;
  }>;
};

export type ExistingChapter = {
  chapter_id: string;
  scene_count: number;
  is_stable: boolean;
  version: number | null;
};

export type FeedbackDraft = {
  open: boolean;
  tokenKey: string;
  locationRef: string;
  note: string;
  sceneIdxLeft: number | null;
  sceneIdxRight: number | null;
  charOffset: number | null;
  aiResponse: Record<string, unknown> | null;
};

export type WorkerLaneStatus = {
  lane: string;
  running: boolean;
  pid: number | null;
};

export type WorkerStatus = {
  enabled: boolean;
  running: boolean;
  pid: number | null;
  detail?: string;
  lanes?: WorkerLaneStatus[];
};

export type SourceDocItem = {
  source_doc_id: string;
  chapter_id: string | null;
  chapter_no: number | null;
  source_path: string | null;
  source_type: string | null;
  source_role: string | null;
  char_len: number;
  is_stable: boolean;
  version: number;
  created_at: string;
};

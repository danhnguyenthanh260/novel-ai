import type {
  ExistingChapter,
  FeedbackDraft,
  IngestJob,
  SourceDocItem,
  SplitDraftData,
  SplitDraftScene,
} from "@/features/ingest/components/ingestJobs/types";

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOrZero(value: unknown): number {
  return Number(value) || 0;
}

function numberOrNull(value: unknown): number | null {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? asObject(value) : {};
}

function parseChapterTextStats(value: unknown): { chars?: number } {
  return value && typeof value === "object" ? (value as { chars?: number }) : {};
}

function normalizeSupervisorDecision(value: unknown): "auto_pass" | "auto_retry_once" | "manual_review" {
  if (value === "manual_review" || value === "auto_retry_once") return value;
  return "auto_pass";
}

function parseStrategyAttempts(value: unknown): SplitDraftData["chapters"][number]["strategy_attempts"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x))
    .map((x) => ({
      strategy: typeof x.strategy === "string" ? x.strategy : "unknown",
      quality_report: recordOrEmpty(x.quality_report),
      llm_calls_used: numberOrNull(x.llm_calls_used),
      semantic_guard_report: recordOrEmpty(x.semantic_guard_report),
      targeted_window_report: recordOrEmpty(x.targeted_window_report),
      hard_fail: Boolean(x.hard_fail),
      rerun_reason: stringOrEmpty(x.rerun_reason),
      forced_retry_gate: Boolean(x.forced_retry_gate),
      exploration_retry: Boolean(x.exploration_retry),
    }));
}

function parseSplitScene(row: Record<string, unknown>): SplitDraftScene {
  return {
    idx: numberOrZero(row.idx),
    start: numberOrZero(row.start),
    end: numberOrZero(row.end),
    title: stringOrNull(row.title),
    summary: stringOrNull(row.summary),
    reason: stringOrNull(row.reason),
    head_excerpt: stringOrNull(row.head_excerpt),
    tail_excerpt: stringOrNull(row.tail_excerpt),
    scene_text: stringOrNull(row.scene_text),
    scene_text_sha256: stringOrNull(row.scene_text_sha256),
    flags: Array.isArray(row.flags) ? row.flags.map((f) => String(f)) : [],
    boundary_debug: row.boundary_debug && typeof row.boundary_debug === "object" ? asObject(row.boundary_debug) : null,
  };
}

function parseChapter(row: Record<string, unknown>): SplitDraftData["chapters"][number] {
  const chapterScenesRaw = Array.isArray(row.scenes) ? row.scenes : [];
  const chapterScenes: SplitDraftScene[] = chapterScenesRaw
    .filter((x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x))
    .map(parseSplitScene)
    .filter((scene) => scene.idx > 0 && scene.end > scene.start);

  return {
    task_id: numberOrZero(row.task_id),
    seq_no: numberOrZero(row.seq_no),
    status: stringOrEmpty(row.status),
    source_path: stringOrNull(row.source_path),
    source_doc_id: stringOrNull(row.source_doc_id),
    source_doc_sha256: stringOrNull(row.source_doc_sha256),
    source_type: stringOrNull(row.source_type),
    source_role: stringOrNull(row.source_role),
    chapter_id: stringOrNull(row.chapter_id),
    chapter_title: stringOrNull(row.chapter_title),
    text_basis: typeof row.text_basis === "string" ? row.text_basis : "unknown",
    repair_report: recordOrEmpty(row.repair_report),
    autofix_report: recordOrEmpty(row.autofix_report),
    quality_report: recordOrEmpty(row.quality_report),
    previous_quality_report: recordOrEmpty(row.previous_quality_report),
    quality_delta: recordOrEmpty(row.quality_delta),
    hard_fail: Boolean(row.hard_fail),
    safe_to_approve: Boolean(row.safe_to_approve),
    rerun_reason: stringOrEmpty(row.rerun_reason),
    decision_reason_codes: Array.isArray(row.decision_reason_codes)
      ? row.decision_reason_codes.map((x) => String(x)).filter((x) => x.trim().length > 0)
      : [],
    strategy_selected: stringOrNull(row.strategy_selected),
    profile_scope: stringOrNull(row.profile_scope),
    strategy_attempts: parseStrategyAttempts(row.strategy_attempts),
    llm_calls_used: numberOrNull(row.llm_calls_used),
    llm_calls_budget: numberOrNull(row.llm_calls_budget),
    strategy_profile: recordOrEmpty(row.strategy_profile),
    feedback_summary: recordOrEmpty(row.feedback_summary),
    feedback_penalties: recordOrEmpty(row.feedback_penalties),
    issue_hints: recordOrEmpty(row.issue_hints),
    issue_hints_explicit: recordOrEmpty(row.issue_hints_explicit),
    issue_hints_inferred: recordOrEmpty(row.issue_hints_inferred),
    boundary_type_hints: recordOrEmpty(row.boundary_type_hints),
    strategy_bias: recordOrEmpty(row.strategy_bias),
    window_rerun_report: recordOrEmpty(row.window_rerun_report),
    supervisor_decision: normalizeSupervisorDecision(row.supervisor_decision),
    supervisor_retry_used: Boolean(row.supervisor_retry_used),
    prompt_version_id: numberOrNull(row.prompt_version_id),
    hydration_output_hash: stringOrNull(row.hydration_output_hash),
    hydration_output_text: stringOrNull(row.hydration_output_text),
    prompt_trace_phase: stringOrNull(row.prompt_trace_phase),
    prompt_trace_status: stringOrNull(row.prompt_trace_status),
    prompt_trace_source: stringOrNull(row.prompt_trace_source),
    prompt_trace_created_at: stringOrNull(row.prompt_trace_created_at),
    prompt_unavailable_reason: stringOrNull(row.prompt_unavailable_reason),
    chunk_prompt_trace: Array.isArray(row.chunk_prompt_trace)
      ? row.chunk_prompt_trace.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x)).map(asObject)
      : [],
    boundary_evidence: Array.isArray(row.boundary_evidence)
      ? row.boundary_evidence.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x)).map(asObject)
      : [],
    context_window: recordOrEmpty(row.context_window),
    context_hash: stringOrNull(row.context_hash),
    context_pack_version: stringOrNull(row.context_pack_version),
    preference_rule_version: stringOrNull(row.preference_rule_version),
    decision_evidence: recordOrEmpty(row.decision_evidence),
    split_mode: row.split_mode === "auto" ? "auto" : "manual",
    split_controls: recordOrEmpty(row.split_controls),
    split_runtime: (() => {
      const runtime = recordOrEmpty(row.split_runtime);
      const phaseTiming = recordOrEmpty(runtime.phase_timing);
      const phaseBudget = recordOrEmpty(runtime.phase_budget);
      const repairSummary = recordOrEmpty(runtime.repair_summary);
      return {
        ...runtime,
        phase_timing: {
          outline_sec: Number(phaseTiming.outline_sec ?? 0),
          primary_sec: Number(phaseTiming.primary_sec ?? 0),
          recursion_sec: Number(phaseTiming.recursion_sec ?? 0),
          repair_sec: Number(phaseTiming.repair_sec ?? 0),
          total_sec: Number(phaseTiming.total_sec ?? 0),
        },
        phase_budget: {
          outline_budget_sec: Number(phaseBudget.outline_budget_sec ?? 0),
          primary_budget_sec: Number(phaseBudget.primary_budget_sec ?? 0),
          repair_budget_sec: Number(phaseBudget.repair_budget_sec ?? 0),
          total_budget_sec: Number(phaseBudget.total_budget_sec ?? 0),
        },
        phase_stop_reason: typeof runtime.phase_stop_reason === "string" ? runtime.phase_stop_reason : null,
        budget_profile: typeof runtime.budget_profile === "string" ? runtime.budget_profile : null,
        retry_profile_used: typeof runtime.retry_profile_used === "string" ? runtime.retry_profile_used : null,
        root_cause_class: typeof runtime.root_cause_class === "string" ? runtime.root_cause_class : null,
        root_cause_confidence: Number.isFinite(Number(runtime.root_cause_confidence)) ? Number(runtime.root_cause_confidence) : null,
        recommended_action_code: typeof runtime.recommended_action_code === "string" ? runtime.recommended_action_code : null,
        runbook_hint_code: typeof runtime.runbook_hint_code === "string" ? runtime.runbook_hint_code : null,
        pipeline_version:
          typeof runtime.pipeline_version === "string" && runtime.pipeline_version.trim().length > 0
            ? runtime.pipeline_version
            : null,
        degrade_path_taken: Boolean(runtime.degrade_path_taken),
        degrade_reason_code: typeof runtime.degrade_reason_code === "string" ? runtime.degrade_reason_code : null,
        deterministic_fallback_applied: Boolean(runtime.deterministic_fallback_applied),
        deterministic_fallback_notes: Array.isArray(runtime.deterministic_fallback_notes)
          ? runtime.deterministic_fallback_notes.map((x) => String(x)).filter((x) => x.trim().length > 0)
          : [],
        repair_summary: {
          attempted: Boolean(repairSummary.attempted),
          repaired_chunks: Number(repairSummary.repaired_chunks ?? 0),
          remaining_violations: Number(repairSummary.remaining_violations ?? 0),
        },
        duration_sec: Number(runtime.duration_sec ?? 0),
      };
    })(),
    analysis_chunk_artifact: (() => {
      const artifact = recordOrEmpty(row.analysis_chunk_artifact);
      const diagnostics = recordOrEmpty(artifact.diagnostics);
      return {
        ...artifact,
        status: typeof artifact.status === "string" ? artifact.status : null,
        diagnostics: {
          oversized_count: Number(diagnostics.oversized_count ?? 0),
          max_chunk_chars_observed: Number(diagnostics.max_chunk_chars_observed ?? 0),
          repair_attempted: Boolean(diagnostics.repair_attempted),
          repair_exhausted: Boolean(diagnostics.repair_exhausted),
        },
      };
    })(),
    analysis_chunk_diagnostics: (() => {
      const diagnostics = recordOrEmpty(row.analysis_chunk_diagnostics);
      return {
        oversized_count: Number(diagnostics.oversized_count ?? 0),
        max_chunk_chars_observed: Number(diagnostics.max_chunk_chars_observed ?? 0),
        repair_attempted: Boolean(diagnostics.repair_attempted),
        repair_exhausted: Boolean(diagnostics.repair_exhausted),
      };
    })(),
    operational_state:
      row.operational_state === "READY_FOR_ANALYSIS"
        ? "READY_FOR_ANALYSIS"
        : row.operational_state === "NEEDS_RETRY"
          ? "NEEDS_RETRY"
          : null,
    operational_state_reason: stringOrNull(row.operational_state_reason),
    chapter_text_stats: parseChapterTextStats(row.chapter_text_stats),
    scenes: chapterScenes,
    is_stable: Boolean(row.is_stable),
    version: numberOrNull(row.version),
  };
}

export function parseSplitDraftResponse(json: Record<string, unknown>): SplitDraftData {
  const splitDraft = asObject(json.split_draft);
  const scenesRaw = Array.isArray(splitDraft.scenes) ? splitDraft.scenes : [];
  const scenes = scenesRaw
    .filter((x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x))
    .map(parseSplitScene)
    .filter((scene) => scene.idx > 0 && scene.end > scene.start);

  const chaptersRaw = Array.isArray(splitDraft.chapters) ? splitDraft.chapters : [];
  const chapters = chaptersRaw
    .filter((x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x))
    .map(parseChapter)
    .filter((chapter) => chapter.task_id > 0);

  return {
    status: (json.status as IngestJob["status"]) ?? "SPLIT_DRAFT",
    feedback_health:
      splitDraft.feedback_health && typeof splitDraft.feedback_health === "object"
        ? {
          total_feedback: Number((splitDraft.feedback_health as Record<string, unknown>).total_feedback ?? 0),
          valid_feedback: Number((splitDraft.feedback_health as Record<string, unknown>).valid_feedback ?? 0),
          mismatch_feedback: Number((splitDraft.feedback_health as Record<string, unknown>).mismatch_feedback ?? 0),
          data_coverage_pct: Number((splitDraft.feedback_health as Record<string, unknown>).data_coverage_pct ?? 0),
          mode_changed_feedback: Number((splitDraft.feedback_health as Record<string, unknown>).mode_changed_feedback ?? 0),
        }
        : undefined,
    scenes,
    chapter_text_stats:
      splitDraft.chapter_text_stats && typeof splitDraft.chapter_text_stats === "object"
        ? (splitDraft.chapter_text_stats as { chars?: number })
        : {},
    chapters,
    is_mature: Boolean(json.is_mature),
  };
}

export function parseSourceDocItems(json: Record<string, unknown>): SourceDocItem[] {
  const itemsRaw = Array.isArray(json.items) ? json.items : [];
  return itemsRaw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x))
    .map((x) => ({
      source_doc_id: stringOrEmpty(x.source_doc_id),
      chapter_id: typeof x.chapter_id === "string" && x.chapter_id.trim() ? x.chapter_id : null,
      chapter_no: numberOrNull(x.chapter_no),
      source_path: stringOrNull(x.source_path),
      source_type: stringOrNull(x.source_type),
      source_role: stringOrNull(x.source_role),
      char_len: numberOrZero(x.char_len),
      is_stable: Boolean(x.is_stable),
      version: numberOrZero(x.version),
      created_at: stringOrEmpty(x.created_at),
    }))
    .filter((x) => x.source_doc_id.length > 0);
}

export function parseExistingChapters(json: Record<string, unknown>): ExistingChapter[] {
  const itemsRaw = Array.isArray(json.items) ? json.items : [];
  return itemsRaw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x))
    .map((x) => ({
      chapter_id: stringOrEmpty(x.chapter_id),
      scene_count: numberOrZero(x.scene_count),
      is_stable: Boolean(x.is_stable),
      version: numberOrNull(x.version),
    }))
    .filter((x) => Boolean(x.chapter_id));
}

export function createDefaultFeedbackDraft(): FeedbackDraft {
  return {
    open: true,
    tokenKey: "UNCLASSIFIED",
    locationRef: "",
    note: "",
    sceneIdxLeft: null,
    sceneIdxRight: null,
    charOffset: null,
    aiResponse: null,
  };
}

export type TimelineEventSource = "backend";

export type TimelineEventBase = {
  event_id: string;
  source: TimelineEventSource;
  story_id: number | null;
  chapter_id: string | null;
  job_id?: number | null;
};

export type TimelineWorkflowStepStatus = "complete" | "active" | "pending" | "failed";

export type WorkflowProgressTimelineEvent = TimelineEventBase & {
  type: "workflow_progress";
  workflow_name: string;
  status: "running" | "complete" | "failed" | "cancelled";
  current_step: number;
  total_steps: number;
  current_step_label: string;
  steps: Array<{ label: string; status: TimelineWorkflowStepStatus }>;
};

export type ArtifactPreviewTimelineEvent = TimelineEventBase & {
  type: "artifact_preview";
  artifact_id: string;
  artifact_type: "plan" | "draft" | "analysis" | "review" | "research";
  title: string;
  status: "draft" | "needs_approval" | "approved" | "failed" | "superseded";
  word_count: number | null;
  beat_count: number | null;
  preview_lines: string[];
  actions: string[];
};

export type ApprovalGateTimelineEvent = TimelineEventBase & {
  type: "approval_gate";
  gate_type: "import_to_editor" | "promote_to_memory" | "publish_chapter" | "approve_plan";
  description: string;
  actions: string[];
};

export type FailureRecoveryTimelineEvent = TimelineEventBase & {
  type: "failure_recovery";
  workflow_name: string;
  stopped_at_step: string;
  plain_reason: string;
  draft_preserved: boolean;
  actions: string[];
  detail_log: string[];
  details: { reason_codes: string[] };
};

export type ContextDigestTimelineEvent = TimelineEventBase & {
  type: "context_digest";
  title: string;
  included: string[];
  missing: string[];
  degraded: string[];
  conflicts: string[];
};

export type TimelineEvent =
  | WorkflowProgressTimelineEvent
  | ArtifactPreviewTimelineEvent
  | ApprovalGateTimelineEvent
  | FailureRecoveryTimelineEvent
  | ContextDigestTimelineEvent;

type ChapterWritingTask = {
  task_type: string;
  status: string;
  error?: string | null;
};

type ChapterWritingTimelineArgs = {
  storyId: number | null;
  chapterId: string;
  jobId: number | null;
  jobStatus: string;
  doneTasks: number;
  totalTasks: number;
  latestTaskType: string | null;
  latestTaskStatus: string | null;
  latestTaskError: string | null;
  narrativeTasks: ChapterWritingTask[];
  proseReady: boolean;
  wordCount: number;
  planJson: Record<string, unknown> | null;
  memoryRuntimeV5: Record<string, unknown>;
  finalReviewReady: boolean;
  blockedByConflictReview: boolean;
  blockedByCanonConflict: boolean;
  blockingReason: string | null;
};

const reasonMessages: Record<string, string> = {
  INTENT_MISSING: "I don't know what this chapter needs to accomplish yet.",
  MISSING_CHAPTER_INTENT: "I don't know what this chapter needs to accomplish yet.",
  CONTINUITY_REQUIRED_BUT_MISSING: "I don't have a safe handoff from the previous chapter.",
  CURRENT_STATE_HARD_CONFLICT: "There's a conflict in the current character or event state that needs review.",
  STYLE_ANCHOR_MISSING: "I can continue, but I don't have a clear voice anchor for this story yet.",
  CHARACTER_COUNT_LOW: "This chapter has very few active characters, which may limit the scene.",
  NO_STORY_SELECTED: "No story is selected. I need to know which story we're working on.",
  NO_CHAPTER_SELECTED: "No chapter is selected. Which chapter are we working on?",
  PLAN_INVALID_NO_ALLOWED_CHARACTERS: "I don't have enough character data for this chapter's plan.",
  MEMORY_SNAPSHOT_STALE: "The memory snapshot is out of date. I may miss recent story developments.",
  SOURCE_CHAPTER_MISSING: "There's no source material to ground this chapter in.",
  BLOCKED_BY_CONFLICT_REVIEW: "This needs conflict review before writing can continue.",
  BLOCKED_BY_CANON_CONFLICT: "This plan conflicts with existing canon and needs review before writing can continue.",
  JOB_NOT_FOUND: "I couldn't find the writing run for this chapter.",
  WRITING_STATUS_FAILED: "I couldn't read the writing run status.",
};

function eventId(parts: Array<string | number | null | undefined>): string {
  return parts.filter((part) => part !== null && part !== undefined && String(part).length > 0).join(":");
}

function cleanReasonCode(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  const direct = value.toUpperCase();
  if (/^[A-Z0-9_]+$/.test(direct)) return direct;
  const match = direct.match(/[A-Z0-9]+(?:_[A-Z0-9]+)+/);
  return match ? match[0] : null;
}

export function plainTimelineReason(raw: string | null | undefined, fallback: string): string {
  const code = cleanReasonCode(raw);
  if (code && reasonMessages[code]) return reasonMessages[code];
  const text = String(raw || "").trim();
  if (!text || /^[A-Z0-9_]+$/.test(text)) return fallback;
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function normalizeJobStatus(status: string): WorkflowProgressTimelineEvent["status"] {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "DONE" || normalized === "COMPLETE" || normalized === "COMPLETED") return "complete";
  if (normalized === "FAILED" || normalized === "ERROR") return "failed";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "cancelled";
  return "running";
}

function taskLabel(taskType: string | null): string {
  const type = String(taskType || "").toUpperCase();
  if (type === "CHAPTER_WRITE_V3") return "Write chapter draft";
  if (type === "CHAPTER_LEDGER_EXTRACT") return "Extract chapter ledger";
  if (type === "MEMORY_ROLLUP_V3") return "Update memory rollup";
  if (type === "NARRATIVE_START") return "Start narrative run";
  if (type === "NARRATIVE_STYLIST") return "Apply story voice";
  if (type === "NARRATIVE_CRITIC") return "Review draft quality";
  if (type === "NARRATIVE_REFINE") return "Refine draft";
  if (type === "NARRATIVE_FINALIZE") return "Finalize draft artifact";
  return type ? type.toLowerCase().replaceAll("_", " ") : "Read workflow state";
}

function taskStatus(status: string): TimelineWorkflowStepStatus {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "DONE" || normalized === "COMPLETE" || normalized === "COMPLETED") return "complete";
  if (normalized === "FAILED" || normalized === "ERROR") return "failed";
  if (normalized === "RUNNING" || normalized === "READY") return "active";
  return "pending";
}

export function buildWorkflowProgressEvent(args: {
  storyId: number | null;
  chapterId: string | null;
  jobId?: number | null;
  workflowName: string;
  jobStatus: string;
  currentStepLabel: string;
  steps: Array<{ label: string; status: TimelineWorkflowStepStatus }>;
}): WorkflowProgressTimelineEvent {
  const totalSteps = Math.max(args.steps.length, 1);
  const activeIndex = args.steps.findIndex((step) => step.status === "active" || step.status === "failed");
  const currentStep = activeIndex >= 0 ? activeIndex + 1 : totalSteps;
  return {
    event_id: eventId(["workflow", args.jobId, args.chapterId, args.workflowName]),
    source: "backend",
    story_id: args.storyId,
    chapter_id: args.chapterId,
    job_id: args.jobId ?? null,
    type: "workflow_progress",
    workflow_name: args.workflowName,
    status: normalizeJobStatus(args.jobStatus),
    current_step: currentStep,
    total_steps: totalSteps,
    current_step_label: args.currentStepLabel,
    steps: args.steps.length > 0 ? args.steps : [{ label: args.currentStepLabel, status: "active" }],
  };
}

export function buildFailureRecoveryEvent(args: {
  storyId: number | null;
  chapterId: string | null;
  jobId?: number | null;
  workflowName: string;
  stoppedAtStep: string;
  reason: string | null;
  fallbackReason: string;
  draftPreserved: boolean;
  detailLog?: string[];
}): FailureRecoveryTimelineEvent {
  const code = cleanReasonCode(args.reason);
  return {
    event_id: eventId(["failure", args.jobId, args.chapterId, args.stoppedAtStep]),
    source: "backend",
    story_id: args.storyId,
    chapter_id: args.chapterId,
    job_id: args.jobId ?? null,
    type: "failure_recovery",
    workflow_name: args.workflowName,
    stopped_at_step: args.stoppedAtStep,
    plain_reason: plainTimelineReason(args.reason, args.fallbackReason),
    draft_preserved: args.draftPreserved,
    actions: ["retry", "open_details", args.draftPreserved ? "keep_draft" : "cancel_run"],
    detail_log: args.detailLog ?? [],
    details: { reason_codes: code ? [code] : [] },
  };
}

export function buildArtifactPreviewEvent(args: {
  storyId: number | null;
  chapterId: string | null;
  jobId?: number | null;
  artifactId: string;
  artifactType: ArtifactPreviewTimelineEvent["artifact_type"];
  title: string;
  status: ArtifactPreviewTimelineEvent["status"];
  wordCount?: number | null;
  beatCount?: number | null;
  previewLines: string[];
  actions: string[];
}): ArtifactPreviewTimelineEvent {
  return {
    event_id: eventId(["artifact", args.artifactType, args.artifactId]),
    source: "backend",
    story_id: args.storyId,
    chapter_id: args.chapterId,
    job_id: args.jobId ?? null,
    type: "artifact_preview",
    artifact_id: args.artifactId,
    artifact_type: args.artifactType,
    title: args.title,
    status: args.status,
    word_count: args.wordCount ?? null,
    beat_count: args.beatCount ?? null,
    preview_lines: args.previewLines.slice(0, 3),
    actions: args.actions,
  };
}

export function buildApprovalGateEvent(args: {
  storyId: number | null;
  chapterId: string | null;
  jobId?: number | null;
  gateType: ApprovalGateTimelineEvent["gate_type"];
  description: string;
  actions: string[];
}): ApprovalGateTimelineEvent {
  return {
    event_id: eventId(["approval", args.gateType, args.jobId, args.chapterId]),
    source: "backend",
    story_id: args.storyId,
    chapter_id: args.chapterId,
    job_id: args.jobId ?? null,
    type: "approval_gate",
    gate_type: args.gateType,
    description: args.description,
    actions: args.actions,
  };
}

export function buildContextDigestEvent(args: {
  storyId: number | null;
  chapterId: string | null;
  title: string;
  included: string[];
  missing: string[];
  degraded: string[];
  conflicts: string[];
}): ContextDigestTimelineEvent {
  return {
    event_id: eventId(["context", args.storyId, args.chapterId]),
    source: "backend",
    story_id: args.storyId,
    chapter_id: args.chapterId,
    type: "context_digest",
    title: args.title,
    included: args.included,
    missing: args.missing,
    degraded: args.degraded,
    conflicts: args.conflicts,
  };
}

function beatCount(planJson: Record<string, unknown> | null): number | null {
  const beats = planJson?.beats;
  return Array.isArray(beats) ? beats.length : null;
}

function contextDigestFromMemory(args: ChapterWritingTimelineArgs): ContextDigestTimelineEvent {
  const degradedReasons = Array.isArray(args.memoryRuntimeV5.degraded_reasons)
    ? args.memoryRuntimeV5.degraded_reasons.map((reason) => plainTimelineReason(String(reason), "Context is degraded."))
    : [];
  const hasEvidenceRefs = Boolean(args.memoryRuntimeV5.evidence_refs && typeof args.memoryRuntimeV5.evidence_refs === "object");
  return buildContextDigestEvent({
    storyId: args.storyId,
    chapterId: args.chapterId,
    title: `Chapter ${args.chapterId} context`,
    included: [
      args.planJson ? "Chapter plan" : "",
      hasEvidenceRefs ? "Evidence references" : "",
      args.proseReady ? "Draft prose" : "",
    ].filter(Boolean),
    missing: [
      args.planJson ? "" : "Chapter plan",
      hasEvidenceRefs ? "" : "Evidence references",
      args.proseReady ? "" : "Draft prose",
    ].filter(Boolean),
    degraded: degradedReasons,
    conflicts: [
      args.blockedByCanonConflict ? "Canon conflict requires review." : "",
      args.blockedByConflictReview ? "Conflict review is required." : "",
    ].filter(Boolean),
  });
}

function planPreviewFromArgs(args: ChapterWritingTimelineArgs): ArtifactPreviewTimelineEvent | null {
  if (!args.planJson) return null;
  return buildArtifactPreviewEvent({
    storyId: args.storyId,
    chapterId: args.chapterId,
    jobId: args.jobId,
    artifactId: `plan:${args.chapterId}`,
    artifactType: "plan",
    title: `Chapter ${args.chapterId} Plan`,
    status: args.blockedByCanonConflict || args.blockedByConflictReview ? "needs_approval" : "draft",
    beatCount: beatCount(args.planJson),
    previewLines: ["Plan artifact is available for review."],
    actions: ["open_full", "edit", "regenerate"],
  });
}

function draftPreviewFromArgs(args: ChapterWritingTimelineArgs): ArtifactPreviewTimelineEvent | null {
  if (!args.proseReady) return null;
  return buildArtifactPreviewEvent({
    storyId: args.storyId,
    chapterId: args.chapterId,
    jobId: args.jobId,
    artifactId: `draft:${args.chapterId}`,
    artifactType: "draft",
    title: `Chapter ${args.chapterId} Draft`,
    status: "draft",
    wordCount: args.wordCount,
    previewLines: ["Draft created. Open the document editor to review the prose."],
    actions: ["open_draft", "review_continuity", "edit_in_document"],
  });
}

function importGateFromArgs(args: ChapterWritingTimelineArgs): ApprovalGateTimelineEvent | null {
  if (!args.proseReady) return null;
  return buildApprovalGateEvent({
    storyId: args.storyId,
    chapterId: args.chapterId,
    jobId: args.jobId,
    gateType: "import_to_editor",
    description: "This draft can be moved into the editor, but it is not approved story content yet.",
    actions: args.finalReviewReady ? ["import_to_editor", "keep_as_draft", "run_continuity_check"] : ["run_continuity_check", "keep_as_draft"],
  });
}

function blockedFailureFromArgs(args: ChapterWritingTimelineArgs): FailureRecoveryTimelineEvent | null {
  if (!args.blockedByCanonConflict && !args.blockedByConflictReview) return null;
  return buildFailureRecoveryEvent({
    storyId: args.storyId,
    chapterId: args.chapterId,
    jobId: args.jobId,
    workflowName: "Chapter Write",
    stoppedAtStep: "Planning",
    reason: args.blockingReason || (args.blockedByCanonConflict ? "BLOCKED_BY_CANON_CONFLICT" : "BLOCKED_BY_CONFLICT_REVIEW"),
    fallbackReason: "The chapter plan needs review before writing can continue.",
    draftPreserved: args.proseReady,
    detailLog: args.blockingReason ? [args.blockingReason] : [],
  });
}

function taskFailureFromArgs(args: ChapterWritingTimelineArgs): FailureRecoveryTimelineEvent | null {
  if (normalizeJobStatus(args.jobStatus) !== "failed" && args.latestTaskStatus?.toUpperCase() !== "FAILED") return null;
  return buildFailureRecoveryEvent({
    storyId: args.storyId,
    chapterId: args.chapterId,
    jobId: args.jobId,
    workflowName: "Chapter Write",
    stoppedAtStep: taskLabel(args.latestTaskType),
    reason: args.latestTaskError,
    fallbackReason: "The writing run stopped before completion.",
    draftPreserved: args.proseReady,
    detailLog: args.latestTaskError ? [args.latestTaskError] : [],
  });
}

export function buildChapterWritingTimelineEvents(args: ChapterWritingTimelineArgs): TimelineEvent[] {
  const taskSteps = args.narrativeTasks.map((task) => ({
    label: taskLabel(task.task_type),
    status: taskStatus(task.status),
  }));
  const currentStepLabel = taskLabel(args.latestTaskType) || "Read workflow state";
  const events: TimelineEvent[] = [
    buildWorkflowProgressEvent({
      storyId: args.storyId,
      chapterId: args.chapterId,
      jobId: args.jobId,
      workflowName: "Chapter Write",
      jobStatus: args.jobStatus,
      currentStepLabel,
      steps: taskSteps.length > 0 ? taskSteps : [{ label: currentStepLabel, status: normalizeJobStatus(args.jobStatus) === "complete" ? "complete" : "active" }],
    }),
  ];
  const optionalEvents: Array<TimelineEvent | null> = [planPreviewFromArgs(args), draftPreviewFromArgs(args), importGateFromArgs(args), blockedFailureFromArgs(args), taskFailureFromArgs(args)];
  events.push(...optionalEvents.filter((event): event is TimelineEvent => Boolean(event)), contextDigestFromMemory(args));
  return events;
}

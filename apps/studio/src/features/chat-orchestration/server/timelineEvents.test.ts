import {
  buildApprovalGateEvent,
  buildArtifactPreviewEvent,
  buildChapterWritingTimelineEvents,
  buildFailureRecoveryEvent,
  buildWorkflowProgressEvent,
  plainTimelineReason,
  type TimelineEvent,
} from "@/features/chat-orchestration/server/timelineEvents";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runTimelineEventDtoSelfTest(): TimelineEvent[] {
  const running = buildWorkflowProgressEvent({
    storyId: 1,
    chapterId: "ch01",
    jobId: 10,
    workflowName: "Chapter Write",
    jobStatus: "RUNNING",
    currentStepLabel: "Write chapter draft",
    steps: [{ label: "Write chapter draft", status: "active" }],
  });
  assert(running.type === "workflow_progress" && running.source === "backend", "workflow progress must be backend sourced");

  const artifact = buildArtifactPreviewEvent({
    storyId: 1,
    chapterId: "ch01",
    jobId: 10,
    artifactId: "draft:ch01",
    artifactType: "draft",
    title: "Chapter ch01 Draft",
    status: "draft",
    wordCount: 1200,
    previewLines: ["Draft created"],
    actions: ["open_draft"],
  });
  assert(artifact.type === "artifact_preview" && artifact.word_count === 1200, "artifact preview must carry draft metadata");

  const approval = buildApprovalGateEvent({
    storyId: 1,
    chapterId: "ch01",
    jobId: 10,
    gateType: "import_to_editor",
    description: "Needs explicit user action.",
    actions: ["import_to_editor", "keep_as_draft"],
  });
  assert(approval.type === "approval_gate" && approval.actions.length === 2, "approval gate must expose user actions");

  const failure = buildFailureRecoveryEvent({
    storyId: 1,
    chapterId: "ch01",
    jobId: 10,
    workflowName: "Chapter Write",
    stoppedAtStep: "Planning",
    reason: "PLAN_INVALID_NO_ALLOWED_CHARACTERS",
    fallbackReason: "The writing run stopped.",
    draftPreserved: false,
  });
  assert(failure.plain_reason.includes("character data"), "failure recovery must translate raw reason codes");

  const chapterEvents = buildChapterWritingTimelineEvents({
    storyId: 1,
    chapterId: "ch01",
    jobId: 10,
    jobStatus: "DONE",
    doneTasks: 3,
    totalTasks: 3,
    latestTaskType: "CHAPTER_WRITE_V3",
    latestTaskStatus: "DONE",
    latestTaskError: null,
    narrativeTasks: [{ task_type: "CHAPTER_WRITE_V3", status: "DONE" }],
    proseReady: true,
    wordCount: 1400,
    planJson: { beats: [{ title: "Opening" }] },
    memoryRuntimeV5: { evidence_refs: { canon: ["c1"] } },
    finalReviewReady: true,
    blockedByConflictReview: false,
    blockedByCanonConflict: false,
    blockingReason: null,
  });
  assert(chapterEvents.some((event) => event.type === "context_digest"), "chapter events must include context digest");
  assert(plainTimelineReason("SOURCE_CHAPTER_MISSING", "fallback").includes("source material"), "known reason codes must map to plain language");
  return [running, artifact, approval, failure, ...chapterEvents];
}

runTimelineEventDtoSelfTest();

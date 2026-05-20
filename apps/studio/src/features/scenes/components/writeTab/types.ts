export type SceneItem = {
  id: number;
  chapter_id: string;
  idx: number;
  title: string | null;
  status: string;
  workunit_id: string | null;
};

export type CurrentVersion = {
  id: number;
  version_no: number;
  kind: string;
  summary: string | null;
  text_content: string | null;
};

export type ChapterSceneItem = {
  id: number;
  idx: number;
  title: string | null;
  status: string;
  text_content: string;
};

export type DockTab = "actions" | "context" | "assist" | "report";

export type ContextReadiness = "proceed" | "degraded" | "blocked";

export type ContextReadinessLabel = "Context Clean" | "Context Partial" | "Context Blocked";

export type AssistantReadinessStatus = "ready" | "degraded" | "blocked";

export type AssistantReadinessItemState = "ok" | "missing" | "partial";

export type AssistantReadinessItem = {
  label: string;
  state: AssistantReadinessItemState;
};

export type AssistantAvailability = {
  has_source_chapters: boolean;
  has_active_characters: boolean;
  has_memory_snapshot: boolean;
  has_style_profile: boolean;
  has_chapter_intent: boolean;
  has_immediate_continuity: boolean;
};

export type RecoveryIntent =
  | "browse_stories"
  | "start_story"
  | "describe_goal"
  | "add_context"
  | "analyze_source"
  | "inspect_context"
  | "switch_story"
  | "continue_degraded";

export type RecoveryChip = {
  label: string;
  intent: RecoveryIntent;
};

export type AssistantReadinessContext = {
  storyTitle: string | null;
  storySelected: boolean;
  chapterId: string | null;
  chapterTitle: string | null;
  readiness: ContextReadiness;
  availability: AssistantAvailability;
};

export type AssistantReadinessBriefing = {
  status: AssistantReadinessStatus;
  title: string;
  summary: string;
  items: AssistantReadinessItem[];
  chips: RecoveryChip[];
  canWrite: boolean;
  blockedWriteReason: string | null;
};

export type ComposerState = "idle" | "typing" | "slash_command_menu" | "command_form_active";

export type StudioChatIntent =
  | "CHAT"
  | "WRITE"
  | "PLAN"
  | "ANALYZE"
  | "RESEARCH"
  | "SWITCH_STORY"
  | "ADD_CONTEXT"
  | "BRAINSTORM"
  | "REVIEW"
  | "SPLIT"
  | "INSPECT"
  | "APPROVE"
  | "REPO_RUN_HELP"
  | "REPO_TEST_HELP"
  | "BRAINSTORM_CLARIFICATION"
  | "BRAINSTORM_EXPAND_CHOICE"
  | "BRAINSTORM_SCENE_GOAL"
  | "BRAINSTORM_CHARACTER_CONTRADICTION"
  | "BRAINSTORM_CHAPTER_OPENING"
  | "QUOTED_PREVIOUS_RESPONSE_QUESTION"
  | "AMBIGUOUS";

export type ChatContextMiniBarPayload = {
  storyTitle: string;
  chapterLabel: string;
  status: AssistantReadinessStatus;
};

export type InlineChoiceChip = RecoveryChip & {
  action: RecoveryIntent;
};

export type ChoiceGroupChoice = {
  id: string;
  label: string;
  description?: string;
  value: string;
  selected?: boolean;
  disabled?: boolean;
};

export type ChoiceGroupBlock = {
  type: "choice_group";
  id: string;
  source: "assistant";
  prompt: string;
  selectionMode: "single" | "multiple";
  choices: ChoiceGroupChoice[];
  submitBehavior: "immediate" | "requires_confirm";
  metadata?: {
    intent?: StudioChatIntent;
    groupKind?: "brainstorm_angle" | "brainstorm_followup" | "context_recovery";
    seed?: string | null;
    [key: string]: unknown;
  };
};

export type WorkflowStepStatus = "complete" | "active" | "pending" | "failed";

export type WriteInspectorMode = "progress" | "context" | "artifacts" | "memory";

export type ChatScope = "chapter" | "story";

export type WorkspaceChatMode = {
  scope: ChatScope;
  conversationWorkspace: "write_assistant" | "story";
  chapterId: string | null;
};

export type ArtifactType = "memory" | "analysis" | "source" | "generated" | "review" | "progress";

export type ArtifactStatus = "draft" | "staged" | "pending" | "approved" | "rejected" | "applied" | "published" | "stale";

export type ArtifactCardAction = {
  id: string;
  label: string;
  href?: string;
  disabled?: boolean;
};

export type MemorySnapshot = {
  title: string;
  scope: ChatScope;
  chapterId: string | null;
  characters: string[];
  arcs: string[];
  tags: string[];
  styleNotes: string[];
  missing: string[];
  conflicts: string[];
};

export type AnalysisSnapshot = {
  title: string;
  scope: ChatScope;
  chapterId: string | null;
  verdict: "ready" | "needs-review" | "blocked" | "stale";
  freshness: "fresh" | "stale" | "missing";
  updatedAt: string | null;
  flags: string[];
  continuityFindings: string[];
  characterFindings: string[];
  plotFindings: string[];
};

export type TimelineArtifactCard = {
  type: ArtifactType;
  status: ArtifactStatus;
  title: string;
  wordCount?: number | null;
  actions: ArtifactCardAction[];
};

export type ReviewArtifactStateTransition = {
  from: ArtifactStatus;
  to: ArtifactStatus;
  action: "stage" | "submit" | "approve" | "reject" | "apply" | "publish";
};

export const REVIEW_ARTIFACT_STATE_TRANSITIONS: ReviewArtifactStateTransition[] = [
  { from: "draft", to: "staged", action: "stage" },
  { from: "staged", to: "pending", action: "submit" },
  { from: "pending", to: "approved", action: "approve" },
  { from: "pending", to: "rejected", action: "reject" },
  { from: "approved", to: "applied", action: "apply" },
  { from: "applied", to: "staged", action: "stage" },
  { from: "applied", to: "pending", action: "submit" },
  { from: "applied", to: "published", action: "publish" },
];

export type TimelineActionLink = {
  label: string;
  href: string;
};

export type WorkflowProgressBlock = {
  type: "workflow_progress";
  source: "backend" | "assistant";
  event_id?: string;
  story_id?: number | null;
  chapter_id?: string | null;
  job_id?: number | null;
  workflow_name: string;
  status: "running" | "complete" | "failed" | "cancelled";
  current_step: number;
  total_steps: number;
  current_step_label: string;
  steps: Array<{
    label: string;
    status: WorkflowStepStatus;
  }>;
  action_links?: TimelineActionLink[];
};

export type PipelineSnapshot = {
  title: string;
  jobId: number | null;
  status: WorkflowProgressBlock["status"];
  mode: string;
  updatedAt: string | null;
  timing: string[];
  logs: string[];
  block: WorkflowProgressBlock & { id: string };
};

export type ArtifactPreviewBlock = {
  type: "artifact_preview";
  source: "backend" | "assistant";
  event_id?: string;
  story_id?: number | null;
  chapter_id?: string | null;
  job_id?: number | null;
  artifact_id: string;
  artifact_type: "plan" | "draft" | "analysis" | "review" | "research" | "memory" | "source" | "progress";
  title: string;
  status: "draft" | "needs_approval" | "approved" | "failed" | "superseded";
  description?: string;
  word_count: number | null;
  beat_count: number | null;
  preview_lines: string[];
  actions: string[];
  action_links?: TimelineActionLink[];
};

export type ApprovalGateBlock = {
  type: "approval_gate";
  source: "backend" | "assistant";
  event_id?: string;
  story_id?: number | null;
  chapter_id?: string | null;
  job_id?: number | null;
  gate_type: "import_to_editor" | "promote_to_memory" | "publish_chapter" | "approve_plan";
  description: string;
  actions: string[];
};

export type FailureRecoveryBlock = {
  type: "failure_recovery";
  source: "backend" | "assistant";
  event_id?: string;
  story_id?: number | null;
  chapter_id?: string | null;
  job_id?: number | null;
  workflow_name: string;
  stopped_at_step: string;
  plain_reason: string;
  draft_preserved: boolean;
  actions: string[];
  detail_log?: string[];
  details?: { reason_codes: string[] };
};

export type ContextDigestBlock = {
  type: "context_digest";
  source: "backend" | "assistant";
  event_id?: string;
  story_id?: number | null;
  chapter_id?: string | null;
  title: string;
  included: string[];
  missing: string[];
  degraded: string[];
  conflicts: string[];
  action_links?: TimelineActionLink[];
};

export type TimelineBlock =
  | { type: "text_message"; id: string; source: "user" | "assistant"; label: string; text: string; tone?: "ready" | "blocked" | "running"; pending?: boolean; metadata?: Record<string, unknown> }
  | { type: "readiness_card"; id: string; briefing: AssistantReadinessBriefing }
  | { type: "inline_choice_chips"; id: string; chips: InlineChoiceChip[] }
  | ChoiceGroupBlock
  | (WorkflowProgressBlock & { id: string })
  | (ArtifactPreviewBlock & { id: string })
  | (ApprovalGateBlock & { id: string })
  | (FailureRecoveryBlock & { id: string })
  | (ContextDigestBlock & { id: string });

export type ArtifactKind = "document" | "analysis" | "review" | "memory" | "publish_preview" | "operations";

export type CommandId =
  | "/write chapter"
  | "/plan"
  | "/analyze chapter"
  | "/research"
  | "/context"
  | "/pipeline"
  | "/memory"
  | "/rewrite selection"
  | "/continue from cursor"
  | "/check continuity"
  | "/extract memory"
  | "/review chapter"
  | "/approve draft"
  | "/publish preview"
  | "/status"
  | "/inspect"
  | "/split";

export type HeaderContextPayload = {
  chapterLabel: string | null;
  sceneLabel: string | null;
  sceneStatus: string | null;
};

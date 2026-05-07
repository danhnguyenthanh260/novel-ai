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

export type ArtifactKind = "document" | "analysis" | "review" | "memory" | "publish_preview" | "operations";

export type CommandTaskStatus = "idle" | "running" | "completed" | "blocked";

export type CommandTaskCard = {
  id: string;
  command: CommandId;
  title: string;
  status: CommandTaskStatus;
  detail: string;
  cta?: string;
  ctaCommand?: CommandId;
};

export type CommandId =
  | "/write chapter"
  | "/analyze chapter"
  | "/rewrite selection"
  | "/continue from cursor"
  | "/check continuity"
  | "/extract memory"
  | "/review chapter"
  | "/approve draft"
  | "/publish preview"
  | "/status"
  | "/split";

export type HeaderContextPayload = {
  chapterLabel: string | null;
  sceneLabel: string | null;
  sceneStatus: string | null;
};

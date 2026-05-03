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

export type ArtifactKind = "document" | "analysis" | "review" | "memory" | "publish_preview" | "operations";

export type CommandTaskStatus = "idle" | "running" | "completed" | "blocked";

export type CommandTaskCard = {
  id: string;
  command: string;
  title: string;
  status: CommandTaskStatus;
  detail: string;
  cta?: string;
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

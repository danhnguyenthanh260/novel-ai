import type { ChatCommandOption } from "@/features/scenes/components/writeTab/chatOrchestration/ChatComposer";
import { buildAssistantReadiness } from "@/features/scenes/components/writeTab/chatOrchestration/readiness";
import type {
  AssistantReadinessContext,
  ChatContextMiniBarPayload,
  CommandId,
  RecoveryChip,
  TimelineBlock,
} from "@/features/scenes/components/writeTab/types";

export type CommandResult = {
  tone: "ready" | "blocked" | "running";
  title: string;
  detail: string;
};

type CommandDefinition = {
  id: CommandId;
  description: string;
  group: "primary" | "more" | "hidden";
  visible: boolean;
  unavailableDetail?: string;
};

const commandDefinitions: CommandDefinition[] = [
  { id: "/write chapter", description: "Generate chapter draft", group: "primary", visible: true },
  { id: "/plan", description: "Create chapter outline", group: "primary", visible: true },
  { id: "/analyze chapter", description: "Analyze source or context", group: "primary", visible: true },
  { id: "/research", description: "Research story or worldbuilding context", group: "primary", visible: true },
  { id: "/inspect", description: "Show full context digest", group: "primary", visible: true },
  { id: "/context", description: "Inspect context readiness", group: "primary", visible: true },
  { id: "/pipeline", description: "Show pipeline progress", group: "primary", visible: true },
  { id: "/check continuity", description: "Review canon and timeline handoff", group: "primary", visible: true },
  { id: "/extract memory", description: "Open story memory extraction", group: "more", visible: true },
  { id: "/memory", description: "Show memory and continuity notes", group: "more", visible: true },
  { id: "/review chapter", description: "Open review panel", group: "more", visible: true },
  { id: "/split", description: "Prepare chapter split request", group: "more", visible: true },
  {
    id: "/rewrite selection",
    description: "Rewrite selected prose",
    group: "hidden",
    visible: false,
    unavailableDetail: "Selection-backed rewriting is not wired in the Novel Lab artifact surface yet.",
  },
  {
    id: "/continue from cursor",
    description: "Continue from cursor",
    group: "hidden",
    visible: false,
    unavailableDetail: "Cursor-backed continuation is not wired in the Novel Lab artifact surface yet.",
  },
  {
    id: "/approve draft",
    description: "Approve active draft",
    group: "hidden",
    visible: false,
    unavailableDetail: "Approval gates are not connected to durable review state from the command surface yet.",
  },
  {
    id: "/publish preview",
    description: "Preview approved output",
    group: "hidden",
    visible: false,
    unavailableDetail: "Publish preview remains owned by the artifact approval surface until publish workflow state is durable.",
  },
];

export function commandDefinition(command: CommandId): CommandDefinition | null {
  return commandDefinitions.find((item) => item.id === command) ?? null;
}

export function commandLabel(command: CommandId): string {
  return command.replace("/", "").replaceAll("_", " ");
}

export function commandTail(command: CommandId, goal: string): string {
  return goal.trim() ? `${command} ${goal.trim()}` : `${command} `;
}

export function contextWithCommandIntent(context: AssistantReadinessContext, command: CommandId, goal: string): AssistantReadinessContext {
  if (command !== "/write chapter" && command !== "/plan" && command !== "/analyze chapter" && command !== "/research") return context;
  return {
    ...context,
    availability: {
      ...context.availability,
      has_chapter_intent: context.availability.has_chapter_intent || goal.trim().length > 0,
    },
  };
}

export function chipTarget(chip: RecoveryChip): string | null {
  if (chip.intent === "browse_stories" || chip.intent === "switch_story") return "/shelf";
  if (chip.intent === "start_story") return "/";
  return null;
}

export function buildCommands(context: AssistantReadinessContext, chapterId: string): ChatCommandOption[] {
  const readiness = buildAssistantReadiness(context);

  return commandDefinitions
    .filter((command) => command.visible)
    .map((command) => {
      let blockedReason: string | undefined;
      if (command.id === "/write chapter" && !readiness.canWrite) {
        blockedReason = readiness.blockedWriteReason ?? "The chapter context is blocked.";
      }
      if (command.id === "/check continuity" && !chapterId) {
        blockedReason = "Choose or create a chapter before checking continuity.";
      }
      if ((command.id === "/plan" || command.id === "/split") && !chapterId) {
        blockedReason = "Choose or create a chapter before running this command.";
      }

      return {
        id: command.id,
        description: blockedReason ?? command.description,
        group: command.group === "more" ? "more" : "primary",
        status: blockedReason ? "blocked" : "ready",
        blockedReason,
      };
    });
}

export function buildContextMiniBar(context: AssistantReadinessContext, status: ChatContextMiniBarPayload["status"]): ChatContextMiniBarPayload {
  return {
    storyTitle: context.storyTitle?.trim() || "No story selected",
    chapterLabel: context.chapterTitle?.trim() || context.chapterId || "No chapter selected",
    status,
  };
}

export function workspaceHref(storySlug: string, workspace: "analysis" | "reviews" | "memory" | "pipelines"): string {
  return `/stories/${encodeURIComponent(storySlug)}/${workspace}`;
}

function labelsFor(items: Array<[boolean, string]>): string[] {
  return items.flatMap(([condition, label]) => condition ? [label] : []);
}

export function buildContextDigestBlock(context: AssistantReadinessContext, actionLinks: Array<{ label: string; href: string }> = [], id = "intent-context-digest"): TimelineBlock {
  const included = labelsFor([
    [context.storySelected, "Story selected"],
    [Boolean(context.chapterId), "Chapter selected"],
    [context.availability.has_source_chapters, "Source material"],
    [context.availability.has_active_characters, "Active characters"],
    [context.availability.has_memory_snapshot, "Memory snapshot"],
    [context.availability.has_style_profile, "Style profile"],
    [context.availability.has_immediate_continuity, "Immediate continuity"],
    [context.availability.has_chapter_intent, "Chapter intent"],
  ]);
  const missing = labelsFor([
    [!context.storySelected, "Story selected"],
    [!context.chapterId, "Chapter selected"],
    [!context.availability.has_source_chapters, "Source material"],
    [!context.availability.has_active_characters, "Active characters"],
    [!context.availability.has_chapter_intent, "Chapter intent"],
  ]);
  const degraded = labelsFor([
    [!context.availability.has_memory_snapshot, "Memory snapshot"],
    [!context.availability.has_style_profile, "Style profile"],
    [!context.availability.has_immediate_continuity, "Immediate continuity"],
  ]);

  return {
    id,
    type: "context_digest",
    source: "assistant",
    title: context.chapterId ? `Chapter ${context.chapterId} context` : "Current story context",
    included,
    missing,
    degraded,
    conflicts: context.readiness === "blocked" ? ["Current context is blocked for writing."] : [],
    action_links: actionLinks,
  };
}

export function buildWorkspaceWorkflowBlock(args: {
  id: string;
  workflowName: string;
  stepLabel: string;
  chapterId: string;
  actionLabel: string;
  actionHref: string;
}): TimelineBlock {
  return {
    id: args.id,
    type: "workflow_progress",
    source: "backend",
    event_id: args.id,
    chapter_id: args.chapterId || null,
    job_id: null,
    workflow_name: args.workflowName,
    status: "running",
    current_step: 1,
    total_steps: 3,
    current_step_label: args.stepLabel,
    steps: [
      { label: "Read workspace context", status: "complete" },
      { label: args.stepLabel, status: "active" },
      { label: "Create workspace artifact", status: "pending" },
    ],
    action_links: [{ label: args.actionLabel, href: args.actionHref }],
  };
}

export function buildWorkspaceArtifactBlock(args: {
  id: string;
  artifactType: "analysis" | "review" | "research";
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}): TimelineBlock {
  return {
    id: args.id,
    type: "artifact_preview",
    source: "backend",
    artifact_id: args.id,
    artifact_type: args.artifactType,
    title: args.title,
    status: "draft",
    description: args.description,
    word_count: null,
    beat_count: null,
    preview_lines: [args.description],
    actions: [],
    action_links: [{ label: args.actionLabel, href: args.actionHref }],
  };
}

export function approvalGateBlock(chapterId: string): TimelineBlock {
  return {
    id: "intent-approval-gate",
    type: "approval_gate",
    source: "assistant",
    gate_type: "import_to_editor",
    description: chapterId
      ? "This needs your sign-off before I can continue. Importing to the editor does not approve story memory or publish the chapter."
      : "Choose a chapter before approving or importing draft content.",
    actions: ["import_to_editor", "keep_as_draft", "run_continuity_check"],
  };
}

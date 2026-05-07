import React from "react";
import { useRouter } from "next/navigation";
import ChatComposer, { type ChatCommandOption } from "@/features/scenes/components/writeTab/chatOrchestration/ChatComposer";
import ChatTimeline from "@/features/scenes/components/writeTab/chatOrchestration/ChatTimeline";
import { buildAssistantReadiness } from "@/features/scenes/components/writeTab/chatOrchestration/readiness";
import type {
  AssistantReadinessContext,
  ChatContextMiniBarPayload,
  CommandId,
  FailureRecoveryBlock,
  RecoveryChip,
  TimelineBlock,
} from "@/features/scenes/components/writeTab/types";

type CommandWorkStreamProps = {
  storySlug: string;
  chapterId: string;
  hasDraft: boolean;
  continuityQueued: boolean;
  composerValue: string;
  commandMenuOpen: boolean;
  onComposerValueChange: (value: string) => void;
  onCommandMenuOpenChange: (value: boolean) => void;
  onOpenAutoWrite: () => void;
  onQueueContinuity: () => void;
  assistantContext: AssistantReadinessContext;
};

type CommandResult = {
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
  { id: "/analyze chapter", description: "Analyze source or context", group: "primary", visible: true },
  { id: "/check continuity", description: "Review canon and timeline handoff", group: "primary", visible: true },
  { id: "/extract memory", description: "Open story memory extraction", group: "more", visible: true },
  { id: "/review chapter", description: "Open review panel", group: "more", visible: true },
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

function commandDefinition(command: CommandId): CommandDefinition | null {
  return commandDefinitions.find((item) => item.id === command) ?? null;
}

function commandLabel(command: CommandId): string {
  return command.replace("/", "").replaceAll("_", " ");
}

function commandTail(command: CommandId, goal: string): string {
  return goal.trim() ? `${command} ${goal.trim()}` : `${command} `;
}

function contextWithCommandIntent(context: AssistantReadinessContext, command: CommandId, goal: string): AssistantReadinessContext {
  if (command !== "/write chapter" && command !== "/analyze chapter") return context;
  return {
    ...context,
    availability: {
      ...context.availability,
      has_chapter_intent: context.availability.has_chapter_intent || goal.trim().length > 0,
    },
  };
}

function chipTarget(storySlug: string, chip: RecoveryChip): string | null {
  const storyBase = `/stories/${encodeURIComponent(storySlug)}`;
  if (chip.intent === "browse_stories" || chip.intent === "switch_story") return "/shelf";
  if (chip.intent === "start_story") return "/";
  if (chip.intent === "add_context" || chip.intent === "analyze_source") return `${storyBase}/analysis`;
  if (chip.intent === "inspect_context") return `${storyBase}/memory`;
  return null;
}

function buildCommands(context: AssistantReadinessContext, chapterId: string): ChatCommandOption[] {
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

      return {
        id: command.id,
        description: blockedReason ?? command.description,
        group: command.group === "more" ? "more" : "primary",
        status: blockedReason ? "blocked" : "ready",
        blockedReason,
      };
    });
}

function buildContextMiniBar(context: AssistantReadinessContext, status: ChatContextMiniBarPayload["status"]): ChatContextMiniBarPayload {
  return {
    storyTitle: context.storyTitle?.trim() || "No story selected",
    chapterLabel: context.chapterTitle?.trim() || context.chapterId || "No chapter selected",
    status,
  };
}

function resultBlock(result: CommandResult): TimelineBlock {
  if (result.tone === "blocked") {
    return {
      id: "command-recovery",
      type: "failure_recovery",
      workflow_name: result.title,
      stopped_at_step: "Preflight",
      plain_reason: result.detail,
      draft_preserved: true,
      actions: ["retry", "cancel"],
    } satisfies FailureRecoveryBlock & { id: string };
  }

  return {
    id: "command-result",
    type: "text_message",
    source: "assistant",
    label: "Studio Writing Assistant",
    text: `${result.title}. ${result.detail}`,
    tone: result.tone,
  };
}

function buildTimelineBlocks(args: {
  briefing: ReturnType<typeof buildAssistantReadiness>;
  composerValue: string;
  hasDraft: boolean;
  continuityQueued: boolean;
  commandResult: CommandResult | null;
}): TimelineBlock[] {
  const blocks: TimelineBlock[] = [
    { id: "readiness", type: "readiness_card", briefing: args.briefing },
    {
      id: "readiness-chips",
      type: "inline_choice_chips",
      chips: args.briefing.chips.map((chip) => ({ ...chip, action: chip.intent })),
    },
  ];

  if (args.composerValue.trim()) {
    blocks.push({ id: "composer-echo", type: "text_message", source: "user", label: "You", text: args.composerValue.trim() });
  }

  if (args.continuityQueued) {
    blocks.push({
      id: "continuity-progress",
      type: "workflow_progress",
      workflow_name: "Continuity Check",
      status: "running",
      current_step: 2,
      total_steps: 4,
      current_step_label: "Checking timeline handoff",
      steps: [
        { label: "Read current artifact", status: "complete" },
        { label: "Check timeline handoff", status: "active" },
        { label: "Validate reveal constraints", status: "pending" },
        { label: "Save review result", status: "pending" },
      ],
    });
  }

  if (args.hasDraft) {
    blocks.push({
      id: "draft-preview",
      type: "artifact_preview",
      artifact_id: "current-draft",
      artifact_type: "draft",
      title: "Current chapter draft",
      status: "draft",
      word_count: null,
      beat_count: null,
      preview_lines: ["Draft content is open in the artifact workspace.", "Use the editor surface for prose edits and approval gates."],
      actions: ["open_draft", "review_continuity", "edit_in_document"],
    });
  }

  if (args.commandResult) blocks.push(resultBlock(args.commandResult));
  return blocks;
}

function useCommandRunner(args: {
  storySlug: string;
  chapterId: string;
  onOpenAutoWrite: () => void;
  onQueueContinuity: () => void;
  readinessContext: AssistantReadinessContext;
}) {
  const router = useRouter();
  const [commandResult, setCommandResult] = React.useState<CommandResult | null>(null);

  const runCommand = React.useCallback(
    (command: CommandId, goal: string) => {
      const definition = commandDefinition(command);
      if (definition?.visible === false) {
        setCommandResult({
          tone: "blocked",
          title: `${commandLabel(command)} unavailable`,
          detail: definition.unavailableDetail ?? "This command is not available from the current workspace.",
        });
        return;
      }

      const storyBase = `/stories/${encodeURIComponent(args.storySlug)}`;
      const commandContext = contextWithCommandIntent(args.readinessContext, command, goal);
      if (command === "/write chapter") {
        const readiness = buildAssistantReadiness(commandContext);
        if (!readiness.canWrite) {
          setCommandResult({
            tone: "blocked",
            title: "Chapter Write",
            detail: readiness.blockedWriteReason ?? "The chapter context is blocked. Add missing context before opening AutoWrite.",
          });
          return;
        }
        args.onOpenAutoWrite();
        setCommandResult({ tone: "running", title: "AutoWrite opened", detail: `Chapter ${args.chapterId} is ready for a writing run.` });
        return;
      }

      if (command === "/check continuity") {
        if (!args.chapterId) {
          setCommandResult({ tone: "blocked", title: "Continuity Check", detail: "Choose or create a chapter before checking continuity." });
          return;
        }
        args.onQueueContinuity();
        setCommandResult({ tone: "running", title: "Continuity check queued", detail: "Canon, timeline, and reveal constraints are now marked for validation." });
        return;
      }

      if (command === "/analyze chapter") {
        router.push(`${storyBase}/analysis`);
        setCommandResult({ tone: "ready", title: "Opening analysis", detail: "The analysis workspace owns chapter and source diagnostics." });
        return;
      }

      if (command === "/extract memory") {
        router.push(`${storyBase}/memory`);
        setCommandResult({ tone: "ready", title: "Opening memory hub", detail: "Memory extraction and conflict review continue in the story memory workspace." });
        return;
      }

      if (command === "/review chapter") {
        router.push(`${storyBase}/reviews`);
        setCommandResult({ tone: "ready", title: "Opening reviews", detail: "Chapter review requests, scoring, and responses live in the review workspace." });
        return;
      }

      setCommandResult({ tone: "blocked", title: `${commandLabel(command)} unavailable`, detail: "This command is not wired to a safe workflow action yet." });
    },
    [args, router]
  );

  return { commandResult, runCommand };
}

export default function CommandWorkStream(props: CommandWorkStreamProps) {
  const router = useRouter();
  const briefing = buildAssistantReadiness(props.assistantContext);
  const commands = buildCommands(props.assistantContext, props.chapterId);
  const { commandResult, runCommand } = useCommandRunner({
    storySlug: props.storySlug,
    chapterId: props.chapterId,
    onOpenAutoWrite: props.onOpenAutoWrite,
    onQueueContinuity: props.onQueueContinuity,
    readinessContext: props.assistantContext,
  });
  const blocks = buildTimelineBlocks({
    briefing,
    composerValue: props.composerValue,
    hasDraft: props.hasDraft,
    continuityQueued: props.continuityQueued,
    commandResult,
  });

  const handleChip = (chip: RecoveryChip) => {
    const target = chipTarget(props.storySlug, chip);
    if (chip.intent === "describe_goal" || chip.intent === "continue_degraded") {
      props.onComposerValueChange(props.chapterId ? `/write chapter ${props.chapterId} ` : "/write chapter ");
      props.onCommandMenuOpenChange(false);
      return;
    }
    if (target) router.push(target);
  };

  return (
    <section className="work-stream" aria-label="Studio chat work stream">
      <ChatTimeline context={buildContextMiniBar(props.assistantContext, briefing.status)} blocks={blocks} onChip={handleChip} />
      <ChatComposer
        value={props.composerValue}
        menuOpen={props.commandMenuOpen}
        commands={commands}
        onValueChange={props.onComposerValueChange}
        onMenuOpenChange={props.onCommandMenuOpenChange}
        onSubmitCommand={(command, goal) => {
          props.onComposerValueChange(commandTail(command, goal));
          runCommand(command, goal);
        }}
      />
    </section>
  );
}

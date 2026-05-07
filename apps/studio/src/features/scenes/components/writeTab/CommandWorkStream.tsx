import React from "react";
import { useRouter } from "next/navigation";
import ChatComposer, { type ChatCommandOption } from "@/features/scenes/components/writeTab/chatOrchestration/ChatComposer";
import ChatTimeline from "@/features/scenes/components/writeTab/chatOrchestration/ChatTimeline";
import { routeStudioIntent } from "@/features/scenes/components/writeTab/chatOrchestration/intentRouter";
import { buildAssistantReadiness } from "@/features/scenes/components/writeTab/chatOrchestration/readiness";
import {
  continuityWorkflowProgressEvent,
  workflowProgressBlockFromEvent,
} from "@/features/scenes/components/writeTab/chatOrchestration/workflowProgressEvents";
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
  { id: "/plan", description: "Create chapter outline", group: "primary", visible: true },
  { id: "/analyze chapter", description: "Analyze source or context", group: "primary", visible: true },
  { id: "/research", description: "Research story or worldbuilding context", group: "primary", visible: true },
  { id: "/inspect", description: "Show full context digest", group: "primary", visible: true },
  { id: "/check continuity", description: "Review canon and timeline handoff", group: "primary", visible: true },
  { id: "/extract memory", description: "Open story memory extraction", group: "more", visible: true },
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
  if (command !== "/write chapter" && command !== "/plan" && command !== "/analyze chapter" && command !== "/research") return context;
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
      source: "assistant",
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
  conversationBlocks: TimelineBlock[];
  chapterId: string | null;
  hasDraft: boolean;
  showDraftPreview: boolean;
  continuityQueued: boolean;
  commandResult: CommandResult | null;
  intentBlock: TimelineBlock | null;
}): TimelineBlock[] {
  const blocks: TimelineBlock[] = [
    { id: "readiness", type: "readiness_card", briefing: args.briefing },
    {
      id: "readiness-chips",
      type: "inline_choice_chips",
      chips: args.briefing.chips.map((chip) => ({ ...chip, action: chip.intent })),
    },
  ];

  blocks.push(...args.conversationBlocks);

  if (args.composerValue.trim()) {
    blocks.push({ id: "composer-echo", type: "text_message", source: "user", label: "You", text: args.composerValue.trim() });
  }

  const continuityEvent = continuityWorkflowProgressEvent({ chapterId: args.chapterId, queued: args.continuityQueued });
  if (continuityEvent) blocks.push(workflowProgressBlockFromEvent(continuityEvent));

  if (args.hasDraft && args.showDraftPreview) {
    blocks.push({
      id: "draft-preview",
      type: "artifact_preview",
      source: "backend",
      artifact_id: "current-draft",
      artifact_type: "draft",
      title: "Current chapter draft",
      status: "draft",
      description: "Draft content is open in the artifact workspace.",
      word_count: null,
      beat_count: null,
      preview_lines: ["Draft content is open in the artifact workspace.", "Use the editor surface for prose edits and approval gates."],
      actions: ["open_draft", "review_continuity", "edit_in_document"],
    });
  }

  if (args.commandResult) blocks.push(resultBlock(args.commandResult));
  if (args.intentBlock) blocks.push(args.intentBlock);
  return blocks;
}

function buildContextDigestBlock(context: AssistantReadinessContext): TimelineBlock {
  const included = [
    context.storySelected ? "Story selected" : "",
    context.chapterId ? "Chapter selected" : "",
    context.availability.has_source_chapters ? "Source material" : "",
    context.availability.has_active_characters ? "Active characters" : "",
    context.availability.has_memory_snapshot ? "Memory snapshot" : "",
    context.availability.has_style_profile ? "Style profile" : "",
    context.availability.has_immediate_continuity ? "Immediate continuity" : "",
    context.availability.has_chapter_intent ? "Chapter intent" : "",
  ].filter(Boolean);
  const missing = [
    context.storySelected ? "" : "Story selected",
    context.chapterId ? "" : "Chapter selected",
    context.availability.has_source_chapters ? "" : "Source material",
    context.availability.has_active_characters ? "" : "Active characters",
    context.availability.has_chapter_intent ? "" : "Chapter intent",
  ].filter(Boolean);
  const degraded = [
    context.availability.has_memory_snapshot ? "" : "Memory snapshot",
    context.availability.has_style_profile ? "" : "Style profile",
    context.availability.has_immediate_continuity ? "" : "Immediate continuity",
  ].filter(Boolean);

  return {
    id: "intent-context-digest",
    type: "context_digest",
    source: "assistant",
    title: context.chapterId ? `Chapter ${context.chapterId} context` : "Current story context",
    included,
    missing,
    degraded,
    conflicts: context.readiness === "blocked" ? ["Current context is blocked for writing."] : [],
  };
}

function approvalGateBlock(chapterId: string): TimelineBlock {
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

function useCommandRunner(args: {
  storySlug: string;
  chapterId: string;
  onOpenAutoWrite: () => void;
  onQueueContinuity: () => void;
  readinessContext: AssistantReadinessContext;
  mode: "chat" | "brainstorm";
  onModeChange: (mode: "chat" | "brainstorm") => void;
  onConversationBlock: (block: TimelineBlock) => void;
}) {
  const router = useRouter();
  const [commandResult, setCommandResult] = React.useState<CommandResult | null>(null);
  const [intentBlock, setIntentBlock] = React.useState<TimelineBlock | null>(null);

  const runCommand = React.useCallback(
    (command: CommandId, goal: string) => {
      setIntentBlock(null);
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
      if (command === "/inspect" || command === "/status") {
        setIntentBlock(buildContextDigestBlock(commandContext));
        setCommandResult({ tone: "ready", title: "Context digest ready", detail: "I found the current story and chapter context state." });
        return;
      }

      if (command === "/approve draft") {
        setIntentBlock(approvalGateBlock(args.chapterId));
        setCommandResult({ tone: "blocked", title: "Approval required", detail: "I surfaced the approval gate, but I cannot approve or promote the draft for you." });
        return;
      }

      if (command === "/plan") {
        if (!args.chapterId) {
          setCommandResult({ tone: "blocked", title: "Chapter Planning", detail: "Choose or create a chapter before planning." });
          return;
        }
        if (!goal.trim()) {
          setCommandResult({ tone: "blocked", title: "Chapter Planning", detail: "I need to know what this chapter should accomplish before planning." });
          return;
        }
        const readiness = buildAssistantReadiness(commandContext);
        if (readiness.status === "blocked") {
          setCommandResult({ tone: "blocked", title: "Chapter Planning", detail: readiness.blockedWriteReason ?? "The chapter context is blocked. Add missing context before planning." });
          return;
        }
        args.onOpenAutoWrite();
        setCommandResult({ tone: "running", title: "Planning preflight passed", detail: "The AutoWrite planner is ready to continue with your chapter goal." });
        return;
      }

      if (command === "/research") {
        router.push(`${storyBase}/analysis`);
        setCommandResult({ tone: "ready", title: "Opening research context", detail: "Research and source analysis continue in the analysis workspace." });
        return;
      }

      if (command === "/split") {
        if (!args.chapterId) {
          setCommandResult({ tone: "blocked", title: "Chapter Split", detail: "Choose or create a chapter before splitting." });
          return;
        }
        setCommandResult({ tone: "ready", title: "Split request captured", detail: "Chapter splitting remains gated by the artifact workflow; review the current draft before running the split pipeline." });
        return;
      }

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

  const submitMessage = React.useCallback((message: string) => {
    const route = routeStudioIntent({ message, readiness: args.readinessContext.readiness, mode: args.mode });
    setIntentBlock(null);
    if (route.intent === "SWITCH_STORY") {
      router.push("/shelf");
      setCommandResult({ tone: "ready", title: "Opening story selector", detail: "Choose the story you want to work on next." });
      return;
    }
    if (route.intent === "ADD_CONTEXT") {
      router.push(`/stories/${encodeURIComponent(args.storySlug)}/analysis`);
      setCommandResult({ tone: "ready", title: "Opening context tools", detail: "Add or analyze story context before writing." });
      return;
    }
    if (route.intent === "BRAINSTORM") {
      args.onModeChange("brainstorm");
      args.onConversationBlock({
        id: `assistant-${Date.now()}`,
        type: "text_message",
        source: "assistant",
        label: "Studio Writing Assistant",
        text: route.assistantText ?? "I can brainstorm here without starting a writing workflow.",
        tone: "ready",
      });
      return;
    }
    if (route.intent === "CHAT") {
      args.onConversationBlock({
        id: `assistant-${Date.now()}`,
        type: "text_message",
        source: "assistant",
        label: "Studio Writing Assistant",
        text: route.assistantText ?? "Hi. I can chat freely or help with writing workflows when you ask.",
        tone: "ready",
      });
      return;
    }
    if (route.needsClarification) {
      args.onConversationBlock({
        id: `assistant-${Date.now()}`,
        type: "text_message",
        source: "assistant",
        label: "Studio Writing Assistant",
        text: route.assistantText ?? "Which writing action should I help with?",
        tone: "ready",
      });
      return;
    }
    if (route.command) runCommand(route.command, route.goal);
  }, [args, router, runCommand]);

  return { commandResult, intentBlock, runCommand, submitMessage };
}

export default function CommandWorkStream(props: CommandWorkStreamProps) {
  const router = useRouter();
  const [chatMode, setChatMode] = React.useState<"chat" | "brainstorm">("chat");
  const [conversationBlocks, setConversationBlocks] = React.useState<TimelineBlock[]>([]);
  const briefing = buildAssistantReadiness(props.assistantContext);
  const commands = buildCommands(props.assistantContext, props.chapterId);
  const { commandResult, intentBlock, runCommand, submitMessage } = useCommandRunner({
    storySlug: props.storySlug,
    chapterId: props.chapterId,
    onOpenAutoWrite: props.onOpenAutoWrite,
    onQueueContinuity: props.onQueueContinuity,
    readinessContext: props.assistantContext,
    mode: chatMode,
    onModeChange: setChatMode,
    onConversationBlock: (block) => setConversationBlocks((current) => [...current, block]),
  });
  const blocks = buildTimelineBlocks({
    briefing,
    composerValue: props.composerValue,
    conversationBlocks,
    chapterId: props.chapterId,
    hasDraft: props.hasDraft,
    showDraftPreview: chatMode !== "brainstorm",
    continuityQueued: props.continuityQueued,
    commandResult,
    intentBlock,
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
        onSubmitMessage={(message) => {
          setConversationBlocks((current) => [
            ...current,
            { id: `user-${Date.now()}`, type: "text_message", source: "user", label: "You", text: message },
          ]);
          props.onComposerValueChange("");
          props.onCommandMenuOpenChange(false);
          submitMessage(message);
        }}
      />
    </section>
  );
}

import React from "react";
import { useRouter } from "next/navigation";
import ChatComposer from "@/features/scenes/components/writeTab/chatOrchestration/ChatComposer";
import ChatTimeline from "@/features/scenes/components/writeTab/chatOrchestration/ChatTimeline";
import {
  approvalGateBlock,
  buildCommands,
  buildContextDigestBlock,
  buildContextMiniBar,
  buildWorkspaceArtifactBlock,
  buildWorkspaceWorkflowBlock,
  chipTarget,
  commandDefinition,
  commandLabel,
  commandTail,
  contextWithCommandIntent,
  type CommandResult,
  workspaceHref,
} from "@/features/scenes/components/writeTab/chatOrchestration/commandSurfaceContracts";
import { routeStudioIntent } from "@/features/scenes/components/writeTab/chatOrchestration/intentRouter";
import { buildAssistantReadiness } from "@/features/scenes/components/writeTab/chatOrchestration/readiness";
import {
  continuityWorkflowProgressEvent,
  workflowProgressBlockFromEvent,
} from "@/features/scenes/components/writeTab/chatOrchestration/workflowProgressEvents";
import type {
  AssistantReadinessContext,
  CommandId,
  FailureRecoveryBlock,
  RecoveryChip,
  TimelineBlock,
  WriteInspectorMode,
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
  onInspectorModeChange: (mode: WriteInspectorMode) => void;
  assistantContext: AssistantReadinessContext;
};

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
  pendingAssistant: boolean;
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

  if (args.pendingAssistant) {
    blocks.push({
      id: "assistant-pending",
      type: "text_message",
      source: "assistant",
      label: "Studio Writing Assistant",
      text: "Thinking",
      tone: "running",
      pending: true,
    });
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

// Command dispatch mirrors the slash-command contract table; keep branches explicit so blocked/degraded routing stays readable.
// eslint-disable-next-line max-lines-per-function
function useCommandRunner(args: {
  storySlug: string;
  chapterId: string;
  onOpenAutoWrite: () => void;
  onQueueContinuity: () => void;
  readinessContext: AssistantReadinessContext;
  mode: "chat" | "brainstorm";
  onModeChange: (mode: "chat" | "brainstorm") => void;
  recentBrainstormSeed: string | null;
  onBrainstormSeedChange: (seed: string | null) => void;
  onConversationBlock: (block: TimelineBlock) => void;
  onInspectorModeChange: (mode: WriteInspectorMode) => void;
}) {
  const router = useRouter();
  const [commandResult, setCommandResult] = React.useState<CommandResult | null>(null);
  const [intentBlock, setIntentBlock] = React.useState<TimelineBlock | null>(null);

  const runCommand = React.useCallback(
    // eslint-disable-next-line complexity, max-lines-per-function
    (command: CommandId, goal: string) => {
      setIntentBlock(null);
      setCommandResult(null);
      const definition = commandDefinition(command);
      if (definition?.visible === false) {
        setCommandResult({
          tone: "blocked",
          title: `${commandLabel(command)} unavailable`,
          detail: definition.unavailableDetail ?? "This command is not available from the current workspace.",
        });
        return;
      }

      const commandContext = contextWithCommandIntent(args.readinessContext, command, goal);
      if (command === "/inspect" || command === "/status" || command === "/context") {
        args.onInspectorModeChange("context");
        setIntentBlock(buildContextDigestBlock(commandContext, [{ label: "Open full memory workspace", href: workspaceHref(args.storySlug, "memory") }]));
        setCommandResult({ tone: "ready", title: "Context digest ready", detail: "I found the current story and chapter context state." });
        return;
      }

      if (command === "/pipeline") {
        args.onInspectorModeChange("progress");
        args.onConversationBlock(buildWorkspaceWorkflowBlock({
          id: `pipeline-${Date.now()}`,
          workflowName: "Pipeline Progress",
          stepLabel: "Inspecting active workflow state",
          chapterId: args.chapterId,
          actionLabel: "Open full pipelines workspace",
          actionHref: workspaceHref(args.storySlug, "pipelines"),
        }));
        setCommandResult({ tone: "ready", title: "Pipeline progress opened", detail: "I kept the workflow state in the Write workspace inspector." });
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
        args.onInspectorModeChange("context");
        const stamp = Date.now();
        args.onConversationBlock(buildWorkspaceWorkflowBlock({
          id: `research-progress-${stamp}`,
          workflowName: "Research Context",
          stepLabel: "Preparing research context",
          chapterId: args.chapterId,
          actionLabel: "Open full analysis workspace",
          actionHref: workspaceHref(args.storySlug, "analysis"),
        }));
        args.onConversationBlock(buildWorkspaceArtifactBlock({
          id: `research-artifact-${stamp}`,
          artifactType: "research",
          title: "Research context",
          description: "Research stays in this Write workspace; open the full analysis workspace only if you need the deep view.",
          actionLabel: "Open full analysis workspace",
          actionHref: workspaceHref(args.storySlug, "analysis"),
        }));
        setCommandResult({ tone: "ready", title: "Research context opened", detail: "I kept it in Write and opened the context inspector." });
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
        args.onInspectorModeChange("progress");
        args.onQueueContinuity();
        setCommandResult({ tone: "running", title: "Continuity check queued", detail: "Canon, timeline, and reveal constraints are now marked for validation." });
        return;
      }

      if (command === "/analyze chapter") {
        args.onInspectorModeChange("context");
        const stamp = Date.now();
        args.onConversationBlock(buildWorkspaceWorkflowBlock({
          id: `analysis-progress-${stamp}`,
          workflowName: "Chapter Analysis",
          stepLabel: "Analyzing chapter context",
          chapterId: args.chapterId,
          actionLabel: "Open full analysis workspace",
          actionHref: workspaceHref(args.storySlug, "analysis"),
        }));
        args.onConversationBlock(buildWorkspaceArtifactBlock({
          id: `analysis-artifact-${stamp}`,
          artifactType: "analysis",
          title: "Chapter analysis report",
          description: "Analysis is attached to the Write timeline and expanded in the right inspector.",
          actionLabel: "Open full analysis workspace",
          actionHref: workspaceHref(args.storySlug, "analysis"),
        }));
        setCommandResult({ tone: "ready", title: "Analysis opened", detail: "I kept the command inside Write and opened the context inspector." });
        return;
      }

      if (command === "/extract memory" || command === "/memory") {
        args.onInspectorModeChange("memory");
        setIntentBlock(buildContextDigestBlock(commandContext, [{ label: "Open full memory workspace", href: workspaceHref(args.storySlug, "memory") }]));
        setCommandResult({ tone: "ready", title: "Memory notes opened", detail: "I kept memory and continuity notes in the Write workspace inspector." });
        return;
      }

      if (command === "/review chapter") {
        args.onInspectorModeChange("artifacts");
        const stamp = Date.now();
        args.onConversationBlock(buildWorkspaceWorkflowBlock({
          id: `review-progress-${stamp}`,
          workflowName: "Chapter Review",
          stepLabel: "Preparing review artifact",
          chapterId: args.chapterId,
          actionLabel: "Open full reviews workspace",
          actionHref: workspaceHref(args.storySlug, "reviews"),
        }));
        args.onConversationBlock(buildWorkspaceArtifactBlock({
          id: `review-artifact-${stamp}`,
          artifactType: "review",
          title: "Chapter review result",
          description: "Review output is visible in Write and expands through the artifact inspector.",
          actionLabel: "Open full reviews workspace",
          actionHref: workspaceHref(args.storySlug, "reviews"),
        }));
        setCommandResult({ tone: "ready", title: "Review opened", detail: "I kept review output inside Write and opened the artifact inspector." });
        return;
      }

      setCommandResult({ tone: "blocked", title: `${commandLabel(command)} unavailable`, detail: "This command is not wired to a safe workflow action yet." });
    },
    [args]
  );

  const submitMessage = React.useCallback((message: string) => {
    const route = routeStudioIntent({
      message,
      readiness: args.readinessContext.readiness,
      mode: args.mode,
      recentBrainstormSeed: args.recentBrainstormSeed,
    });
    setIntentBlock(null);
    if (route.brainstormSeed !== undefined) {
      args.onBrainstormSeedChange(route.brainstormSeed);
    }
    if (route.intent === "SWITCH_STORY") {
      router.push("/shelf");
      setCommandResult({ tone: "ready", title: "Opening story selector", detail: "Choose the story you want to work on next." });
      return;
    }
    if (route.intent === "ADD_CONTEXT") {
      args.onInspectorModeChange("context");
      setIntentBlock(buildContextDigestBlock(args.readinessContext, [{ label: "Open full analysis workspace", href: workspaceHref(args.storySlug, "analysis") }]));
      setCommandResult({ tone: "ready", title: "Context tools opened", detail: "I kept context recovery in Write and opened the context inspector." });
      return;
    }
    if (route.assistantText) {
      if (route.intent === "BRAINSTORM") {
        args.onModeChange("brainstorm");
      }
      if (route.intent === "REPO_RUN_HELP" || route.intent === "REPO_TEST_HELP") {
        args.onModeChange("chat");
      }
      args.onConversationBlock({
        id: `assistant-${Date.now()}`,
        type: "text_message",
        source: "assistant",
        label: "Studio Writing Assistant",
        text: route.assistantText,
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
  const [recentBrainstormSeed, setRecentBrainstormSeed] = React.useState<string | null>(null);
  const [conversationBlocks, setConversationBlocks] = React.useState<TimelineBlock[]>([]);
  const [pendingAssistant, setPendingAssistant] = React.useState(false);
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
    recentBrainstormSeed,
    onBrainstormSeedChange: setRecentBrainstormSeed,
    onConversationBlock: (block) => setConversationBlocks((current) => [...current, block]),
    onInspectorModeChange: props.onInspectorModeChange,
  });
  const blocks = buildTimelineBlocks({
    briefing,
    composerValue: props.composerValue,
    conversationBlocks,
    pendingAssistant,
    chapterId: props.chapterId,
    hasDraft: props.hasDraft,
    showDraftPreview: chatMode !== "brainstorm",
    continuityQueued: props.continuityQueued,
    commandResult,
    intentBlock,
  });

  const handleChip = (chip: RecoveryChip) => {
    const target = chipTarget(chip);
    if (chip.intent === "describe_goal" || chip.intent === "continue_degraded") {
      props.onComposerValueChange(props.chapterId ? `/write chapter ${props.chapterId} ` : "/write chapter ");
      props.onCommandMenuOpenChange(false);
      return;
    }
    if (chip.intent === "add_context" || chip.intent === "analyze_source") {
      props.onInspectorModeChange("context");
      setConversationBlocks((current) => [
        ...current,
        buildWorkspaceWorkflowBlock({
          id: `recovery-analysis-${Date.now()}`,
          workflowName: "Context Recovery",
          stepLabel: chip.intent === "analyze_source" ? "Analyzing source context" : "Preparing missing context",
          chapterId: props.chapterId,
          actionLabel: "Open full analysis workspace",
          actionHref: workspaceHref(props.storySlug, "analysis"),
        }),
      ]);
      return;
    }
    if (chip.intent === "inspect_context") {
      props.onInspectorModeChange("context");
      setConversationBlocks((current) => [
        ...current,
        buildContextDigestBlock(
          props.assistantContext,
          [{ label: "Open full memory workspace", href: workspaceHref(props.storySlug, "memory") }],
          `recovery-context-${Date.now()}`
        ),
      ]);
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
          setPendingAssistant(true);
          props.onComposerValueChange("");
          props.onCommandMenuOpenChange(false);
          window.setTimeout(() => {
            submitMessage(message);
            setPendingAssistant(false);
          }, 220);
        }}
      />
    </section>
  );
}

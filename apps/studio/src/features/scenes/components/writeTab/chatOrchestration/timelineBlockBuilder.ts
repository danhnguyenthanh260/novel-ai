import { buildAssistantReadiness } from "@/features/scenes/components/writeTab/chatOrchestration/readiness";
import {
  continuityWorkflowProgressEvent,
  workflowProgressBlockFromEvent,
} from "@/features/scenes/components/writeTab/chatOrchestration/workflowProgressEvents";
import type { CommandResult } from "@/features/scenes/components/writeTab/chatOrchestration/commandSurfaceContracts";
import type { FailureRecoveryBlock, TimelineBlock } from "@/features/scenes/components/writeTab/types";

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

export function buildTimelineBlocks(args: {
  briefing: ReturnType<typeof buildAssistantReadiness>;
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

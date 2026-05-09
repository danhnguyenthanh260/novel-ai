import type { TimelineBlock } from "@/features/scenes/components/writeTab/types";
import type { BrainstormFollowupAction } from "@/features/scenes/components/writeTab/chatOrchestration/intentRouter";

export type AssistantConversationState = {
  chatMode: "chat" | "brainstorm";
  recentBrainstormSeed: string | null;
  pendingBrainstormActions: BrainstormFollowupAction[] | null;
  choiceSelections: Record<string, string[]>;
};

export const defaultConversationState: AssistantConversationState = {
  chatMode: "chat",
  recentBrainstormSeed: null,
  pendingBrainstormActions: null,
  choiceSelections: {},
};

export function isTimelineBlock(value: unknown): value is TimelineBlock {
  return Boolean(value && typeof value === "object" && "type" in value && "id" in value);
}

export function normalizeConversationState(value: unknown): AssistantConversationState {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<AssistantConversationState> : {};
  return {
    chatMode: obj.chatMode === "brainstorm" ? "brainstorm" : "chat",
    recentBrainstormSeed: typeof obj.recentBrainstormSeed === "string" ? obj.recentBrainstormSeed : null,
    pendingBrainstormActions: Array.isArray(obj.pendingBrainstormActions) ? obj.pendingBrainstormActions : null,
    choiceSelections: obj.choiceSelections && typeof obj.choiceSelections === "object" && !Array.isArray(obj.choiceSelections)
      ? obj.choiceSelections as Record<string, string[]>
      : {},
  };
}

export function blockRole(block: TimelineBlock): "user" | "assistant" | "workflow" {
  if (block.type === "text_message") return block.source === "user" ? "user" : "assistant";
  if (block.type === "readiness_card" || block.type === "inline_choice_chips") return "assistant";
  if (block.source === "assistant") return "assistant";
  return "workflow";
}

export function blockContent(block: TimelineBlock): string {
  if (block.type === "text_message") return block.text;
  if (block.type === "choice_group") return block.prompt;
  if (block.type === "workflow_progress") return `${block.workflow_name}: ${block.current_step_label}`;
  if (block.type === "artifact_preview") return block.title;
  if (block.type === "approval_gate") return block.description;
  if (block.type === "failure_recovery") return `${block.workflow_name} stopped: ${block.plain_reason}`;
  if (block.type === "context_digest") return block.title;
  if (block.type === "readiness_card") return block.briefing.title;
  return block.chips.map((chip) => chip.label).join(", ");
}

export function persistedBlockPayload(block: TimelineBlock) {
  return {
    role: blockRole(block),
    block_type: block.type,
    content: blockContent(block),
    metadata_json: { block },
  };
}

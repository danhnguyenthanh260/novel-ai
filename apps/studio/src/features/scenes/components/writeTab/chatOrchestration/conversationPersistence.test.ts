import {
  normalizeConversationState,
  persistedBlockPayload,
} from "@/features/scenes/components/writeTab/chatOrchestration/conversationPersistence";
import type { TimelineBlock } from "@/features/scenes/components/writeTab/types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runConversationPersistenceSelfTest(): void {
  const userBlock: TimelineBlock = {
    id: "user-1",
    type: "text_message",
    source: "user",
    label: "You",
    text: "scene goals",
  };
  const payload = persistedBlockPayload(userBlock);
  assert(payload.role === "user", "submitted user text persists as one user message");
  assert(payload.content === "scene goals", "persisted content uses final submitted text");
  assert(payload.metadata_json.block === userBlock, "full timeline block is preserved under metadata");

  const state = normalizeConversationState({
    chatMode: "brainstorm",
    recentBrainstormSeed: "a girl",
    pendingBrainstormActions: ["character_contradiction"],
  });
  assert(state.chatMode === "brainstorm", "brainstorm mode restores from metadata");
  assert(state.recentBrainstormSeed === "a girl", "recent brainstorm seed restores from metadata");
  assert(state.pendingBrainstormActions?.[0] === "character_contradiction", "pending follow-up actions restore from metadata");
  assert(Object.keys(state.choiceSelections).length === 0, "choice selections default to an object");

  const fallback = normalizeConversationState({ chatMode: "invalid", recentBrainstormSeed: 1 });
  assert(fallback.chatMode === "chat", "invalid state falls back to chat mode");
  assert(fallback.recentBrainstormSeed === null, "invalid seed falls back to null");
}

runConversationPersistenceSelfTest();

import { useCallback, useState } from "react";
import type { MuseChatBeat, MuseChatPhase, MuseChatScope, MuseCompressedSummary, MuseTargetRange } from "@/features/scenes/components/draftRunner/shared";

export function useDraftMuseChatState() {
  const [chatScope, setChatScope] = useState<MuseChatScope>("scene");
  const [chatTargetRange, setChatTargetRange] = useState<MuseTargetRange>("medium");
  const [chatPhase, setChatPhase] = useState<MuseChatPhase>("idle");
  const [chatIdeasDraft, setChatIdeasDraft] = useState("");
  const [chatContextDraft, setChatContextDraft] = useState("");
  const [chatIntent, setChatIntent] = useState("");
  const [chatMacroAnchor, setChatMacroAnchor] = useState("");
  const [chatCompressed, setChatCompressed] = useState<MuseCompressedSummary | null>(null);
  const [chatLockedBlocks, setChatLockedBlocks] = useState<string[]>([]);
  const [chatBeats, setChatBeats] = useState<MuseChatBeat[]>([]);
  const [chatQuestions, setChatQuestions] = useState<string[]>([]);
  const [chatProse, setChatProse] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);

  const chatBusy = chatPhase === "compressing" || chatPhase === "synthesizing" || chatPhase === "writing";

  const resetChatState = useCallback(() => {
    setChatScope("scene");
    setChatTargetRange("medium");
    setChatPhase("idle");
    setChatIdeasDraft("");
    setChatContextDraft("");
    setChatIntent("");
    setChatMacroAnchor("");
    setChatCompressed(null);
    setChatLockedBlocks([]);
    setChatBeats([]);
    setChatQuestions([]);
    setChatProse("");
    setChatError(null);
  }, []);

  const clearChatState = useCallback(() => {
    setChatScope("scene");
    setChatTargetRange("medium");
    setChatPhase("idle");
    setChatError(null);
    setChatIntent("");
    setChatMacroAnchor("");
    setChatCompressed(null);
    setChatLockedBlocks([]);
    setChatBeats([]);
    setChatQuestions([]);
    setChatProse("");
  }, []);

  return {
    chatScope,
    setChatScope,
    chatTargetRange,
    setChatTargetRange,
    chatPhase,
    setChatPhase,
    chatIdeasDraft,
    setChatIdeasDraft,
    chatContextDraft,
    setChatContextDraft,
    chatIntent,
    setChatIntent,
    chatMacroAnchor,
    setChatMacroAnchor,
    chatCompressed,
    setChatCompressed,
    chatLockedBlocks,
    setChatLockedBlocks,
    chatBeats,
    setChatBeats,
    chatQuestions,
    setChatQuestions,
    chatProse,
    setChatProse,
    chatError,
    setChatError,
    chatBusy,
    resetChatState,
    clearChatState,
  };
}

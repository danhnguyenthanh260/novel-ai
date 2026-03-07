import type { RefObject } from "react";
import { useDraftMuseChatState } from "@/features/scenes/components/draftRunner/useDraftMuseChatState";
import { useDraftMuseChatActions } from "@/features/scenes/components/draftRunner/useDraftMuseChatActions";

export function useDraftMuseChat(params: {
  text: string;
  setText: (value: string | ((prev: string) => string)) => void;
  textRef: RefObject<HTMLTextAreaElement | null>;
  isSceneLocked: boolean;
  museChatEnabled: boolean;
  museHistoryKey: string;
  storySlug: string;
  sceneId: string;
  writingLanguage: string;
}) {
  const { text, setText, textRef, isSceneLocked, museChatEnabled, museHistoryKey, storySlug, sceneId, writingLanguage } = params;
  const state = useDraftMuseChatState();
  const { runMuseChatCompress, runMuseChatSynthesis, runMuseChatProse, acceptMuseChatProse } = useDraftMuseChatActions({
    text,
    setText,
    textRef,
    isSceneLocked,
    museChatEnabled,
    museHistoryKey,
    storySlug,
    sceneId,
    writingLanguage,
    chatBusy: state.chatBusy,
    chatScope: state.chatScope,
    chatTargetRange: state.chatTargetRange,
    chatIdeasDraft: state.chatIdeasDraft,
    chatContextDraft: state.chatContextDraft,
    chatCompressed: state.chatCompressed,
    chatLockedBlocks: state.chatLockedBlocks,
    chatBeats: state.chatBeats,
    chatProse: state.chatProse,
    setChatPhase: state.setChatPhase,
    setChatError: state.setChatError,
    setChatCompressed: state.setChatCompressed,
    setChatLockedBlocks: state.setChatLockedBlocks,
    setChatIntent: state.setChatIntent,
    setChatMacroAnchor: state.setChatMacroAnchor,
    setChatBeats: state.setChatBeats,
    setChatQuestions: state.setChatQuestions,
    setChatProse: state.setChatProse,
  });

  return {
    ...state,
    runMuseChatCompress,
    runMuseChatSynthesis,
    runMuseChatProse,
    acceptMuseChatProse,
  };
}

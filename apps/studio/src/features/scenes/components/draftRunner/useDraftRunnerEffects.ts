import type { Preferences } from "@/features/scenes/components/draftRunner/shared";
import { useDraftRunnerPreferenceEffects } from "@/features/scenes/components/draftRunner/useDraftRunnerPreferenceEffects";
import { useDraftRunnerRuntimeEffects } from "@/features/scenes/components/draftRunner/useDraftRunnerRuntimeEffects";

type BufferState = "idle" | "pending" | "saved";

export function useDraftRunnerEffects(params: {
  storySlug: string;
  sceneId: string;
  currentVersionId: number | null;
  initialText: string;
  text: string;
  dirty: boolean;
  bufferKey: string;
  prefs: Preferences;
  showWriteTools: boolean;
  setPrefs: (value: Preferences) => void;
  setShowWriteTools: (value: boolean) => void;
  setText: (value: string) => void;
  setBaselineText: (value: string) => void;
  setMsg: (value: string | null) => void;
  resetGhost: () => void;
  resetChatState: () => void;
  setStoryStatus: (value: string) => void;
  setBufferState: (value: BufferState) => void;
  setActionsDockEl: (value: HTMLElement | null) => void;
  setAssistDockEl: (value: HTMLElement | null) => void;
  setReportDockEl: (value: HTMLElement | null) => void;
}) {
  const {
    storySlug,
    sceneId,
    currentVersionId,
    initialText,
    text,
    dirty,
    bufferKey,
    prefs,
    showWriteTools,
    setPrefs,
    setShowWriteTools,
    setText,
    setBaselineText,
    setMsg,
    resetGhost,
    resetChatState,
    setStoryStatus,
    setBufferState,
    setActionsDockEl,
    setAssistDockEl,
    setReportDockEl,
  } = params;

  useDraftRunnerPreferenceEffects({
    prefs,
    showWriteTools,
    setPrefs,
    setShowWriteTools,
  });

  const { flushLocalBuffer } = useDraftRunnerRuntimeEffects({
    storySlug,
    sceneId,
    currentVersionId,
    initialText,
    text,
    dirty,
    bufferKey,
    setText,
    setBaselineText,
    setMsg,
    resetGhost,
    resetChatState,
    setStoryStatus,
    setBufferState,
    setActionsDockEl,
    setAssistDockEl,
    setReportDockEl,
  });

  return { flushLocalBuffer };
}

import type { Dispatch, SetStateAction } from "react";
import type { AssistMode, MuseChatBeat, MuseChatScope, MuseCompressedSummary, MuseTargetRange, Preferences } from "@/features/scenes/components/draftRunner/shared";

export type QuickAssistProps = {
  ghostSuggestionReady: boolean;
  museV2Enabled: boolean;
  prefs: Preferences;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setPrefs: Dispatch<SetStateAction<Preferences>>;
  ghostCooldownSec: number;
  ghostIdleCountdownSec: number | null;
  ghostRunning: boolean;
  isSceneLocked: boolean;
  pullGhostSuggestion: (mode: "bullets" | "block") => Promise<void>;
  ghostMode: "bullets" | "block";
  ghostBullets: string[];
  ghostText: string;
  acceptGhost: () => void;
  dismissGhost: () => void;
};

export type ChatAssistProps = {
  chatPhase: string;
  chatScope: MuseChatScope;
  onChatScopeChange: (next: MuseChatScope) => void;
  chatTargetRange: MuseTargetRange;
  setChatTargetRange: Dispatch<SetStateAction<MuseTargetRange>>;
  chatIdeasDraft: string;
  setChatIdeasDraft: Dispatch<SetStateAction<string>>;
  chatContextDraft: string;
  setChatContextDraft: Dispatch<SetStateAction<string>>;
  chatCompressed: MuseCompressedSummary | null;
  chapterPayloadMaxKb: number;
  chatBusy: boolean;
  runMuseChatCompress: () => Promise<void>;
  runMuseChatSynthesis: () => Promise<void>;
  runMuseChatProse: () => Promise<void>;
  chatBeats: MuseChatBeat[];
  chatError: string | null;
  chatMacroAnchor: string;
  chatIntent: string;
  chatQuestions: string[];
  chatProse: string;
  isSceneLocked: boolean;
  acceptMuseChatProse: () => void;
  clearChatState: () => void;
};

export type DraftAssistPanelProps = {
  assistMode: AssistMode;
  setAssistMode: Dispatch<SetStateAction<AssistMode>>;
  museChatEnabled: boolean;
} & QuickAssistProps &
  ChatAssistProps;

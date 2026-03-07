import { useMemo, useState } from "react";
import {
  DEFAULT_PREFS,
  buildBufferKey,
  buildMuseHistoryKey,
  buildMuseReportDraftKey,
  type AssistMode,
  type ConsistencySummary,
  type GuardPayload,
  type Preferences,
  type WriteViewMode,
} from "@/features/scenes/components/draftRunner/shared";

type RunningAction = "none" | "commit" | "consistency" | "evaluate" | "rewrite" | "lock" | "autowrite";
type BufferState = "idle" | "pending" | "saved";

export function useDraftRunnerState(params: {
  storySlug: string;
  sceneId: string;
  currentVersionId: number | null;
  initialText: string;
}) {
  const { storySlug, sceneId, currentVersionId, initialText } = params;

  const [storyStatus, setStoryStatus] = useState<string>("ACTIVE");
  const [text, setText] = useState(initialText);
  const [baselineText, setBaselineText] = useState(initialText);
  const [bufferState, setBufferState] = useState<BufferState>("idle");
  const [runningAction, setRunningAction] = useState<RunningAction>("none");
  const [msg, setMsg] = useState<string | null>(null);
  const [guard, setGuard] = useState<GuardPayload | null>(null);
  const [lastGuardTokens, setLastGuardTokens] = useState<number>(0);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assistMode, setAssistMode] = useState<AssistMode>("quick");
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [consistencySummary, setConsistencySummary] = useState<ConsistencySummary | null>(null);
  const [actionsDockEl, setActionsDockEl] = useState<HTMLElement | null>(null);
  const [assistDockEl, setAssistDockEl] = useState<HTMLElement | null>(null);
  const [reportDockEl, setReportDockEl] = useState<HTMLElement | null>(null);
  const [writeViewMode, setWriteViewMode] = useState<WriteViewMode>("edit");
  const [showWriteTools, setShowWriteTools] = useState(true);
  const [showWriteMore, setShowWriteMore] = useState(false);

  const bufferKey = useMemo(() => buildBufferKey(storySlug, sceneId, currentVersionId), [storySlug, sceneId, currentVersionId]);
  const museHistoryKey = useMemo(() => buildMuseHistoryKey(storySlug, sceneId), [sceneId, storySlug]);
  const museReportDraftKey = useMemo(() => buildMuseReportDraftKey(storySlug, sceneId), [sceneId, storySlug]);
  const museV2Enabled = process.env.NEXT_PUBLIC_MUSE_V2_ENABLED !== "0";
  const museChatEnabled =
    process.env.NEXT_PUBLIC_MUSE_CHAT_ENABLED === "1" ||
    process.env.NEXT_PUBLIC_MUSE_CHAT_ENABLED === "true";

  return {
    storyStatus,
    setStoryStatus,
    text,
    setText,
    baselineText,
    setBaselineText,
    bufferState,
    setBufferState,
    runningAction,
    setRunningAction,
    msg,
    setMsg,
    guard,
    setGuard,
    lastGuardTokens,
    setLastGuardTokens,
    prefs,
    setPrefs,
    settingsOpen,
    setSettingsOpen,
    assistMode,
    setAssistMode,
    lastCheckedAt,
    setLastCheckedAt,
    consistencySummary,
    setConsistencySummary,
    actionsDockEl,
    setActionsDockEl,
    assistDockEl,
    setAssistDockEl,
    reportDockEl,
    setReportDockEl,
    writeViewMode,
    setWriteViewMode,
    showWriteTools,
    setShowWriteTools,
    showWriteMore,
    setShowWriteMore,
    bufferKey,
    museHistoryKey,
    museReportDraftKey,
    museV2Enabled,
    museChatEnabled,
  };
}

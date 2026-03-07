"use client";

import { useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useStory } from "@/features/story/StoryContext";
import { useDraftGhost } from "@/features/scenes/components/draftRunner/useDraftGhost";
import { useDraftControlActions } from "@/features/scenes/components/draftRunner/useDraftControlActions";
import { useDraftMuseChat } from "@/features/scenes/components/draftRunner/useDraftMuseChat";
import { useDraftReports } from "@/features/scenes/components/draftRunner/useDraftReports";
import { useDraftRunnerState } from "@/features/scenes/components/draftRunner/useDraftRunnerState";
import { useDraftRunnerEffects } from "@/features/scenes/components/draftRunner/useDraftRunnerEffects";
import { DraftAssistPanel } from "@/features/scenes/components/draftRunner/panels/AssistPanel";
import { ConsistencySummaryPanel } from "@/features/scenes/components/draftRunner/panels/ConsistencySummaryPanel";
import { DraftControlPanel } from "@/features/scenes/components/draftRunner/panels/ControlPanel";
import { DraftEditorPanel } from "@/features/scenes/components/draftRunner/panels/EditorPanel";
import { DraftReportPanel } from "@/features/scenes/components/draftRunner/panels/ReportPanel";
import {
  MAX_CONTEXT_TOKENS,
  approxTokensFromChars,
  normalizeSceneStatus,
  prefixSelectedLines,
  renderMarkdownLite,
  toPlain,
  type MuseChatScope,
  type Props,
  wrapSelectionWith,
} from "@/features/scenes/components/draftRunner/shared";

export default function DraftRunner({
  sceneId,
  sceneStatus,
  workunitId,
  currentVersionId,
  currentVersionNo,
  initialText,
  seedPrompt,
  onCommitted,
  onGhostSuggestionReadyChange,
}: Props) {
  const { storySlug, writingLanguage } = useStory();
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const {
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
  } = useDraftRunnerState({
    storySlug,
    sceneId,
    currentVersionId,
    initialText,
  });

  const normalizedSceneStatus = normalizeSceneStatus(sceneStatus);
  const isSceneLocked = normalizedSceneStatus === "LOCKED" || storyStatus === "ARCHIVED";
  const dirty = text !== baselineText;
  const commitReady = dirty && bufferState !== "pending" && runningAction === "none" && !isSceneLocked;
  const canRunControlAction = !dirty && runningAction === "none" && !isSceneLocked;
  const canCheckConsistency = canRunControlAction;
  const canEvaluate = canRunControlAction && (normalizedSceneStatus === "DRAFTED" || normalizedSceneStatus === "REVISED");
  const canRewrite = canRunControlAction && normalizedSceneStatus === "EVALUATED";
  const canLock = canRunControlAction;
  const canAutoWrite = canRunControlAction;
  const canCommit = commitReady && normalizedSceneStatus === "DRAFTING";
  const {
    ghostText,
    ghostBullets,
    ghostMode,
    ghostRunning,
    ghostCooldownSec,
    ghostIdleCountdownSec,
    ghostSuggestionReady,
    pullGhostSuggestion,
    acceptGhost,
    dismissGhost,
    resetGhost,
  } = useDraftGhost({
    prefs,
    museV2Enabled,
    isSceneLocked,
    text,
    setText,
    textRef,
    sceneId,
    storySlug,
    writingLanguage,
    museHistoryKey,
    setMsg,
    onSuggestionReadyChange: onGhostSuggestionReadyChange,
  });
  const {
    chatScope,
    setChatScope,
    chatTargetRange,
    setChatTargetRange,
    chatPhase,
    chatIdeasDraft,
    setChatIdeasDraft,
    chatContextDraft,
    setChatContextDraft,
    chatIntent,
    chatMacroAnchor,
    chatCompressed,
    setChatCompressed,
    setChatLockedBlocks,
    chatBeats,
    setChatBeats,
    chatQuestions,
    setChatQuestions,
    chatProse,
    setChatProse,
    chatError,
    setChatError,
    setChatIntent,
    setChatMacroAnchor,
    setChatPhase,
    chatBusy,
    resetChatState,
    clearChatState,
    runMuseChatCompress,
    runMuseChatSynthesis,
    runMuseChatProse,
    acceptMuseChatProse,
  } = useDraftMuseChat({
    text,
    setText,
    textRef,
    isSceneLocked,
    museChatEnabled,
    museHistoryKey,
    storySlug,
    sceneId,
    writingLanguage,
  });
  const {
    reportScope,
    setReportScope,
    reportDraft,
    setReportDraft,
    reportItems,
    reportLoading,
    reportSaving,
    reportError,
    reportFlash,
    loadReports,
    saveReport,
  } = useDraftReports({
    storySlug,
    sceneId,
    museReportDraftKey,
  });

  const globalChars = useMemo(() => {
    const g = guard?.sections?.global;
    if (!g) return 0;
    return [toPlain(g.style), toPlain(g.worldCore), toPlain(g.worldTagged)].join("\n").length;
  }, [guard]);

  const localChars = useMemo(() => {
    const s = guard?.sections;
    if (!s) return 0;
    const localCanon = toPlain(s.local?.canon ?? s.canon);
    const localRel = toPlain(s.local?.relationships ?? s.relationships);
    const localEvents = toPlain(s.local?.recentEvents ?? s.recentEvents);
    const localUncertain = toPlain(s.local?.uncertain ?? s.uncertain);
    return [localCanon, localRel, localEvents, localUncertain].join("\n").length;
  }, [guard]);

  const sceneChars = text.length;
  const approxTokens = approxTokensFromChars(sceneChars + globalChars + localChars);
  const budgetPct = Math.min(100, Math.round((approxTokens / MAX_CONTEXT_TOKENS) * 100));
  const budgetColor = budgetPct < 60 ? "bg-emerald-500" : budgetPct <= 85 ? "bg-amber-500" : "bg-red-500";

  const { flushLocalBuffer } = useDraftRunnerEffects({
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
  });

  const { checkConsistency, evaluateScene, rewriteTargeted, lockScene, runAutoWrite, commitVersion } = useDraftControlActions({
    canRunControlAction,
    canAutoWrite,
    commitReady,
    storySlug,
    sceneId,
    workunitId,
    seedPrompt,
    text,
    writingLanguage,
    bufferKey,
    maxContextTokens: MAX_CONTEXT_TOKENS,
    onCommitted,
    flushLocalBuffer,
    setMsg,
    setGuard,
    setConsistencySummary,
    setLastGuardTokens,
    setLastCheckedAt,
    setText,
    setBaselineText,
    setBufferState,
    setRunningAction,
  });

  function applyWrap(prefix: string, suffix: string, fallbackText: string) {
    const el = textRef.current;
    if (!el || isSceneLocked) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const { nextValue, nextStart, nextEnd } = wrapSelectionWith(text, start, end, prefix, suffix, fallbackText);
    setText(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextStart, nextEnd);
    });
  }

  function applyLinePrefix(marker: string) {
    const el = textRef.current;
    if (!el || isSceneLocked) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const { nextValue, nextStart, nextEnd } = prefixSelectedLines(text, start, end, marker);
    setText(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextStart, nextEnd);
    });
  }

  const pipelineSteps = useMemo(
    () => [
      { key: "DRAFTING", label: "Drafting", done: false, current: normalizedSceneStatus === "DRAFTING" },
      {
        key: "DRAFTED",
        label: "Drafted",
        done: normalizedSceneStatus === "DRAFTED" || normalizedSceneStatus === "EVALUATED" || normalizedSceneStatus === "REVISED" || normalizedSceneStatus === "LOCKED",
        current: normalizedSceneStatus === "DRAFTED",
      },
      {
        key: "EVALUATED",
        label: "Evaluated",
        done: normalizedSceneStatus === "EVALUATED" || normalizedSceneStatus === "REVISED" || normalizedSceneStatus === "LOCKED",
        current: normalizedSceneStatus === "EVALUATED",
      },
      {
        key: "REVISED",
        label: "Revised",
        done: normalizedSceneStatus === "REVISED" || normalizedSceneStatus === "LOCKED",
        current: normalizedSceneStatus === "REVISED",
      },
      {
        key: "LOCKED",
        label: "Locked",
        done: normalizedSceneStatus === "LOCKED",
        current: normalizedSceneStatus === "LOCKED",
      },
    ],
    [normalizedSceneStatus]
  );

  const onChatScopeChange = useCallback(
    (next: MuseChatScope) => {
      setChatScope(next);
      setChatError(null);
      setChatIntent("");
      setChatMacroAnchor("");
      setChatBeats([]);
      setChatQuestions([]);
      setChatProse("");
      setChatCompressed(null);
      setChatLockedBlocks([]);
      setChatPhase("idle");
    },
    [setChatBeats, setChatCompressed, setChatError, setChatIntent, setChatLockedBlocks, setChatMacroAnchor, setChatPhase, setChatProse, setChatQuestions, setChatScope]
  );

  const chapterPayloadMaxKb = 350;
  const controlPanel = (
    <DraftControlPanel
      checkConsistency={checkConsistency}
      evaluateScene={evaluateScene}
      rewriteTargeted={rewriteTargeted}
      runAutoWrite={runAutoWrite}
      lockScene={lockScene}
      commitVersion={commitVersion}
      canCheckConsistency={canCheckConsistency}
      canEvaluate={canEvaluate}
      canRewrite={canRewrite}
      canAutoWrite={canAutoWrite}
      canLock={canLock}
      canCommit={canCommit}
      runningAction={runningAction}
      approxTokens={approxTokens}
      maxContextTokens={MAX_CONTEXT_TOKENS}
      budgetColor={budgetColor}
      sceneId={sceneId}
      currentVersionNo={currentVersionNo}
      sceneStatus={sceneStatus}
      sceneChars={sceneChars}
      globalChars={globalChars}
      localChars={localChars}
      lastGuardTokens={lastGuardTokens}
      lastCheckedAt={lastCheckedAt}
      budgetPct={budgetPct}
    />
  );
  const assistPanel = (
    <DraftAssistPanel
      assistMode={assistMode}
      setAssistMode={setAssistMode}
      museChatEnabled={museChatEnabled}
      ghostSuggestionReady={ghostSuggestionReady}
      museV2Enabled={museV2Enabled}
      prefs={prefs}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      setPrefs={setPrefs}
      ghostCooldownSec={ghostCooldownSec}
      ghostIdleCountdownSec={ghostIdleCountdownSec ?? 0}
      ghostRunning={ghostRunning}
      isSceneLocked={isSceneLocked}
      pullGhostSuggestion={pullGhostSuggestion}
      ghostMode={ghostMode}
      ghostBullets={ghostBullets}
      ghostText={ghostText}
      acceptGhost={acceptGhost}
      dismissGhost={dismissGhost}
      chatPhase={chatPhase}
      chatScope={chatScope}
      onChatScopeChange={onChatScopeChange}
      chatTargetRange={chatTargetRange}
      setChatTargetRange={setChatTargetRange}
      chatIdeasDraft={chatIdeasDraft}
      setChatIdeasDraft={setChatIdeasDraft}
      chatContextDraft={chatContextDraft}
      setChatContextDraft={setChatContextDraft}
      chatCompressed={chatCompressed}
      chapterPayloadMaxKb={chapterPayloadMaxKb}
      chatBusy={chatBusy}
      runMuseChatCompress={runMuseChatCompress}
      runMuseChatSynthesis={runMuseChatSynthesis}
      runMuseChatProse={runMuseChatProse}
      chatBeats={chatBeats}
      chatError={chatError}
      chatMacroAnchor={chatMacroAnchor}
      chatIntent={chatIntent}
      chatQuestions={chatQuestions}
      chatProse={chatProse}
      acceptMuseChatProse={acceptMuseChatProse}
      clearChatState={clearChatState}
    />
  );
  const reportPanel = (
    <DraftReportPanel
      reportScope={reportScope}
      setReportScope={setReportScope}
      reportDraft={reportDraft}
      setReportDraft={setReportDraft}
      reportSaving={reportSaving}
      saveReport={saveReport}
      reportLoading={reportLoading}
      loadReports={loadReports}
      reportFlash={reportFlash}
      reportError={reportError}
      reportItems={reportItems}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-[#e8edf2]">
      {actionsDockEl ? createPortal(controlPanel, actionsDockEl) : controlPanel}
      {assistDockEl ? createPortal(assistPanel, assistDockEl) : assistPanel}
      {reportDockEl ? createPortal(reportPanel, reportDockEl) : reportPanel}
      <section className="surface-card p-2">
        <div className="flex flex-wrap items-center gap-2">
          {pipelineSteps.map((step) => (
            <span
              key={step.key}
              className={
                step.current
                  ? "status-pill status-pill--other"
                  : step.done
                    ? "shell-link px-2 py-1 text-xs"
                    : "shell-link border-dashed px-2 py-1 text-xs opacity-70"
              }
            >
              {step.label}
            </span>
          ))}
          <span className="muted ml-auto text-xs">
            current: {normalizedSceneStatus ?? sceneStatus} {storyStatus === "ARCHIVED" ? "| story archived" : ""}
          </span>
        </div>
      </section>
      {msg ? <div className="surface-card px-3 py-2 text-sm">{msg}</div> : null}
      {isSceneLocked ? (
        <div className="rounded border border-[#5d4430] bg-[#2e2217] px-2 py-1 text-sm text-[#ffd9a6]">
          Scene is locked or story is archived. Editing actions are disabled.
        </div>
      ) : null}
      <DraftEditorPanel
        writeViewMode={writeViewMode}
        setWriteViewMode={setWriteViewMode}
        showWriteTools={showWriteTools}
        setShowWriteTools={setShowWriteTools}
        showWriteMore={showWriteMore}
        setShowWriteMore={setShowWriteMore}
        isSceneLocked={isSceneLocked}
        applyWrap={applyWrap}
        applyLinePrefix={applyLinePrefix}
        textRef={textRef}
        prefs={prefs}
        text={text}
        setText={setText}
        renderPreview={renderMarkdownLite}
        bufferState={bufferState}
        dirty={dirty}
      />
      {consistencySummary ? <ConsistencySummaryPanel summary={consistencySummary} /> : null}
    </div>
  );
}

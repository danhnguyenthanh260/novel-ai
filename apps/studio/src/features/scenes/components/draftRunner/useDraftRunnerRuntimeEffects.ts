import { useCallback, useEffect, useRef } from "react";
import { AUTOSAVE_DEBOUNCE_MS, parseJsonSafe, resolveVisibleDock } from "@/features/scenes/components/draftRunner/shared";

type BufferState = "idle" | "pending" | "saved";

export function useDraftRunnerRuntimeEffects(params: {
  storySlug: string;
  sceneId: string;
  currentVersionId: number | null;
  initialText: string;
  text: string;
  dirty: boolean;
  bufferKey: string;
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
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
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
  } = params;

  useEffect(() => {
    setText(initialText);
    setBaselineText(initialText);
    setMsg(null);
    resetGhost();
    resetChatState();
    const restore = parseJsonSafe<{ text?: string; updated_at?: string }>(localStorage.getItem(bufferKey), {});
    if (typeof restore.text === "string" && restore.text !== initialText) {
      setText(restore.text);
      setMsg(`Recovered local buffer from ${restore.updated_at ?? "previous session"}.`);
    }
  }, [bufferKey, initialText, resetChatState, resetGhost, setBaselineText, setMsg, setText]);

  useEffect(() => {
    let dead = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/stories/${storySlug}`, { cache: "no-store" });
        const json = await res.json();
        if (!dead) setStoryStatus(typeof json?.item?.status === "string" ? json.item.status : "ACTIVE");
      } catch {
        if (!dead) setStoryStatus("ACTIVE");
      }
    };
    run();
    return () => {
      dead = true;
    };
  }, [setStoryStatus, storySlug]);

  useEffect(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    if (!dirty) {
      setBufferState("idle");
      return;
    }
    setBufferState("pending");
    autosaveTimerRef.current = setTimeout(() => {
      localStorage.setItem(
        bufferKey,
        JSON.stringify({
          text,
          updated_at: new Date().toISOString(),
          story_slug: storySlug,
          scene_id: sceneId,
          current_version_id: currentVersionId,
        })
      );
      setBufferState("saved");
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [bufferKey, currentVersionId, dirty, sceneId, setBufferState, storySlug, text]);

  useEffect(() => {
    const bindDockTargets = () => {
      setActionsDockEl(resolveVisibleDock("write-dock-actions"));
      setAssistDockEl(resolveVisibleDock("write-dock-assist"));
      setReportDockEl(resolveVisibleDock("write-dock-report"));
    };
    bindDockTargets();
    window.addEventListener("resize", bindDockTargets);
    return () => window.removeEventListener("resize", bindDockTargets);
  }, [setActionsDockEl, setAssistDockEl, setReportDockEl]);

  const flushLocalBuffer = useCallback(() => {
    if (!dirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    localStorage.setItem(
      bufferKey,
      JSON.stringify({
        text,
        updated_at: new Date().toISOString(),
        story_slug: storySlug,
        scene_id: sceneId,
        current_version_id: currentVersionId,
      })
    );
    setBufferState("saved");
  }, [bufferKey, currentVersionId, dirty, sceneId, setBufferState, storySlug, text]);

  return { flushLocalBuffer };
}

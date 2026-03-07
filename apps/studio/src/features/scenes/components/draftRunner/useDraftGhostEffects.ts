import { useEffect } from "react";

export function useDraftGhostEffects(params: {
  ghostSuggestionReady: boolean;
  onSuggestionReadyChange?: (ready: boolean) => void;
  ghostCooldownUntil: number;
  setGhostCooldownSec: (v: number) => void;
  prefsGhostEnabled: boolean;
  prefsGhostIdleSec: number;
  ghostRunning: boolean;
  isSceneLocked: boolean;
  ghostCooldownSec: number;
  text: string;
  setGhostIdleCountdownSec: (v: number | null) => void;
  pullGhostSuggestion: (mode: "bullets" | "block") => Promise<void>;
}) {
  const {
    ghostSuggestionReady,
    onSuggestionReadyChange,
    ghostCooldownUntil,
    setGhostCooldownSec,
    prefsGhostEnabled,
    prefsGhostIdleSec,
    ghostRunning,
    isSceneLocked,
    ghostCooldownSec,
    text,
    setGhostIdleCountdownSec,
    pullGhostSuggestion,
  } = params;

  useEffect(() => {
    onSuggestionReadyChange?.(ghostSuggestionReady);
  }, [ghostSuggestionReady, onSuggestionReadyChange]);

  useEffect(() => {
    if (ghostCooldownUntil <= Date.now()) {
      setGhostCooldownSec(0);
      return;
    }
    const tick = () => setGhostCooldownSec(Math.max(0, Math.ceil((ghostCooldownUntil - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [ghostCooldownUntil, setGhostCooldownSec]);

  useEffect(() => {
    const canAutoSuggest =
      prefsGhostEnabled && !ghostRunning && !isSceneLocked && ghostCooldownSec <= 0 && Boolean(text.trim());
    if (!canAutoSuggest) {
      setGhostIdleCountdownSec(null);
      return;
    }
    const delayMs = Math.max(15, prefsGhostIdleSec) * 1000;
    const triggerAt = Date.now() + delayMs;
    const tick = () => setGhostIdleCountdownSec(Math.max(1, Math.ceil((triggerAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    const timer = setTimeout(() => {
      setGhostIdleCountdownSec(null);
      pullGhostSuggestion("bullets").catch(() => undefined);
    }, delayMs);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [
    prefsGhostEnabled,
    ghostRunning,
    isSceneLocked,
    ghostCooldownSec,
    text,
    prefsGhostIdleSec,
    pullGhostSuggestion,
    setGhostIdleCountdownSec,
  ]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (!prefsGhostEnabled) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === "e") {
        ev.preventDefault();
        pullGhostSuggestion("block").catch(() => undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prefsGhostEnabled, pullGhostSuggestion]);
}

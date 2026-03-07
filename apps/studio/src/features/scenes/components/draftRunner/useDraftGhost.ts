import { type RefObject, useCallback, useMemo, useState } from "react";
import { GHOST_COOLDOWN_MS, parseMuseBullets, readMuseHistory, writeMuseHistory, type Preferences } from "@/features/scenes/components/draftRunner/shared";
import { useDraftGhostEffects } from "@/features/scenes/components/draftRunner/useDraftGhostEffects";

type Mode = "bullets" | "block";
type GhostRequestContext = { selection: string; tail: string; focusText: string };

function buildFocusContext(text: string, textRef: RefObject<HTMLTextAreaElement | null>): GhostRequestContext {
  const el = textRef.current;
  const selection =
    el && typeof el.selectionStart === "number" && typeof el.selectionEnd === "number" && el.selectionEnd > el.selectionStart
      ? text.slice(el.selectionStart, el.selectionEnd)
      : "";
  const tail = text.slice(Math.max(0, text.length - 450));
  return { selection, tail, focusText: selection || tail };
}

function normalizeSsePayload(line: string): string {
  if (!line.startsWith("data:")) return "";
  const payload = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
  return payload.trim();
}

function parseJsonDelta(payload: string): string {
  try {
    const json = JSON.parse(payload.trim());
    return json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? "";
  } catch {
    return payload;
  }
}

function parseSseDelta(line: string): string {
  const payload = normalizeSsePayload(line);
  if (!payload || payload === "[DONE]") return "";
  return parseJsonDelta(payload);
}

async function streamGhost(endpoint: string, requestBody: unknown, onDelta: (out: string) => void): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok || !res.body) throw new Error(`GHOST_FAILED_${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      const delta = parseSseDelta(line);
      if (!delta) continue;
      out += delta;
      onDelta(out);
    }
  }
  return out;
}

function buildGhostRequestBody(params: {
  museV2Enabled: boolean;
  mode: Mode;
  context: GhostRequestContext;
  storySlug: string;
  sceneId: string;
  history: string[];
  writingLanguage: string;
  museTemperature: number;
}): unknown {
  if (params.museV2Enabled) {
    return {
      storySlug: params.storySlug,
      sceneId: Number(params.sceneId),
      mode: params.mode,
      context: { selection: params.context.selection, tail: params.context.tail },
      history: params.history,
      writing_language: params.writingLanguage,
      temperature: params.museTemperature,
    };
  }
  return {
    messages: [
      { role: "system", content: "You are a writing muse. Continue stylistically with concrete imagery. Keep it concise and avoid explaining your process." },
      { role: "user", content: `Continue this passage:\n\n${params.context.focusText}` },
    ],
    writing_language: params.writingLanguage,
    temperature: params.museTemperature,
    max_tokens: params.mode === "block" ? 360 : 220,
  };
}

function applyGhostDelta(mode: Mode, out: string, setGhostBullets: (v: string[]) => void, setGhostText: (v: string) => void): void {
  if (mode === "bullets") {
    const parsed = parseMuseBullets(out);
    setGhostBullets(parsed);
    setGhostText(parsed.length > 0 ? "" : out);
    return;
  }
  setGhostText(out);
}

export function useDraftGhost(params: {
  prefs: Preferences;
  museV2Enabled: boolean;
  isSceneLocked: boolean;
  text: string;
  setText: (value: string | ((prev: string) => string)) => void;
  textRef: RefObject<HTMLTextAreaElement | null>;
  sceneId: string;
  storySlug: string;
  writingLanguage: string;
  museHistoryKey: string;
  setMsg: (value: string | null) => void;
  onSuggestionReadyChange?: (ready: boolean) => void;
}) {
  const [ghostText, setGhostText] = useState("");
  const [ghostBullets, setGhostBullets] = useState<string[]>([]);
  const [ghostMode, setGhostMode] = useState<Mode>("bullets");
  const [ghostRunning, setGhostRunning] = useState(false);
  const [ghostCooldownUntil, setGhostCooldownUntil] = useState(0);
  const [ghostCooldownSec, setGhostCooldownSec] = useState(0);
  const [ghostIdleCountdownSec, setGhostIdleCountdownSec] = useState<number | null>(null);

  const ghostSuggestionReady = useMemo(
    () => ghostBullets.length > 0 || Boolean(ghostText.trim()),
    [ghostBullets, ghostText]
  );

  const pullGhostSuggestion = useCallback(async (mode: Mode) => {
    if (ghostRunning || !params.prefs.ghostEnabled) return;
    if (Date.now() < ghostCooldownUntil) return;
    const context = buildFocusContext(params.text, params.textRef);
    if (!context.focusText.trim()) return;

    setGhostRunning(true);
    setGhostMode(mode);
    setGhostText("");
    setGhostBullets([]);
    try {
      const endpoint = params.museV2Enabled ? "/api/muse/stream" : "/api/pipeline/draft/stream";
      const history = readMuseHistory(params.museHistoryKey);
      const requestBody = buildGhostRequestBody({
        museV2Enabled: params.museV2Enabled,
        mode,
        context,
        storySlug: params.storySlug,
        sceneId: params.sceneId,
        history,
        writingLanguage: params.writingLanguage,
        museTemperature: params.prefs.museTemperature,
      });
      const out = await streamGhost(endpoint, requestBody, (current) =>
        applyGhostDelta(mode, current, setGhostBullets, setGhostText)
      );

      const finalBullets = mode === "bullets" ? parseMuseBullets(out) : [];
      const finalText = mode === "bullets" ? (finalBullets.length > 0 ? finalBullets.join("\n") : out) : out;
      if (finalText.trim()) writeMuseHistory(params.museHistoryKey, finalText);
    } catch (e: unknown) {
      params.setMsg(e instanceof Error ? e.message : "GHOST_FAILED");
    } finally {
      setGhostRunning(false);
    }
  }, [ghostCooldownUntil, ghostRunning, params]);

  const acceptGhost = useCallback(() => {
    const accepted = ghostMode === "bullets" ? (ghostBullets.length > 0 ? ghostBullets.join("\n") : ghostText) : ghostText;
    if (!accepted.trim()) return;
    params.setText((prev) => `${prev}${prev.endsWith("\n") ? "" : "\n"}${accepted}`);
    setGhostText("");
    setGhostBullets([]);
  }, [ghostBullets, ghostMode, ghostText, params]);

  const dismissGhost = useCallback(() => {
    setGhostText("");
    setGhostBullets([]);
    setGhostCooldownUntil(Date.now() + GHOST_COOLDOWN_MS);
  }, []);

  const resetGhost = useCallback(() => {
    setGhostText("");
    setGhostBullets([]);
    setGhostMode("bullets");
    setGhostCooldownUntil(0);
    setGhostCooldownSec(0);
    setGhostIdleCountdownSec(null);
  }, []);

  useDraftGhostEffects({
    ghostSuggestionReady,
    onSuggestionReadyChange: params.onSuggestionReadyChange,
    ghostCooldownUntil,
    setGhostCooldownSec,
    prefsGhostEnabled: params.prefs.ghostEnabled,
    prefsGhostIdleSec: params.prefs.ghostIdleSec,
    ghostRunning,
    isSceneLocked: params.isSceneLocked,
    ghostCooldownSec,
    text: params.text,
    setGhostIdleCountdownSec,
    pullGhostSuggestion,
  });

  return {
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
  };
}

import { renderMarkdownLite } from "@/features/scenes/components/draftRunner/markdownLite";

export type Props = {
  sceneId: string;
  sceneStatus: string;
  workunitId?: string;
  currentVersionId: number | null;
  currentVersionNo: number | null;
  initialText: string;
  seedPrompt: string;
  onCommitted?: () => Promise<void> | void;
  onGhostSuggestionReadyChange?: (ready: boolean) => void;
};

export type GuardPayload = {
  sections?: {
    global?: { style?: string[]; worldCore?: string[]; worldTagged?: string[] };
    local?: { canon?: string[]; relationships?: string[]; recentEvents?: string[]; uncertain?: string[] };
    canon?: string[];
    relationships?: string[];
    recentEvents?: string[];
    uncertain?: string[];
  };
  stats?: { approx_tokens?: number };
};

export type Preferences = {
  ghostEnabled: boolean;
  ghostIdleSec: number;
  museTemperature: number;
  editorFontSize: number;
};

export type ConsistencySummary = {
  canonConflicts: string[];
  timelineInconsistencies: string[];
  uncertainQuestions: string[];
};

export type MuseReportItem = {
  id: string;
  scene_id: number | null;
  raw_content_md: string;
  created_by: string;
  created_at: string;
};

export type WriteViewMode = "edit" | "split" | "preview";
export type AssistMode = "quick" | "chat";
export type MuseChatScope = "selection" | "scene" | "chapter";
export type MuseTargetRange = "patch_short" | "medium" | "rewrite_scene";
export type MuseChatPhase = "idle" | "compressing" | "ready_to_synthesize" | "synthesizing" | "review" | "writing";
export type MuseChatBeat = {
  id: string;
  goal: string;
  conflict: string;
  turn: string;
};
export type MuseCompressedSummary = {
  core_thesis: string;
  emotional_arc: string[];
  critical_events: string[];
  unresolved_risks: string[];
  style_notes: string[];
  constraints_for_next_step: string[];
};

type SceneWorkflowStatus = "DRAFTING" | "DRAFTED" | "EVALUATED" | "REVISED" | "LOCKED";

export const DEFAULT_PREFS: Preferences = {
  ghostEnabled: false,
  ghostIdleSec: 60,
  museTemperature: 0.92,
  editorFontSize: 16,
};

export const MAX_CONTEXT_TOKENS = 8192;
export const AUTOSAVE_DEBOUNCE_MS = 3500;
export const GHOST_COOLDOWN_MS = 30000;
const MUSE_HISTORY_LIMIT = 5;
export const MAX_MUSE_CHAPTER_BYTES = 350 * 1024;
export const WRITE_TOOLS_VISIBLE_KEY = "write_toolbar_visible:v1";

export function approxTokensFromChars(chars: number): number {
  return Math.ceil(chars / 3.8);
}

export function toPlain(lines?: string[]): string {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  return lines.join("\n");
}

export function parseJsonSafe<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function buildBufferKey(storySlug: string, sceneId: string, versionId: number | null): string {
  return `write_buffer:v1:${storySlug}:${sceneId}:${versionId ?? "none"}`;
}

export function buildMuseHistoryKey(storySlug: string, sceneId: string): string {
  return `muse_history:v1:${storySlug}:${sceneId}`;
}

export function buildMuseReportDraftKey(storySlug: string, sceneId: string): string {
  return `muse_report_draft:v1:${storySlug}:${sceneId}`;
}

export function parseMuseBullets(raw: string): string[] {
  const explicit = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^([-*]|(\d+[\.\)]))\s+/.test(line))
    .map((line) => line.replace(/^([-*]|(\d+[\.\)]))\s+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 3);
  if (explicit.length >= 3) return explicit;

  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) return explicit;

  const chunks = normalized
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  const sentenceLike = (chunks.length >= 3 ? chunks : normalized.split(/(?<=[.!?])\s+/))
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (sentenceLike.length === 0) return explicit;
  if (sentenceLike.length <= 3) return sentenceLike.slice(0, 3);

  const grouped: string[] = [];
  const groupSize = Math.ceil(sentenceLike.length / 3);
  for (let i = 0; i < 3; i += 1) {
    const start = i * groupSize;
    const end = Math.min(sentenceLike.length, start + groupSize);
    const block = sentenceLike.slice(start, end).join(" ").trim();
    if (block) grouped.push(block);
  }
  return grouped.slice(0, 3);
}

export function parseMuseChatIdeas(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^[-*\d\.\)\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 12);
}

export function parseMuseLockedBlocks(raw: string): { stripped: string; blocks: string[] } {
  const lockRegex = /\[\[LOCK\]\]([\s\S]*?)\[\[\/LOCK\]\]/g;
  const blocks: string[] = [];
  const stripped = raw.replace(lockRegex, (_full, inner: string) => {
    const cleaned = inner.trim();
    if (cleaned) blocks.push(cleaned);
    return "";
  });
  return { stripped: stripped.trim(), blocks: blocks.slice(0, 20) };
}

export function toUtf8Bytes(raw: string): number {
  return new TextEncoder().encode(raw).length;
}

export function readMuseHistory(key: string): string[] {
  const parsed = parseJsonSafe<unknown>(localStorage.getItem(key), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, MUSE_HISTORY_LIMIT);
}

export function writeMuseHistory(key: string, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const prev = readMuseHistory(key);
  const deduped = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, MUSE_HISTORY_LIMIT);
  localStorage.setItem(key, JSON.stringify(deduped));
}

export { renderMarkdownLite };

export function resolveVisibleDock(id: string): HTMLElement | null {
  const matches = Array.from(document.querySelectorAll<HTMLElement>(`#${id}`));
  if (matches.length === 0) return null;
  return matches.find((el) => el.getClientRects().length > 0) ?? matches[matches.length - 1] ?? null;
}

export function normalizeSceneStatus(status: string): SceneWorkflowStatus | null {
  if (status === "DRAFTING" || status === "DRAFTED" || status === "EVALUATED" || status === "REVISED" || status === "LOCKED") {
    return status;
  }
  return null;
}

export function wrapSelectionWith(
  value: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  fallbackText: string
): { nextValue: string; nextStart: number; nextEnd: number } {
  const selected = value.slice(start, end);
  const inner = selected || fallbackText;
  const nextValue = `${value.slice(0, start)}${prefix}${inner}${suffix}${value.slice(end)}`;
  const nextStart = start + prefix.length;
  const nextEnd = nextStart + inner.length;
  return { nextValue, nextStart, nextEnd };
}

export function prefixSelectedLines(
  value: string,
  start: number,
  end: number,
  marker: string
): { nextValue: string; nextStart: number; nextEnd: number } {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndCandidate = value.indexOf("\n", end);
  const lineEnd = lineEndCandidate === -1 ? value.length : lineEndCandidate;
  const segment = value.slice(lineStart, lineEnd);
  const nextSegment = segment
    .split("\n")
    .map((line) => `${marker}${line}`)
    .join("\n");
  const nextValue = `${value.slice(0, lineStart)}${nextSegment}${value.slice(lineEnd)}`;
  return {
    nextValue,
    nextStart: lineStart,
    nextEnd: lineStart + nextSegment.length,
  };
}

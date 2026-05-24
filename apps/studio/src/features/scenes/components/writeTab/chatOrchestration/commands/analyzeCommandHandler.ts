import { type CommandResult, workspaceHref } from "@/features/scenes/components/writeTab/chatOrchestration/commandSurfaceContracts";
import type { AnalysisSnapshot, TimelineBlock } from "@/features/scenes/components/writeTab/types";
import type { WorkflowCommandHandlerArgs } from "@/features/scenes/components/writeTab/chatOrchestration/commands/statusCommandHandler";

type AnalysisResponse = {
  ok?: boolean;
  items?: AnalysisItem[];
  error?: string;
};

type AnalysisItem = {
  id: number;
  chapter_id: string | null;
  fact_status: string;
  ready_for_writing: boolean;
  degraded_mode: boolean;
  narrative_score: number;
  emotional_target: string | null;
  created_at: string;
  active: boolean;
  analysis_data: Record<string, unknown> | null;
  scope_type: "chapter" | "batch" | "arc" | "story";
  scope_key: string;
  status: "DRAFT" | "APPROVED" | "SUPERSEDED" | "CANCELED";
  vetting_summary?: {
    duplicate_count?: number;
    conflict_count?: number;
  };
};

export type AnalyzeCommandHandlerResult = {
  block: TimelineBlock;
  result: CommandResult;
  snapshot: AnalysisSnapshot | null;
};

const FRESH_MS = 5 * 60 * 1000;

function commandUrl(args: WorkflowCommandHandlerArgs): string {
  const url = new URL(`/api/stories/${encodeURIComponent(args.storySlug)}/analysis`, window.location.origin);
  if (args.chatScope === "chapter" && args.chapterId) url.searchParams.set("chapter_id", args.chapterId);
  url.searchParams.set("scope_type", args.chatScope === "story" ? "story" : "chapter");
  return url.toString();
}

async function fetchAnalysis(args: WorkflowCommandHandlerArgs): Promise<AnalysisItem | null> {
  const res = await fetch(commandUrl(args), { cache: "no-store" });
  const json = await res.json().catch(() => ({})) as AnalysisResponse;
  if (!res.ok || !json.ok || !Array.isArray(json.items)) throw new Error(json.error ?? "ANALYZE_COMMAND_FAILED");
  return json.items.find((item) => item.active) ?? json.items[0] ?? null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item.trim();
    const itemRecord = record(item);
    return String(itemRecord.description || itemRecord.label || itemRecord.issue || itemRecord.name || "").trim();
  }).filter(Boolean).slice(0, 8);
}

function snapshotV3(item: AnalysisItem): Record<string, unknown> {
  const data = record(item.analysis_data);
  const finalPayload = record(data.final_memory_payload);
  const aggregate = record(data.aggregate_snapshot);
  return record(data.snapshot_v3 || finalPayload.snapshot_v3 || aggregate.snapshot_v3);
}

function freshness(createdAt: string): AnalysisSnapshot["freshness"] {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return "missing";
  return Date.now() - created <= FRESH_MS ? "fresh" : "stale";
}

function verdict(item: AnalysisItem, fresh: AnalysisSnapshot["freshness"]): AnalysisSnapshot["verdict"] {
  if (fresh === "stale") return "stale";
  if (item.ready_for_writing && item.fact_status === "CLEAN" && !item.degraded_mode) return "ready";
  if (item.fact_status === "BLOCKED" || item.status === "CANCELED") return "blocked";
  return "needs-review";
}

function plotFindingsFromSnapshot(snap: Record<string, unknown>): string[] {
  const metrics = record(snap.narrative_metrics);
  return [
    ...stringList(snap.subplots_open),
    Number.isFinite(Number(metrics.narrative_score)) ? `Narrative score: ${Number(metrics.narrative_score).toFixed(2)}` : null,
    metrics.lore_debt ? "Lore debt is flagged." : null,
  ].filter((value): value is string => Boolean(value));
}

function flagsForItem(item: AnalysisItem): string[] {
  return [
    `Fact status: ${item.fact_status}`,
    `Narrative score: ${Number(item.narrative_score || 0).toFixed(2)}`,
    `Status: ${item.status}`,
    item.degraded_mode ? "Degraded mode" : null,
    item.vetting_summary?.conflict_count ? `Conflicts: ${item.vetting_summary.conflict_count}` : null,
    item.vetting_summary?.duplicate_count ? `Duplicates: ${item.vetting_summary.duplicate_count}` : null,
  ].filter((value): value is string => Boolean(value));
}

function analysisSnapshot(args: WorkflowCommandHandlerArgs, item: AnalysisItem): AnalysisSnapshot {
  const snap = snapshotV3(item);
  const fresh = freshness(item.created_at);
  const characterVoices = Array.isArray(snap.character_voices)
    ? snap.character_voices.map((voice) => {
      const voiceRecord = record(voice);
      return [voiceRecord.name, voiceRecord.tone].filter(Boolean).join(": ");
    }).filter(Boolean).slice(0, 8)
    : [];

  return {
    title: args.chatScope === "story" ? "Story analysis artifact" : `Chapter ${(item.chapter_id ?? args.chapterId) || "current"} analysis artifact`,
    scope: args.chatScope,
    chapterId: item.chapter_id,
    verdict: verdict(item, fresh),
    freshness: fresh,
    updatedAt: item.created_at,
    flags: flagsForItem(item),
    continuityFindings: stringList(snap.open_loops),
    characterFindings: characterVoices,
    plotFindings: plotFindingsFromSnapshot(snap),
  };
}

function artifactBlock(args: WorkflowCommandHandlerArgs, snapshot: AnalysisSnapshot): TimelineBlock {
  const findings = [...snapshot.continuityFindings, ...snapshot.characterFindings, ...snapshot.plotFindings].slice(0, 4);
  return {
    id: `analysis-artifact-${Date.now()}`,
    type: "artifact_preview",
    source: "backend",
    artifact_id: `analysis-${snapshot.scope}-${snapshot.chapterId ?? "story"}`,
    artifact_type: "analysis",
    title: snapshot.title,
    status: snapshot.verdict === "blocked" ? "failed" : snapshot.verdict === "stale" ? "superseded" : "draft",
    description: `Readiness verdict: ${snapshot.verdict}. ${snapshot.freshness === "fresh" ? "Using cached analysis under 5 minutes old." : "Analysis cache is stale or missing."}`,
    word_count: null,
    beat_count: null,
    preview_lines: findings.length ? findings : snapshot.flags,
    actions: [],
    action_links: [{ label: "Open full analysis workspace", href: workspaceHref(args.storySlug, "analysis") }],
  };
}

function fallback(args: WorkflowCommandHandlerArgs): AnalyzeCommandHandlerResult {
  const block: TimelineBlock = {
    id: `analysis-artifact-${Date.now()}`,
    type: "artifact_preview",
    source: "assistant",
    artifact_id: `analysis-${args.chatScope}-${args.chapterId || "story"}`,
    artifact_type: "analysis",
    title: args.chatScope === "story" ? "Story analysis artifact" : `Chapter ${args.chapterId || "current"} analysis artifact`,
    status: "failed",
    description: "No cached analysis snapshot is available inside Write yet.",
    word_count: null,
    beat_count: null,
    preview_lines: ["Run analysis from the full workspace, then return to Write for the snapshot."],
    actions: [],
    action_links: [{ label: "Open full analysis workspace", href: workspaceHref(args.storySlug, "analysis") }],
  };
  return {
    block,
    snapshot: null,
    result: { tone: "blocked", title: "Analysis snapshot unavailable", detail: "No cached analysis snapshot was available for this scope." },
  };
}

export async function runAnalyzeCommand(args: WorkflowCommandHandlerArgs): Promise<AnalyzeCommandHandlerResult> {
  try {
    const item = await fetchAnalysis(args);
    if (!item) return fallback(args);
    const snapshot = analysisSnapshot(args, item);
    return {
      block: artifactBlock(args, snapshot),
      snapshot,
      result: {
        tone: snapshot.verdict === "blocked" ? "blocked" : "ready",
        title: snapshot.title,
        detail: `Readiness verdict: ${snapshot.verdict}.`,
      },
    };
  } catch {
    return fallback(args);
  }
}

import {
  type CommandResult,
  workspaceHref,
} from "@/features/scenes/components/writeTab/chatOrchestration/commandSurfaceContracts";
import type {
  MemorySnapshot,
  TimelineBlock,
} from "@/features/scenes/components/writeTab/types";
import type { WorkflowCommandHandlerArgs } from "@/features/scenes/components/writeTab/chatOrchestration/commands/statusCommandHandler";

type MemoryResponse = {
  ok?: boolean;
  item?: MemoryContextItem;
  error?: string;
};

type MemoryContextItem = MemorySnapshot & {
  title: string;
  included: string[];
  degraded: string[];
};

export type MemoryCommandHandlerResult = {
  blocks: TimelineBlock[];
  result: CommandResult;
  snapshot: MemorySnapshot | null;
};

function commandUrl(args: WorkflowCommandHandlerArgs): string {
  const url = new URL(`/api/stories/${encodeURIComponent(args.storySlug)}/assistant/context`, window.location.origin);
  url.searchParams.set("scope", args.chatScope);
  if (args.chatScope === "chapter" && args.chapterId) url.searchParams.set("chapter_id", args.chapterId);
  return url.toString();
}

async function fetchMemory(args: WorkflowCommandHandlerArgs): Promise<MemoryContextItem> {
  const res = await fetch(commandUrl(args), { cache: "no-store" });
  const json = await res.json().catch(() => ({})) as MemoryResponse;
  if (!res.ok || !json.ok || !json.item) {
    throw new Error(json.error ?? "MEMORY_COMMAND_FAILED");
  }
  return json.item;
}

function summarize(items: string[], label: string): string | null {
  if (items.length === 0) return null;
  return `${label}: ${items.slice(0, 4).join("; ")}`;
}

function snapshotFromItem(item: MemoryContextItem): MemorySnapshot {
  return {
    title: item.title,
    scope: item.scope,
    chapterId: item.chapterId,
    characters: item.characters,
    arcs: item.arcs,
    tags: item.tags,
    styleNotes: item.styleNotes,
    missing: item.missing,
    conflicts: item.conflicts,
  };
}

function digestBlock(args: WorkflowCommandHandlerArgs, item: MemoryContextItem): TimelineBlock {
  const chapterLabel = (item.chapterId ?? args.chapterId) || "current";
  const included = [
    item.scope === "story" ? "Story scope" : "Chapter scope",
    summarize(item.characters, "Characters"),
    summarize(item.arcs, "Arcs"),
    summarize(item.tags, "Tags"),
    summarize(item.styleNotes, "Style notes"),
    ...item.included,
  ].filter((value): value is string => Boolean(value));

  return {
    id: `memory-digest-${Date.now()}`,
    type: "context_digest",
    source: "backend",
    title: item.scope === "story" ? "Story memory snapshot" : `Chapter ${chapterLabel} memory snapshot`,
    chapter_id: item.chapterId,
    included: Array.from(new Set(included)),
    missing: item.missing,
    degraded: item.degraded,
    conflicts: item.conflicts,
  };
}

function artifactBlock(args: WorkflowCommandHandlerArgs, item: MemoryContextItem): TimelineBlock {
  const chapterLabel = (item.chapterId ?? args.chapterId) || "current";
  const previewLines = [
    summarize(item.characters, "Characters"),
    summarize(item.arcs, "Arcs"),
    summarize(item.tags, "Tags"),
    summarize(item.styleNotes, "Style notes"),
  ].filter((value): value is string => Boolean(value));

  return {
    id: `memory-artifact-${Date.now()}`,
    type: "artifact_preview",
    source: "backend",
    artifact_id: `memory-${item.scope}-${item.chapterId ?? "story"}`,
    artifact_type: "memory",
    title: item.scope === "story" ? "Story memory snapshot" : `Chapter ${chapterLabel} memory snapshot`,
    status: item.missing.length ? "needs_approval" : "draft",
    description: item.missing.length
      ? "Memory snapshot is available with missing context called out in the inspector."
      : "Characters, arcs, tags, and style notes are ready in the Write inspector.",
    word_count: null,
    beat_count: null,
    preview_lines: previewLines.length ? previewLines : ["No memory entries are available yet."],
    actions: [],
    action_links: [{ label: "Open full Memory Hub", href: workspaceHref(args.storySlug, "memory") }],
  };
}

function fallback(args: WorkflowCommandHandlerArgs): MemoryCommandHandlerResult {
  const snapshot: MemorySnapshot = {
    title: args.chatScope === "story" ? "Story memory snapshot" : `Chapter ${args.chapterId || "current"} memory snapshot`,
    scope: args.chatScope,
    chapterId: args.chatScope === "chapter" ? args.chapterId || null : null,
    characters: [],
    arcs: [],
    tags: [],
    styleNotes: [],
    missing: ["Live memory snapshot"],
    conflicts: args.readinessContext.readiness === "blocked" ? ["Current context is blocked for writing."] : [],
  };
  const block: TimelineBlock = {
    id: `memory-digest-${Date.now()}`,
    type: "context_digest",
    source: "assistant",
    title: snapshot.title,
    chapter_id: snapshot.chapterId,
    included: [args.chatScope === "story" ? "Story scope" : "Chapter scope"],
    missing: snapshot.missing,
    degraded: ["Using local readiness because the memory service did not respond."],
    conflicts: snapshot.conflicts,
  };
  return {
    blocks: [block],
    snapshot,
    result: {
      tone: "blocked",
      title: "Memory loaded from local readiness",
      detail: "The live memory service did not respond, so I kept the available snapshot inside Write.",
    },
  };
}

export async function runMemoryCommand(args: WorkflowCommandHandlerArgs): Promise<MemoryCommandHandlerResult> {
  try {
    const item = await fetchMemory(args);
    const snapshot = snapshotFromItem(item);
    return {
      blocks: [digestBlock(args, item), artifactBlock(args, item)],
      snapshot,
      result: {
        tone: item.missing.length ? "blocked" : "ready",
        title: snapshot.title,
        detail: item.missing.length ? `Missing: ${item.missing.join(", ")}` : "Memory snapshot is available in the inspector.",
      },
    };
  } catch {
    return fallback(args);
  }
}

import {
  type CommandResult,
  workspaceHref,
} from "@/features/scenes/components/writeTab/chatOrchestration/commandSurfaceContracts";
import type {
  ChatScope,
  TimelineBlock,
} from "@/features/scenes/components/writeTab/types";
import type {
  WorkflowCommandHandlerArgs,
  WorkflowCommandHandlerResult,
} from "@/features/scenes/components/writeTab/chatOrchestration/commands/statusCommandHandler";

type ContextResponse = {
  ok?: boolean;
  item?: WorkflowContextItem;
  error?: string;
};

type WorkflowContextItem = {
  scope: ChatScope;
  chapterId: string | null;
  title: string;
  characters: string[];
  arcs: string[];
  tags: string[];
  styleNotes: string[];
  included: string[];
  missing: string[];
  degraded: string[];
  conflicts: string[];
};

function commandUrl(args: WorkflowCommandHandlerArgs): string {
  const url = new URL(`/api/stories/${encodeURIComponent(args.storySlug)}/assistant/context`, window.location.origin);
  url.searchParams.set("scope", args.chatScope);
  if (args.chatScope === "chapter" && args.chapterId) url.searchParams.set("chapter_id", args.chapterId);
  return url.toString();
}

async function fetchContext(args: WorkflowCommandHandlerArgs): Promise<WorkflowContextItem> {
  const res = await fetch(commandUrl(args), { cache: "no-store" });
  const json = await res.json().catch(() => ({})) as ContextResponse;
  if (!res.ok || !json.ok || !json.item) {
    throw new Error(json.error ?? "CONTEXT_COMMAND_FAILED");
  }
  return json.item;
}

function summarize(items: string[], label: string): string | null {
  if (items.length === 0) return null;
  return `${label}: ${items.slice(0, 4).join("; ")}`;
}

function contextBlock(args: WorkflowCommandHandlerArgs, item: WorkflowContextItem): TimelineBlock {
  const included = [
    item.scope === "story" ? "Story scope" : "Chapter scope",
    summarize(item.characters, "Characters"),
    summarize(item.arcs, "Arcs"),
    summarize(item.tags, "Tags"),
    summarize(item.styleNotes, "Style notes"),
    ...item.included,
  ].filter((value): value is string => Boolean(value));

  return {
    id: `context-${Date.now()}`,
    type: "context_digest",
    source: "backend",
    title: item.title,
    chapter_id: item.chapterId,
    included: Array.from(new Set(included)),
    missing: item.missing,
    degraded: item.degraded,
    conflicts: item.conflicts,
    action_links: [{ label: "Open full Memory Hub", href: workspaceHref(args.storySlug, "memory") }],
  };
}

function fallbackBlock(args: WorkflowCommandHandlerArgs): TimelineBlock {
  return {
    id: `context-${Date.now()}`,
    type: "context_digest",
    source: "assistant",
    title: args.chatScope === "story" ? "Story context snapshot" : `Chapter ${args.chapterId || "current"} context snapshot`,
    chapter_id: args.chatScope === "chapter" ? args.chapterId || null : null,
    included: [
      args.chatScope === "story" ? "Story scope" : "Chapter scope",
      args.readinessContext.storyTitle ? `Story: ${args.readinessContext.storyTitle}` : null,
      args.readinessContext.chapterTitle ? `Chapter: ${args.readinessContext.chapterTitle}` : null,
    ].filter((value): value is string => Boolean(value)),
    missing: ["Live context digest"],
    degraded: ["Using local readiness because context service did not respond."],
    conflicts: args.readinessContext.readiness === "blocked" ? ["Current context is blocked for writing."] : [],
    action_links: [{ label: "Open full Memory Hub", href: workspaceHref(args.storySlug, "memory") }],
  };
}

function resultFor(item: WorkflowContextItem): CommandResult {
  return {
    tone: item.missing.length > 0 ? "blocked" : "ready",
    title: item.title,
    detail: item.missing.length > 0 ? `Missing: ${item.missing.join(", ")}` : "Context snapshot is available in the inspector.",
  };
}

export async function runContextCommand(args: WorkflowCommandHandlerArgs): Promise<WorkflowCommandHandlerResult> {
  try {
    const item = await fetchContext(args);
    return { block: contextBlock(args, item), result: resultFor(item) };
  } catch {
    return {
      block: fallbackBlock(args),
      result: {
        tone: "blocked",
        title: "Context loaded from local readiness",
        detail: "The live context service did not respond, so I kept a local context snapshot inside Write.",
      },
    };
  }
}

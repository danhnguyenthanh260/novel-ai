import {
  buildContextDigestBlock,
  type CommandResult,
} from "@/features/scenes/components/writeTab/chatOrchestration/commandSurfaceContracts";
import type {
  AssistantReadinessContext,
  ChatScope,
  TimelineBlock,
} from "@/features/scenes/components/writeTab/types";

type StatusResponse = {
  ok?: boolean;
  item?: WorkflowStatusItem;
  error?: string;
};

type WorkflowStatusItem = {
  scope: ChatScope;
  chapterId: string | null;
  chapterCount: number;
  lastWriteAt: string | null;
  memoryCompleteness: number;
  analysisFlags: {
    activeSnapshots: number;
    sourceDocs: number;
    hasActiveSnapshot: boolean;
  };
  readiness: "ready" | "needs-context" | "blocked";
  missing: string[];
  nextAction: string;
};

export type WorkflowCommandHandlerArgs = {
  storySlug: string;
  chapterId: string;
  chatScope: ChatScope;
  readinessContext: AssistantReadinessContext;
};

export type WorkflowCommandHandlerResult = {
  block: TimelineBlock;
  result: CommandResult;
};

function commandUrl(args: WorkflowCommandHandlerArgs, command: "status" | "context"): string {
  const url = new URL(`/api/stories/${encodeURIComponent(args.storySlug)}/assistant/${command}`, window.location.origin);
  url.searchParams.set("scope", args.chatScope);
  if (args.chatScope === "chapter" && args.chapterId) url.searchParams.set("chapter_id", args.chapterId);
  return url.toString();
}

async function fetchStatus(args: WorkflowCommandHandlerArgs): Promise<WorkflowStatusItem> {
  const res = await fetch(commandUrl(args, "status"), { cache: "no-store" });
  const json = await res.json().catch(() => ({})) as StatusResponse;
  if (!res.ok || !json.ok || !json.item) {
    throw new Error(json.error ?? "STATUS_COMMAND_FAILED");
  }
  return json.item;
}

function statusTone(readiness: WorkflowStatusItem["readiness"]): CommandResult["tone"] {
  if (readiness === "blocked") return "blocked";
  if (readiness === "needs-context") return "blocked";
  return "ready";
}

function statusTitle(item: WorkflowStatusItem): string {
  if (item.scope === "story") return `Story status: ${item.readiness}`;
  return `Chapter status: ${item.readiness}`;
}

function statusBlock(item: WorkflowStatusItem): TimelineBlock {
  const scopeLabel = item.scope === "story" ? "Story scope" : "Chapter scope";
  return {
    id: `status-${Date.now()}`,
    type: "context_digest",
    source: "backend",
    title: statusTitle(item),
    chapter_id: item.chapterId,
    included: [
      scopeLabel,
      `Chapters: ${item.chapterCount}`,
      `Memory completeness: ${item.memoryCompleteness}%`,
      item.lastWriteAt ? `Last write: ${item.lastWriteAt}` : "Last write: none",
      `Analysis snapshots: ${item.analysisFlags.activeSnapshots}`,
      `Source docs: ${item.analysisFlags.sourceDocs}`,
      `Next action: ${item.nextAction}`,
    ],
    missing: item.missing,
    degraded: item.analysisFlags.hasActiveSnapshot ? [] : ["No active analysis snapshot."],
    conflicts: item.readiness === "blocked" ? [item.nextAction] : [],
  };
}

function fallbackBlock(args: WorkflowCommandHandlerArgs): TimelineBlock {
  const block = buildContextDigestBlock(args.readinessContext, [], `status-${Date.now()}`) as Extract<TimelineBlock, { type: "context_digest" }>;
  return {
    ...block,
    title: args.chatScope === "story" ? "Story status: needs-context" : "Chapter status: needs-context",
    included: [args.chatScope === "story" ? "Story scope" : "Chapter scope", ...block.included],
    missing: block.missing.length ? block.missing : ["Workflow status service unavailable"],
    degraded: [...block.degraded, "Using local readiness because live status could not load."],
  };
}

export async function runStatusCommand(args: WorkflowCommandHandlerArgs): Promise<WorkflowCommandHandlerResult> {
  try {
    const item = await fetchStatus(args);
    return {
      block: statusBlock(item),
      result: {
        tone: statusTone(item.readiness),
        title: statusTitle(item),
        detail: item.nextAction,
      },
    };
  } catch {
    return {
      block: fallbackBlock(args),
      result: {
        tone: "blocked",
        title: "Status loaded from local readiness",
        detail: "The live workflow status service did not respond, so I kept the result inside Write with local readiness.",
      },
    };
  }
}

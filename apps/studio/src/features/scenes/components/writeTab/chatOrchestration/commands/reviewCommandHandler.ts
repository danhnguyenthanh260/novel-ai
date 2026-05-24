import { type CommandResult, workspaceHref } from "@/features/scenes/components/writeTab/chatOrchestration/commandSurfaceContracts";
import type { ArtifactStatus, ReviewSnapshot, TimelineBlock } from "@/features/scenes/components/writeTab/types";
import type { WorkflowCommandHandlerArgs } from "@/features/scenes/components/writeTab/chatOrchestration/commands/statusCommandHandler";

type ReviewRequestItem = {
  id: number;
  chapter_id: string | null;
  status: "OPEN" | "SUBMITTED" | "APPLIED";
  rubric_version: string;
  created_at: string;
  version_no?: number | null;
};

type ReviewResponseItem = {
  id: number;
  scores_json: Record<string, unknown>;
  flags_json: Record<string, unknown>;
  suggestions_text: string | null;
  created_at: string;
};

type ReviewListResponse = {
  ok?: boolean;
  requests?: ReviewRequestItem[];
  responses?: ReviewResponseItem[];
  error?: string;
};

export type ReviewCommandHandlerResult = {
  block: TimelineBlock;
  result: CommandResult;
  snapshot: ReviewSnapshot | null;
};

function reviewsUrl(args: WorkflowCommandHandlerArgs, requestId?: number): string {
  const url = new URL(`/api/${encodeURIComponent(args.storySlug)}/reviews`, window.location.origin);
  if (requestId) url.searchParams.set("request_id", String(requestId));
  else url.searchParams.set("limit", "20");
  return url.toString();
}

async function fetchJson(url: string): Promise<ReviewListResponse> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({})) as ReviewListResponse;
  if (!res.ok || !json.ok) throw new Error(json.error ?? "REVIEW_COMMAND_FAILED");
  return json;
}

function score(response: ReviewResponseItem | null): number | null {
  if (!response) return null;
  const values = Object.values(response.scores_json).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function criticalCount(response: ReviewResponseItem | null): number {
  const critical = response?.flags_json?.critical;
  return Array.isArray(critical) ? critical.length : 0;
}

function snapshotStatus(request: ReviewRequestItem, latest: ReviewResponseItem | null): ArtifactStatus {
  if (request.status === "APPLIED") return "applied";
  if (!latest) return "pending";
  if (criticalCount(latest) > 0) return "rejected";
  const avg = score(latest);
  return avg !== null && avg < 3.5 ? "rejected" : "approved";
}

function actionsFor(status: ArtifactStatus): string[] {
  if (status === "pending") return ["approve_review", "reject_review", "rewrite_review"];
  if (status === "approved") return ["apply_review"];
  return [];
}

function snapshotFrom(request: ReviewRequestItem, responses: ReviewResponseItem[]): ReviewSnapshot {
  const latest = responses[0] ?? null;
  const status = snapshotStatus(request, latest);
  const avg = score(latest);
  return {
    requestId: request.id,
    chapterId: request.chapter_id,
    title: `Review request #${request.id}`,
    status,
    score: avg,
    feedback: [
      latest?.suggestions_text ?? "No reviewer feedback submitted yet.",
      `Rubric: ${request.rubric_version}`,
      avg === null ? "Score: pending" : `Score: ${avg.toFixed(1)}`,
    ],
    actions: actionsFor(status),
  };
}

function artifactStatus(status: ArtifactStatus): Extract<TimelineBlock, { type: "artifact_preview" }>["status"] {
  if (status === "pending") return "needs_approval";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "applied") return "applied";
  return "draft";
}

function blockFrom(args: WorkflowCommandHandlerArgs, snapshot: ReviewSnapshot): TimelineBlock {
  return {
    id: `review-artifact-${snapshot.requestId}-${Date.now()}`,
    type: "artifact_preview",
    source: "backend",
    artifact_id: `review-request-${snapshot.requestId}`,
    artifact_type: "review",
    title: snapshot.title,
    status: artifactStatus(snapshot.status),
    description: `Review state: ${snapshot.status}.`,
    word_count: null,
    beat_count: null,
    preview_lines: snapshot.feedback,
    actions: snapshot.actions,
    action_links: [{ label: "Open full reviews workspace", href: workspaceHref(args.storySlug, "reviews") }],
  };
}

function emptyResult(args: WorkflowCommandHandlerArgs): ReviewCommandHandlerResult {
  const block: TimelineBlock = {
    id: `review-artifact-empty-${Date.now()}`,
    type: "artifact_preview",
    source: "assistant",
    artifact_id: "review-empty",
    artifact_type: "review",
    title: "No pending review artifacts",
    status: "draft",
    description: "There are no review requests for this story yet.",
    word_count: null,
    beat_count: null,
    preview_lines: ["Create a draft or run review from the full reviews workspace."],
    actions: [],
    action_links: [{ label: "Open full reviews workspace", href: workspaceHref(args.storySlug, "reviews") }],
  };
  return { block, snapshot: null, result: { tone: "ready", title: "No review artifacts", detail: "No pending review requests were found." } };
}

export async function runReviewCommand(args: WorkflowCommandHandlerArgs): Promise<ReviewCommandHandlerResult> {
  try {
    const list = await fetchJson(reviewsUrl(args));
    const request = list.requests?.find((item) => item.status !== "APPLIED") ?? list.requests?.[0] ?? null;
    if (!request) return emptyResult(args);
    const detail = await fetchJson(reviewsUrl(args, request.id));
    const snapshot = snapshotFrom(request, detail.responses ?? []);
    return { block: blockFrom(args, snapshot), snapshot, result: { tone: "ready", title: snapshot.title, detail: `Review state: ${snapshot.status}.` } };
  } catch {
    return emptyResult(args);
  }
}

function bodyForAction(requestId: number, actionId: string) {
  return actionId === "apply_review"
    ? { action: "apply_response", request_id: requestId, applied_by: "write_assistant" }
    : {
      action: "submit_response",
      request_id: requestId,
      reviewer_name: "write_assistant",
      scores_json: actionId === "approve_review" ? { logic: 4.5, pacing: 4.5, consistency: 4.5, voice: 4.5 } : { logic: 2, pacing: 2, consistency: 2, voice: 2 },
      flags_json: actionId === "approve_review" ? { critical: [], major: [], minor: [] } : { critical: ["Rejected from Write review card"], major: [], minor: [] },
      suggestions_text: actionId === "approve_review" ? "Approved from Write review card." : "Rejected from Write review card.",
      canon_proposals_json: [],
    };
}

function snapshotAfterAction(args: WorkflowCommandHandlerArgs, requestId: number, actionId: string): ReviewSnapshot {
  const nextStatus: ArtifactStatus = actionId === "apply_review" ? "applied" : actionId === "approve_review" ? "approved" : "rejected";
  return {
    requestId,
    chapterId: args.chapterId || null,
    title: `Review request #${requestId}`,
    status: nextStatus,
    score: actionId === "approve_review" ? 4.5 : actionId === "reject_review" ? 2 : null,
    feedback: [actionId === "approve_review" ? "Approved from Write review card." : actionId === "reject_review" ? "Rejected from Write review card." : "Review response applied."],
    actions: actionsFor(nextStatus),
  };
}

function rewriteResult(args: WorkflowCommandHandlerArgs, requestId: number): ReviewCommandHandlerResult {
  const snapshot: ReviewSnapshot = {
    requestId,
    chapterId: args.chapterId || null,
    title: `Review request #${requestId}`,
    status: "rejected",
    score: null,
    feedback: ["Rewrite requested from inline review action."],
    actions: [],
  };
  return { block: blockFrom(args, snapshot), snapshot, result: { tone: "running", title: "Rewrite requested", detail: "Open AutoWrite to create a revised draft." } };
}

export async function runReviewAction(args: WorkflowCommandHandlerArgs, requestId: number, actionId: string): Promise<ReviewCommandHandlerResult> {
  if (actionId === "rewrite_review") return rewriteResult(args, requestId);
  const body = bodyForAction(requestId, actionId);
  const res = await fetch(`/api/${encodeURIComponent(args.storySlug)}/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? "REVIEW_ACTION_FAILED");
  const snapshot = snapshotAfterAction(args, requestId, actionId);
  return { block: blockFrom(args, snapshot), snapshot, result: { tone: snapshot.status === "rejected" ? "blocked" : "ready", title: snapshot.title, detail: `Review state: ${snapshot.status}.` } };
}

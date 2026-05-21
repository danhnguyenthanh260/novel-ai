import { runIngestAction } from "@/features/scenes/components/writeTab/chatOrchestration/commands/ingestCommandHandler";
import { runReviewAction } from "@/features/scenes/components/writeTab/chatOrchestration/commands/reviewCommandHandler";
import type { ReviewSnapshot, TimelineBlock } from "@/features/scenes/components/writeTab/types";
import type { WorkflowCommandHandlerArgs } from "@/features/scenes/components/writeTab/chatOrchestration/commands/statusCommandHandler";

type ArtifactBlock = Extract<TimelineBlock, { type: "artifact_preview" }>;

export function runArtifactAction(params: {
  block: ArtifactBlock;
  actionId: string;
  locks: Set<string>;
  commandArgs: WorkflowCommandHandlerArgs;
  appendBlock: (block: TimelineBlock) => Promise<unknown>;
  onOpenAutoWrite: () => void;
  onReviewSnapshotChange: (snapshot: ReviewSnapshot | null) => void;
}): void {
  const { block, actionId, locks } = params;
  const lockKey = `${block.artifact_id}:${actionId}`;
  if (locks.has(lockKey)) return;

  if (block.artifact_type === "source") {
    const nextBlock = runIngestAction(block, actionId);
    if (!nextBlock) return;
    locks.add(lockKey);
    void params.appendBlock(nextBlock);
    return;
  }

  if (block.artifact_type !== "review") return;
  const requestId = Number(block.artifact_id.match(/review-request-(\d+)/)?.[1] ?? 0);
  if (!requestId) return;
  locks.add(lockKey);
  if (actionId === "rewrite_review") params.onOpenAutoWrite();
  void runReviewAction(params.commandArgs, requestId, actionId)
    .then(({ block: nextBlock, snapshot }) => {
      params.onReviewSnapshotChange(snapshot);
      return params.appendBlock(nextBlock);
    })
    .catch(() => undefined);
}

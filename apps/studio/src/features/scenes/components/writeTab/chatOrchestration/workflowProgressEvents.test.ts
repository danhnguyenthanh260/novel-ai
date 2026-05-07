import {
  continuityWorkflowProgressEvent,
  upsertWorkflowProgressBlock,
  workflowProgressBlockFromEvent,
} from "@/features/scenes/components/writeTab/chatOrchestration/workflowProgressEvents";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runWorkflowProgressEventsSelfTest(): void {
  const event = continuityWorkflowProgressEvent({ chapterId: "ch01", queued: true });
  assert(event !== null, "queued continuity creates a backend-shaped event");
  if (!event) throw new Error("continuity event missing");
  const block = workflowProgressBlockFromEvent(event);
  assert(block.type === "workflow_progress", "event maps to workflow_progress block");
  assert(block.source === "backend", "workflow progress block is backend-originated");

  const updated = upsertWorkflowProgressBlock([], event);
  assert(updated.length === 1, "upsert appends first workflow block");

  const completeEvent = { ...event, status: "complete" as const, current_step: 4, current_step_label: "Review saved" };
  const merged = upsertWorkflowProgressBlock(updated, completeEvent);
  assert(merged.length === 1, "upsert updates existing workflow block");
  assert(merged[0]?.type === "workflow_progress" && merged[0].status === "complete", "upsert preserves latest workflow status");
}

runWorkflowProgressEventsSelfTest();

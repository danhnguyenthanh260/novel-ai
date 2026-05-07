import type { TimelineBlock, WorkflowProgressBlock } from "@/features/scenes/components/writeTab/types";

export type BackendWorkflowProgressEvent = Omit<WorkflowProgressBlock, "type" | "source"> & {
  event_id: string;
};

export function workflowProgressBlockId(event: BackendWorkflowProgressEvent): string {
  return event.job_id ? `workflow-progress-${event.job_id}` : `workflow-progress-${event.event_id}`;
}

export function workflowProgressBlockFromEvent(event: BackendWorkflowProgressEvent): Extract<TimelineBlock, { type: "workflow_progress" }> {
  return {
    ...event,
    id: workflowProgressBlockId(event),
    type: "workflow_progress",
    source: "backend",
  };
}

export function upsertWorkflowProgressBlock(
  blocks: TimelineBlock[],
  event: BackendWorkflowProgressEvent
): TimelineBlock[] {
  const nextBlock = workflowProgressBlockFromEvent(event);
  const existingIndex = blocks.findIndex((block) => block.type === "workflow_progress" && block.id === nextBlock.id);
  if (existingIndex === -1) return [...blocks, nextBlock];
  return blocks.map((block, index) => (index === existingIndex ? nextBlock : block));
}

export function continuityWorkflowProgressEvent(args: { chapterId: string | null; queued: boolean }): BackendWorkflowProgressEvent | null {
  if (!args.queued) return null;
  return {
    event_id: "continuity-check-active",
    chapter_id: args.chapterId,
    job_id: null,
    workflow_name: "Continuity Check",
    status: "running",
    current_step: 2,
    total_steps: 4,
    current_step_label: "Checking timeline handoff",
    steps: [
      { label: "Read current artifact", status: "complete" },
      { label: "Check timeline handoff", status: "active" },
      { label: "Validate reveal constraints", status: "pending" },
      { label: "Save review result", status: "pending" },
    ],
  };
}

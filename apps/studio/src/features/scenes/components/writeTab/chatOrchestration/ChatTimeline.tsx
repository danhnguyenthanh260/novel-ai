import TimelineBlocks from "@/features/scenes/components/writeTab/chatOrchestration/TimelineBlocks";
import type { ChatContextMiniBarPayload, RecoveryChip, TimelineBlock } from "@/features/scenes/components/writeTab/types";

type ChatTimelineProps = {
  context: ChatContextMiniBarPayload;
  blocks: TimelineBlock[];
  onChip: (chip: RecoveryChip) => void;
};

function statusClass(status: ChatContextMiniBarPayload["status"]): string {
  if (status === "ready") return "status-pill status-pill--clean";
  if (status === "degraded") return "status-pill status-pill--partial";
  return "status-pill status-pill--blocked";
}

export default function ChatTimeline({ context, blocks, onChip }: ChatTimelineProps) {
  return (
    <>
      <div className="chat-context-mini-bar" aria-label="Current chat context">
        <button type="button">{context.storyTitle}</button>
        <span>/</span>
        <button type="button">{context.chapterLabel}</button>
        <span className={statusClass(context.status)}>{context.status.toUpperCase()}</span>
      </div>
      <div className="work-stream__scroll">
        <div className="timeline-stack">
          <TimelineBlocks blocks={blocks} onChip={onChip} />
        </div>
      </div>
    </>
  );
}

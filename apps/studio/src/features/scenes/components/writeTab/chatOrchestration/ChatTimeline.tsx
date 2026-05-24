"use client";

import React from "react";
import TimelineBlocks from "@/features/scenes/components/writeTab/chatOrchestration/TimelineBlocks";
import type { ChatContextMiniBarPayload, RecoveryChip, TimelineBlock } from "@/features/scenes/components/writeTab/types";
import type { StructuredChoiceSelection } from "@/features/scenes/components/writeTab/chatOrchestration/choiceGroups";

type ChatTimelineProps = {
  context: ChatContextMiniBarPayload;
  blocks: TimelineBlock[];
  onChip: (chip: RecoveryChip) => void;
  onChoice: (selection: StructuredChoiceSelection) => void;
};

function statusClass(status: ChatContextMiniBarPayload["status"]): string {
  if (status === "ready") return "status-pill status-pill--clean";
  if (status === "degraded") return "status-pill status-pill--partial";
  return "status-pill status-pill--blocked";
}

export default function ChatTimeline({ context, blocks, onChip, onChoice }: ChatTimelineProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [nearBottom, setNearBottom] = React.useState(true);
  const nearBottomRef = React.useRef(true);

  React.useEffect(() => {
    if (!nearBottom) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: "smooth" });
  }, [blocks, nearBottom]);

  const updateNearBottom = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const nextNearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 96;
    if (nearBottomRef.current === nextNearBottom) return;
    nearBottomRef.current = nextNearBottom;
    setNearBottom(nextNearBottom);
  };

  return (
    <>
      <div data-testid="chat-context-bar" className="chat-context-mini-bar" aria-label="Current chat context">
        <button type="button">{context.storyTitle}</button>
        <span>/</span>
        <button type="button">{context.chapterLabel}</button>
        <span className={statusClass(context.status)}>{context.status.toUpperCase()}</span>
      </div>
      <div ref={scrollRef} data-testid="chat-timeline" className="work-stream__scroll" onScroll={updateNearBottom}>
        <div className="timeline-stack">
          <TimelineBlocks blocks={blocks} onChip={onChip} onChoice={onChoice} />
        </div>
        {!nearBottom ? (
          <button type="button" className="jump-to-bottom" onClick={() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            nearBottomRef.current = true;
            setNearBottom(true);
          }}>
            New messages
          </button>
        ) : null}
      </div>
    </>
  );
}

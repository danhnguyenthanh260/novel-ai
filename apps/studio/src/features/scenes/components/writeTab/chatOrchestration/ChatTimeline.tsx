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
  onOpenArtifact?: (block: Extract<TimelineBlock, { type: "artifact_preview" }>) => void;
};

function statusClass(status: ChatContextMiniBarPayload["status"]): string {
  if (status === "ready") return "status-pill status-pill--clean";
  if (status === "degraded") return "status-pill status-pill--partial";
  return "status-pill status-pill--blocked";
}

export default function ChatTimeline({ context, blocks, onChip, onChoice, onOpenArtifact }: ChatTimelineProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [nearBottom, setNearBottom] = React.useState(true);

  React.useEffect(() => {
    if (!nearBottom) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: "smooth" });
  }, [blocks, nearBottom]);

  const updateNearBottom = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    setNearBottom(scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 96);
  };

  return (
    <>
      <div className="chat-context-mini-bar" aria-label="Current chat context">
        <button type="button">{context.storyTitle}</button>
        <span>/</span>
        <button type="button">{context.chapterLabel}</button>
        <span className={statusClass(context.status)}>{context.status.toUpperCase()}</span>
      </div>
      <div ref={scrollRef} className="work-stream__scroll" onScroll={updateNearBottom}>
        <div className="timeline-stack">
          <TimelineBlocks blocks={blocks} onChip={onChip} onChoice={onChoice} onOpenArtifact={onOpenArtifact} />
        </div>
        {!nearBottom ? (
          <button type="button" className="jump-to-bottom" onClick={() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            setNearBottom(true);
          }}>
            New messages
          </button>
        ) : null}
      </div>
    </>
  );
}

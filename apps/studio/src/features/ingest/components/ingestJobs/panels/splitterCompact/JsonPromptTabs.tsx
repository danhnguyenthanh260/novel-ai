"use client";

import { useState } from "react";
import { ChapterScenesTracker } from "@/features/ingest/components/ingestJobs/panels/splitterCompact/ChapterScenesTracker";
import type { ScenesTrackerChapterData } from "@/features/ingest/components/ingestJobs/panels/splitterCompact/ChapterScenesTracker";

type RawTab = "payload" | "result" | "prompt" | "scenes";

export function JsonPromptTabs({
  payload,
  result,
  promptData,
  scenesData,
}: {
  payload: Record<string, unknown> | null | undefined;
  result: Record<string, unknown> | null | undefined;
  promptData: { text: string; unavailableReason: string | null };
  scenesData?: ScenesTrackerChapterData | null;
}) {
  const [tab, setTab] = useState<RawTab>("payload");
  const resolvedTab: RawTab = tab === "scenes" && !scenesData ? "payload" : tab;
  const content =
    resolvedTab === "payload"
      ? JSON.stringify(payload ?? {}, null, 2)
      : resolvedTab === "result"
        ? JSON.stringify(result ?? {}, null, 2)
        : promptData.text || promptData.unavailableReason || "PROMPT_UNAVAILABLE";

  return (
    <div className="rounded border border-[#223247] bg-[#0b1526] p-2">
      <div className="mb-2 flex items-center gap-2">
        {(["payload", "result", "prompt", "scenes"] as RawTab[]).map((entry) => (
          <button
            key={entry}
            type="button"
            className={`shell-link px-2 py-1 text-[11px] ${resolvedTab === entry ? "border-[#9de5dc]/50 text-[#9de5dc]" : ""} ${
              entry === "scenes" && !scenesData ? "cursor-not-allowed opacity-50" : ""
            }`}
            onClick={() => setTab(entry)}
            disabled={entry === "scenes" && !scenesData}
            title={entry === "scenes" && !scenesData ? "Available in Chapters tab" : undefined}
          >
            {entry}
          </button>
        ))}
      </div>
      {resolvedTab === "scenes" && scenesData ? <ChapterScenesTracker chapter={scenesData} /> : null}
      {resolvedTab === "prompt" && !promptData.text ? (
        <div className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          {promptData.unavailableReason || "PROMPT_UNAVAILABLE"}
        </div>
      ) : null}
      {resolvedTab !== "scenes" ? (
        <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded border border-[#223247] bg-[#0a1220] p-2 text-[11px] text-slate-200">{content}</pre>
      ) : null}
    </div>
  );
}

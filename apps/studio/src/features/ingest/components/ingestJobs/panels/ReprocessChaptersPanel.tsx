"use client";

import type { ExistingChapter } from "@/features/ingest/components/ingestJobs/types";

type ReprocessChaptersPanelProps = {
  existingChapters: ExistingChapter[];
  selectedChapterIds: string[];
  onSelectAll: () => void;
  onClear: () => void;
  onRefreshChapters: () => void;
  onToggleChapter: (chapterId: string) => void;
  onRunReprocess: () => void;
  reprocessRunning: boolean;
  reprocessReasonCode:
  | "BOUNDARY_QUALITY"
  | "MID_WORD_CUT"
  | "SCENE_SPLIT_TOO_WIDE"
  | "SCENE_SPLIT_TOO_FRAGMENTED"
  | "QUOTE_CONTINUITY_BREAK"
  | "SYSTEMIC_ENTITY_SPLIT"
  | "OTHER";
  onSetReprocessReasonCode: (
    value:
      | "BOUNDARY_QUALITY"
      | "MID_WORD_CUT"
      | "SCENE_SPLIT_TOO_WIDE"
      | "SCENE_SPLIT_TOO_FRAGMENTED"
      | "QUOTE_CONTINUITY_BREAK"
      | "SYSTEMIC_ENTITY_SPLIT"
      | "OTHER"
  ) => void;
  reprocessNote: string;
  onSetReprocessNote: (value: string) => void;
  forcedStrategy: string | null;
  onSetForcedStrategy: (value: string | null) => void;
};

export function ReprocessChaptersPanel({
  existingChapters,
  selectedChapterIds,
  onSelectAll,
  onClear,
  onRefreshChapters,
  onToggleChapter,
  onRunReprocess,
  reprocessRunning,
  reprocessReasonCode,
  onSetReprocessReasonCode,
  reprocessNote,
  onSetReprocessNote,
  forcedStrategy,
  onSetForcedStrategy,
}: ReprocessChaptersPanelProps) {
  const hasSelectedChapters = selectedChapterIds.length > 0;

  return (
    <section className="surface-card">
      <div className="border-b border-[#223247] px-4 py-3 text-sm font-medium">Reprocess Existing Chapters (Scene-only)</div>
      <div className="grid gap-3 p-4">
        <div className="muted text-xs">Select existing chapters to regenerate split scenes without re-uploading full source.</div>
        <div className="flex items-center gap-2">
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onSelectAll} disabled={existingChapters.length === 0}>
            Select All
          </button>
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onClear} disabled={!hasSelectedChapters}>
            Clear
          </button>
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onRefreshChapters}>
            Refresh Chapters
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="grid gap-1 text-xs">
            <span>Reprocess reason code</span>
            <select
              className="shell-control px-2 py-1 text-xs"
              value={reprocessReasonCode}
              onChange={(e) =>
                onSetReprocessReasonCode(
                  e.target.value as
                  | "BOUNDARY_QUALITY"
                  | "MID_WORD_CUT"
                  | "SCENE_SPLIT_TOO_WIDE"
                  | "SCENE_SPLIT_TOO_FRAGMENTED"
                  | "QUOTE_CONTINUITY_BREAK"
                  | "SYSTEMIC_ENTITY_SPLIT"
                  | "OTHER"
                )
              }
            >
              <option value="BOUNDARY_QUALITY">BOUNDARY_QUALITY</option>
              <option value="MID_WORD_CUT">MID_WORD_CUT</option>
              <option value="SCENE_SPLIT_TOO_WIDE">SCENE_SPLIT_TOO_WIDE</option>
              <option value="SCENE_SPLIT_TOO_FRAGMENTED">SCENE_SPLIT_TOO_FRAGMENTED</option>
              <option value="QUOTE_CONTINUITY_BREAK">QUOTE_CONTINUITY_BREAK</option>
              <option value="SYSTEMIC_ENTITY_SPLIT">SYSTEMIC_ENTITY_SPLIT</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span>Strategy{" "}<span className="muted">(auto: recommended)</span></span>
            <select
              className="shell-control px-2 py-1 text-xs"
              value={forcedStrategy ?? ""}
              onChange={(e) => onSetForcedStrategy(e.target.value || null)}
            >
              <option value="">auto (recommended)</option>
              <option value="S3_SEMANTIC_RESPLIT">S3_SEMANTIC_RESPLIT (recommended for mature stories)</option>
              <option value="S0_BASE">S0_BASE (fast, exploration)</option>
              <option value="S1_STRICT_BOUNDARY">S1_STRICT_BOUNDARY</option>
              <option value="S1_TARGETED_WINDOW_REPAIR">S1_TARGETED_WINDOW_REPAIR</option>
              <option value="S2_MERGE_FIX">S2_MERGE_FIX</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span>Reprocess note (optional)</span>
            <input
              className="shell-control px-2 py-1 text-xs"
              value={reprocessNote}
              onChange={(e) => onSetReprocessNote(e.target.value)}
              placeholder="Describe why reprocess is needed..."
            />
          </label>
        </div>
        <div className="grid max-h-48 gap-1 overflow-auto rounded-lg border border-[#223247] bg-[#0f172a] p-2 text-sm">
          {existingChapters.map((chapter) => {
            const checked = selectedChapterIds.includes(chapter.chapter_id);
            return (
              <label key={chapter.chapter_id} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-[#132236]">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={checked} onChange={() => onToggleChapter(chapter.chapter_id)} />
                  <span className="flex items-center gap-2">
                    {chapter.chapter_id}
                    {chapter.is_stable && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                        STABLE v{chapter.version}
                      </span>
                    )}
                  </span>
                </span>
                <span className="muted text-xs">scenes: {chapter.scene_count}</span>
              </label>
            );
          })}
          {existingChapters.length === 0 && <div className="muted px-2 py-2 text-xs">No existing chapters found.</div>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="shell-link px-3 py-2 text-sm"
            onClick={onRunReprocess}
            disabled={reprocessRunning || !hasSelectedChapters}
          >
            {reprocessRunning ? "Working..." : `Reprocess Selected (${selectedChapterIds.length})`}
          </button>
        </div>
      </div>
    </section>
  );
}

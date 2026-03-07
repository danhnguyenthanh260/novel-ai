"use client";

import Link from "next/link";
import HistorianAnalysisConsole from "@/features/analysis/components/HistorianAnalysisConsole";

export default function AnalysisOperationsPanel({ storySlug }: { storySlug: string }) {
  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6">
        <div className="rounded border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-100">
          <div className="font-semibold uppercase tracking-wide">Operations Scope</div>
          <div className="mt-1">
            Batch/chapter-range is an operational rollup and retcon tool. It is not a writer memory layer.
          </div>
          <div className="mt-2">
            <Link
              href={`/stories/${encodeURIComponent(storySlug)}/analysis`}
              className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-800"
            >
              Back to Analysis Workspace
            </Link>
          </div>
        </div>
      </div>
      <HistorianAnalysisConsole storySlug={storySlug} initialScope="chapter_range" scopeFilterMode="ops" />
    </div>
  );
}


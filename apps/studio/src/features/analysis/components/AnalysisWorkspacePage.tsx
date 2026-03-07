"use client";

import { useState } from "react";
import Link from "next/link";
import HistorianAnalysisConsole from "@/features/analysis/components/HistorianAnalysisConsole";
import CoreDbConsole from "@/features/memory/components/CoreDbConsole";

type AnalysisTab = "chapter" | "arc" | "saga" | "core";

export default function AnalysisWorkspacePage({ storySlug }: { storySlug: string }) {
  const [tab, setTab] = useState<AnalysisTab>("chapter");

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Analysis Workspaces</div>
          <Link
            href={`/stories/${encodeURIComponent(storySlug)}/analysis/operations`}
            className="rounded border border-amber-700/50 bg-amber-900/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200 hover:bg-amber-900/30"
          >
            Advanced Operations
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setTab("chapter")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "chapter" ? "bg-cyan-700/30 text-cyan-200" : "bg-slate-900 text-slate-300"}`}
          >
            Chapter Analysis
          </button>
          <button
            type="button"
            onClick={() => setTab("arc")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "arc" ? "bg-cyan-700/30 text-cyan-200" : "bg-slate-900 text-slate-300"}`}
          >
            Arc Memory
          </button>
          <button
            type="button"
            onClick={() => setTab("saga")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "saga" ? "bg-cyan-700/30 text-cyan-200" : "bg-slate-900 text-slate-300"}`}
          >
            Saga Memory
          </button>
          <button
            type="button"
            onClick={() => setTab("core")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "core" ? "bg-cyan-700/30 text-cyan-200" : "bg-slate-900 text-slate-300"}`}
          >
            Core Lore / World DB
          </button>
        </div>
      </div>

      {tab === "core" ? (
        <div className="mx-auto max-w-7xl px-4 pb-4 md:px-6">
          <CoreDbConsole storySlug={storySlug} />
        </div>
      ) : (
        <HistorianAnalysisConsole
          key={tab}
          storySlug={storySlug}
          initialScope={tab === "chapter" ? "chapter" : tab === "arc" ? "arc" : "story"}
          scopeFilterMode="strict"
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CoreDbConsole from "@/features/memory/components/CoreDbConsole";
import EntityConflictConsole from "@/features/memory/components/EntityConflictConsole";

type MemoryTab = "chapter" | "arc" | "saga" | "core" | "conflicts";

export default function MemoryHubPage({ storySlug }: { storySlug: string }) {
  const [tab, setTab] = useState<MemoryTab>("core");
  const [arcLoading, setArcLoading] = useState(false);
  const [sagaLoading, setSagaLoading] = useState(false);
  const [arcError, setArcError] = useState<string | null>(null);
  const [sagaError, setSagaError] = useState<string | null>(null);
  const [arcData, setArcData] = useState<Record<string, unknown> | null>(null);
  const [sagaData, setSagaData] = useState<Record<string, unknown> | null>(null);
  const base = useMemo(() => `/api/stories/${encodeURIComponent(storySlug)}/memory`, [storySlug]);

  useEffect(() => {
    if (tab !== "arc") return;
    let cancelled = false;
    (async () => {
      setArcLoading(true);
      setArcError(null);
      try {
        const res = await fetch(`${base}/arc`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || data?.ok === false) throw new Error(data?.error || "LOAD_ARC_MEMORY_FAILED");
        if (!cancelled) setArcData((data?.arc_memory && typeof data.arc_memory === "object") ? data.arc_memory : null);
      } catch (e: unknown) {
        if (!cancelled) setArcError(e instanceof Error ? e.message : "LOAD_ARC_MEMORY_FAILED");
      } finally {
        if (!cancelled) setArcLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, tab]);

  useEffect(() => {
    if (tab !== "saga") return;
    let cancelled = false;
    (async () => {
      setSagaLoading(true);
      setSagaError(null);
      try {
        const res = await fetch(`${base}/saga`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || data?.ok === false) throw new Error(data?.error || "LOAD_SAGA_MEMORY_FAILED");
        if (!cancelled) setSagaData((data?.saga_memory && typeof data.saga_memory === "object") ? data.saga_memory : null);
      } catch (e: unknown) {
        if (!cancelled) setSagaError(e instanceof Error ? e.message : "LOAD_SAGA_MEMORY_FAILED");
      } finally {
        if (!cancelled) setSagaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, tab]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Memory Hub</h1>
          <p className="text-sm text-slate-400">Analyze &rarr; Review &rarr; Approve across chapter, arc, saga, and core lore.</p>
          <p className="mt-1 text-xs text-slate-500">Batch/chapter-range is available in Advanced Operations, not as a memory layer.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/stories/${encodeURIComponent(storySlug)}/analysis/operations`} className="rounded border border-amber-700/50 bg-amber-900/20 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/30">
            Advanced Operations
          </Link>
          <Link href={`/stories/${encodeURIComponent(storySlug)}`} className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
            Back to Story
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button type="button" onClick={() => setTab("chapter")} className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "chapter" ? "bg-cyan-700/30 text-cyan-200" : "bg-slate-900 text-slate-300"}`}>Chapter Analysis</button>
        <button type="button" onClick={() => setTab("arc")} className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "arc" ? "bg-cyan-700/30 text-cyan-200" : "bg-slate-900 text-slate-300"}`}>Arc Memory</button>
        <button type="button" onClick={() => setTab("saga")} className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "saga" ? "bg-cyan-700/30 text-cyan-200" : "bg-slate-900 text-slate-300"}`}>Saga Memory</button>
        <button type="button" onClick={() => setTab("core")} className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "core" ? "bg-cyan-700/30 text-cyan-200" : "bg-slate-900 text-slate-300"}`}>Core Lore / World DB</button>
        <button type="button" onClick={() => setTab("conflicts")} className={`rounded px-3 py-1.5 text-xs font-semibold ${tab === "conflicts" ? "bg-cyan-700/30 text-cyan-200" : "bg-slate-900 text-slate-300"}`}>Conflict Review</button>
      </div>

      {tab === "core" ? <CoreDbConsole storySlug={storySlug} /> : null}
      {tab === "conflicts" ? <EntityConflictConsole storySlug={storySlug} /> : null}

      {tab === "chapter" ? (
        <div className="rounded border border-slate-800 bg-[#0d1524] p-4 text-sm text-slate-300">
          <div className="mb-2 font-semibold text-slate-100">
            Chapter Analysis
          </div>
          <p className="mb-3 text-slate-400">
            This workspace reuses the Historian analysis scope.
          </p>
          <Link href={`/stories/${encodeURIComponent(storySlug)}/analysis`} className="rounded border border-cyan-600/50 bg-cyan-600/20 px-3 py-1.5 text-xs font-semibold text-cyan-200">
            Open Historian Analysis Console
          </Link>
        </div>
      ) : null}

      {tab === "arc" ? (
        <div className="rounded border border-slate-800 bg-[#0d1524] p-4 text-sm text-slate-300">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="font-semibold text-slate-100">Arc Memory (Delta)</div>
            {Number((arcData?.overlap_report as Record<string, unknown> | undefined)?.dropped_items || 0) > 0 ? (
              <span className="rounded border border-emerald-600/60 bg-emerald-900/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                Delta Focus
              </span>
            ) : null}
          </div>
          {arcLoading ? <div className="text-slate-400">Loading arc memory...</div> : null}
          {arcError ? <div className="text-rose-300">{arcError}</div> : null}
          {!arcLoading && !arcError && !arcData ? <div className="text-slate-400">No arc memory snapshot found.</div> : null}
          {!arcLoading && !arcError && arcData ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                Window: {String(arcData.chapter_from || "-")} {"->"} {String(arcData.chapter_to || "-")} | score {Number(arcData.quality_score || 0).toFixed(3)}
              </div>
              <div className="text-xs text-slate-400">
                overlap_dedup_ratio={Number(((arcData.overlap_report as Record<string, unknown> | undefined)?.dedup_ratio) || 0).toFixed(4)} | dropped={Number(((arcData.overlap_report as Record<string, unknown> | undefined)?.dropped_items) || 0)}
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.isArray((arcData.quality as Record<string, unknown> | undefined)?.validation_flags)
                  ? (((arcData.quality as Record<string, unknown>).validation_flags as unknown[]).map((flag, idx) => (
                    <span key={`${String(flag)}:${idx}`} className="rounded border border-amber-700/50 bg-amber-900/20 px-2 py-0.5 text-[11px] text-amber-200">
                      {String(flag)}
                    </span>
                  )))
                  : null}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-200">Carry-forward hooks</div>
                <ul className="list-disc space-y-1 pl-5 text-slate-300">
                  {(Array.isArray(arcData.carry_forward_hooks) ? arcData.carry_forward_hooks : []).slice(0, 8).map((item, idx) => (
                    <li key={`hook:${idx}`}>{String(item || "")}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "saga" ? (
        <div className="rounded border border-slate-800 bg-[#0d1524] p-4 text-sm text-slate-300">
          <div className="mb-3 font-semibold text-slate-100">Saga Memory (Canon)</div>
          {sagaLoading ? <div className="text-slate-400">Loading saga memory...</div> : null}
          {sagaError ? <div className="text-rose-300">{sagaError}</div> : null}
          {!sagaLoading && !sagaError && !sagaData ? <div className="text-slate-400">No saga memory snapshot found.</div> : null}
          {!sagaLoading && !sagaError && sagaData ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                snapshot #{Number(sagaData.snapshot_id || 0)} | rebuild_reason={String(sagaData.rebuild_reason || "-")} | score {Number(sagaData.narrative_score || 0).toFixed(3)}
              </div>
              <div className="grid gap-2 text-xs text-slate-300 md:grid-cols-3">
                <div className="rounded border border-slate-700 bg-slate-900/60 p-2">open_debt: {Number(((sagaData.lore_debt_summary as Record<string, unknown> | undefined)?.open_count) || 0)}</div>
                <div className="rounded border border-slate-700 bg-slate-900/60 p-2">high_urgency: {Number(((sagaData.lore_debt_summary as Record<string, unknown> | undefined)?.high_urgency_count) || 0)}</div>
                <div className="rounded border border-slate-700 bg-slate-900/60 p-2">oldest: {String(((sagaData.lore_debt_summary as Record<string, unknown> | undefined)?.oldest_debt_chapter) || "-")}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-200">Unresolved Lore Debt</div>
                <ul className="list-disc space-y-1 pl-5 text-slate-300">
                  {(Array.isArray(sagaData.unresolved_lore_debt) ? sagaData.unresolved_lore_debt : []).slice(0, 10).map((item, idx) => {
                    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
                    return (
                      <li key={`debt:${idx}`}>
                        {String(row.description || "")}{" "}
                        <span className="text-slate-500">(urgency {Number(row.urgency || 0).toFixed(2)})</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

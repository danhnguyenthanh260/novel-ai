"use client";

import { useMemo, useState } from "react";
import type { SourceDocItem } from "@/features/ingest/components/ingestJobs/types";

type CanonicalSourcePanelProps = {
  sourceDocs: SourceDocItem[];
  sourceDocsLoading: boolean;
  canonicalBusyId: string | null;
  onRefreshSources: () => void;
  onSetCanonicalSourceDoc: (sourceDocId: string) => void;
};

export function CanonicalSourcePanel({
  sourceDocs,
  sourceDocsLoading,
  canonicalBusyId,
  onRefreshSources,
  onSetCanonicalSourceDoc,
}: CanonicalSourcePanelProps) {
  const [filter, setFilter] = useState<"all" | "missing" | "reverify">("all");
  const [selectedChapterKey, setSelectedChapterKey] = useState<string | null>(null);

  const chapterBuckets = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        docs: SourceDocItem[];
      }
    >();
    for (const row of sourceDocs) {
      const chapterNoFromId = Number(String(row.chapter_id ?? "").replace(/[^0-9]/g, ""));
      const chapterNo = Number.isFinite(Number(row.chapter_no)) && Number(row.chapter_no) > 0
        ? Number(row.chapter_no)
        : Number.isFinite(chapterNoFromId) && chapterNoFromId > 0
          ? chapterNoFromId
          : null;
      const chapterKey = chapterNo ? `ch${String(chapterNo).padStart(2, "0")}` : (row.chapter_id || "(unknown)");
      const bucket = map.get(chapterKey) ?? {
        key: chapterKey,
        label: chapterKey,
        docs: [],
      };
      bucket.docs.push(row);
      map.set(chapterKey, bucket);
    }
    const rows = [...map.values()].map((bucket) => {
      const docs = [...bucket.docs].sort((a, b) => {
        const ta = Date.parse(a.created_at || "") || 0;
        const tb = Date.parse(b.created_at || "") || 0;
        return tb - ta;
      });
      const stable = docs.find((d) => d.is_stable) ?? null;
      const latest = docs[0] ?? null;
      const needsReverify = Boolean(stable && latest && stable.source_doc_id !== latest.source_doc_id);
      const status = stable ? (needsReverify ? "needs_reverify" : "stable_ready") : "missing_canonical";
      return {
        ...bucket,
        docs,
        stable,
        latest,
        status,
      };
    });
    rows.sort((a, b) => a.key.localeCompare(b.key));
    return rows;
  }, [sourceDocs]);

  const visibleBuckets = useMemo(() => {
    if (filter === "missing") return chapterBuckets.filter((x) => x.status === "missing_canonical");
    if (filter === "reverify") return chapterBuckets.filter((x) => x.status === "needs_reverify");
    return chapterBuckets;
  }, [chapterBuckets, filter]);

  const selectedKey = selectedChapterKey && visibleBuckets.some((x) => x.key === selectedChapterKey)
    ? selectedChapterKey
    : visibleBuckets[0]?.key ?? null;
  const selected = visibleBuckets.find((x) => x.key === selectedKey) ?? null;

  const counts = useMemo(() => {
    const total = chapterBuckets.length;
    const stable = chapterBuckets.filter((x) => x.status === "stable_ready").length;
    const missing = chapterBuckets.filter((x) => x.status === "missing_canonical").length;
    const reverify = chapterBuckets.filter((x) => x.status === "needs_reverify").length;
    return { total, stable, missing, reverify };
  }, [chapterBuckets]);

  function shortId(v: string): string {
    if (!v) return "-";
    return v.length <= 12 ? v : `${v.slice(0, 8)}...${v.slice(-4)}`;
  }

  return (
    <section className="surface-card">
      <div className="flex items-center justify-between border-b border-[#223247] px-4 py-3 text-sm font-medium">
        <div>
          <div>Canonical Source Manager</div>
          <div className="muted mt-1 text-xs">
            Chapters: {counts.total} | Stable: {counts.stable} | Missing: {counts.missing} | Needs Re-verify: {counts.reverify}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="shell-control px-2 py-1 text-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "missing" | "reverify")}
          >
            <option value="all">All Chapters</option>
            <option value="missing">Missing Canonical</option>
            <option value="reverify">Needs Re-verify</option>
          </select>
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onRefreshSources} disabled={sourceDocsLoading}>
            {sourceDocsLoading ? "Refreshing..." : "Refresh Sources"}
          </button>
        </div>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-[240px,1fr]">
        <div className="max-h-72 space-y-1 overflow-auto rounded border border-[#223247] bg-[#0f172a] p-2">
          {visibleBuckets.map((bucket) => {
            const isSelected = bucket.key === selectedKey;
            const statusCls =
              bucket.status === "stable_ready"
                ? "text-emerald-300"
                : bucket.status === "needs_reverify"
                  ? "text-amber-300"
                  : "text-rose-300";
            const statusLabel =
              bucket.status === "stable_ready"
                ? "Stable Ready"
                : bucket.status === "needs_reverify"
                  ? "Needs Re-verify"
                  : "Missing Canonical";
            return (
              <button
                key={bucket.key}
                type="button"
                className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                  isSelected ? "border-[#9de5dc]/40 bg-[#122231]" : "border-[#223247] bg-[#0b1220]"
                }`}
                onClick={() => setSelectedChapterKey(bucket.key)}
              >
                <div className="font-medium text-slate-100">{bucket.label}</div>
                <div className={`mt-0.5 ${statusCls}`}>{statusLabel}</div>
                <div className="muted mt-0.5">versions: {bucket.docs.length}</div>
              </button>
            );
          })}
          {visibleBuckets.length === 0 && <div className="muted px-1 py-2 text-xs">No chapter matches this filter.</div>}
        </div>
        <div className="space-y-2">
          {selected ? (
            <>
              <div className="rounded border border-[#223247] bg-[#0f172a] px-3 py-2 text-xs">
                <div className="font-medium text-slate-100">Chapter {selected.label}</div>
                <div className="muted mt-1">
                  Next step after setting canonical: approve split scenes for this chapter so analytics can consume verified ground truth.
                </div>
              </div>
              <div className="max-h-72 space-y-2 overflow-auto">
                {selected.docs.map((row) => {
                  const isCanonical = row.source_role === "canonical_truth" || row.is_stable;
                  return (
                    <div key={row.source_doc_id} className="rounded border border-[#223247] bg-[#0f172a] p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-medium">
                          {isCanonical ? "Canonical Candidate" : "Historical Source"}
                          {row.is_stable ? (
                            <span className="rounded border border-emerald-500/30 bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                              STABLE v{row.version}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="shell-link px-2 py-1 text-xs"
                          onClick={() => onSetCanonicalSourceDoc(row.source_doc_id)}
                          disabled={canonicalBusyId !== null || row.is_stable}
                        >
                          {row.is_stable ? "Already Canonical" : canonicalBusyId === row.source_doc_id ? "Setting..." : "Set As Canonical"}
                        </button>
                      </div>
                      <div className="muted mt-1 text-xs">
                        source_doc: {shortId(row.source_doc_id)} | chars: {row.char_len} | type: {row.source_type ?? "-"} | role: {row.source_role ?? "-"}
                      </div>
                      <div className="muted text-xs">path: {row.source_path ?? "-"}</div>
                      <div className="muted text-xs">created: {row.created_at || "-"}</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="muted rounded border border-[#223247] bg-[#0f172a] px-3 py-4 text-xs">No source documents found.</div>
          )}
        </div>
      </div>
      {selected?.status === "missing_canonical" ? (
        <div className="border-t border-[#223247] px-4 py-2 text-xs text-rose-300">
          This chapter has no canonical source yet. Set one source as canonical before reprocess/analysis.
        </div>
      ) : null}
      {selected?.status === "needs_reverify" ? (
        <div className="border-t border-[#223247] px-4 py-2 text-xs text-amber-300">
          Canonical source is older than latest source version. Re-verify split scenes after canonical update.
        </div>
      ) : null}
      {sourceDocs.length === 0 && !sourceDocsLoading ? (
        <div className="border-t border-[#223247] px-4 py-2 text-xs text-slate-400">
          No source documents found.
        </div>
      ) : null}
    </section>
  );
}

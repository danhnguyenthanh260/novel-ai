"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  storySlug: string;
};

type ConflictRow = {
  id: number;
  chapter_id: string | null;
  entity_key: string;
  conflict_type: string;
  severity: string;
  status: string;
  suggested_resolution: Record<string, unknown> | null;
  candidate_values: Array<Record<string, unknown>>;
  created_at: string;
};

export default function EntityConflictConsole({ storySlug }: Props) {
  const [items, setItems] = useState<ConflictRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const base = useMemo(() => `/api/stories/${encodeURIComponent(storySlug)}/memory/conflicts`, [storySlug]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}?status=REQUIRES_HUMAN_REVIEW&limit=100`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "LOAD_CONFLICTS_FAILED");
      const rows = Array.isArray(data.items) ? data.items : [];
      setItems(rows.map((row: Record<string, unknown>) => ({
        id: Number(row.id || 0),
        chapter_id: row.chapter_id ? String(row.chapter_id) : null,
        entity_key: String(row.entity_key || ""),
        conflict_type: String(row.conflict_type || ""),
        severity: String(row.severity || ""),
        status: String(row.status || ""),
        suggested_resolution: row.suggested_resolution && typeof row.suggested_resolution === "object" && !Array.isArray(row.suggested_resolution)
          ? (row.suggested_resolution as Record<string, unknown>)
          : null,
        candidate_values: Array.isArray(row.candidate_values) ? (row.candidate_values as Array<Record<string, unknown>>) : [],
        created_at: String(row.created_at || ""),
      })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "LOAD_CONFLICTS_FAILED");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(async (row: ConflictRow, action: "SET_CANONICAL_TYPE_OR_ROLE" | "REJECT_SUGGESTION") => {
    setBusyId(row.id);
    setError(null);
    try {
      const payload = action === "SET_CANONICAL_TYPE_OR_ROLE"
        ? {
          canonical_type: String(row.suggested_resolution?.canonical_type || "OTHER"),
          canonical_role: String(row.suggested_resolution?.canonical_role || "ABSTRACT"),
        }
        : {};
      const res = await fetch(`${base}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actor: "studio_user",
          actions: [{ review_id: row.id, action, payload }],
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "REVIEW_ACTION_FAILED");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "REVIEW_ACTION_FAILED");
    } finally {
      setBusyId(null);
    }
  }, [base, load]);

  return (
    <div className="rounded border border-slate-800 bg-[#0d1524] p-4 text-sm text-slate-300 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-100">Conflict Review Queue</div>
          <div className="text-xs text-slate-500">Resolve entity truth conflicts before auto-write can proceed.</div>
        </div>
        <button type="button" onClick={() => void load()} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">
          Refresh
        </button>
      </div>
      {error ? <div className="text-rose-300 text-xs">{error}</div> : null}
      {loading ? <div className="text-slate-400 text-xs">Loading conflicts...</div> : null}
      {!loading && items.length === 0 ? <div className="text-slate-500 text-xs">No pending conflicts.</div> : null}
      <div className="space-y-2">
        {items.map((row) => (
          <div key={row.id} className="rounded border border-slate-700 bg-slate-900/70 p-2 space-y-2">
            <div className="text-xs text-slate-200">
              <span className="font-semibold">#{row.id}</span> {row.entity_key} | {row.conflict_type} | {row.severity}
              {row.chapter_id ? ` | ${row.chapter_id}` : ""}
            </div>
            <div className="text-[11px] text-slate-400">Suggested: {String(row.suggested_resolution?.canonical_type || "OTHER")} / {String(row.suggested_resolution?.canonical_role || "ABSTRACT")}</div>
            <pre className="max-h-40 overflow-auto text-[11px] text-slate-400 whitespace-pre-wrap break-words">{JSON.stringify(row.candidate_values, null, 2)}</pre>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void act(row, "SET_CANONICAL_TYPE_OR_ROLE")}
                className="rounded border border-emerald-700/60 bg-emerald-900/30 px-2 py-1 text-[11px] text-emerald-200 disabled:opacity-50"
              >
                {busyId === row.id ? "Applying..." : "Approve Suggested"}
              </button>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void act(row, "REJECT_SUGGESTION")}
                className="rounded border border-rose-700/60 bg-rose-900/30 px-2 py-1 text-[11px] text-rose-200 disabled:opacity-50"
              >
                {busyId === row.id ? "Applying..." : "Reject"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


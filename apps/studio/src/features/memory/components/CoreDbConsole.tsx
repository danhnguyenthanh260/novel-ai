"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CoreMemoryItem = {
  source_kind: "CANON_FACT" | "TIMELINE_ANCHOR" | "STORY_CANON_FACT";
  source_id: number;
  chapter_id: string | null;
  scene_id: number | null;
  entity_type: string | null;
  classification: string | null;
  subject: string | null;
  predicate: string | null;
  object: string | null;
  event_label: string | null;
  location: string | null;
  participants: string[];
  content: string | null;
  confidence: number;
  source_trace: Record<string, unknown>;
  review_status: "PENDING" | "APPROVED" | "REJECTED";
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  duplicate_count: number;
  normalize_key: string;
};

type CoreEvent = {
  id: number;
  source_kind: string;
  source_id: number;
  action: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  actor: string;
  created_at: string;
};

type CoreDbConsoleProps = {
  storySlug: string;
};

type ModeTab = "analyze" | "review" | "approve";

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function CoreDbConsole({ storySlug }: CoreDbConsoleProps) {
  const [mode, setMode] = useState<ModeTab>("analyze");
  const [status, setStatus] = useState<string>("");
  const [sourceKind, setSourceKind] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [classification, setClassification] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [cursor, setCursor] = useState<string>("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [items, setItems] = useState<CoreMemoryItem[]>([]);
  const [counts, setCounts] = useState<{ by_status: Record<string, number>; by_source: Record<string, number>; total: number }>({
    by_status: {},
    by_source: {},
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<CoreMemoryItem | null>(null);
  const [events, setEvents] = useState<CoreEvent[]>([]);
  const [reviewer, setReviewer] = useState("operator");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (mode === "review" && !status) setStatus("PENDING");
    if (mode === "analyze" && status === "PENDING") setStatus("");
  }, [mode, status]);

  const selectedIds = useMemo(
    () => Array.from(selected).map((id) => {
      const [source_kind, source_id] = id.split(":");
      return { source_kind, source_id: Number(source_id || 0) };
    }).filter((x) => Number.isFinite(x.source_id) && x.source_id > 0),
    [selected]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (sourceKind) params.set("source_kind", sourceKind);
      if (entityType) params.set("entity_type", entityType);
      if (classification) params.set("classification", classification);
      if (chapterId) params.set("chapter_id", chapterId);
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "30");
      const res = await fetch(`/api/stories/${encodeURIComponent(storySlug)}/memory/core?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "CORE_MEMORY_LOAD_FAILED");
      const list = Array.isArray(data.items) ? (data.items as CoreMemoryItem[]) : [];
      setItems(list);
      setCounts(data.counts || { by_status: {}, by_source: {}, total: 0 });
      setNextCursor(typeof data.next_cursor === "string" ? data.next_cursor : null);
      if (list.length > 0 && !selectedItem) setSelectedItem(list[0]);
      setSelected(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "CORE_MEMORY_LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, [storySlug, status, sourceKind, entityType, classification, chapterId, q, cursor, selectedItem]);

  const loadEvents = useCallback(async (item: CoreMemoryItem | null) => {
    if (!item) {
      setEvents([]);
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("source_kind", item.source_kind);
      params.set("source_id", String(item.source_id));
      params.set("limit", "20");
      const res = await fetch(`/api/stories/${encodeURIComponent(storySlug)}/memory/core/events?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "CORE_EVENTS_LOAD_FAILED");
      setEvents(Array.isArray(data.items) ? data.items : []);
    } catch {
      setEvents([]);
    }
  }, [storySlug]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadEvents(selectedItem);
  }, [selectedItem, loadEvents]);

  const toggle = (item: CoreMemoryItem) => {
    const key = `${item.source_kind}:${item.source_id}`;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const runAction = async (action: "APPROVE" | "REJECT" | "RESET_TO_PENDING") => {
    if (selectedIds.length === 0) return;
    setActing(true);
    setInfo(null);
    setError(null);
    try {
      const payload = {
        actor: reviewer || "operator",
        actions: selectedIds.map((x) => ({
          source_kind: x.source_kind,
          source_id: x.source_id,
          action,
          note: note || null,
        })),
      };
      const res = await fetch(`/api/stories/${encodeURIComponent(storySlug)}/memory/core/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "CORE_REVIEW_ACTION_FAILED");
      setInfo(`Updated ${Number(data.updated_count || 0)} record(s).`);
      await load();
      await loadEvents(selectedItem);
      setNote("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "CORE_REVIEW_ACTION_FAILED");
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["analyze", "review", "approve"] as ModeTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              mode === tab ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200" : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
            onClick={() => setMode(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded border border-slate-800 bg-[#0f1722] p-3 md:grid-cols-7">
        <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" placeholder="search..." value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" placeholder="chapter_id" value={chapterId} onChange={(e) => setChapterId(e.target.value)} />
        <select className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">status: all</option>
          <option value="PENDING">PENDING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
        <select className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" value={sourceKind} onChange={(e) => setSourceKind(e.target.value)}>
          <option value="">source: all</option>
          <option value="CANON_FACT">CANON_FACT</option>
          <option value="TIMELINE_ANCHOR">TIMELINE_ANCHOR</option>
          <option value="STORY_CANON_FACT">STORY_CANON_FACT</option>
        </select>
        <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" placeholder="entity_type" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
        <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" placeholder="classification" value={classification} onChange={(e) => setClassification(e.target.value)} />
        <div className="flex gap-2">
          <button className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200" type="button" onClick={() => setCursor("")}>reset</button>
          <button className="rounded border border-cyan-600/50 bg-cyan-600/20 px-3 py-1.5 text-xs text-cyan-200" type="button" onClick={load} disabled={loading}>{loading ? "loading..." : "apply"}</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded border border-slate-800 bg-[#0d1524]">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs text-slate-300">
            <span>Total {counts.total} | Pending {counts.by_status.PENDING || 0} | Approved {counts.by_status.APPROVED || 0} | Rejected {counts.by_status.REJECTED || 0}</span>
            <span>{selected.size} selected</span>
          </div>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-300">
                <tr>
                  <th className="px-2 py-2 text-left">Sel</th>
                  <th className="px-2 py-2 text-left">Source</th>
                  <th className="px-2 py-2 text-left">Body</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Score</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const key = `${item.source_kind}:${item.source_id}`;
                  const body = item.source_kind === "TIMELINE_ANCHOR"
                    ? `${item.event_label || "-"} @ ${item.location || "-"}`
                    : `${item.subject || "-"} ${item.predicate || "-"} ${item.object || item.content || "-"}`;
                  return (
                    <tr
                      key={key}
                      className={`cursor-pointer border-b border-slate-900 hover:bg-slate-900/60 ${selectedItem?.source_kind === item.source_kind && selectedItem?.source_id === item.source_id ? "bg-slate-900/70" : ""}`}
                      onClick={() => setSelectedItem(item)}
                    >
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(item)} />
                      </td>
                      <td className="px-2 py-2 text-slate-300">
                        <div>{item.source_kind}</div>
                        <div className="muted text-[10px]">{item.chapter_id || "-"} / #{item.source_id}</div>
                      </td>
                      <td className="px-2 py-2 text-slate-200">
                        <div className="line-clamp-2">{body}</div>
                        {item.duplicate_count > 1 ? <div className="text-[10px] text-amber-300">duplicate in page: {item.duplicate_count}</div> : null}
                      </td>
                      <td className="px-2 py-2 text-slate-300">{item.review_status}</td>
                      <td className="px-2 py-2 text-slate-300">{item.confidence.toFixed(2)}</td>
                    </tr>
                  );
                })}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-slate-500" colSpan={5}>No records.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2 text-xs">
            <button
              className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-40"
              type="button"
              onClick={() => setCursor((prev) => String(Math.max(0, Number(prev || 0) - 30)))}
              disabled={Number(cursor || 0) <= 0}
            >
              prev
            </button>
            <button
              className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-40"
              type="button"
              onClick={() => setCursor(nextCursor || "")}
              disabled={!nextCursor}
            >
              next
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded border border-slate-800 bg-[#0d1524] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Approve Actions</div>
            <input
              className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              placeholder="reviewer"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            />
            <textarea
              className="mb-2 h-20 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              placeholder="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button className="rounded border border-emerald-600/50 bg-emerald-600/20 px-2 py-1 text-xs text-emerald-200 disabled:opacity-40" type="button" onClick={() => runAction("APPROVE")} disabled={acting || selectedIds.length === 0}>approve</button>
              <button className="rounded border border-rose-600/50 bg-rose-600/20 px-2 py-1 text-xs text-rose-200 disabled:opacity-40" type="button" onClick={() => runAction("REJECT")} disabled={acting || selectedIds.length === 0}>reject</button>
              <button className="rounded border border-amber-600/50 bg-amber-600/20 px-2 py-1 text-xs text-amber-200 disabled:opacity-40" type="button" onClick={() => runAction("RESET_TO_PENDING")} disabled={acting || selectedIds.length === 0}>reset</button>
            </div>
            {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
            {info ? <div className="mt-2 text-xs text-emerald-300">{info}</div> : null}
          </div>

          <div className="rounded border border-slate-800 bg-[#0d1524] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Evidence</div>
            <div className="text-xs text-slate-300">
              <div>source: {selectedItem?.source_kind || "-"}</div>
              <div>id: {selectedItem ? `#${selectedItem.source_id}` : "-"}</div>
              <div>chapter: {selectedItem?.chapter_id || "-"}</div>
              <div>review: {selectedItem?.review_status || "-"}</div>
              <div>reviewed by: {selectedItem?.reviewed_by || "-"}</div>
              <div>reviewed at: {fmtTime(selectedItem?.reviewed_at)}</div>
            </div>
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-950 p-2 text-[10px] text-slate-400">
              {JSON.stringify(selectedItem?.source_trace || {}, null, 2)}
            </pre>
          </div>

          <div className="rounded border border-slate-800 bg-[#0d1524] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Audit Timeline</div>
            <div className="max-h-48 space-y-2 overflow-auto text-xs">
              {events.map((ev) => (
                <div key={ev.id} className="rounded border border-slate-800 bg-slate-900/60 p-2">
                  <div className="text-slate-200">{ev.action} ({ev.from_status || "-"} -&gt; {ev.to_status})</div>
                  <div className="text-slate-400">{ev.actor} | {fmtTime(ev.created_at)}</div>
                  {ev.note ? <div className="text-slate-300">{ev.note}</div> : null}
                </div>
              ))}
              {events.length === 0 ? <div className="text-slate-500">No events.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

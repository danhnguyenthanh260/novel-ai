"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChapterDetailSection } from "@/features/ingest/components/ingestJobs/panels/splitterCompact/ChapterDetailSection";
import { TaskDetailSection } from "@/features/ingest/components/ingestJobs/panels/splitterCompact/TaskDetailSection";
import { ageSecFromIso, formatAge } from "@/features/ingest/components/ingestJobs/panels/splitterCompact/splitterHelpers";
import type { IngestJobsControllerState } from "@/features/ingest/hooks/useIngestJobsController";

type SplitterTab = "jobs" | "tasks" | "chapters";

type ListItem = {
  id: string;
  status: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  warningCount: number;
};

const STATUS_PRIORITY: Record<string, number> = {
  FAILED: 5,
  NEEDS_RETRY: 5,
  RUNNING: 4,
  READY: 3,
  WAIT_REVIEW: 2,
  DONE: 1,
};

const LIST_HEIGHT = 560;
const ROW_HEIGHT = 74;
const OVERSCAN = 6;
const SPLIT_SLA_SEC = 180;
const SPLIT_STALE_SEC = 600;

function priorityForStatus(status: string) {
  return STATUS_PRIORITY[String(status || "").toUpperCase()] ?? 0;
}

export function SplitterCompactPanel({ state }: { state: IngestJobsControllerState }) {
  const [tab, setTab] = useState<SplitterTab>("jobs");
  const [filterInput, setFilterInput] = useState("");
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [selectedChapterTaskId, setSelectedChapterTaskId] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [flashMap, setFlashMap] = useState<Record<string, number>>({});
  const statusRef = useRef<Map<string, string>>(new Map());
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilterText(filterInput.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [filterInput]);

  useEffect(() => {
    if (!state.splitDraft?.chapters?.length) {
      setSelectedChapterTaskId(null);
      return;
    }
    if (!selectedChapterTaskId || !state.splitDraft.chapters.some((c) => c.task_id === selectedChapterTaskId)) {
      setSelectedChapterTaskId(state.splitDraft.chapters[0].task_id);
    }
  }, [state.splitDraft, selectedChapterTaskId]);

  const allItems = useMemo(() => {
    let source: ListItem[] = [];
    if (tab === "jobs") {
      source = [...state.jobs]
        .sort((a, b) => priorityForStatus(b.status) - priorityForStatus(a.status) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .map((job) => ({
          id: `job:${job.id}`,
          status: job.status,
          title: `#${job.id} ${job.mode}`,
          subtitle: `progress ${job.completed_tasks}/${job.total_tasks} | by ${job.created_by ?? "-"}`,
          updatedAt: job.updated_at,
          warningCount: job.status === "FAILED" ? 1 : 0,
        }));
    } else if (tab === "tasks") {
      source = [...state.tasks]
        .map((task) => ({
          id: `task:${task.id}`,
          status:
            task.status === "DONE" &&
            task.task_type === "CHAPTER_SPLIT_LLM" &&
            String((task.result_json as Record<string, unknown> | null | undefined)?.operational_state || "").toUpperCase() === "NEEDS_RETRY"
              ? "NEEDS_RETRY"
              : task.status,
          title: `#${task.seq_no} ${task.task_type}`,
          subtitle: `${task.source_path ?? "-"} | attempts ${task.attempts}`,
          updatedAt: task.updated_at,
          warningCount:
            (task.error ? 1 : 0) +
            (
              task.status === "DONE" &&
              task.task_type === "CHAPTER_SPLIT_LLM" &&
              String((task.result_json as Record<string, unknown> | null | undefined)?.operational_state || "").toUpperCase() === "NEEDS_RETRY"
                ? 1
                : 0
            ),
        }))
        .sort((a, b) => priorityForStatus(b.status) - priorityForStatus(a.status) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else {
      source = (state.splitDraft?.chapters ?? []).map((chapter) => ({
        id: `chapter:${chapter.task_id}`,
        status:
          String(chapter.status ?? "UNKNOWN").toUpperCase() === "DONE" &&
          String(chapter.operational_state || "").toUpperCase() === "NEEDS_RETRY"
            ? "NEEDS_RETRY"
            : String(chapter.status ?? "UNKNOWN"),
        title: `${chapter.chapter_id ?? `task#${chapter.task_id}`} ${chapter.chapter_title ? `| ${chapter.chapter_title}` : ""}`,
        subtitle: `scenes ${chapter.scenes.length} | strategy ${chapter.strategy_selected ?? "-"}`,
        updatedAt: state.selectedJob?.updated_at ?? new Date().toISOString(),
        warningCount:
          Number(Boolean(chapter.hard_fail)) +
          (chapter.supervisor_decision === "manual_review" ? 1 : 0) +
          (String(chapter.operational_state || "").toUpperCase() === "NEEDS_RETRY" ? 1 : 0),
      }))
      .sort((a, b) => priorityForStatus(b.status) - priorityForStatus(a.status) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return source;
  }, [tab, state.jobs, state.tasks, state.splitDraft, state.selectedJob?.updated_at]);

  useEffect(() => {
    const nextFlash: string[] = [];
    const prevMap = statusRef.current;
    const nextMap = new Map<string, string>();
    for (const item of allItems) {
      nextMap.set(item.id, item.status);
      const prev = prevMap.get(item.id);
      if (prev && prev !== item.status) nextFlash.push(item.id);
    }
    statusRef.current = nextMap;
    if (nextFlash.length === 0) return;
    setFlashMap((prev) => {
      const merged = { ...prev };
      const now = Date.now();
      for (const id of nextFlash) merged[id] = now;
      return merged;
    });
    for (const id of nextFlash) {
      const existing = flashTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setFlashMap((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        flashTimersRef.current.delete(id);
      }, 1200);
      flashTimersRef.current.set(id, timer);
    }
  }, [allItems]);

  useEffect(() => {
    return () => {
      for (const timer of flashTimersRef.current.values()) clearTimeout(timer);
      flashTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const loading = Boolean((state as { loading?: boolean }).loading);
    if (!loading) {
      loadingSinceRef.current = null;
      return;
    }
    if (!loadingSinceRef.current) {
      loadingSinceRef.current = Date.now();
      return;
    }
    const elapsedSec = (Date.now() - loadingSinceRef.current) / 1000;
    if (elapsedSec >= 30) {
      console.warn("[splitter-ui] loading appears stuck", { elapsedSec: Math.round(elapsedSec) });
    }
  }, [(state as { loading?: boolean }).loading]);

  const items = useMemo(() => {
    return allItems.filter((row) => {
      const textOk = !filterText || `${row.title} ${row.subtitle}`.toLowerCase().includes(filterText.toLowerCase());
      const statusOk = filterStatus === "ALL" || row.status.toUpperCase() === filterStatus;
      return textOk && statusOk;
    });
  }, [allItems, filterText, filterStatus]);

  const selectedListId =
    tab === "jobs"
      ? state.selectedJobId
        ? `job:${state.selectedJobId}`
        : null
      : tab === "tasks"
        ? state.selectedTaskId
          ? `task:${state.selectedTaskId}`
          : null
        : selectedChapterTaskId
          ? `chapter:${selectedChapterTaskId}`
          : null;

  const selectedFromAll = useMemo(() => {
    if (!selectedListId) return null;
    return allItems.find((x) => x.id === selectedListId) ?? null;
  }, [allItems, selectedListId]);

  const displayItems = useMemo(() => {
    if (!selectedFromAll) return items;
    if (items.some((x) => x.id === selectedFromAll.id)) return items;
    return [selectedFromAll, ...items];
  }, [items, selectedFromAll]);

  const totalRows = displayItems.length;
  const visibleCount = Math.ceil(LIST_HEIGHT / ROW_HEIGHT);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(totalRows, startIndex + visibleCount + OVERSCAN * 2);
  const virtualRows = displayItems.slice(startIndex, endIndex);
  const topPad = startIndex * ROW_HEIGHT;
  const bottomPad = Math.max(0, (totalRows - endIndex) * ROW_HEIGHT);

  const selectedChapter = useMemo(
    () => state.splitDraft?.chapters?.find((chapter) => chapter.task_id === selectedChapterTaskId) ?? null,
    [state.splitDraft, selectedChapterTaskId]
  );

  return (
    <section className="relative z-10 grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)] pointer-events-auto">
      <div className="surface-card min-h-[660px] p-3">
        <div className="mb-3 flex gap-2">
          {(["jobs", "tasks", "chapters"] as SplitterTab[]).map((entry) => (
            <button key={entry} type="button" className={`shell-link px-2 py-1 text-xs uppercase ${tab === entry ? "border-[#9de5dc]/50 text-[#9de5dc]" : ""}`} onClick={() => setTab(entry)}>
              {entry}
            </button>
          ))}
        </div>
        <div className="mb-2 text-[11px] text-slate-400">
          {tab === "jobs" ? "Jobs: one pipeline run end-to-end." : tab === "tasks" ? "Tasks: debug each execution step." : "Chapters: content-level split quality and approve/reprocess."}
        </div>
        <div className="mb-3 flex flex-wrap gap-1 text-[10px] text-slate-300">
          <span className="rounded border border-rose-700/40 bg-rose-900/20 px-2 py-0.5">FAILED</span>
          <span className="rounded border border-rose-600/40 bg-rose-900/30 px-2 py-0.5">NEEDS_RETRY</span>
          <span className="rounded border border-amber-700/40 bg-amber-900/20 px-2 py-0.5">RUNNING</span>
          <span className="rounded border border-slate-700/40 bg-slate-900/30 px-2 py-0.5">READY</span>
          <span className="rounded border border-emerald-700/40 bg-emerald-900/20 px-2 py-0.5">DONE</span>
          <span className="rounded border border-amber-500/40 bg-amber-900/20 px-2 py-0.5">SLA &gt; {SPLIT_SLA_SEC}s</span>
          <span className="rounded border border-rose-500/40 bg-rose-900/20 px-2 py-0.5">STALE &gt; {SPLIT_STALE_SEC}s</span>
        </div>
        <div className="mb-3 grid gap-2">
          <input className="shell-control px-2 py-1 text-xs" value={filterInput} onChange={(e) => setFilterInput(e.target.value)} placeholder="Filter..." />
          <select className="shell-control px-2 py-1 text-xs" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="FAILED">FAILED</option>
            <option value="NEEDS_RETRY">NEEDS_RETRY</option>
            <option value="RUNNING">RUNNING</option>
            <option value="READY">READY</option>
            <option value="WAIT_REVIEW">WAIT_REVIEW</option>
            <option value="DONE">DONE</option>
          </select>
        </div>
        <div
          ref={listRef}
          className="max-h-[560px] overflow-auto pr-1"
          style={{ height: LIST_HEIGHT }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (displayItems.length === 0) return;
            const currentIndex = selectedListId ? displayItems.findIndex((x) => x.id === selectedListId) : -1;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const nextIndex = Math.min(displayItems.length - 1, currentIndex < 0 ? 0 : currentIndex + 1);
              const next = displayItems[nextIndex];
              if (next) {
                if (next.id.startsWith("job:")) state.setSelectedJobId(Number(next.id.slice(4)));
                if (next.id.startsWith("task:")) state.setSelectedTaskId(Number(next.id.slice(5)));
                if (next.id.startsWith("chapter:")) setSelectedChapterTaskId(Number(next.id.slice(8)));
                const nextTop = nextIndex * ROW_HEIGHT;
                const nextBottom = nextTop + ROW_HEIGHT;
                const viewTop = listRef.current?.scrollTop ?? 0;
                const viewBottom = viewTop + LIST_HEIGHT;
                if (nextBottom > viewBottom) listRef.current?.scrollTo({ top: nextBottom - LIST_HEIGHT });
                if (nextTop < viewTop) listRef.current?.scrollTo({ top: nextTop });
              }
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              const nextIndex = Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
              const next = displayItems[nextIndex];
              if (next) {
                if (next.id.startsWith("job:")) state.setSelectedJobId(Number(next.id.slice(4)));
                if (next.id.startsWith("task:")) state.setSelectedTaskId(Number(next.id.slice(5)));
                if (next.id.startsWith("chapter:")) setSelectedChapterTaskId(Number(next.id.slice(8)));
                const nextTop = nextIndex * ROW_HEIGHT;
                const viewTop = listRef.current?.scrollTop ?? 0;
                if (nextTop < viewTop) listRef.current?.scrollTo({ top: nextTop });
              }
            }
          }}
        >
          <div style={{ paddingTop: topPad, paddingBottom: bottomPad }} className="space-y-1">
          {virtualRows.map((row) => (
            (() => {
              const age = ageSecFromIso(row.updatedAt);
              const isRunning = row.status.toUpperCase() === "RUNNING";
              const slaBreach = isRunning && age > SPLIT_SLA_SEC;
              const stale = isRunning && age > SPLIT_STALE_SEC;
              return (
            <button
              key={row.id}
              type="button"
              className={`w-full rounded border px-2 py-2 text-left text-xs transition-colors duration-300 ${
                selectedListId === row.id ? "border-[#9de5dc]/60 bg-[#132338]" : "border-[#223247] bg-[#0f172a] hover:bg-[#132338]"
              } ${flashMap[row.id] ? "ring-1 ring-amber-400/70" : ""}`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => {
                if (row.id.startsWith("job:")) state.setSelectedJobId(Number(row.id.slice(4)));
                if (row.id.startsWith("task:")) state.setSelectedTaskId(Number(row.id.slice(5)));
                if (row.id.startsWith("chapter:")) setSelectedChapterTaskId(Number(row.id.slice(8)));
              }}
              title={`${row.title}\n${row.subtitle}`}
            >
              <div className="truncate font-medium text-slate-100">{row.title}</div>
              <div className="muted truncate">{row.subtitle}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                <span className="text-slate-400">age {formatAge(age)}</span>
                {slaBreach ? <span className="rounded border border-amber-500/40 bg-amber-900/20 px-1 py-0.5 text-amber-200">SLA</span> : null}
                {stale ? <span className="rounded border border-rose-500/40 bg-rose-900/20 px-1 py-0.5 text-rose-200">STALE</span> : null}
              </div>
              {row.warningCount > 0 ? <div className="text-[10px] text-amber-300">warnings: {row.warningCount}</div> : null}
            </button>
              );
            })()
          ))}
          {displayItems.length === 0 ? <div className="muted rounded border border-[#223247] px-2 py-3 text-xs">No items.</div> : null}
          </div>
        </div>
      </div>
      <div className="surface-card min-h-[660px] p-3">
        <div className="mb-3 text-sm font-medium text-slate-200">Detail Drawer</div>
        <div className="max-h-[800px] overflow-auto space-y-3 pr-1">
          {tab === "jobs" ? (
            <div className="rounded border border-[#223247] bg-[#0f172a] p-3 text-xs">
              <div className="text-sm font-medium text-slate-100">Job #{state.selectedJob?.id ?? "-"}</div>
              <div className="muted mt-1">status: {state.selectedJob?.status ?? "-"} | mode: {state.selectedJob?.mode ?? "-"}</div>
            </div>
          ) : null}
          {tab === "tasks" ? <TaskDetailSection state={state} splitSlaSec={SPLIT_SLA_SEC} splitStaleSec={SPLIT_STALE_SEC} /> : null}
          {tab === "chapters" && selectedChapter ? (
            <ChapterDetailSection state={state} selectedChapter={selectedChapter} />
          ) : null}
          {tab !== "jobs" && tab !== "tasks" && tab !== "chapters" ? null : null}
        </div>
      </div>
    </section>
  );
}

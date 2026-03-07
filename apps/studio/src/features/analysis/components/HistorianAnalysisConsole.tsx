"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SnapshotItem = {
  id: number;
  source: "SNAPSHOT" | "TASK_RESULT";
  task_id: number | null;
  task_status: string | null;
  chapter_id: string | null;
  fact_status: string;
  ready_for_writing: boolean;
  degraded_mode: boolean;
  narrative_score: number;
  emotional_target: string | null;
  created_at: string;
  elapsed_sec: number | null;
  active: boolean;
  analysis_data: Record<string, unknown> | null;
  scope_type: "chapter" | "batch" | "arc" | "story";
  scope_key: string;
  status: "DRAFT" | "APPROVED" | "SUPERSEDED" | "CANCELED";
  prep_status?: "NONE" | "CREATED";
  rollup_task_status?: "NONE" | "READY" | "RUNNING" | "DONE" | "FAILED" | "FAILED_STALE";
  final_source?: "ROLLUP" | "NONE";
  blocking_reason?: "DB_UNAVAILABLE" | "LLM_UNAVAILABLE" | "WAITING_QUEUE" | "TASK_FAILED" | "READY";
  aggregate_status?: "NONE" | "CREATED";
  rollup_status?: "NONE" | "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  is_final_analysis_ready?: boolean;
  intermediate_only?: boolean;
  analysis_state_reason?: "WORKER_OFF" | "LANE_OFF" | "LLM_OFF" | "WAITING_QUEUE" | "TASK_FAILED" | "FAILED_STALE" | "READY";
  rollup_task_id?: number | null;
  rollup_input_payload?: Record<string, unknown> | null;
  final_memory_payload?: Record<string, unknown> | null;
  final_source_table?: "story_milestone" | "writing_scope_snapshot_v1" | "none";
  final_payload_schema_version?: string | null;
  task_result_compact?: Record<string, unknown> | null;
  rollup_input_chapter_snapshots?: Array<{
    snapshot_id: number;
    chapter_id: string | null;
    snapshot_v3: Record<string, unknown>;
  }>;
  stale_running?: boolean;
  rollup_last_updated_at?: string | null;
  rollup_timeout_sec?: number;
  is_intermediate_prep?: boolean;
  final_payload_available?: boolean;
  vetting_summary?: {
    fact_status?: string;
    duplicate_count?: number;
    conflict_count?: number;
    classification_stats?: Record<string, number>;
    entity_type_stats?: Record<string, number>;
    entity_type_conflict_count?: number;
  };
};

type RunningTask = {
  id: number;
  task_type: "WRITING_ANALYSIS" | "MEMORY_ROLLUP";
  status: "READY" | "RUNNING";
  chapter_id: string | null;
  scope: string;
  started_at: string | null;
  updated_at: string | null;
  age_sec: number;
};
type WorkerStatus = {
  enabled: boolean;
  running: boolean;
  pid: number | null;
  detail?: string;
};
type AnalysisLaneStatus = {
  lane: "analysis";
  running: boolean;
  pid: number | null;
};
type LlamaStatus = {
  running: boolean;
  pid: number | null;
  detail?: string;
  http_ready?: boolean;
};

type ScopeFolder = {
  key: string;
  scopeType: SnapshotItem["scope_type"];
  scopeKey: string;
  hasApproved: boolean;
  latestAt: string;
  items: SnapshotItem[];
  coverageNote?: string;
  prepStatus?: "NONE" | "CREATED";
  rollupTaskStatus?: "NONE" | "READY" | "RUNNING" | "DONE" | "FAILED" | "FAILED_STALE";
  finalSource?: "ROLLUP" | "NONE";
  blockingReason?: "DB_UNAVAILABLE" | "LLM_UNAVAILABLE" | "WAITING_QUEUE" | "TASK_FAILED" | "READY";
  aggregateStatus?: "NONE" | "CREATED";
  rollupStatus?: "NONE" | "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  isFinalAnalysisReady?: boolean;
  intermediateOnly?: boolean;
  analysisStateReason?: "WORKER_OFF" | "LANE_OFF" | "LLM_OFF" | "WAITING_QUEUE" | "TASK_FAILED" | "FAILED_STALE" | "READY";
  rollupTaskId?: number | null;
  staleRunning?: boolean;
  rollupLastUpdatedAt?: string | null;
  rollupTimeoutSec?: number;
};

type HistorianMetrics = {
  window_days: number;
  sample_size: number;
  metrics: {
    p95_latency_sec: number;
    entity_accuracy: number;
    ephemeral_leak_count: number;
    static_fact_count: number;
    prompt_token_reduction_pct: number | null;
  };
  gates: {
    go: {
      token_reduction_ge_30pct: { pass: boolean; reason?: string };
      entity_accuracy_ge_95pct: { pass: boolean };
      p95_latency_le_1_7x_baseline: { pass: boolean };
    };
    no_go: {
      ephemeral_leak_into_global: { pass: boolean; leak_count: number };
    };
  };
};

export default function HistorianAnalysisConsole({
  storySlug,
  initialScope = "chapter",
  scopeFilterMode = "strict",
}: {
  storySlug: string;
  initialScope?: "story" | "chapter" | "chapter_range" | "arc";
  scopeFilterMode?: "strict" | "ops";
}) {
  const formatElapsed = (sec: number | null | undefined) => {
    const s = Math.max(0, Number(sec || 0));
    if (!Number.isFinite(s) || s <= 0) return "-";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rs = Math.floor(s % 60);
    if (h > 0) return `${h}h ${m}m ${rs}s`;
    if (m > 0) return `${m}m ${rs}s`;
    return `${rs}s`;
  };
  const [scope, setScope] = useState<"story" | "chapter" | "chapter_range" | "arc">(initialScope);
  const [chapterId, setChapterId] = useState("");
  const [chapterFrom, setChapterFrom] = useState("");
  const [chapterTo, setChapterTo] = useState("");
  const [arcId, setArcId] = useState("");
  const [arcs, setArcs] = useState<Array<{ id: number; name: string; slug: string | null }>>([]);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SnapshotItem[]>([]);
  const [actionType, setActionType] = useState<"chapter_analysis" | "rollup">("chapter_analysis");
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [chapters, setChapters] = useState<string[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null);
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [analysisLaneStatus, setAnalysisLaneStatus] = useState<AnalysisLaneStatus | null>(null);
  const [llamaStatus, setLlamaStatus] = useState<LlamaStatus | null>(null);
  const [workerMasterRunning, setWorkerMasterRunning] = useState<boolean>(false);
  const [workerLaneRunning, setWorkerLaneRunning] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<HistorianMetrics | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "activating" | "canceling">("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  const [showAllScopes, setShowAllScopes] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const base = useMemo(() => `/api/stories/${encodeURIComponent(storySlug)}/analysis`, [storySlug]);
  const isOpsMode = scopeFilterMode === "ops";

  const scopeTypeQuery = useMemo(() => {
    if (isOpsMode) {
      return showAllScopes ? "all" : "batch";
    }
    if (scope === "chapter") return "chapter";
    if (scope === "arc") return "arc";
    if (scope === "story") return "story";
    return "all";
  }, [isOpsMode, scope, showAllScopes]);

  const folders = useMemo<ScopeFolder[]>(() => {
    const map = new Map<string, ScopeFolder>();
    for (const item of items) {
      const key = `${item.scope_type}:${item.scope_key}`;
      const existing = map.get(key);
      if (!existing) {
        let coverageNote: string | undefined;
        if (item.scope_type !== "chapter") {
          const snapshotRoot =
            item.analysis_data && typeof item.analysis_data === "object"
              ? (
                ((item.analysis_data.snapshot_v3 as Record<string, unknown> | undefined) ??
                  ((item.analysis_data.aggregate_snapshot as Record<string, unknown> | undefined)?.snapshot_v3 as Record<string, unknown> | undefined))
              )
              : undefined;
          const coverage =
            snapshotRoot && typeof snapshotRoot.coverage === "object"
              ? (snapshotRoot.coverage as Record<string, unknown>)
              : undefined;
          if (coverage) {
            const total = Number(coverage.total ?? 0);
            const approved = Number(coverage.approved ?? 0);
            const missing = Array.isArray(coverage.missing) ? coverage.missing.map((x) => String(x || "")).filter(Boolean) : [];
            const metrics =
              snapshotRoot && typeof snapshotRoot.aggregate_metrics === "object"
                ? (snapshotRoot.aggregate_metrics as Record<string, unknown>)
                : undefined;
            const threshold = Number(metrics?.coverage_threshold ?? NaN);
            if (Number.isFinite(total) && total > 0) {
              const thresholdText = Number.isFinite(threshold) ? ` | threshold:${(threshold * 100).toFixed(0)}%` : "";
              coverageNote = `${approved}/${total} approved${thresholdText}${missing.length ? ` | missing: ${missing.join(", ")}` : ""}`;
            }
          }
        }
        map.set(key, {
          key,
          scopeType: item.scope_type,
          scopeKey: item.scope_key,
          hasApproved: item.status === "APPROVED",
          latestAt: item.created_at,
          items: [item],
          coverageNote,
          prepStatus: item.prep_status,
          rollupTaskStatus: item.rollup_task_status,
          finalSource: item.final_source,
          blockingReason: item.blocking_reason,
          aggregateStatus: item.aggregate_status,
          rollupStatus: item.rollup_status,
          isFinalAnalysisReady: Boolean(item.is_final_analysis_ready),
          intermediateOnly: Boolean(item.intermediate_only),
          analysisStateReason: item.analysis_state_reason,
          rollupTaskId: Number.isFinite(Number(item.rollup_task_id)) ? Number(item.rollup_task_id) : null,
          staleRunning: Boolean(item.stale_running),
          rollupLastUpdatedAt: item.rollup_last_updated_at || null,
          rollupTimeoutSec: Number(item.rollup_timeout_sec || 0) || undefined,
        });
        continue;
      }
      existing.items.push(item);
      if (item.status === "APPROVED") existing.hasApproved = true;
      if (!existing.prepStatus && item.prep_status) existing.prepStatus = item.prep_status;
      if (!existing.rollupTaskStatus && item.rollup_task_status) existing.rollupTaskStatus = item.rollup_task_status;
      if (!existing.finalSource && item.final_source) existing.finalSource = item.final_source;
      if (!existing.blockingReason && item.blocking_reason) existing.blockingReason = item.blocking_reason;
      if (!existing.aggregateStatus && item.aggregate_status) existing.aggregateStatus = item.aggregate_status;
      if (!existing.rollupStatus && item.rollup_status) existing.rollupStatus = item.rollup_status;
      if (item.is_final_analysis_ready) existing.isFinalAnalysisReady = true;
      if (item.intermediate_only) existing.intermediateOnly = true;
      if (!existing.analysisStateReason && item.analysis_state_reason) existing.analysisStateReason = item.analysis_state_reason;
      if ((existing.rollupTaskId == null || existing.rollupTaskId <= 0) && Number(item.rollup_task_id || 0) > 0) {
        existing.rollupTaskId = Number(item.rollup_task_id || 0);
      }
      if (item.stale_running) existing.staleRunning = true;
      if (!existing.rollupLastUpdatedAt && item.rollup_last_updated_at) existing.rollupLastUpdatedAt = item.rollup_last_updated_at;
      if (!existing.rollupTimeoutSec && item.rollup_timeout_sec) existing.rollupTimeoutSec = Number(item.rollup_timeout_sec);
      if (new Date(item.created_at).getTime() > new Date(existing.latestAt).getTime()) {
        existing.latestAt = item.created_at;
      }
    }

    const statusRank = (status: SnapshotItem["status"]) => {
      if (status === "APPROVED") return 0;
      if (status === "DRAFT") return 1;
      if (status === "SUPERSEDED") return 2;
      return 3;
    };

    const out = Array.from(map.values());
    for (const folder of out) {
      folder.items.sort((a, b) => {
        const s = statusRank(a.status) - statusRank(b.status);
        if (s !== 0) return s;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    out.sort((a, b) => {
      if (a.hasApproved !== b.hasApproved) return a.hasApproved ? -1 : 1;
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
    });
    return out;
  }, [items]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (silent) {
      setRefreshing(true);
    } else {
      setPhase("loading");
      setLoading(true);
      setError(null);
    }
    try {
      const params = new URLSearchParams();
      if (scope === "chapter" && chapterId.trim()) {
        params.set("chapter_id", chapterId.trim());
      }
      if (scopeTypeQuery) {
        params.set("scope_type", scopeTypeQuery);
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      const [res, metricsRes] = await Promise.all([
        fetch(`${base}${qs}`, { cache: "no-store" }),
        fetch(`${base}/metrics?days=7`, { cache: "no-store" }),
      ]);
      const data = await res.json();
      const metricsData = await metricsRes.json().catch(() => null);
      if (!res.ok || data?.ok === false) throw new Error(data.error || "ANALYSIS_LOAD_FAILED");
      setItems(Array.isArray(data.items) ? data.items : []);
      setChapters(Array.isArray(data.chapters) ? data.chapters.map((x: unknown) => String(x || "")).filter(Boolean) : []);
      setArcs(Array.isArray(data.arcs) ? data.arcs : []);
      setActiveSnapshotId(Number.isFinite(Number(data.active_snapshot_id)) ? Number(data.active_snapshot_id) : null);
      setRunningTasks(Array.isArray(data.running_tasks) ? data.running_tasks : []);
      setWorkerStatus(data.worker_status && typeof data.worker_status === "object" ? (data.worker_status as WorkerStatus) : null);
      setAnalysisLaneStatus(
        data.analysis_lane_status && typeof data.analysis_lane_status === "object"
          ? (data.analysis_lane_status as AnalysisLaneStatus)
          : null
      );
      setLlamaStatus(data.llama_status && typeof data.llama_status === "object" ? (data.llama_status as LlamaStatus) : null);
      setWorkerMasterRunning(Boolean(data.worker_master_running));
      setWorkerLaneRunning(Boolean(data.worker_lane_running));
      setLastUpdatedAt(new Date().toISOString());
      if (metricsRes.ok && metricsData?.ok !== false) {
        setMetrics(metricsData as HistorianMetrics);
      }
    } catch (e: unknown) {
      if (!silent) {
        setError(e instanceof Error ? e.message : "ANALYSIS_LOAD_FAILED");
      }
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
        setPhase("idle");
      }
    }
  }, [base, chapterId, scope, scopeTypeQuery]);

  const runAnalysis = useCallback(async () => {
    setPhase("running");
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          chapter_id: chapterId.trim() || undefined,
          chapter_from: chapterFrom.trim() || undefined,
          chapter_to: chapterTo.trim() || undefined,
          arc_id: scope === "arc" ? Number(arcId || 0) || undefined : undefined,
          instructions: instructions.trim() || undefined,
          action_type: scope === "chapter" ? "chapter_analysis" : actionType,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data.error || "ANALYSIS_RUN_FAILED");
      const taskCount = Array.isArray(data?.task_ids) ? data.task_ids.length : 0;
      const mode = String(data?.mode || "");
      if (mode === "chapter_runs") {
        setInfo(`Analysis queued: ${taskCount} task(s). Polling updates...`);
      } else if (mode === "aggregate") {
        const snap = Number(data?.aggregate_snapshot_id || data?.scope_snapshot_id || 0);
        const reason = String(data?.analysis_state_reason || "WAITING_QUEUE");
        setInfo(`Preparation created (#${snap}). Rollup queued. reason=${reason}`);
      } else {
        setInfo("Analysis request accepted.");
      }
      await load({ silent: true });
      if (mode === "chapter_runs" && taskCount > 0) {
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          await load({ silent: true });
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ANALYSIS_RUN_FAILED");
    } finally {
      setLoading(false);
      setPhase("idle");
    }
  }, [arcId, base, chapterFrom, chapterId, chapterTo, instructions, load, scope]);

  const activate = useCallback(async (snapshotId: number, chapter: string | null, scopeType: SnapshotItem["scope_type"], scopeKey: string) => {
    setPhase("activating");
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`${base}/activate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          snapshot_id: snapshotId,
          chapter_id: (chapter || chapterId || "").trim(),
          scope_type: scopeType,
          scope_key: scopeKey,
          activated_by: "analysis_console",
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data.error || "ANALYSIS_ACTIVATE_FAILED");
      setInfo("Approved lane updated.");
      await load({ silent: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ANALYSIS_ACTIVATE_FAILED");
    } finally {
      setLoading(false);
      setPhase("idle");
    }
  }, [base, chapterId, load]);

  const cancelSnapshot = useCallback(async (snapshotId: number, chapter: string | null, scopeType: SnapshotItem["scope_type"], scopeKey: string) => {
    setPhase("canceling");
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`${base}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          snapshot_id: snapshotId,
          chapter_id: (chapter || chapterId || "").trim(),
          scope_type: scopeType,
          scope_key: scopeKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data.error || "ANALYSIS_CANCEL_FAILED");
      setInfo("Snapshot canceled.");
      await load({ silent: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ANALYSIS_CANCEL_FAILED");
    } finally {
      setLoading(false);
      setPhase("idle");
    }
  }, [base, chapterId, load]);

  const recoverRollup = useCallback(async (scopeType: "arc" | "story" | "batch", scopeKey: string, mode: "requeue" | "fail" = "requeue") => {
    setPhase("running");
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`${base}/recover-rollup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope_type: scopeType,
          scope_key: scopeKey,
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data.error || "ANALYSIS_RECOVER_ROLLUP_FAILED");
      setInfo(`Rollup recovery: ${String(data.reason || "DONE")} (task #${Number(data.task_id || 0)})`);
      await load({ silent: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ANALYSIS_RECOVER_ROLLUP_FAILED");
    } finally {
      setLoading(false);
      setPhase("idle");
    }
  }, [base, load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (runningTasks.length === 0) return;
    const timer = setInterval(() => {
      void load({ silent: true });
    }, 2500);
    return () => clearInterval(timer);
  }, [runningTasks.length, load]);

  useEffect(() => {
    if (isOpsMode && scope !== "chapter_range") {
      setScope("chapter_range");
    }
  }, [isOpsMode, scope]);

  useEffect(() => {
    if (chapters.length === 0) return;
    if (scope === "chapter") {
      if (!chapterId || !chapters.includes(chapterId)) {
        setChapterId(chapters[0]);
      }
      return;
    }
    if (scope === "chapter_range" || scope === "arc") {
      if (!chapterFrom || !chapters.includes(chapterFrom)) {
        setChapterFrom(chapters[0]);
      }
      if (!chapterTo || !chapters.includes(chapterTo)) {
        setChapterTo(chapters[chapters.length - 1]);
      }
      if (scope === "arc" && !arcId && arcs.length > 0) {
        setArcId(String(arcs[0].id));
      }
      return;
    }
  }, [arcId, arcs, chapterFrom, chapterId, chapterTo, chapters, scope]);

  const runningCount = runningTasks.filter((t) => t.status === "RUNNING").length;
  const queuedCount = runningTasks.filter((t) => t.status === "READY").length;
  const processingLabel =
    phase === "running"
      ? "Running analysis..."
      : phase === "activating"
        ? "Updating approved lane..."
        : phase === "canceling"
          ? "Canceling snapshot..."
          : phase === "loading"
            ? "Loading analysis data..."
            : runningTasks.length > 0
              ? `Processing tasks (running:${runningCount} queued:${queuedCount})`
              : refreshing
                ? "Refreshing in background..."
                : "Ready";
  const showOfflineBanner = Boolean(analysisLaneStatus && !analysisLaneStatus.running && runningTasks.length === 0);
  const preflightReady =
    scope !== "chapter" || Boolean(analysisLaneStatus?.running && llamaStatus?.running && llamaStatus?.http_ready);
  const preflightHint =
    scope === "chapter"
      ? !analysisLaneStatus?.running
        ? "Analysis lane offline"
        : !llamaStatus?.running
          ? "LLM process offline"
          : !llamaStatus?.http_ready
            ? "LLM warming up (health not ready)"
            : "Preflight ready"
      : null;
  const activeScopeType = scope === "chapter" ? "chapter" : scope === "arc" ? "arc" : scope === "story" ? "story" : "batch";
  const visibleFolders = useMemo(() => {
    if (isOpsMode && showAllScopes) return folders;
    return folders.filter((folder) => folder.scopeType === activeScopeType);
  }, [activeScopeType, folders, isOpsMode, showAllScopes]);

  return (
    <main className="flex flex-col h-screen overflow-hidden bg-[#0B1016]">
      {/* Sticky Header and Control Bar */}
      <section className="sticky top-0 z-20 space-y-0 border-b border-[#1E2A38] bg-[#0E1217]/95 backdrop-blur shadow-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">Historian Analysis Console</h1>
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">story: {storySlug}</div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/stories/${encodeURIComponent(storySlug)}/write`} className="rounded bg-[#1E2A38] hover:bg-[#2A3441] px-3 py-1.5 text-xs font-medium transition-colors">
              Back To Writing
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        {isOpsMode ? (
          <div className="flex items-center justify-between border-b border-[#1E2A38] px-4 py-2">
            <div className="text-[11px] font-bold tracking-widest text-amber-300">BATCH OPERATIONS</div>
            <label className="flex items-center gap-2 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={showAllScopes}
                onChange={(e) => setShowAllScopes(e.target.checked)}
              />
              Show all scopes
            </label>
          </div>
        ) : (
          <div className="flex px-4 border-b border-[#1E2A38]">
            {[
              { id: "chapter", label: "CHAPTER" },
              { id: "arc", label: "ARC" },
              { id: "story", label: "STORY" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setScope(tab.id as any)}
                className={`px-4 py-2 text-[11px] font-bold tracking-widest transition-all border-b-2 ${scope === tab.id
                  ? "border-[#4DA3FF] text-[#4DA3FF] bg-[#4DA3FF]/5"
                  : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Dynamic Control Bar */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-3 p-3 px-4">
          <div className="flex flex-wrap items-center gap-2">
            {scope === "chapter" && (
              <select
                className="rounded border border-[#2A3441] bg-[#0E1217] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[#4DA3FF] outline-none"
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
              >
                {chapters.length === 0 ? <option value="">no chapters</option> : null}
                {chapters.map((ch) => (
                  <option key={`one-${ch}`} value={ch}>
                    {ch}
                  </option>
                ))}
              </select>
            )}

            {scope === "arc" && (
              <select
                className="rounded border border-[#2A3441] bg-[#0E1217] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[#4DA3FF] outline-none"
                value={arcId}
                onChange={(e) => setArcId(e.target.value)}
              >
                {arcs.length === 0 ? <option value="">no arcs found</option> : null}
                {arcs.map((arc) => (
                  <option key={`arc-${arc.id}`} value={String(arc.id)}>
                    {arc.name}
                  </option>
                ))}
              </select>
            )}

            {(scope === "arc" || scope === "chapter_range") && (
              <div className="flex items-center gap-1.5">
                <select
                  className="rounded border border-[#2A3441] bg-[#0E1217] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[#4DA3FF] outline-none min-w-[100px]"
                  value={chapterFrom}
                  onChange={(e) => setChapterFrom(e.target.value)}
                >
                  {chapters.map((ch) => (
                    <option key={`from-${ch}`} value={ch}>
                      from {ch}
                    </option>
                  ))}
                </select>
                <div className="h-px w-2 bg-[#2A3441]" />
                <select
                  className="rounded border border-[#2A3441] bg-[#0E1217] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[#4DA3FF] outline-none min-w-[100px]"
                  value={chapterTo}
                  onChange={(e) => setChapterTo(e.target.value)}
                >
                  {chapters.map((ch) => (
                    <option key={`to-${ch}`} value={ch}>
                      to {ch}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <input
              className="flex-1 rounded border border-[#2A3441] bg-[#0E1217] px-3 py-1.5 text-xs min-w-[200px] focus:ring-1 focus:ring-[#4DA3FF] outline-none"
              placeholder="analysis instructions (optional)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />

            {scope !== "chapter" && (
              <select
                className="rounded border border-[#2A3441] bg-[#0E1217] px-3 py-1.5 text-xs focus:ring-1 focus:ring-[#4DA3FF] outline-none min-w-[130px]"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as any)}
              >
                <option value="chapter_analysis">Chapter Tasks</option>
                <option value="rollup">Run Rollup</option>
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="text-[#B8DBFF] hover:bg-[#1E2A38] px-3 py-1.5 text-xs font-bold transition-all rounded"
              onClick={() => void load()}
              disabled={loading}
              title="Refresh data"
            >
              REFRESH
            </button>
            <button
              className="bg-[#1E3A5F] hover:bg-[#2B5282] text-[#B8DBFF] px-4 py-1.5 text-xs font-bold transition-all rounded shadow-lg disabled:opacity-30"
              onClick={() => void runAnalysis()}
              disabled={
                loading ||
                (scope === "chapter" && (!preflightReady || !chapterId)) ||
                (scope === "chapter_range" && (!chapterFrom || !chapterTo)) ||
                (scope === "arc" && !arcId && (!chapterFrom || !chapterTo))
              }
            >
              {loading ? "PROCESSING..." : "RUN ANALYSIS"}
            </button>
          </div>
        </div>

        {/* Mini Stats Bar */}
        <div className="bg-[#0B1016] border-t border-[#1E2A38] px-4 py-1.5 flex items-center gap-6 overflow-hidden">
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`h-1.5 w-1.5 rounded-full ${runningTasks.length > 0 ? "animate-pulse bg-amber-400" : "bg-[#5AA9FF]"}`} />
            <span className="font-mono text-slate-400 tracking-tight">{processingLabel}</span>
          </div>

          <div className="flex items-center gap-4 ml-auto font-mono text-[9px] text-slate-500 uppercase tracking-widest hidden md:flex">
            <span className={workerMasterRunning ? "text-[#9de5dc]" : ""}>Worker Master: {workerMasterRunning ? "ON" : "OFF"}</span>
            <span className={workerLaneRunning ? "text-[#9de5dc]" : ""}>Analysis Lane: {workerLaneRunning ? "ON" : "OFF"}</span>
            <span className={llamaStatus?.running ? "text-[#9de5dc]" : ""}>LLM: {llamaStatus?.running ? "ON" : "OFF"}</span>
            <span>Tasks: {runningTasks.length}</span>
          </div>
        </div>
      </section>

      {/* Main Content Area - Scrollable */}
      <section className="flex-1 overflow-y-auto p-4 space-y-6">
        {error ? (
          <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        ) : null}

        {info ? (
          <div className="rounded border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-[#B8DBFF]">
            {info}
          </div>
        ) : null}

        {scope === "chapter" && chapters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 py-1">
            <span className="text-[10px] font-bold text-slate-500 mr-2">SKIP TO:</span>
            {chapters.map((ch) => (
              <button
                key={ch}
                type="button"
                className={`rounded px-2.5 py-1 text-[10px] font-bold border transition-all ${chapterId === ch ? "border-[#4DA3FF] text-[#4DA3FF] bg-[#1E3A5F]/20" : "border-[#2A3441] text-slate-400 hover:border-slate-500"
                  }`}
                onClick={() => {
                  setChapterId(ch);
                  if (!chapterFrom) setChapterFrom(ch);
                  setChapterTo(ch);
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        )}

        {metrics ? (
          <section className="surface-card p-3">
            <div className="mb-2 text-sm font-medium text-slate-200">Go / No-Go Metrics</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded border border-[#2A3441] bg-[#101720] px-3 py-2 text-xs text-slate-200">
                <div className="muted">Entity accuracy</div>
                <div className="mt-1 text-base font-semibold">{(metrics.metrics.entity_accuracy * 100).toFixed(1)}%</div>
                <div className={metrics.gates.go.entity_accuracy_ge_95pct.pass ? "text-[#9de5dc]" : "text-[#ff9f9f]"}>
                  {metrics.gates.go.entity_accuracy_ge_95pct.pass ? "PASS" : "FAIL"} | target {"\u003e="} 95%
                </div>
              </div>
              <div className="rounded border border-[#2A3441] bg-[#101720] px-3 py-2 text-xs text-slate-200">
                <div className="muted">P95 latency</div>
                <div className="mt-1 text-base font-semibold">{metrics.metrics.p95_latency_sec.toFixed(2)}s</div>
                <div className={metrics.gates.go.p95_latency_le_1_7x_baseline.pass ? "text-[#9de5dc]" : "text-[#ff9f9f]"}>
                  {metrics.gates.go.p95_latency_le_1_7x_baseline.pass ? "PASS" : "CHECK"}
                </div>
              </div>
              <div className="rounded border border-[#2A3441] bg-[#101720] px-3 py-2 text-xs text-slate-200">
                <div className="muted">EPHEMERAL leak</div>
                <div className="mt-1 text-base font-semibold">{metrics.metrics.ephemeral_leak_count}</div>
                <div className={metrics.gates.no_go.ephemeral_leak_into_global.pass ? "text-[#9de5dc]" : "text-[#ff9f9f]"}>
                  {metrics.gates.no_go.ephemeral_leak_into_global.pass ? "PASS" : "NO-GO"}
                </div>
              </div>
              <div className="rounded border border-[#2A3441] bg-[#101720] px-3 py-2 text-xs text-slate-200">
                <div className="muted">Prompt token reduction</div>
                <div className="mt-1 text-base font-semibold">
                  {metrics.metrics.prompt_token_reduction_pct == null
                    ? "N/A"
                    : `${(metrics.metrics.prompt_token_reduction_pct * 100).toFixed(1)}%`}
                </div>
                <div className={metrics.gates.go.token_reduction_ge_30pct.pass ? "text-[#9de5dc]" : "text-[#ffcc88]"}>
                  {metrics.gates.go.token_reduction_ge_30pct.pass
                    ? "PASS"
                    : (metrics.gates.go.token_reduction_ge_30pct.reason || "NOT_READY")}
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Window: {metrics.window_days}d | sample size: {metrics.sample_size} | static facts: {metrics.metrics.static_fact_count}
            </div>
          </section>
        ) : null}
        <section className="rounded border border-[#2A3441] bg-[#0E1B2A] px-3 py-2 text-xs text-slate-200">
          <div className="font-medium">Writer Memory Contract v4</div>
          <div className="mt-1 text-slate-300">
            Planning uses arc + saga + core_db. Prose uses working + saga + core_db. Batch is an operation scope, not a writer memory layer.
          </div>
        </section>

        <section className="surface-card p-3">
          <div className="mb-2 text-sm font-medium text-slate-200">Analysis Folders</div>
          <div className="space-y-4">
            {visibleFolders.map((folder) => (
              <div key={folder.key} className="rounded border border-[#2A3441]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A3441] bg-[#101720] px-3 py-2 text-xs">
                  <div className="font-mono text-slate-200">
                    {folder.scopeType}: {folder.scopeKey}
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span>{folder.hasApproved ? "approved lane ready" : "draft only"}</span>
                    {folder.scopeType !== "chapter" && (folder.isFinalAnalysisReady === false || folder.intermediateOnly) ? (
                      <span className="rounded border border-amber-700/60 bg-amber-900/20 px-1.5 py-0.5 text-[10px] text-amber-200">INTERMEDIATE</span>
                    ) : null}
                    {folder.scopeType !== "chapter" && folder.staleRunning ? (
                      <span className="rounded border border-rose-700/60 bg-rose-900/20 px-1.5 py-0.5 text-[10px] text-rose-200">STALE_RUNNING</span>
                    ) : null}
                    {folder.scopeType !== "chapter" && (folder.rollupTaskStatus || folder.rollupStatus) ? (
                      <span className="rounded border border-cyan-700/60 bg-cyan-900/20 px-1.5 py-0.5 text-[10px] text-cyan-200">
                        ROLLUP:{folder.rollupTaskStatus || folder.rollupStatus}
                      </span>
                    ) : null}
                    {folder.scopeType !== "chapter" && (folder.blockingReason || folder.analysisStateReason) ? (
                      <span className="text-[10px] text-slate-400">reason:{folder.blockingReason || folder.analysisStateReason}</span>
                    ) : null}
                    {folder.coverageNote ? <span>| coverage: {folder.coverageNote}</span> : null}
                    <span>{folder.items.length} version(s)</span>
                    {folder.scopeType !== "chapter" && folder.staleRunning ? (
                      <button
                        className="rounded border border-rose-700/60 bg-rose-900/20 px-2 py-0.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-900/30 disabled:opacity-40"
                        disabled={loading}
                        onClick={() => void recoverRollup(folder.scopeType as "arc" | "story" | "batch", folder.scopeKey, "requeue")}
                        title="Recover stale RUNNING rollup by requeueing task to READY"
                      >
                        Recover Rollup
                      </button>
                    ) : null}
                  </div>
                </div>
                {folder.scopeType !== "chapter" ? (
                  <div className="border-b border-[#1C2530] bg-[#0B1016] px-3 py-2 text-[11px] text-slate-300">
                    <span className="mr-3 text-slate-400">Preparation: {folder.prepStatus || "NONE"}</span>
                    <span className="mr-3 text-slate-400">Current Rollup Task:</span>
                    <span className="mr-3">id: {folder.rollupTaskId ? `#${folder.rollupTaskId}` : "-"}</span>
                    <span className="mr-3">status: {folder.rollupTaskStatus || folder.rollupStatus || "NONE"}</span>
                    <span className="mr-3">last_updated: {folder.rollupLastUpdatedAt ? new Date(folder.rollupLastUpdatedAt).toLocaleString() : "-"}</span>
                    <span>timeout_sec: {folder.rollupTimeoutSec || "-"}</span>
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-left text-sm">
                    <thead className="text-xs text-slate-400">
                      <tr>
                        <th className="px-2 py-1">Version</th>
                        <th className="px-2 py-1">Status</th>
                        <th className="px-2 py-1">Chapter</th>
                        <th className="px-2 py-1">Fact</th>
                        <th className="px-2 py-1">Vetting</th>
                        <th className="px-2 py-1">Score</th>
                        <th className="px-2 py-1">Target</th>
                        <th className="px-2 py-1">Created</th>
                        <th className="px-2 py-1">Elapsed</th>
                        <th className="px-2 py-1">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {folder.items.map((row) => {
                        const expanded = expandedRowId === row.id;
                        const stats = row.vetting_summary?.classification_stats || {};
                        const classes = Object.entries(stats)
                          .map(([k, v]) => `${k}:${v}`)
                          .join(" ");
                        const entityStats = row.vetting_summary?.entity_type_stats || {};
                        const entityText = Object.entries(entityStats)
                          .map(([k, v]) => `${k}:${v}`)
                          .join(" ");
                        const entityConflictCount = Number(row.vetting_summary?.entity_type_conflict_count || 0);
                        const isChapterScope = row.scope_type === "chapter";
                        const finalReady = isChapterScope ? true : Boolean(row.is_final_analysis_ready && row.final_payload_available);
                        const aggregateRoot =
                          row.analysis_data && typeof row.analysis_data === "object"
                            ? (
                              ((row.analysis_data.aggregate_snapshot as Record<string, unknown> | undefined) ??
                                row.analysis_data) as Record<string, unknown>
                            )
                            : {};
                        const aggregateSnapshotV3 =
                          aggregateRoot && typeof aggregateRoot.snapshot_v3 === "object"
                            ? (aggregateRoot.snapshot_v3 as Record<string, unknown>)
                            : {};
                        const renderJson = isChapterScope || finalReady
                          ? (
                            row.scope_type === "chapter"
                              ? (row.analysis_data || {})
                              : {
                                ...(row.analysis_data || {}),
                                FINAL_MEMORY_PAYLOAD: row.final_memory_payload || (row.analysis_data && typeof row.analysis_data.final_memory_payload === "object" ? row.analysis_data.final_memory_payload : null),
                                FINAL_SOURCE_TABLE: row.final_source_table || "none",
                                FINAL_PAYLOAD_SCHEMA_VERSION: row.final_payload_schema_version || null,
                                TASK_RESULT_COMPACT: row.task_result_compact || null,
                                ROLLUP_INPUT_PAYLOAD: row.rollup_input_payload || null,
                                ROLLUP_INPUT_CHAPTER_SNAPSHOTS: row.rollup_input_chapter_snapshots || [],
                              }
                          )
                          : {
                            mode: "TASK_FIRST_WAIT_FINAL",
                            task: {
                              task_id: row.rollup_task_id || null,
                              status: row.rollup_task_status || row.rollup_status || "NONE",
                              updated_at: row.rollup_last_updated_at || null,
                              timeout_sec: row.rollup_timeout_sec || null,
                              stale_running: Boolean(row.stale_running),
                              blocking_reason: row.blocking_reason || row.analysis_state_reason || "WAITING_QUEUE",
                            },
                            FINAL_MEMORY_PAYLOAD: null,
                            FINAL_SOURCE_TABLE: row.final_source_table || "none",
                            FINAL_PAYLOAD_SCHEMA_VERSION: row.final_payload_schema_version || null,
                            TASK_RESULT_COMPACT: row.task_result_compact || null,
                            ROLLUP_INPUT_PAYLOAD: row.rollup_input_payload || null,
                            ROLLUP_INPUT_CHAPTER_SNAPSHOTS: row.rollup_input_chapter_snapshots || [],
                            prep_summary: {
                              scope_type: row.scope_type,
                              scope_key: row.scope_key,
                              coverage: (aggregateSnapshotV3.coverage as Record<string, unknown> | undefined) || null,
                              aggregate_metrics: (aggregateSnapshotV3.aggregate_metrics as Record<string, unknown> | undefined) || null,
                            },
                          };
                        const approveAllowed =
                          row.source === "SNAPSHOT" &&
                          row.ready_for_writing &&
                          row.fact_status === "CLEAN" &&
                          !row.degraded_mode &&
                          row.status !== "CANCELED" &&
                          finalReady;
                        const cancelAllowed = row.source === "SNAPSHOT" && row.status !== "CANCELED";
                        return (
                          <Fragment key={row.id}>
                            <tr className="border-t border-[#2A3441]">
                              <td className="px-2 py-2 font-mono">
                                {row.source === "SNAPSHOT" ? `#${row.id}` : `task#${row.task_id ?? "-"}`}
                                {activeSnapshotId === row.id || row.active ? " (active)" : ""}
                              </td>
                              <td className="px-2 py-2">
                                {row.status}
                              </td>
                              <td className="px-2 py-2">{row.chapter_id || "-"}</td>
                              <td className="px-2 py-2">{row.fact_status}</td>
                              <td className="px-2 py-2 text-xs">
                                dup:{Number(row.vetting_summary?.duplicate_count || 0)}{" "}
                                conf:{Number(row.vetting_summary?.conflict_count || 0)}{" "}
                                entity_conf:{entityConflictCount}{" "}
                                {classes ? `| cls ${classes}` : ""}
                                {entityText ? ` | ent ${entityText}` : ""}
                              </td>
                              <td className="px-2 py-2">{Number(row.narrative_score || 0).toFixed(3)}</td>
                              <td className="px-2 py-2">{row.emotional_target || "-"}</td>
                              <td className="px-2 py-2">{new Date(row.created_at).toLocaleString()}</td>
                              <td className="px-2 py-2">{formatElapsed(row.elapsed_sec)}</td>
                              <td className="px-2 py-2">
                                <div className="flex gap-2">
                                  <button
                                    className="shell-link px-2 py-1 text-xs"
                                    onClick={() => setExpandedRowId(expanded ? null : row.id)}
                                  >
                                    {expanded ? "Hide JSON" : "View JSON"}
                                  </button>
                                  <button
                                    className="shell-link px-2 py-1 text-xs"
                                    disabled={loading || !approveAllowed}
                                    onClick={() => void activate(row.id, row.chapter_id, row.scope_type, row.scope_key)}
                                    title={
                                      approveAllowed
                                        ? (isChapterScope ? "Approve chapter snapshot" : "Approve final rollup snapshot")
                                        : (isChapterScope
                                          ? "Approval requires CLEAN + ready_for_writing + non-canceled snapshot"
                                          : "Approval requires final rollup DONE + CLEAN + ready_for_writing")
                                    }
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="shell-link px-2 py-1 text-xs"
                                    disabled={loading || !cancelAllowed}
                                    onClick={() => void cancelSnapshot(row.id, row.chapter_id, row.scope_type, row.scope_key)}
                                    title="Mark snapshot as canceled"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {expanded ? (
                              <tr className="border-t border-[#1C2530]">
                                <td className="px-2 py-2" colSpan={10}>
                                  {row.scope_type !== "chapter" ? (
                                    <div className="mb-2 rounded border border-[#2A3441] bg-[#101720] px-3 py-2 text-xs text-slate-300">
                                      <span className="mr-3">blocking_reason: {row.blocking_reason || row.analysis_state_reason || "-"}</span>
                                      <span className="mr-3">rollup_task_status: {row.rollup_task_status || row.rollup_status || "-"}</span>
                                      <span className="mr-3">worker_master: {workerMasterRunning ? "ON" : "OFF"}</span>
                                      <span className="mr-3">analysis_lane: {workerLaneRunning ? "ON" : "OFF"}</span>
                                      <span>llm: {llamaStatus?.running && llamaStatus?.http_ready ? "ON" : "OFF"}</span>
                                    </div>
                                  ) : null}
                                  {row.scope_type !== "chapter" && row.stale_running ? (
                                    <div className="mb-2 rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
                                      Stale RUNNING detected. last_updated={row.rollup_last_updated_at || "-"} timeout_sec={Number(row.rollup_timeout_sec || 0)}
                                    </div>
                                  ) : null}
                                  <div className="max-w-full overflow-x-auto rounded border border-[#1E2A38] bg-[#0B1016]">
                                    <pre className="max-h-[460px] min-w-0 overflow-auto whitespace-pre-wrap break-all p-3 text-xs leading-5 text-slate-200">
                                      {JSON.stringify(renderJson, null, 2)}
                                    </pre>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {visibleFolders.length === 0 ? (
              <div className="muted px-2 py-4 text-sm">No analysis snapshots yet.</div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

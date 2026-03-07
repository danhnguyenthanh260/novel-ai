"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { StoryProvider, useStory } from "@/features/story/StoryContext";
import StorySelector from "@/features/story/StorySelector";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <StoryProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between">
              <Link href="/shelf" className="brand-mark text-sm">
                <span>Novel</span>
                <span>AI</span>
              </Link>
              <StorySelector />
            </div>
            <HeaderContextRow />
          </div>
        </header>
        <div className="mx-auto w-full max-w-none px-1 pb-6 pt-2">{children}</div>
      </div>
    </StoryProvider>
  );
}

function sceneStatusClass(status: string | null): string {
  if (!status) return "status-pill status-pill--other";
  if (status === "LOCKED") return "status-pill status-pill--locked";
  if (status === "DRAFTING" || status === "DRAFTED") return "status-pill status-pill--drafting";
  return "status-pill status-pill--other";
}

function HeaderContextRow() {
  const pathname = usePathname();
  const { storySlug, headerContext, headerBusy, headerBusyLabel, runHeaderAction } = useStory();
  const [llamaRunning, setLlamaRunning] = useState(false);
  const [llamaBusy, setLlamaBusy] = useState(false);
  const [llamaError, setLlamaError] = useState<string | null>(null);
  const [workerPanelOpen, setWorkerPanelOpen] = useState(false);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [laneStatus, setLaneStatus] = useState<Record<string, { running: boolean; pid: number | null }>>({});
  const [queueMetrics, setQueueMetrics] = useState<Record<string, Record<string, number>>>({});

  const areaLabel = pathname.includes("/map") ? "Map" : pathname.includes("/write") ? "Write" : "Studio";
  const chapter = headerContext.chapterLabel ?? "No chapter";
  const scene = headerContext.sceneLabel ?? "No scene";

  const refreshLlamaStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/${encodeURIComponent(storySlug)}/ingest/worker`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        llama?: { running?: boolean };
        lanes?: Array<{ lane: string; running?: boolean; pid?: number | null }>;
        queue?: Record<string, Record<string, number>>;
      };
      if (res.ok && json.ok !== false) {
        setLlamaRunning(Boolean(json.llama?.running));
        const nextLaneMap: Record<string, { running: boolean; pid: number | null }> = {};
        for (const row of Array.isArray(json.lanes) ? json.lanes : []) {
          nextLaneMap[String(row.lane || "")] = {
            running: Boolean(row.running),
            pid: Number.isFinite(Number(row.pid)) ? Number(row.pid) : null,
          };
        }
        setLaneStatus(nextLaneMap);
        setQueueMetrics(json.queue && typeof json.queue === "object" ? json.queue : {});
      }
    } catch {
      // ignore header status failures
    }
  }, [storySlug]);

  useEffect(() => {
    void refreshLlamaStatus();
    const timer = window.setInterval(() => {
      void refreshLlamaStatus();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refreshLlamaStatus]);

  const toggleLlama = useCallback(async () => {
    if (llamaBusy) return;
    setLlamaBusy(true);
    setLlamaError(null);
    try {
      await runHeaderAction(llamaRunning ? "Stopping llama server" : "Starting llama server", async () => {
        const action = llamaRunning ? "stop_llama" : "start_llama";
        const res = await fetch(`/api/${encodeURIComponent(storySlug)}/ingest/worker`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string; hint?: string; llama?: { running?: boolean } };
        if (!res.ok || json.ok === false) {
          throw new Error(json.hint || json.error || "LLAMA_TOGGLE_FAILED");
        }
        setLlamaRunning(Boolean(json.llama?.running));
      });
    } catch (err: unknown) {
      setLlamaError(err instanceof Error ? err.message : "Llama toggle failed");
    } finally {
      setLlamaBusy(false);
    }
  }, [llamaBusy, llamaRunning, runHeaderAction, storySlug]);

  const runWorkerAction = useCallback(
    async (label: string, action: string, lane?: "split" | "analysis" | "writing" | "all") => {
      if (workerBusy) return;
      setWorkerBusy(true);
      setWorkerError(null);
      try {
        await runHeaderAction(label, async () => {
          const res = await fetch(`/api/${encodeURIComponent(storySlug)}/ingest/worker`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lane ? { action, lane } : { action }),
          });
          const json = (await res.json()) as { ok?: boolean; error?: string; hint?: string };
          if (!res.ok || json.ok === false) throw new Error(json.hint || json.error || "WORKER_ACTION_FAILED");
        });
      } catch (err: unknown) {
        setWorkerError(err instanceof Error ? err.message : "Worker action failed");
      } finally {
        setWorkerBusy(false);
        void refreshLlamaStatus();
      }
    },
    [refreshLlamaStatus, runHeaderAction, storySlug, workerBusy]
  );

  const laneStats = (lane: "split" | "analysis" | "writing") => {
    const row = queueMetrics[lane] || {};
    return {
      ready: Number(row.READY || 0),
      running: Number(row.RUNNING || 0),
      failed: Number(row.FAILED || 0),
    };
  };

  return (
    <div className="surface-card flex flex-wrap items-center justify-between gap-2 p-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="muted text-xs uppercase tracking-wide">{areaLabel}</span>
        <span className="shell-link px-2 py-1 text-xs">Chapter: {chapter}</span>
        <span className="shell-link px-2 py-1 text-xs">Scene: {scene}</span>
        {headerContext.sceneStatus ? (
          <span className={sceneStatusClass(headerContext.sceneStatus)}>{headerContext.sceneStatus}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          className="shell-link px-2 py-1"
          onClick={() => setWorkerPanelOpen((v) => !v)}
          title="Global worker control"
        >
          Worker Ctrl
        </button>
        <button
          type="button"
          className={`llama-toggle ${llamaRunning ? "llama-toggle--on" : "llama-toggle--off"}`}
          role="switch"
          aria-checked={llamaRunning}
          aria-label="Toggle llama server"
          onClick={() => void toggleLlama()}
          disabled={llamaBusy}
          title={llamaRunning ? "Llama server: On" : "Llama server: Off"}
        >
          <span className="llama-toggle__label">Llama</span>
          <span className="llama-toggle__track">
            <span className="llama-toggle__thumb" />
          </span>
        </button>
        {headerBusy ? (
          <>
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#38BDF8]" aria-hidden />
            <span className="muted">{headerBusyLabel ?? "Running..."}</span>
          </>
        ) : (
          <span className="muted">Ready</span>
        )}
      </div>
      {workerPanelOpen ? (
        <div className="w-full rounded border border-[#2A3441] bg-[#0B1016] p-3 text-xs">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-200">Worker Control Center</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="shell-link px-2 py-1"
                disabled={workerBusy}
                onClick={() => void runWorkerAction("Starting all lanes", "start_all_lanes")}
              >
                Start All
              </button>
              <button
                type="button"
                className="shell-link px-2 py-1"
                disabled={workerBusy}
                onClick={() => void runWorkerAction("Restarting all lanes", "restart_all_lanes")}
              >
                Restart All
              </button>
              <button
                type="button"
                className="shell-link px-2 py-1"
                disabled={workerBusy}
                onClick={() => void runWorkerAction("Stopping all lanes", "stop_all_lanes")}
              >
                Stop All
              </button>
              <button
                type="button"
                className="shell-link px-2 py-1"
                disabled={workerBusy}
                onClick={() => void refreshLlamaStatus()}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-4">
            {(["split", "analysis", "writing", "all"] as const).map((lane) => {
              const running = Boolean(laneStatus[lane]?.running);
              const pid = laneStatus[lane]?.pid;
              return (
                <div key={lane} className="rounded border border-[#24303d] bg-[#0E141C] px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200">{lane}</span>
                    <span className={running ? "text-emerald-300" : "text-slate-400"}>
                      {running ? "online" : "offline"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">pid: {pid ?? "-"}</div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {(["split", "analysis", "writing"] as const).map((lane) => {
              const stats = laneStats(lane);
              const running = Boolean(laneStatus[lane]?.running);
              return (
                <div key={lane} className="rounded border border-[#24303d] bg-[#0F141B] p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200">{lane}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] ${
                        running ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"
                      }`}
                    >
                      {running ? "running" : "stopped"}
                    </span>
                  </div>

                  <div className="mb-2 grid grid-cols-3 gap-1.5 text-[11px]">
                    <div className="rounded border border-[#2A3441] bg-[#111927] px-1.5 py-1 text-center">
                      <div className="muted">READY</div>
                      <div className="font-medium text-slate-200">{stats.ready}</div>
                    </div>
                    <div className="rounded border border-[#2A3441] bg-[#111927] px-1.5 py-1 text-center">
                      <div className="muted">RUN</div>
                      <div className="font-medium text-slate-200">{stats.running}</div>
                    </div>
                    <div className="rounded border border-[#2A3441] bg-[#111927] px-1.5 py-1 text-center">
                      <div className="muted">FAIL</div>
                      <div className={stats.failed > 0 ? "font-medium text-rose-300" : "font-medium text-slate-200"}>{stats.failed}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      className="shell-link px-2 py-1"
                      disabled={workerBusy}
                      onClick={() => void runWorkerAction(`Starting ${lane} lane`, "start_lane", lane)}
                    >
                      Start
                    </button>
                    <button
                      type="button"
                      className="shell-link px-2 py-1"
                      disabled={workerBusy}
                      onClick={() => void runWorkerAction(`Restarting ${lane} lane`, "restart_lane", lane)}
                    >
                      Restart
                    </button>
                    <button
                      type="button"
                      className="shell-link px-2 py-1"
                      disabled={workerBusy}
                      onClick={() => void runWorkerAction(`Stopping ${lane} lane`, "stop_lane", lane)}
                    >
                      Stop
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {workerError ? <div className="w-full text-xs text-[#ff9f9f]">{workerError}</div> : null}
      {llamaError ? <div className="w-full text-xs text-[#ff9f9f]">{llamaError}</div> : null}
    </div>
  );
}

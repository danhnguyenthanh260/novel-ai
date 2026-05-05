"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import GuidedNextActionRail from "@/features/ingest/components/GuidedNextActionRail";
import {
  findKpiMismatch,
  readOverviewJson,
  type PipelineOverviewAlert,
  type PipelineOverviewHealth,
  type PipelineOverviewJob,
  type PipelineOverviewKpi,
  type PipelineOverviewResponse,
} from "./pipelineOverviewContract";

type PipelinesHeaderProps = {
  storySlug: string;
  loading: boolean;
  onRefresh: () => void;
};

function PipelinesHeader({ storySlug, loading, onRefresh }: PipelinesHeaderProps) {
  return (
    <section className="surface-card flex items-center justify-between p-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipelines</h1>
        <div className="muted text-sm">story: {storySlug}</div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="shell-link px-3 py-2 text-sm" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        <Link href={`/stories/${encodeURIComponent(storySlug)}/ingest`} className="shell-link px-3 py-2 text-sm">
          Back To Ingest
        </Link>
      </div>
    </section>
  );
}

function KpiGrid({ kpi }: { kpi: PipelineOverviewKpi | null }) {
  const cards = [
    { label: "Total Jobs", value: kpi?.total_jobs ?? 0, className: "" },
    { label: "Running", value: kpi?.running_jobs ?? 0, className: "text-amber-300" },
    { label: "Failed", value: kpi?.failed_jobs ?? 0, className: "text-rose-300" },
    { label: "Wait Review", value: kpi?.wait_review_jobs ?? 0, className: "text-violet-300" },
    { label: "Done", value: kpi?.done_jobs ?? 0, className: "text-emerald-300" },
  ];

  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="surface-card p-3">
          <div className="muted text-xs">{card.label}</div>
          <div className={`text-lg font-semibold ${card.className}`}>{card.value}</div>
        </div>
      ))}
    </section>
  );
}

function HealthGrid({ health }: { health: PipelineOverviewHealth | null }) {
  const cards = [
    { label: "Ready Backlog", value: health?.ready_backlog ?? 0 },
    { label: "Running Tasks", value: health?.running_tasks ?? 0 },
    { label: "Active Alerts", value: health?.alert_count ?? 0 },
  ];

  return (
    <section className="grid grid-cols-1 gap-2 md:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="surface-card p-3">
          <div className="muted text-xs">{card.label}</div>
          <div className="text-lg font-semibold">{card.value}</div>
        </div>
      ))}
    </section>
  );
}

function AlertFeed({ storySlug, alerts }: { storySlug: string; alerts: PipelineOverviewAlert[] }) {
  return (
    <section className="surface-card p-3">
      <div className="mb-2 text-sm font-medium text-slate-200">Alert Feed</div>
      <div className="space-y-2">
        {alerts.map((alert, idx) => (
          <Link
            key={`${alert.job_id}:${alert.node_key}:${alert.alert_type}:${idx}`}
            href={`/stories/${encodeURIComponent(storySlug)}/pipelines/${alert.job_id}?node=${encodeURIComponent(alert.node_key)}`}
            className="block rounded border border-rose-700/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200 hover:border-rose-500/50"
          >
            job #{alert.job_id} | {alert.alert_type} | {alert.message}
          </Link>
        ))}
        {alerts.length === 0 ? <div className="muted text-xs">No active alerts.</div> : null}
      </div>
    </section>
  );
}

function RecentJobs({ storySlug, jobs }: { storySlug: string; jobs: PipelineOverviewJob[] }) {
  return (
    <section className="surface-card p-3">
      <div className="mb-2 text-sm font-medium text-slate-200">Recent Jobs</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="px-2 py-1">Job</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Mode</th>
              <th className="px-2 py-1">Progress</th>
              <th className="px-2 py-1">Created By</th>
              <th className="px-2 py-1">Created</th>
              <th className="px-2 py-1">Updated</th>
              <th className="px-2 py-1">Open</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-[#2A3441]">
                <td className="px-2 py-2 font-mono">#{job.id}</td>
                <td className="px-2 py-2">{job.status}</td>
                <td className="px-2 py-2">{job.mode}</td>
                <td className="px-2 py-2">
                  {job.completed_tasks}/{job.total_tasks}
                </td>
                <td className="px-2 py-2">{job.created_by || "-"}</td>
                <td className="px-2 py-2">{new Date(job.created_at).toLocaleString()}</td>
                <td className="px-2 py-2">{new Date(job.updated_at).toLocaleString()}</td>
                <td className="px-2 py-2">
                  <Link href={`/stories/${encodeURIComponent(storySlug)}/pipelines/${job.id}`} className="shell-link px-2 py-1 text-xs">
                    Open Node View
                  </Link>
                </td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td className="muted px-2 py-4 text-sm" colSpan={8}>
                  No pipeline jobs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PipelinesIndexClient({ storySlug }: { storySlug: string }) {
  const [jobs, setJobs] = useState<PipelineOverviewJob[]>([]);
  const [alerts, setAlerts] = useState<PipelineOverviewAlert[]>([]);
  const [kpi, setKpi] = useState<PipelineOverviewKpi | null>(null);
  const [health, setHealth] = useState<PipelineOverviewHealth | null>(null);
  const [kpiMismatch, setKpiMismatch] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = useMemo(() => `/api/${encodeURIComponent(storySlug)}/pipelines/overview`, [storySlug]);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      const json = (await fetch(base, { cache: "no-store" }).then(readOverviewJson)) as PipelineOverviewResponse;
      const nextJobs = Array.isArray(json.jobs) ? json.jobs : [];
      const nextAlerts = Array.isArray(json.alerts) ? json.alerts : [];
      setJobs(nextJobs);
      setAlerts(nextAlerts);
      setKpi(json.kpi ?? null);
      setHealth(json.health ?? null);
      setKpiMismatch(findKpiMismatch(json.kpi ?? null, nextJobs));
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PIPELINES_LOAD_FAILED");
      setJobs([]);
      setAlerts([]);
      setKpi(null);
      setHealth(null);
      setKpiMismatch([]);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  return (
    <main className="space-y-4 p-2 md:p-4">
      <PipelinesHeader storySlug={storySlug} loading={loading} onRefresh={() => void loadJobs()} />

      {error ? <div className="text-sm text-[#ff8f8f]">{error}</div> : null}
      {kpiMismatch.length > 0 ? (
        <div className="rounded border border-rose-700/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
          KPI mismatch detected: {kpiMismatch.join(", ")}
        </div>
      ) : null}

      <GuidedNextActionRail storySlug={storySlug} jobs={jobs} alerts={alerts} kpi={kpi} health={health} />

      <KpiGrid kpi={kpi} />
      <HealthGrid health={health} />
      <AlertFeed storySlug={storySlug} alerts={alerts} />
      <RecentJobs storySlug={storySlug} jobs={jobs} />
    </main>
  );
}

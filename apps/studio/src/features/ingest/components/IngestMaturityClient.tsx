"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiBase } from "@/lib/apiBase";
import { postMaturityReport, type SplitMaturityReport } from "@/features/ingest/hooks/ingestJobsController/http";

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatNum(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

export default function IngestMaturityClient({ storySlug }: { storySlug: string }) {
  const baseUrl = useMemo(() => apiBase(storySlug), [storySlug]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SplitMaturityReport | null>(null);
  const requestInFlightRef = useRef(false);

  const loadReport = useCallback(
    async (processLegacy: boolean) => {
      if (requestInFlightRef.current) return;
      requestInFlightRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const data = await postMaturityReport(baseUrl, processLegacy);
        setReport(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "MATURITY_REPORT_FAILED");
      } finally {
        setLoading(false);
        requestInFlightRef.current = false;
      }
    },
    [baseUrl]
  );

  useEffect(() => {
    void loadReport(false);
  }, [loadReport]);

  return (
    <main className="space-y-4 p-2 md:p-4">
      <section className="surface-card flex items-center justify-between p-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Split Maturity Report</h1>
          <div className="muted text-sm">story: {storySlug}</div>
          {report ? <div className="muted text-xs">generated: {new Date(report.generatedAt).toLocaleString()}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="shell-link px-3 py-2 text-sm" onClick={() => void loadReport(false)} disabled={loading}>
            {loading ? "Running..." : "Refresh Report"}
          </button>
          <button type="button" className="shell-link px-3 py-2 text-sm" onClick={() => void loadReport(true)} disabled={loading}>
            {loading ? "Processing..." : "Process Legacy + Refresh"}
          </button>
          <Link href={`/stories/${encodeURIComponent(storySlug)}/ingest`} className="shell-link px-3 py-2 text-sm">
            Back To Ingest
          </Link>
        </div>
      </section>

      {error ? <div className="text-sm text-[#ff8f8f]">{error}</div> : null}
      {report?.processLegacy ? (
        <div className="surface-card p-3 text-sm text-emerald-300">Legacy rows updated: {report.legacyRowsUpdated}</div>
      ) : null}

      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Windows (7 / 14 / 30 days)</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">Window</th>
                <th className="px-2 py-1">Done Runs</th>
                <th className="px-2 py-1">Machine Pass</th>
                <th className="px-2 py-1">Human Pass</th>
                <th className="px-2 py-1">Pending Human</th>
                <th className="px-2 py-1">Human Reject</th>
                <th className="px-2 py-1">Manual Review</th>
                <th className="px-2 py-1">Retry</th>
                <th className="px-2 py-1">First-Pass Success</th>
                <th className="px-2 py-1">Exploration</th>
                <th className="px-2 py-1">Strategy Switch</th>
                <th className="px-2 py-1">Avg Flagged %</th>
                <th className="px-2 py-1">Avg Fragmentation</th>
                <th className="px-2 py-1">Strategy Diversity</th>
              </tr>
            </thead>
            <tbody>
              {(report?.windows ?? []).map((row) => (
                <tr key={row.days} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2">{row.days}d</td>
                  <td className="px-2 py-2">{row.doneRuns}</td>
                  <td className="px-2 py-2">{formatPct(row.machinePassRate)}</td>
                  <td className="px-2 py-2">{formatPct(row.humanPassRate)}</td>
                  <td className="px-2 py-2">{formatPct(row.pendingHumanRate)}</td>
                  <td className="px-2 py-2">{formatPct(row.humanRejectRate)}</td>
                  <td className="px-2 py-2">{formatPct(row.manualReviewRate)}</td>
                  <td className="px-2 py-2">{formatPct(row.retryRate)}</td>
                  <td className="px-2 py-2">{formatPct(row.firstPassSuccessRate)}</td>
                  <td className="px-2 py-2">{formatPct(row.explorationRate)}</td>
                  <td className="px-2 py-2">{formatPct(row.strategySwitchRate)}</td>
                  <td className="px-2 py-2">{formatNum(row.avgFlaggedPct)}</td>
                  <td className="px-2 py-2">{formatNum(row.avgFragmentation)}</td>
                  <td className="px-2 py-2">{row.strategyDiversity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

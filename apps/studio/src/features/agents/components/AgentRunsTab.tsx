import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentRunsTab({ vm }: Props) {
  const { activeTab, runs, focusRunId, onViewSnapshot, onViewRunDetail, runDetailLoading, runDetail } = vm;
  if (activeTab !== "runs") return null;

  return (
  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Recent Runs</div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Run ID</th>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Chapter</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Prompt Version</th>
            <th className="px-2 py-1">Context Snapshot</th>
            <th className="px-2 py-1">Latency</th>
            <th className="px-2 py-1">Error</th>
            <th className="px-2 py-1">Created</th>
            <th className="px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className={`border-t border-[#2A3441] ${focusRunId === r.id ? "bg-[#16313a]" : ""}`}>
              <td className="px-2 py-2 font-mono">{r.id}</td>
              <td className="px-2 py-2">{r.agent_name}</td>
              <td className="px-2 py-2">{r.chapter_id || "-"}</td>
              <td className="px-2 py-2">{r.status}</td>
              <td className="px-2 py-2">{r.prompt_version_id ?? "-"}</td>
              <td className="px-2 py-2">
                {r.context_snapshot_id ? (
                  <button
                    type="button"
                    className="shell-link px-2 py-1 text-xs"
                    onClick={() => void onViewSnapshot(r.context_snapshot_id)}
                  >
                    #{r.context_snapshot_id}
                  </button>
                ) : "-"}
              </td>
              <td className="px-2 py-2">{r.latency_ms ?? "-"}</td>
              <td className="px-2 py-2 text-[#ff9f9f]">{r.error_code || "-"}</td>
              <td className="px-2 py-2">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-2 py-2">
                <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onViewRunDetail(r.id)}>
                  Detail
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="mt-3 rounded border border-white/10 bg-black/20 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Run Detail Panel</div>
      {runDetailLoading ? <div className="text-xs text-slate-400">Loading run detail...</div> : null}
      {!runDetailLoading && !runDetail ? <div className="text-xs text-slate-500">Select a run and click Detail.</div> : null}
      {!runDetailLoading && runDetail ? (
        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
          {JSON.stringify(runDetail, null, 2)}
        </pre>
      ) : null}
    </div>
  </section>
  );
}

import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentExperimentsTab({ vm }: Props) {
  const { activeTab, experiments, onPauseExperiment, onRollbackExperiment } = vm;
  if (activeTab !== "experiments") return null;

  return (
  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Experiments</div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">ID</th>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Scope</th>
            <th className="px-2 py-1">Baseline</th>
            <th className="px-2 py-1">Candidate</th>
            <th className="px-2 py-1">Traffic</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((x) => (
            <tr key={x.id} className="border-t border-[#2A3441]">
              <td className="px-2 py-2">{x.id}</td>
              <td className="px-2 py-2">{x.agent_name}</td>
              <td className="px-2 py-2">{x.scope}</td>
              <td className="px-2 py-2">{x.baseline_version_id}</td>
              <td className="px-2 py-2">{x.candidate_version_id}</td>
              <td className="px-2 py-2">{x.traffic_percent}%</td>
              <td className="px-2 py-2">{x.status}</td>
              <td className="px-2 py-2">
                <div className="flex gap-2">
                  <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onPauseExperiment(x.id)}>
                    Pause
                  </button>
                  <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onRollbackExperiment(x.id)}>
                    Rollback
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
  );
}

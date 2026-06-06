
import { AgentActivityTimeline } from "./AgentActivityTimeline";
import { AgentDetailDrawer } from "./AgentDetailDrawer";
import { AgentVisualCenterStage } from "./AgentVisualCenterStage";
import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentVisualStage({ vm }: Props) {
  const {
    activeTab,
    selectedAgentName,
    setSelectedAgentName,
    metrics,
    runs,
    prompts,
    profiles,
    loadAll,
    loading,
  } = vm;

  if (activeTab !== "overview") return null;

  return (
  <section className="surface-card p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="text-sm font-medium text-slate-200">Agent Visual Stage</div>
      <div className="flex items-center gap-2">
        <select
          className="shell-control px-2 py-1 text-sm"
          value={selectedAgentName}
          onChange={(e) => setSelectedAgentName(e.target.value)}
        >
          <option value="">Select agent</option>
          {Array.from(new Set([
            ...metrics.map((x) => x.agent_name),
            ...runs.map((x) => x.agent_name),
            ...prompts.map((x) => x.agent_name),
            ...profiles.map((x) => x.species_name),
          ]))
            .filter(Boolean)
            .sort()
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="shell-link px-2 py-1 text-xs"
          onClick={() => void loadAll()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1.25fr]">
      <AgentVisualCenterStage vm={vm} />
      <AgentDetailDrawer vm={vm} />
    </div>

    <AgentActivityTimeline vm={vm} />
  </section>
  );
}

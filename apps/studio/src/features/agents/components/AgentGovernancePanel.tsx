"use client";

import Link from "next/link";

import { AGENT_TAB_GROUPS } from "../shared/agentGovernanceConstants";
import { useAgentGovernancePanel } from "../hooks/useAgentGovernancePanel";
import { AgentExperimentsTab } from "./AgentExperimentsTab";
import { AgentFeedbackTab } from "./AgentFeedbackTab";
import { AgentMemoryTab } from "./AgentMemoryTab";
import { AgentOverviewSections } from "./AgentOverviewSections";
import { AgentPromptActionModal } from "./AgentPromptActionModal";
import { AgentPromptsTab } from "./AgentPromptsTab";
import { AgentRunsTab } from "./AgentRunsTab";
import { AgentVisualStage } from "./AgentVisualStage";

export default function AgentGovernancePanel({ storySlug }: { storySlug: string }) {
  const vm = useAgentGovernancePanel({ storySlug });
  const { activeTab, setActiveTab, agentNameFilter, setAgentNameFilter, loadAll, loading, error, coverageSummary } = vm;

  return (
    <main className="space-y-4 p-2 md:p-4">
      <section className="surface-card flex items-center justify-between p-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent Control Center</h1>
          <div className="muted text-sm">story: {storySlug}</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="shell-control px-2 py-1 text-sm"
            placeholder="Filter agent name..."
            value={agentNameFilter}
            onChange={(e) => setAgentNameFilter(e.target.value)}
          />
          <button className="shell-link px-3 py-2 text-sm" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <Link href={`/stories/${encodeURIComponent(storySlug)}/ingest`} className="shell-link px-3 py-2 text-sm">
            Back To Ingest
          </Link>
        </div>
      </section>

      {error ? <div className="text-sm text-[#ff8f8f]">{error}</div> : null}

      <section className="surface-card grid gap-3 p-3 lg:grid-cols-2">
        {AGENT_TAB_GROUPS.map((group) => (
          <div key={group.label} className="rounded border border-[#223247] bg-[#0b1526] p-3">
            <div className="mb-3">
              <div className="text-sm font-medium text-slate-200">{group.label}</div>
              <div className="muted mt-1 text-xs">{group.description}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`shell-link px-3 py-1.5 text-xs ${activeTab === id ? "border-[#9de5dc]/40 text-[#9de5dc]" : ""}`}
                  onClick={() => setActiveTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {activeTab === "overview" && coverageSummary && coverageSummary.alert_count > 0 ? (
        <section className="surface-card border border-[#ff8f8f]/40 bg-[#3a1015] p-3">
          <div className="text-sm font-semibold text-[#ffb3b3]">
            Trace coverage alert: {(coverageSummary.overall_coverage * 100).toFixed(1)}% (target {"\\u003e="} 99.0%)
          </div>
          <div className="mt-1 text-xs text-[#ffd2d2]">
            {coverageSummary.alert_count} agent(s) are below threshold. Check Coverage Health table and worker traces.
          </div>
        </section>
      ) : null}

      <AgentVisualStage vm={vm} />
      <AgentOverviewSections vm={vm} />
      <AgentExperimentsTab vm={vm} />
      <AgentPromptsTab vm={vm} />
      <AgentRunsTab vm={vm} />
      <AgentFeedbackTab vm={vm} />
      <AgentMemoryTab vm={vm} />
      <AgentPromptActionModal vm={vm} />
    </main>
  );
}

/* eslint-disable max-lines-per-function */

import { PROMOTION_REASON_TEMPLATES } from "../shared/agentGovernanceConstants";
import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentPromptsTab({ vm }: Props) {
  const {
    activeTab,
    diffLeft,
    setDiffLeft,
    diffRight,
    setDiffRight,
    prompts,
    onRunDiff,
    focusPromptVersionId,
    onPromoteCanary,
    openPromoteActiveModal,
    openArchiveModal,
    openRollbackModal,
    diffChunks,
  } = vm;
  void PROMOTION_REASON_TEMPLATES;
  if (activeTab !== "prompts") return null;

  return (
  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Prompts</div>
    <div className="mb-3 flex items-center gap-2">
      <select
        className="shell-control px-2 py-1 text-sm"
        value={diffLeft}
        onChange={(e) => setDiffLeft(e.target.value ? Number(e.target.value) : "")}
      >
        <option value="">Left version</option>
        {prompts.map((p) => (
          <option key={`left-${p.version_id}`} value={p.version_id}>
            {p.version_id} | {p.agent_name} | v{p.version_no}
          </option>
        ))}
      </select>
      <select
        className="shell-control px-2 py-1 text-sm"
        value={diffRight}
        onChange={(e) => setDiffRight(e.target.value ? Number(e.target.value) : "")}
      >
        <option value="">Right version</option>
        {prompts.map((p) => (
          <option key={`right-${p.version_id}`} value={p.version_id}>
            {p.version_id} | {p.agent_name} | v{p.version_no}
          </option>
        ))}
      </select>
      <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onRunDiff()}>
        Compare
      </button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1280px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Version ID</th>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Scope</th>
            <th className="px-2 py-1">Version</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Created</th>
            <th className="px-2 py-1">Note</th>
            <th className="px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {prompts.map((p) => (
            <tr
              key={p.version_id}
              className={`border-t border-[#2A3441] ${focusPromptVersionId === p.version_id ? "bg-[#16313a]" : ""}`}
            >
              <td className="px-2 py-2 font-mono">{p.version_id}</td>
              <td className="px-2 py-2">{p.agent_name}</td>
              <td className="px-2 py-2">{p.scope}{p.chapter_id ? `:${p.chapter_id}` : ""}</td>
              <td className="px-2 py-2">{p.version_no}</td>
              <td className="px-2 py-2">{p.status}</td>
              <td className="px-2 py-2">{new Date(p.created_at).toLocaleString()}</td>
              <td className="px-2 py-2">{p.change_note || "-"}</td>
              <td className="px-2 py-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="shell-link px-2 py-1 text-xs"
                    onClick={() => void onPromoteCanary(p.version_id)}
                  >
                    Canary 10%
                  </button>
                  <button
                    type="button"
                    className="shell-link px-2 py-1 text-xs"
                    onClick={() => openPromoteActiveModal(p.version_id)}
                  >
                    Promote Active
                  </button>
                  <button
                    type="button"
                    className="shell-link px-2 py-1 text-xs"
                    onClick={() => openArchiveModal(p.version_id)}
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    className="shell-link px-2 py-1 text-xs"
                    onClick={() => openRollbackModal(p.version_id)}
                  >
                    Rollback
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {diffChunks.length > 0 && (
      <div className="mt-3 rounded border border-white/10 bg-black/20 p-2">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Prompt Diff</div>
        <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
          {diffChunks.map((c, i) => {
            const prefix = c.added ? "+ " : c.removed ? "- " : "  ";
            return (
              <span
                key={`diff-${i}`}
                className={c.added ? "text-emerald-300" : c.removed ? "text-rose-300" : "text-slate-300"}
              >
                {prefix}
                {c.value}
              </span>
            );
          })}
        </pre>
      </div>
    )}
  </section>
  );
}

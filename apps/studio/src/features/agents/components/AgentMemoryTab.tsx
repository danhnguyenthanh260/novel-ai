import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentMemoryTab({ vm }: Props) {
  const { activeTab, retrieveEmbedding, setRetrieveEmbedding, onRetrieveMemory, memories } = vm;
  if (activeTab !== "memory") return null;

  return (
  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Memory Bank</div>
    <div className="mb-3 flex items-center gap-2">
      <input
        className="shell-control min-w-[520px] px-2 py-1 text-sm"
        value={retrieveEmbedding}
        onChange={(e) => setRetrieveEmbedding(e.target.value)}
        placeholder="context embedding (comma-separated floats)"
      />
      <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onRetrieveMemory()}>
        Retrieve Top-K
      </button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">ID</th>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Type</th>
            <th className="px-2 py-1">Score</th>
            <th className="px-2 py-1">Similarity</th>
            <th className="px-2 py-1">Text</th>
          </tr>
        </thead>
        <tbody>
          {memories.map((m) => (
            <tr key={m.id} className="border-t border-[#2A3441]">
              <td className="px-2 py-2 font-mono">{m.id}</td>
              <td className="px-2 py-2">{m.agent_name}</td>
              <td className="px-2 py-2">{m.memory_type}</td>
              <td className="px-2 py-2">{m.score}</td>
              <td className="px-2 py-2">{typeof m.similarity === "number" ? m.similarity.toFixed(3) : "-"}</td>
              <td className="px-2 py-2">{m.memory_text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
  );
}

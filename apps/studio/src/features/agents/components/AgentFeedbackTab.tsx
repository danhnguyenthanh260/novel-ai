import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentFeedbackTab({ vm }: Props) {
  const {
    activeTab,
    feedbackAgent,
    setFeedbackAgent,
    feedbackType,
    setFeedbackType,
    feedbackText,
    setFeedbackText,
    onCreateFeedback,
    feedbacks,
    onMuteFeedback,
  } = vm;
  if (activeTab !== "feedback") return null;

  return (
  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Feedback Loop</div>
    <div className="mb-3 flex items-center gap-2">
      <input
        className="shell-control px-2 py-1 text-sm"
        value={feedbackAgent}
        onChange={(e) => setFeedbackAgent(e.target.value)}
        placeholder="agent name"
      />
      <select className="shell-control px-2 py-1 text-sm" value={feedbackType} onChange={(e) => setFeedbackType(e.target.value)}>
        <option value="FIX">FIX</option>
        <option value="KEEP">KEEP</option>
        <option value="AVOID">AVOID</option>
        <option value="RULE">RULE</option>
      </select>
      <input
        className="shell-control min-w-[420px] px-2 py-1 text-sm"
        value={feedbackText}
        onChange={(e) => setFeedbackText(e.target.value)}
        placeholder="feedback text..."
      />
      <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onCreateFeedback()}>
        Add Feedback
      </button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">ID</th>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Type</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Weight</th>
            <th className="px-2 py-1">Text</th>
            <th className="px-2 py-1">Action</th>
          </tr>
        </thead>
        <tbody>
          {feedbacks.map((f) => (
            <tr key={f.id} className="border-t border-[#2A3441]">
              <td className="px-2 py-2 font-mono">{f.id}</td>
              <td className="px-2 py-2">{f.agent_name}</td>
              <td className="px-2 py-2">{f.feedback_type}</td>
              <td className="px-2 py-2">{f.status}</td>
              <td className="px-2 py-2">{f.weight}</td>
              <td className="px-2 py-2">{f.feedback_text}</td>
              <td className="px-2 py-2">
                <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onMuteFeedback(f.id)}>
                  Mute
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
  );
}

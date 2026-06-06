
import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentEvolutionCenter({ vm }: Props) {
  const {
    selectedProfileId,
    setSelectedProfileId,
    profiles,
    profileSlots,
    profileEvents,
  } = vm;

  return (
  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Agent Evolution Center</div>
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="surface-card p-2">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Character Stats</div>
        <div className="mb-2">
          <select
            className="shell-control w-full px-2 py-1 text-sm"
            value={selectedProfileId ?? ""}
            onChange={(e) => setSelectedProfileId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select profile</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nick_name} ({p.species_name})
              </option>
            ))}
          </select>
        </div>
        {selectedProfileId ? (
          (() => {
            const p = profiles.find((x) => x.id === selectedProfileId);
            if (!p) return <div className="muted text-xs">Profile not found.</div>;
            const xpPct = Math.min(100, Math.max(0, ((p.experience_pts % 100000) / 100000) * 100));
            return (
              <div className="space-y-2 text-sm">
                <div className="font-medium text-slate-100">{p.nick_name}</div>
                <div className="muted text-xs">{p.species_name}</div>
                <div className="text-xs">Level: {p.level} | XP: {p.experience_pts}</div>
                <div className="h-2 overflow-hidden rounded bg-[#1f2937]">
                  <div className="h-full bg-[#9de5dc]" style={{ width: `${xpPct}%` }} />
                </div>
                <div className={`text-xs ${p.is_sealed ? "text-[#ffd58f]" : "text-slate-400"}`}>
                  {p.is_sealed ? "Sealed (DNA locked)" : "Unsealed"}
                </div>
              </div>
            );
          })()
        ) : (
          <div className="muted text-xs">No profile selected.</div>
        )}
      </div>

      <div className="surface-card p-2">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Equipment Slots</div>
        <div className="space-y-2">
          {profileSlots.length === 0 ? (
            <div className="muted text-xs">No active slots.</div>
          ) : (
            profileSlots.map((s) => (
              <div key={s.id} className="rounded border border-[#2A3441] p-2 text-xs">
                <div className="font-medium text-slate-200">{s.slot_type}</div>
                <div className="muted">{s.artifact_ref_type}</div>
                <div className="font-mono text-[11px] text-slate-300">{s.artifact_id}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="surface-card p-2">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Evolution Log</div>
        <div className="space-y-2">
          {profileEvents.length === 0 ? (
            <div className="muted text-xs">No evolution events yet.</div>
          ) : (
            profileEvents.map((ev) => (
              <div key={ev.id} className="rounded border border-[#2A3441] p-2 text-xs">
                <div className="font-medium text-slate-200">{ev.action}</div>
                <div className="muted">by {ev.actor}</div>
                <div className="muted">{new Date(ev.created_at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  </section>
  );
}

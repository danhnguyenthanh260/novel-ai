
/* eslint-disable max-lines-per-function */
import { avatarFxClass, avatarStateTone, pct } from "../shared/agentGovernanceUtils";
import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentVisualCenterStage({ vm }: Props) {
  const {
    drawerLoading,
    drawerData,
    levelUpPulse,
    drawerXpProgress,
    selectedAgentAlerts,
    drawerVisualForm,
    setDrawerVisualForm,
    onSaveVisualProfile,
    savingVisual,
  } = vm;

  return (
      <div className="surface-card p-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Center Stage</div>
        {drawerLoading ? (
          <div className="muted text-xs">Loading avatar state...</div>
        ) : drawerData ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`agent-stage ${levelUpPulse ? "agent-stage--levelup" : ""}`}>
                <div className={`agent-avatar ${avatarStateTone(drawerData.runtime_summary.state)} ${avatarFxClass(drawerData.visual_profile.fx_level)}`}>
                  <div className="agent-avatar__aura" />
                  <div className="agent-avatar__body">
                    <div className="agent-avatar__head">
                      <span className="agent-avatar__eye agent-avatar__eye--left" />
                      <span className="agent-avatar__eye agent-avatar__eye--right" />
                    </div>
                    <div className="agent-avatar__torso" />
                  </div>
                  <div className="agent-avatar__nameplate">
                    {drawerData.visual_profile.title || drawerData.identity.nick_name || drawerData.agent_name}
                  </div>
                  <div className="agent-avatar__badge">{drawerData.visual_profile.badge || "core"}</div>
                </div>
                <div className="agent-avatar__state">{drawerData.runtime_summary.state}</div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="text-sm font-medium text-slate-100">
                  {drawerData.visual_profile.title || drawerData.identity.nick_name || drawerData.agent_name}
                </div>
                <div className="muted">{drawerData.agent_name}</div>
                <div className="muted">Level {drawerData.identity.level} | {drawerData.identity.is_sealed ? "Sealed" : "Unsealed"}</div>
                <div className="muted">XP {drawerXpProgress.xp.toLocaleString()} | Next +{drawerXpProgress.toNext.toLocaleString()}</div>
                <div className="h-1.5 w-48 overflow-hidden rounded bg-[#1f2937]">
                  <div className="h-full bg-[#9de5dc]" style={{ width: `${drawerXpProgress.pct}%` }} />
                </div>
                <div className="text-slate-300">
                  Success {pct(drawerData.runtime_summary.success_rate)} | Fail {drawerData.runtime_summary.recent_failed_runs}/{drawerData.runtime_summary.recent_total_runs}
                </div>
                {selectedAgentAlerts.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedAgentAlerts.slice(0, 3).map((a, idx) => (
                      <span
                        key={`${a.alert_type}-${idx}`}
                        className={`rounded px-2 py-[2px] text-[10px] uppercase tracking-wide ${
                          a.severity === "CRITICAL"
                            ? "border border-[#ff8f8f]/40 bg-[#441016] text-[#ffb3b3]"
                            : a.severity === "WARN"
                              ? "border border-[#f8c97d]/40 bg-[#3f2a0b] text-[#ffd58f]"
                              : "border border-[#6ec9ff]/40 bg-[#10293f] text-[#9fd8ff]"
                        }`}
                        title={a.message}
                      >
                        {a.alert_type.replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="space-y-1">
                <span className="muted">Skin</span>
                <input
                  className="shell-control w-full px-2 py-1"
                  value={drawerVisualForm.skin}
                  onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, skin: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="muted">Frame</span>
                <input
                  className="shell-control w-full px-2 py-1"
                  value={drawerVisualForm.frame}
                  onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, frame: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="muted">Badge</span>
                <input
                  className="shell-control w-full px-2 py-1"
                  value={drawerVisualForm.badge}
                  onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, badge: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="muted">FX Level</span>
                <input
                  className="shell-control w-full px-2 py-1"
                  value={drawerVisualForm.fx_level}
                  onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, fx_level: e.target.value }))}
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs">
              <span className="muted">Title</span>
              <input
                className="shell-control w-full px-2 py-1"
                value={drawerVisualForm.title}
                onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </label>
            <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onSaveVisualProfile()} disabled={savingVisual}>
              {savingVisual ? "Saving..." : "Save Decoration"}
            </button>
          </div>
        ) : (
          <div className="muted text-xs">Select an agent to open visual stage.</div>
        )}
      </div>
  );
}

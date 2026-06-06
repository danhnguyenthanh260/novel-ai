
import Link from "next/link";

import { formatDrawerEventMessage } from "../shared/agentGovernanceUtils";
import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentActivityTimeline({ vm }: Props) {
  const { drawerData, storySlug } = vm;

  return (
    <div className="mt-3 surface-card p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Activity Timeline</div>
      {!drawerData || drawerData.activity_events.length === 0 ? (
        <div className="muted text-xs">No recent activity.</div>
      ) : (
        <div className="space-y-2">
          {drawerData.activity_events.map((ev) => (
            <div key={`${ev.event_type}-${ev.id}`} className="flex items-start justify-between gap-2 rounded border border-[#2A3441] p-2 text-xs">
              <div>
                <div className="text-slate-200">{formatDrawerEventMessage(ev)}</div>
                <div className="muted">{new Date(ev.created_at).toLocaleString()}</div>
              </div>
              {ev.event_type === "RUN" && typeof ev.meta?.run_id === "number" ? (
                <Link
                  href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=runs&run_id=${String(ev.meta.run_id)}`}
                  className="shell-link px-2 py-1 text-[11px]"
                >
                  Open Run
                </Link>
              ) : (
                <span className="muted text-[11px]">{ev.event_type}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import AgentGovernancePanel from "@/features/agents/components/AgentGovernancePanel";

export default function AgentControlCenterClient({ storySlug }: { storySlug: string }) {
  return (
    <main className="space-y-4 p-2 md:p-4">
      <AgentGovernancePanel storySlug={storySlug} />
    </main>
  );
}

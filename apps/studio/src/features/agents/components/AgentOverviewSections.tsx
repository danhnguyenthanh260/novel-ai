
import { AgentEvolutionCenter } from "./AgentEvolutionCenter";
import { AgentOperatorDiagnostics } from "./AgentOperatorDiagnostics";
import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentOverviewSections({ vm }: Props) {
  if (vm.activeTab !== "overview") return null;

  return (
    <>
      <AgentEvolutionCenter vm={vm} />
      <AgentOperatorDiagnostics vm={vm} />
    </>
  );
}

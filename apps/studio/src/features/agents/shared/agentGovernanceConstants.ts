import type { AgentTabGroup } from "./types";

export const AGENT_TAB_GROUPS: AgentTabGroup[] = [
  {
    label: "Author actions",
    description: "Use these for agent-facing decisions that affect writing direction, feedback, or usable memory.",
    tabs: [
      ["overview", "Overview"],
      ["feedback", "Feedback Loop"],
      ["memory", "Memory Bank"],
    ],
  },
  {
    label: "Operator diagnostics",
    description: "Use these for run traces, prompt governance, experiments, and runtime health inspection.",
    tabs: [
      ["runs", "Run Logs"],
      ["prompts", "Prompt Registry"],
      ["experiments", "Experiments"],
    ],
  },
];


export const PROMOTION_REASON_TEMPLATES = [
  "CANARY_SUCCESS",
  "QUALITY_FIX",
  "INCIDENT_MITIGATION",
  "MANUAL_OVERRIDE",
] as const;

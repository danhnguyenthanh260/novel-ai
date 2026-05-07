import type { CommandId, ContextReadiness, StudioChatIntent } from "@/features/scenes/components/writeTab/types";

export type IntentRoute = {
  intent: StudioChatIntent;
  command: CommandId | null;
  goal: string;
  needsClarification: boolean;
  assistantText: string | null;
};

type RouteIntentArgs = {
  message: string;
  readiness: ContextReadiness;
  mode?: "chat" | "brainstorm";
};

const commandByIntent: Partial<Record<StudioChatIntent, CommandId>> = {
  WRITE: "/write chapter",
  PLAN: "/plan",
  ANALYZE: "/analyze chapter",
  RESEARCH: "/research",
  REVIEW: "/review chapter",
  SPLIT: "/split",
  INSPECT: "/inspect",
  APPROVE: "/approve draft",
};

const intentPatterns: Array<{ intent: StudioChatIntent; patterns: RegExp[] }> = [
  { intent: "BRAINSTORM", patterns: [/\bbrainstorm\b/, /\bno writing\b/, /\bno draft\b/, /\bjust chat\b/, /\btalk freely\b/] },
  { intent: "SWITCH_STORY", patterns: [/\bswitch story\b/, /\bbrowse stories\b/, /\buse .* story\b/] },
  { intent: "ADD_CONTEXT", patterns: [/\badd context\b/, /\badd characters?\b/, /\bmissing context\b/, /\bcharacter data\b/] },
  { intent: "INSPECT", patterns: [/\binspect context\b/, /\bwhat do you know\b/, /\bshow context\b/, /^\/?status\b/] },
  { intent: "APPROVE", patterns: [/\bapprove\b/, /\blooks good\b/, /\bsign off\b/] },
  { intent: "ANALYZE", patterns: [/\banaly[sz]e\b/, /\bsource\b/, /\bdiagnos(e|tic)\b/] },
  { intent: "RESEARCH", patterns: [/\bresearch\b/, /\blore\b/, /\bworldbuilding\b/] },
  { intent: "PLAN", patterns: [/\bplan first\b/, /\boutline\b/, /\bchapter plan\b/, /\bplan\b/] },
  { intent: "REVIEW", patterns: [/\breview\b/, /\bshow draft\b/, /\bopen draft\b/] },
  { intent: "SPLIT", patterns: [/\bsplit\b/, /\btoo long\b/, /\bbreak.*chapter\b/] },
  { intent: "WRITE", patterns: [/\bcontinue\b/, /\bkeep writing\b/, /\blet'?s go\b/, /\bwrite\b/, /\bdraft\b/] },
];

function normalizedMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function includesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

function isShortAcknowledgement(message: string): boolean {
  return /^(ok|okay|yes|yeah|yep|sure|alright|continue)$/i.test(message.trim());
}

function wantsNextStep(message: string): boolean {
  return includesAny(normalizedMessage(message), [/\bwhat do we do now\b/, /\bwhat now\b/, /\bnext step\b/, /\bwhere do we start\b/]);
}

function brainstormReply(message: string): string {
  const text = message.trim();
  const lower = normalizedMessage(message);
  if (!text || isShortAcknowledgement(text)) {
    return "Send me a premise, character, conflict, or scene seed and I will shape it without starting a workflow.";
  }
  if (/^brainstorm\b/i.test(text)) {
    return "I can brainstorm here without starting a writing workflow. Send a premise, character, conflict, or scene problem.";
  }
  if (includesAny(lower, [/\badopt/, /\badopted\b/, /\badoption\b/, /\bfamily\b/])) {
    return [
      "This is a strong emotional seed: a boy is adopted into a normal family, but the normal life feels wrong to him.",
      "The core tension can be that he is not unloved, but he still feels like a guest, so his confusion has no obvious villain.",
      "For chapter 1, open with a normal family moment where everyone fits except him, then choose the angle: quiet coming-of-age, identity mystery, or family secret.",
    ].join("\n\n");
  }
  return [
    `I can work with this seed: ${text}`,
    "Three angles to explore: what wound the protagonist hides, what event forces it into the open, and what first scene reveals the conflict without explaining it.",
    "Pick one angle and I will expand it.",
  ].join("\n\n");
}

function chatReply(message: string): string {
  if (wantsNextStep(message)) {
    return "We can brainstorm freely, inspect context, analyze source, or prepare a write/plan run. If you are unsure, start with a premise or the problem you want the story to solve.";
  }
  return "Hi. I can chat freely, brainstorm, inspect context, analyze source, or help write when you're ready.";
}

function staysInBrainstormMode(mode: RouteIntentArgs["mode"], intent: StudioChatIntent): boolean {
  return mode === "brainstorm" && ["AMBIGUOUS", "CHAT", "BRAINSTORM"].includes(intent);
}

export function detectStudioIntent(message: string): StudioChatIntent {
  const text = normalizedMessage(message);
  if (!text) return "AMBIGUOUS";
  if (includesAny(text, [/^(hi|hello|hey|yo|chao|xin chao|chào)$/i, /\bhow are you\b/])) return "CHAT";
  if (wantsNextStep(message)) return "CHAT";
  const matched = intentPatterns.find((entry) => includesAny(text, entry.patterns));
  if (matched) return matched.intent;
  return "AMBIGUOUS";
}

function goalFromMessage(message: string, intent: StudioChatIntent): string {
  const text = message.trim();
  if (intent === "WRITE") return text.replace(/^(continue|keep writing|let'?s go|write|draft)\b[:,\s-]*/i, "").trim();
  if (intent === "PLAN") return text.replace(/^(plan first|outline|chapter plan|plan)\b[:,\s-]*/i, "").trim();
  return text;
}

export function routeStudioIntent(args: RouteIntentArgs): IntentRoute {
  const intent = detectStudioIntent(args.message);
  const goal = goalFromMessage(args.message, intent);
  if (staysInBrainstormMode(args.mode, intent)) {
    return {
      intent: "BRAINSTORM",
      command: null,
      goal: args.message.trim(),
      needsClarification: false,
      assistantText: brainstormReply(args.message),
    };
  }
  if (intent === "CHAT") {
    return {
      intent,
      command: null,
      goal,
      needsClarification: false,
      assistantText: chatReply(args.message),
    };
  }
  if (intent === "AMBIGUOUS") {
    return {
      intent,
      command: null,
      goal: "",
      needsClarification: true,
      assistantText: "Do you want to brainstorm, inspect context, analyze source, or write the chapter?",
    };
  }
  if (intent === "BRAINSTORM") {
    return {
      intent,
      command: null,
      goal,
      needsClarification: false,
      assistantText: brainstormReply(args.message),
    };
  }
  if (intent === "SWITCH_STORY" || intent === "ADD_CONTEXT") {
    return { intent, command: null, goal, needsClarification: false, assistantText: null };
  }
  if (intent === "WRITE" && args.readiness === "blocked" && !goal) {
    return {
      intent,
      command: "/write chapter",
      goal,
      needsClarification: false,
      assistantText: null,
    };
  }
  return {
    intent,
    command: commandByIntent[intent] ?? null,
    goal,
    needsClarification: false,
    assistantText: null,
  };
}

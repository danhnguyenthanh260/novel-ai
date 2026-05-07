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

function normalizedMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function includesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

export function detectStudioIntent(message: string): StudioChatIntent {
  const text = normalizedMessage(message);
  if (!text) return "AMBIGUOUS";
  if (includesAny(text, [/^(hi|hello|hey|yo|chao|xin chao|chào)$/i, /\bhow are you\b/])) return "CHAT";
  if (includesAny(text, [/\bbrainstorm\b/, /\bno writing\b/, /\bno draft\b/, /\bjust chat\b/, /\btalk freely\b/])) return "BRAINSTORM";
  if (includesAny(text, [/\bswitch story\b/, /\bbrowse stories\b/, /\buse .* story\b/])) return "SWITCH_STORY";
  if (includesAny(text, [/\badd context\b/, /\badd characters?\b/, /\bmissing context\b/, /\bcharacter data\b/])) return "ADD_CONTEXT";
  if (includesAny(text, [/\binspect context\b/, /\bwhat do you know\b/, /\bshow context\b/, /^\/?status\b/])) return "INSPECT";
  if (includesAny(text, [/\bapprove\b/, /\blooks good\b/, /\bsign off\b/])) return "APPROVE";
  if (includesAny(text, [/\banaly[sz]e\b/, /\bsource\b/, /\bdiagnos(e|tic)\b/])) return "ANALYZE";
  if (includesAny(text, [/\bresearch\b/, /\blore\b/, /\bworldbuilding\b/])) return "RESEARCH";
  if (includesAny(text, [/\bplan first\b/, /\boutline\b/, /\bchapter plan\b/, /\bplan\b/])) return "PLAN";
  if (includesAny(text, [/\breview\b/, /\bshow draft\b/, /\bopen draft\b/])) return "REVIEW";
  if (includesAny(text, [/\bsplit\b/, /\btoo long\b/, /\bbreak.*chapter\b/])) return "SPLIT";
  if (includesAny(text, [/\bcontinue\b/, /\bkeep writing\b/, /\blet'?s go\b/, /\bwrite\b/, /\bdraft\b/])) return "WRITE";
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
  if (args.mode === "brainstorm" && intent === "AMBIGUOUS") {
    return {
      intent: "BRAINSTORM",
      command: null,
      goal: args.message.trim(),
      needsClarification: false,
      assistantText: "I can keep brainstorming here without starting a workflow. Tell me the direction, conflict, character, or scene problem you want to explore.",
    };
  }
  if (intent === "CHAT") {
    return {
      intent,
      command: null,
      goal,
      needsClarification: false,
      assistantText: "Hi. I can chat freely, brainstorm, inspect context, analyze source, or help write when you're ready.",
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
      assistantText: "I can brainstorm here without starting a writing workflow.",
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

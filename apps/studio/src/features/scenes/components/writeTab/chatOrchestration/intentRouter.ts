import type { CommandId, ContextReadiness, StudioChatIntent } from "@/features/scenes/components/writeTab/types";

export type BrainstormChoiceStage = "brainstorm_angle" | "brainstorm_followup" | "brainstorm_continuation_next";

export type BrainstormFollowupAction = "scene_goal" | "character_contradiction" | "chapter_opening" | "break_event";

export type IntentRoute = {
  intent: StudioChatIntent;
  command: CommandId | null;
  goal: string;
  needsClarification: boolean;
  assistantText: string | null;
  brainstormSeed?: string | null;
  brainstormFollowupActions?: BrainstormFollowupAction[] | null;
  brainstormChoiceStage?: BrainstormChoiceStage | null;
  selectedBrainstormAction?: BrainstormFollowupAction | null;
};

type RouteIntentArgs = {
  message: string;
  readiness: ContextReadiness;
  mode?: "chat" | "brainstorm";
  recentBrainstormSeed?: string | null;
  pendingBrainstormActions?: BrainstormFollowupAction[] | null;
  activeBrainstormChoiceStage?: BrainstormChoiceStage | null;
  structuredIntent?: StudioChatIntent | null;
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
  { intent: "WRITE", patterns: [/^continue$/, /\bkeep writing\b/, /^let'?s go$/, /\bwrite( the)? chapter\b/, /\bdraft( the)? chapter\b/, /\bgenerate( the)? chapter\b/, /\bstart chapter write\b/, /\brun autowrite\b/, /^\/?write\b/] },
];

const brainstormFollowupActions: BrainstormFollowupAction[] = ["scene_goal", "character_contradiction", "chapter_opening"];
const brainstormContinuationNextActions: BrainstormFollowupAction[] = ["scene_goal", "chapter_opening", "break_event"];

const actionLabelByIntent: Partial<Record<StudioChatIntent, BrainstormFollowupAction>> = {
  BRAINSTORM_SCENE_GOAL: "scene_goal",
  BRAINSTORM_CHARACTER_CONTRADICTION: "character_contradiction",
  BRAINSTORM_CHAPTER_OPENING: "chapter_opening",
  BRAINSTORM_BREAK_EVENT: "break_event",
};

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

function isRepoRunHelp(message: string): boolean {
  const text = normalizedMessage(message);
  return includesAny(text, [
    /\bhow do i run\b/,
    /\bhow to run\b/,
    /\brun (this )?(src|source|project|app|studio)\b/,
    /\bstart (the )?(dev server|studio|app)\b/,
    /\bnpm run (dev|start)\b/,
    /\bdev server\b/,
  ]);
}

function isRepoTestHelp(message: string): boolean {
  const text = normalizedMessage(message);
  return includesAny(text, [
    /\bhow do i test\b/,
    /\bhow to test\b/,
    /\btest (this )?(src|source|project|app|studio)\b/,
    /\brun tests?\b/,
    /\bnpm run (typecheck|build|lint)\b/,
    /\btypecheck\b/,
  ]);
}

function isBrainstormClarification(message: string): boolean {
  const text = normalizedMessage(message).replace(/[?.!]+$/g, "");
  return includesAny(text, [
    /^what angle$/,
    /^wwhat angle$/,
    /^which angle$/,
    /^what do you mean$/,
    /^explain$/,
    /^explain options?$/,
    /^can you clarify$/,
    /\bw?what angle\b/,
  ]);
}

function isQuotedAssistantQuestion(message: string): boolean {
  const text = normalizedMessage(message);
  return includesAny(text, [/\bi can work with this seed\b/, /\bthree angles to explore\b/, /\bpick one angle\b/]) && /[?]|\bw?what\b|\bexplain\b|\bclarify\b/.test(text);
}

function isBrainstormChoice(message: string): boolean {
  return /^(1|2|3|one|two|three|hidden wound|trigger event|opening scene)\b/i.test(message.trim());
}

function isExplicitChapterWrite(message: string): boolean {
  const text = normalizedMessage(message);
  return includesAny(text, [
    /^\/write\b/,
    /\bwrite( the)? chapter\b/,
    /\bdraft( the)? chapter\b/,
    /\bgenerate( the)? chapter\b/,
    /\bstart chapter write\b/,
    /\brun autowrite\b/,
    /\bwrite chapter \d+\b/,
    /\bdraft chapter \d+\b/,
    /\bgenerate chapter \d+\b/,
  ]);
}

function intentForBrainstormAction(action: BrainstormFollowupAction): StudioChatIntent {
  if (action === "scene_goal") return "BRAINSTORM_SCENE_GOAL";
  if (action === "character_contradiction") return "BRAINSTORM_CHARACTER_CONTRADICTION";
  if (action === "chapter_opening") return "BRAINSTORM_CHAPTER_OPENING";
  return "BRAINSTORM_BREAK_EVENT";
}

function pendingNumericBrainstormIntent(message: string, pendingActions: BrainstormFollowupAction[] | null | undefined, stage: BrainstormChoiceStage | null | undefined): StudioChatIntent | null {
  if (!pendingActions?.length || stage === "brainstorm_angle") return null;
  const text = normalizedMessage(message);
  const index = text === "1" || text === "one" ? 0 : text === "2" || text === "two" ? 1 : text === "3" || text === "three" ? 2 : -1;
  const action = index >= 0 ? pendingActions[index] : null;
  return action ? intentForBrainstormAction(action) : null;
}

function pendingNamedBrainstormIntent(text: string, pendingActions: BrainstormFollowupAction[]): StudioChatIntent | null {
  if (pendingActions.includes("scene_goal") && includesAny(text, [/\bscene goals?\b/, /^goals?$/, /\blet'?s go with (a )?scene goals?\b/])) {
    return "BRAINSTORM_SCENE_GOAL";
  }
  if (pendingActions.includes("character_contradiction") && includesAny(text, [/\bcharacter contradiction\b/, /^contradiction$/, /\blet'?s go with (a )?character contradiction\b/])) {
    return "BRAINSTORM_CHARACTER_CONTRADICTION";
  }
  if (pendingActions.includes("chapter_opening") && includesAny(text, [/\bchapter opening\b/, /\bopening scene\b/, /^opening$/, /\blet'?s go with (a )?chapter opening\b/])) {
    return "BRAINSTORM_CHAPTER_OPENING";
  }
  if (pendingActions.includes("break_event") && includesAny(text, [/\bbreak(s|ing)? her logic\b/, /\bevent that breaks\b/, /\bbreak event\b/, /^event$/])) {
    return "BRAINSTORM_BREAK_EVENT";
  }
  return null;
}

function pendingBrainstormIntent(
  message: string,
  pendingActions: BrainstormFollowupAction[] | null | undefined,
  mode: RouteIntentArgs["mode"],
  stage?: BrainstormChoiceStage | null
): StudioChatIntent | null {
  if (mode !== "brainstorm" || !pendingActions?.length) return null;
  const numericIntent = pendingNumericBrainstormIntent(message, pendingActions, stage);
  if (numericIntent) return numericIntent;
  return pendingNamedBrainstormIntent(normalizedMessage(message), pendingActions);
}

function stripQuotedAssistantText(message: string): string {
  return message
    .replace(/i can work with this seed:[\s\S]*?(three angles to explore:)?/gi, "")
    .replace(/pick one angle and i will expand it\.?/gi, "")
    .trim();
}

function optionLabels(seed: string): { title: string; detail: string }[] {
  const lower = normalizedMessage(seed);
  if (includesAny(lower, [/\bbomb\b/, /\bheart attack\b/, /\bheart atack\b/, /\bscience\b/, /\blab\b/])) {
    return [
      { title: "Hidden wound", detail: "The protagonist believes her research helped create the bomb design that caused a death by panic and heart failure." },
      { title: "Trigger event", detail: "A second attack appears, and only she recognizes the scientific pattern linking it to the old tragedy." },
      { title: "Opening scene", detail: "She is in a hospital corridor after a bombing, watching a heart monitor flatline while a lab sample in her pocket starts reacting." },
    ];
  }
  if (includesAny(lower, [/\bsad\b/, /\bgirl\b/, /\bwound\b/, /\bgrief\b/])) {
    return [
      { title: "Hidden wound", detail: "The sad girl hides the real reason she stopped trusting the people who say they love her." },
      { title: "Trigger event", detail: "A small public crisis forces her private grief into view before she is ready to explain it." },
      { title: "Opening scene", detail: "Start with her performing one ordinary task while every detail quietly reveals what she has lost." },
    ];
  }
  if (includesAny(lower, [/\badopt/, /\badopted\b/, /\badoption\b/, /\bfamily\b/])) {
    return [
      { title: "Quiet coming-of-age", detail: "He is loved but still feels like a guest, so the conflict has no obvious villain." },
      { title: "Identity mystery", detail: "A normal family habit exposes a clue that his past was deliberately hidden from him." },
      { title: "Family secret", detail: "The family knows why he does not belong, but protecting him has become another kind of lie." },
    ];
  }
  return [
    { title: "Hidden wound", detail: "Define the pain the protagonist is hiding and why they cannot say it directly." },
    { title: "Trigger event", detail: "Choose the incident that forces the hidden conflict into the open." },
    { title: "Opening scene", detail: "Find the first visual scene that reveals the conflict without explaining it." },
  ];
}

function formatBrainstormOptions(seed: string): string {
  const options = optionLabels(seed);
  return options.map((option, index) => `${index + 1}. ${option.title}\n${option.detail}`).join("\n\n");
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
  const lead = includesAny(lower, [/\bbomb\b/, /\bheart attack\b/, /\bheart atack\b/, /\bscience\b/])
    ? "Good, this shifts the idea toward a science-thriller tragedy."
    : includesAny(lower, [/\badopt/, /\badopted\b/, /\badoption\b/, /\bfamily\b/])
      ? "This is a strong emotional seed about an adopted child who feels out of place in a normal family."
      : "I can shape this as a story seed.";
  return [
    lead,
    "Here are three concrete angles:",
    formatBrainstormOptions(text),
    "Pick 1, 2, or 3.",
  ].join("\n\n");
}

function brainstormClarificationReply(seed: string | null | undefined): string {
  const source = seed?.trim() || "your current idea";
  return [
    "By \"angle\", I mean the direction we use to expand your idea.",
    `For ${seed?.trim() ? `your seed \"${source}\"` : source}, you can choose:`,
    formatBrainstormOptions(source),
    "Pick 1, 2, or 3.",
  ].join("\n\n");
}

function brainstormChoiceReply(message: string, seed: string | null | undefined): string {
  const selected = normalizedMessage(message);
  const options = optionLabels(seed || "your current idea");
  const index = selected.startsWith("2") || selected.startsWith("two") || selected.startsWith("trigger") ? 1
    : selected.startsWith("3") || selected.startsWith("three") || selected.startsWith("opening") ? 2
      : 0;
  const option = options[index];
  return [
    `I will expand angle ${index + 1}: ${option.title}.`,
    option.detail,
    "Next, turn it into a scene goal, a character contradiction, or a chapter opening.",
  ].join("\n\n");
}

function brainstormContinuationReply(intent: StudioChatIntent, message: string, seed: string | null | undefined): string {
  const selectionOnly = normalizedMessage(message);
  const detail = /^(1|2|3|one|two|three|scene goal|scene goals|character contradiction|contradiction|chapter opening|opening scene|event that breaks her logic|break event)$/.test(selectionOnly)
    ? ""
    : message.trim();
  const context = seed?.trim() ? ` from "${seed.trim()}"` : "";
  if (intent === "BRAINSTORM_CHARACTER_CONTRADICTION") {
    return [
      "Good. This contradiction is strong because her loyalty is behavioral, not emotional.",
      "Character contradiction:",
      detail || `Externally, she is the dependable person everyone trusts in a crisis${context}. Internally, she has already categorized every bond as temporary.`,
      "Core tension:",
      "She helps people as if she loves them forever, but plans as if they will betray her tomorrow.",
      "Scene expression:",
      "Show her solving a friend's problem with total competence, then quietly deleting a shared calendar, packing emergency cash, or checking an escape route afterward.",
      "Next options:",
      "1. Turn this into a scene goal.",
      "2. Turn this into a chapter opening.",
      "3. Add the event that breaks her logic.",
    ].join("\n\n");
  }
  if (intent === "BRAINSTORM_SCENE_GOAL") {
    return [
      "Scene goal:",
      detail || `Force the protagonist to prove competence while revealing the private fear underneath${context}.`,
      "The scene should make the contradiction visible through behavior, not explanation.",
      "Next options:",
      "1. Turn this into a character contradiction.",
      "2. Turn this into a chapter opening.",
      "3. Add the event that breaks the scene.",
    ].join("\n\n");
  }
  if (intent === "BRAINSTORM_BREAK_EVENT") {
    return [
      "Event that breaks her logic:",
      detail || `Put her in a situation where the safest plan is to leave, but leaving would betray the one person who trusted her${context}.`,
      "The event should force a visible choice: preserve the escape plan, or stay long enough to become emotionally exposed.",
      "Next options:",
      "1. Turn this into a scene goal.",
      "2. Turn this into a chapter opening.",
      "3. Add the consequence of staying.",
    ].join("\n\n");
  }
  return [
    "Chapter opening:",
    detail || `Open with a concrete pressure point where the protagonist's public role and private logic collide${context}.`,
    "Keep the first scene visual: one problem to solve, one relationship at risk, one private escape plan the reader notices.",
    "Next options:",
    "1. Turn this into a scene goal.",
    "2. Turn this into a character contradiction.",
    "3. Add the event that breaks her logic.",
  ].join("\n\n");
}

function repoHelpReply(): string {
  return [
    "I’ll switch from brainstorming to project setup help for this question.",
    "To run the Studio locally:",
    "1. Start the repo infrastructure if you need DB-backed flows.",
    "2. From `apps/studio`, install dependencies if needed.",
    "3. Run `npm run dev` for the Next.js Studio.",
    "4. Start worker/memory services only when testing ingest, analysis, or writing pipelines.",
    "For checks: run `npm run typecheck`, targeted `npx eslint <changed files>`, and `npm run build` before shipping.",
  ].join("\n\n");
}

function pendingBrainstormPrompt(actions: BrainstormFollowupAction[] | null | undefined): string {
  const labels = (actions?.length ? actions : brainstormFollowupActions).map((action, index) => {
    if (action === "scene_goal") return `${index + 1}. Scene goal`;
    if (action === "character_contradiction") return `${index + 1}. Character contradiction`;
    if (action === "chapter_opening") return `${index + 1}. Chapter opening`;
    return `${index + 1}. Event that breaks her logic`;
  });
  return ["Choose the next brainstorm move:", labels.join("\n")].join("\n\n");
}

function nextActionsAfter(intent: StudioChatIntent): BrainstormFollowupAction[] {
  const selected = actionLabelByIntent[intent];
  if (!selected) return brainstormContinuationNextActions;
  return ["scene_goal", "character_contradiction", "chapter_opening", "break_event"].filter((action) => action !== selected).slice(0, 3) as BrainstormFollowupAction[];
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
  if (isRepoRunHelp(message)) return "REPO_RUN_HELP";
  if (isRepoTestHelp(message)) return "REPO_TEST_HELP";
  if (isQuotedAssistantQuestion(message)) return "QUOTED_PREVIOUS_RESPONSE_QUESTION";
  if (isBrainstormClarification(message)) return "BRAINSTORM_CLARIFICATION";
  if (isBrainstormChoice(message)) return "BRAINSTORM_EXPAND_CHOICE";
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

// Keep routing priority visible because mode override order is the bug surface.
// eslint-disable-next-line complexity
export function routeStudioIntent(args: RouteIntentArgs): IntentRoute {
  const text = normalizedMessage(args.message);
  if (args.mode === "brainstorm" && text === "continue" && !isExplicitChapterWrite(args.message)) {
    return {
      intent: "BRAINSTORM",
      command: null,
      goal: args.message.trim(),
      needsClarification: false,
      assistantText: pendingBrainstormPrompt(args.pendingBrainstormActions),
      brainstormSeed: args.recentBrainstormSeed ?? null,
      brainstormFollowupActions: args.pendingBrainstormActions ?? null,
      brainstormChoiceStage: args.activeBrainstormChoiceStage ?? null,
    };
  }
  const brainstormIntent = isExplicitChapterWrite(args.message)
    ? null
    : pendingBrainstormIntent(args.message, args.pendingBrainstormActions, args.mode, args.activeBrainstormChoiceStage);
  const intent = args.structuredIntent ?? brainstormIntent ?? detectStudioIntent(args.message);
  const goal = goalFromMessage(args.message, intent);
  if (intent === "REPO_RUN_HELP" || intent === "REPO_TEST_HELP") {
    return { intent, command: null, goal, needsClarification: false, assistantText: repoHelpReply(), brainstormSeed: null };
  }
  if (intent === "BRAINSTORM_CLARIFICATION" || intent === "QUOTED_PREVIOUS_RESPONSE_QUESTION") {
    const seed = intent === "QUOTED_PREVIOUS_RESPONSE_QUESTION" ? args.recentBrainstormSeed || stripQuotedAssistantText(args.message) : args.recentBrainstormSeed;
    return { intent, command: null, goal, needsClarification: false, assistantText: brainstormClarificationReply(seed), brainstormSeed: seed ?? null };
  }
  if (intent === "BRAINSTORM_EXPAND_CHOICE") {
    return {
      intent,
      command: null,
      goal,
      needsClarification: false,
      assistantText: brainstormChoiceReply(args.message, args.recentBrainstormSeed),
      brainstormSeed: args.recentBrainstormSeed ?? null,
      brainstormFollowupActions,
      brainstormChoiceStage: "brainstorm_followup",
    };
  }
  if (intent === "BRAINSTORM_SCENE_GOAL" || intent === "BRAINSTORM_CHARACTER_CONTRADICTION" || intent === "BRAINSTORM_CHAPTER_OPENING" || intent === "BRAINSTORM_BREAK_EVENT") {
    const nextActions = nextActionsAfter(intent);
    return {
      intent,
      command: null,
      goal,
      needsClarification: false,
      assistantText: brainstormContinuationReply(intent, args.message, args.recentBrainstormSeed),
      brainstormSeed: args.recentBrainstormSeed ?? null,
      brainstormFollowupActions: nextActions,
      brainstormChoiceStage: "brainstorm_continuation_next",
      selectedBrainstormAction: actionLabelByIntent[intent] ?? null,
    };
  }
  if (staysInBrainstormMode(args.mode, intent)) {
    const seed = args.message.trim();
    return {
      intent: "BRAINSTORM",
      command: null,
      goal: seed,
      needsClarification: false,
      assistantText: brainstormReply(args.message),
      brainstormSeed: isShortAcknowledgement(seed) || /^brainstorm\b/i.test(seed) ? args.recentBrainstormSeed ?? null : seed,
      brainstormFollowupActions: null,
      brainstormChoiceStage: isShortAcknowledgement(seed) || /^brainstorm\b/i.test(seed) ? args.activeBrainstormChoiceStage ?? null : "brainstorm_angle",
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
      brainstormSeed: /^brainstorm\b/i.test(args.message.trim()) ? args.recentBrainstormSeed ?? null : args.message.trim(),
      brainstormFollowupActions: null,
      brainstormChoiceStage: /^brainstorm\b/i.test(args.message.trim()) ? args.activeBrainstormChoiceStage ?? null : "brainstorm_angle",
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

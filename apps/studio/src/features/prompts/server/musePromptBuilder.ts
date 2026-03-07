import type { StoryContextPack } from "@/features/guard/server/storyContextBuilder";

export type MuseMode = "bullets" | "block";
export type MuseRuleType = "AVOID" | "ENFORCE" | "LOGIC" | "PACING" | "VOICE";
export type MuseRule = {
  type: MuseRuleType;
  ruleText: string;
  why: string | null;
  badExamples: string[];
  goodExamples: string[];
};

export function normalizeMode(raw: unknown): MuseMode {
  return raw === "block" ? "block" : "bullets";
}

export function normalizeHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const items = raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0);
  return items.slice(0, 5);
}

export function focusTextFromBody(body: Record<string, unknown>): string {
  const context = (body.context ?? {}) as Record<string, unknown>;
  const selection = typeof context.selection === "string" ? context.selection.trim() : "";
  const tail = typeof context.tail === "string" ? context.tail.trim() : "";
  return selection || tail;
}

export function overlapRatio(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\W+/).filter((x) => x.length >= 4));
  const tokensB = new Set(b.toLowerCase().split(/\W+/).filter((x) => x.length >= 4));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const tk of tokensA) if (tokensB.has(tk)) overlap += 1;
  return overlap / Math.max(tokensA.size, 1);
}

export function normalizeRuleType(raw: unknown): MuseRuleType | null {
  if (raw === "avoid" || raw === "AVOID") return "AVOID";
  if (raw === "enforce" || raw === "ENFORCE") return "ENFORCE";
  if (raw === "logic" || raw === "LOGIC") return "LOGIC";
  if (raw === "pacing" || raw === "PACING") return "PACING";
  if (raw === "voice" || raw === "VOICE") return "VOICE";
  return null;
}

export function toExampleList(raw: unknown): string[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === "string" && raw.trim()
      ? raw
          .split(/[;\n]+/)
          .map((x) => x.trim())
          .filter((x) => x.length > 0)
      : [];
  return arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, 2)
    .map((x) => (x.length > 80 ? `${x.slice(0, 77)}...` : x));
}

function renderRulesFragment(
  rules: MuseRule[],
  opts: { includeWhy: boolean; includeExamples: boolean; exampleTypes?: MuseRuleType[] | null }
): string {
  if (rules.length === 0) return "";
  const blocks: string[] = [];
  for (const rule of rules) {
    blocks.push(`- [${rule.type}] ${rule.ruleText}`);
    if (opts.includeWhy && rule.why) blocks.push(`  Why: ${rule.why}`);
    const allowExamples = opts.includeExamples && (!opts.exampleTypes || opts.exampleTypes.includes(rule.type));
    if (allowExamples) {
      if (rule.badExamples.length > 0) blocks.push(`  Bad examples: ${rule.badExamples.join(" | ")}`);
      if (rule.goodExamples.length > 0) blocks.push(`  Good examples: ${rule.goodExamples.join(" | ")}`);
    }
  }
  return (
    `STORY-BIBLE: MUSE RULES (Top ${rules.length} Active)\n` +
    "You MUST follow these rules for this story. If rules conflict, prioritize LOGIC > VOICE > ENFORCE > PACING > AVOID.\n\n" +
    "RULES:\n" +
    `${blocks.join("\n")}\n\n` +
    "CONSTRAINTS:\n" +
    "- Do NOT repeat the same idea-pattern as PREVIOUS_IDEAS.\n" +
    "- Avoid verbatim reuse of long phrases from PREVIOUS_IDEAS (>8 words).\n" +
    "- Stay consistent with the character's status, setting, and physical reality.\n"
  );
}

export function buildRulesInjection(rules: MuseRule[]): string {
  if (rules.length === 0) return "";
  const rich = renderRulesFragment(rules, { includeWhy: true, includeExamples: true, exampleTypes: null });
  if (rich.length <= 1600) return rich;
  const noWhy = renderRulesFragment(rules, { includeWhy: false, includeExamples: true, exampleTypes: null });
  if (noWhy.length <= 1600) return noWhy;
  return renderRulesFragment(rules, { includeWhy: false, includeExamples: true, exampleTypes: ["AVOID", "VOICE", "LOGIC"] });
}

export function buildMessages(args: {
  focusText: string;
  history: string[];
  mode: MuseMode;
  writingLanguage: "en" | "vi";
  repeatRisk: boolean;
  rulesInjection: string;
  contextInjection: string;
}) {
  const { focusText, history, mode, writingLanguage, repeatRisk, rulesInjection, contextInjection } = args;
  const historyText = history.length > 0 ? history.map((h, idx) => `${idx + 1}. ${h}`).join("\n") : "(none)";
  const outputRule =
    mode === "block"
      ? "Output exactly one prose block, 180-350 words, ready to insert into draft."
      : "Output exactly 3 bullets. Each bullet must be 2-4 sentences and radically different in narrative direction. Formatting is strict: return exactly 3 lines, each line starts with '- ' and no heading/preface.";
  const languageRule =
    writingLanguage === "vi"
      ? "Output language: Vietnamese."
      : "Output language: English.";
  const extraRiskRule = repeatRisk
    ? "Repeat-risk is high. Be aggressively different from PREVIOUS_IDEAS in trope, motive, and conflict framing."
    : "";

  return [
    {
      role: "system",
      content:
        `${languageRule}\n` +
        "You are Ghost Muse for fiction drafting.\n" +
        "Goal: propose fresh directions without repeating prior ideas or structural patterns.\n" +
        "Negative constraints:\n" +
        "- Avoid semantic trope/pattern repetition from PREVIOUS_IDEAS.\n" +
        "- Do not reuse any long phrase (>8 words) from PREVIOUS_IDEAS.\n" +
        "- Keep concrete, scene-anchored details.\n" +
        "- No meta commentary.\n" +
        "- If bullets mode: output exactly 3 bullet lines and nothing else.\n" +
        extraRiskRule,
    },
    {
      role: "user",
      content:
        `${rulesInjection ? `${rulesInjection}\n` : ""}` +
        `${contextInjection ? `${contextInjection}\n` : ""}` +
        `FOCUS_TEXT:\n${focusText}\n\n` +
        `PREVIOUS_IDEAS (last 5):\n${historyText}\n\n` +
        "TASK:\n" +
        "Step A (self-check): Identify 3 common trope/patterns in PREVIOUS_IDEAS that caused repetition or tone clash.\n" +
        "Step B (generate) based on the strongest fresh direction.\n" +
        `${outputRule}\n`,
    },
  ];
}

export function renderMuseContextInjection(pack: StoryContextPack): string {
  const canon = pack.canonLines.slice(0, 16);
  const rel = pack.relationshipLines.slice(0, 8);
  const timeline = pack.timelineLines.slice(0, 12);
  if (canon.length === 0 && rel.length === 0 && timeline.length === 0) return "";
  return [
    "STORY CONTEXT PACK",
    "CANON",
    ...(canon.length > 0 ? canon : ["- (none)"]),
    "RELATIONSHIPS",
    ...(rel.length > 0 ? rel : ["- (none)"]),
    "RECENT EVENTS",
    ...(timeline.length > 0 ? timeline : ["- (none)"]),
  ].join("\n");
}

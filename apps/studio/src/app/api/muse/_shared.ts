import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";

export type MuseRuleType = "AVOID" | "ENFORCE" | "LOGIC" | "PACING" | "VOICE";

export type MuseRule = {
  type: MuseRuleType;
  ruleText: string;
  why: string | null;
  badExamples: string[];
  goodExamples: string[];
};

export type MuseStoryContext = {
  storyId: number;
  storySlug: string;
  storyTitle: string;
  sceneId: number;
  rulesInjection: string;
};

export type MuseChatScope = "selection" | "scene" | "chapter";
export type MuseTargetRange = "patch_short" | "medium" | "rewrite_scene";

export type MuseCompressedSummary = {
  core_thesis: string;
  emotional_arc: string[];
  critical_events: string[];
  unresolved_risks: string[];
  style_notes: string[];
  constraints_for_next_step: string[];
};

export type MuseContextInput = {
  selection: string;
  tail: string;
  freeform: string;
};

function normalizeRuleType(raw: unknown): MuseRuleType | null {
  if (raw === "avoid" || raw === "AVOID") return "AVOID";
  if (raw === "enforce" || raw === "ENFORCE") return "ENFORCE";
  if (raw === "logic" || raw === "LOGIC") return "LOGIC";
  if (raw === "pacing" || raw === "PACING") return "PACING";
  if (raw === "voice" || raw === "VOICE") return "VOICE";
  return null;
}

function toExampleList(raw: unknown): string[] {
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

async function fetchMuseRules(storyId: number): Promise<MuseRule[]> {
  try {
    const rs = await pool.query<{
      type: string | null;
      rule_text: string | null;
      why: string | null;
      bad_examples: unknown;
      good_examples: unknown;
    }>(
      `SELECT type, rule_text, why, bad_examples, good_examples
       FROM public.muse_rules
       WHERE story_id = $1 AND is_active = true
       ORDER BY weight DESC, created_at DESC
       LIMIT 5`,
      [storyId]
    );
    const out: MuseRule[] = [];
    for (const row of rs.rows) {
      const type = normalizeRuleType(row.type);
      const ruleText = typeof row.rule_text === "string" ? row.rule_text.trim() : "";
      if (!type || !ruleText) continue;
      out.push({
        type,
        ruleText,
        why: typeof row.why === "string" && row.why.trim() ? row.why.trim() : null,
        badExamples: toExampleList(row.bad_examples),
        goodExamples: toExampleList(row.good_examples),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function renderRulesFragment(
  rules: MuseRule[],
  summary: string,
  opts: { includeWhy: boolean; includeExamples: boolean; exampleTypes?: MuseRuleType[] | null }
): string {
  if (rules.length === 0 && !summary) return "";
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

  const summaryBlock = summary
    ? `\n\n## STORY BIBLE CORE\nMọi tình tiết trong Scene phải phục vụ hoặc nhất quán với mục tiêu tối thượng của tác phẩm sau đây: ${summary}\n`
    : "";

  const rulesTitle = rules.length > 0 ? `STORY-BIBLE: MUSE RULES (Top ${rules.length} Active)\nYou MUST follow these rules for this story. If rules conflict, prioritize LOGIC > VOICE > ENFORCE > PACING > AVOID.\n\nRULES:\n${blocks.join("\n")}` : "STORY-BIBLE: MUSE RULES (None Active)";

  return (
    `${rulesTitle}` +
    summaryBlock +
    `\n\nCONSTRAINTS:\n` +
    "- Do NOT repeat the same idea-pattern as PREVIOUS_IDEAS.\n" +
    "- Avoid verbatim reuse of long phrases from PREVIOUS_IDEAS (>8 words).\n" +
    "- Stay consistent with the character's status, setting, and physical reality.\n"
  );
}

function buildRulesInjection(rules: MuseRule[], summary: string): string {
  if (rules.length === 0 && !summary) return "";
  const rich = renderRulesFragment(rules, summary, { includeWhy: true, includeExamples: true, exampleTypes: null });
  if (rich.length <= 1600) return rich;
  const noWhy = renderRulesFragment(rules, summary, { includeWhy: false, includeExamples: true, exampleTypes: null });
  if (noWhy.length <= 1600) return noWhy;
  return renderRulesFragment(rules, summary, { includeWhy: false, includeExamples: true, exampleTypes: ["AVOID", "VOICE", "LOGIC"] });
}

export function normalizeMuseHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, 5);
}

export function normalizeMuseContext(raw: unknown): MuseContextInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { selection: "", tail: "", freeform: "" };
  }
  const obj = raw as Record<string, unknown>;
  return {
    selection: typeof obj.selection === "string" ? obj.selection.trim() : "",
    tail: typeof obj.tail === "string" ? obj.tail.trim() : "",
    freeform: typeof obj.context === "string" ? obj.context.trim() : "",
  };
}

export function normalizeMuseScope(raw: unknown): MuseChatScope {
  if (raw === "selection") return "selection";
  if (raw === "chapter") return "chapter";
  return "scene";
}

export function normalizeMuseTargetRange(raw: unknown): MuseTargetRange {
  if (raw === "patch_short") return "patch_short";
  if (raw === "rewrite_scene") return "rewrite_scene";
  return "medium";
}

export function focusTextFromContext(context: MuseContextInput): string {
  return context.selection || context.tail || context.freeform;
}

export function parseSceneId(input: unknown): number | null {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function byteLengthUtf8(raw: string): number {
  return new TextEncoder().encode(raw).length;
}

export function normalizeStringArray(raw: unknown, limit = 8): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, limit);
}

export function parseCompressedSummary(raw: unknown): MuseCompressedSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const coreThesis = typeof obj.core_thesis === "string" ? obj.core_thesis.trim() : "";
  if (!coreThesis) return null;
  return {
    core_thesis: coreThesis,
    emotional_arc: normalizeStringArray(obj.emotional_arc, 8),
    critical_events: normalizeStringArray(obj.critical_events, 8),
    unresolved_risks: normalizeStringArray(obj.unresolved_risks, 8),
    style_notes: normalizeStringArray(obj.style_notes, 8),
    constraints_for_next_step: normalizeStringArray(obj.constraints_for_next_step, 8),
  };
}

export async function loadMuseStoryContext(storySlug: string, sceneId: number): Promise<MuseStoryContext> {
  const storyId = await resolveStoryId(pool, storySlug);
  const storyRs = await pool.query<{ title: string | null; summary_md: string | null }>(
    `SELECT title, summary_md
     FROM public.story_series
     WHERE id = $1
     LIMIT 1`,
    [storyId]
  );
  const storyTitle = typeof storyRs.rows[0]?.title === "string" && storyRs.rows[0].title.trim()
    ? storyRs.rows[0].title.trim()
    : storySlug;
  const storySummary = typeof storyRs.rows[0]?.summary_md === "string" ? storyRs.rows[0].summary_md.trim() : "";
  const rules = await fetchMuseRules(storyId);
  const rulesInjection = buildRulesInjection(rules, storySummary);
  return {
    storyId,
    storySlug,
    storyTitle,
    sceneId,
    rulesInjection,
  };
}

export function buildIdentityAssertion(story: MuseStoryContext, writingLanguage: "en" | "vi"): string {
  const languageRule = writingLanguage === "vi"
    ? "Output language: Vietnamese."
    : "Output language: English.";
  return (
    `${languageRule}\n` +
    `You are Ghost Muse for story "${story.storyTitle}" (${story.storySlug}).\n` +
    "Never mix characters, lore, or events from other stories.\n" +
    "Stay consistent with existing canon and timeline.\n"
  );
}

async function waitForLlmCoolOff() {
  const coolOffSeconds = Number(process.env.LLM_COOL_OFF_SECONDS ?? "60");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Atomic check and update
    const res = await client.query<{ diff_sec: number }>(
      `SELECT EXTRACT(EPOCH FROM (NOW() - last_at)) as diff_sec
       FROM public.system_heartbeat 
       WHERE key = 'last_llm_call'
       FOR UPDATE`
    );

    const diffSec = res.rows[0]?.diff_sec ?? 9999;
    if (diffSec < coolOffSeconds) {
      const waitMs = (coolOffSeconds - diffSec) * 1000;
      console.log(`[LLM_GUARD] Cooling off for ${waitMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    await client.query(
      "UPDATE public.system_heartbeat SET last_at = NOW() WHERE key = 'last_llm_call'"
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[LLM_GUARD] Heartbeat check failed:", err);
  } finally {
    client.release();
  }
}

export async function callChatCompletionJson(args: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}): Promise<{ content: string }> {
  // Enforce global cool-off
  await waitForLlmCoolOff();

  const llmBase = process.env.LLM_API_BASE!;
  const apiKey = process.env.LLM_API_KEY ?? "local";
  const payload = {
    model: process.env.LLM_MODEL ?? "qwen2.5-7b",
    stream: false,
    temperature: args.temperature,
    max_tokens: args.maxTokens,
    messages: args.messages,
  };

  const requestUpstream = async (base: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
      return await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let upstream: Response;
  try {
    upstream = await requestUpstream(llmBase);
  } catch (primaryErr) {
    if (llmBase.includes("host.docker.internal")) {
      const fallbackBase = llmBase.replace("host.docker.internal", "localhost");
      upstream = await requestUpstream(fallbackBase);
    } else {
      throw primaryErr;
    }
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(errText || `LLM_FAILED_${upstream.status}`);
  }

  const json = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: string | null } | null }>;
  };
  const content = json?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("LLM_EMPTY_CONTENT");
  return { content };
}

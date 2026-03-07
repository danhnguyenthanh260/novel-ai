import { Pool } from "pg";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";
import { buildStoryContextPack } from "@/features/guard/server/storyContextBuilder";
import {
  buildRulesInjection,
  MuseRule,
  normalizeRuleType,
  renderMuseContextInjection,
  toExampleList,
} from "@/features/prompts/server/musePromptBuilder";
import type { MuseStoryContext } from "@/features/muse/server/museStream/types";

async function fetchMuseRules(pool: Pool, storyId: number): Promise<MuseRule[]> {
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
}

export async function buildMuseStoryContext(
  pool: Pool,
  storySlug: string,
  sceneId: number,
  focusText: string
): Promise<MuseStoryContext> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const rules = await fetchMuseRules(pool, storyId);
    const pack = await buildStoryContextPack(pool, {
      storyId,
      sceneId: Number.isFinite(sceneId) ? Number(sceneId) : undefined,
      keywords: focusText,
    });
    return {
      rules,
      contextInjection: renderMuseContextInjection(pack),
    };
  } catch {
    return {
      rules: [],
      contextInjection: "",
    };
  }
}

export function buildMuseRulesInjection(rules: MuseRule[]): string {
  return buildRulesInjection(rules);
}

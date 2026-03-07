import type { Pool, PoolClient } from "pg";
import { buildStoryContextPack } from "@/features/guard/server/storyContextBuilder";

type GuardInput = {
  storyId: number;
  sceneId?: number;
  workunitId?: string;
  keywords?: string;
  maxContextTokens?: number;
};

type Queryable = Pool | PoolClient;

type GuardOutput = {
  block: string;
  sections: {
    global: {
      style: string[];
      worldCore: string[];
      worldTagged: string[];
    };
    local: {
      canon: string[];
      relationships: string[];
      recentEvents: string[];
      uncertain: string[];
    };
    canon: string[];
    relationships: string[];
    recentEvents: string[];
    uncertain: string[];
  };
  stats: {
    approx_tokens: number;
    max_tokens: number;
    world_core_rows: number;
    world_tagged_rows: number;
    canon_rows: number;
    timeline_rows: number;
  };
};

const DEFAULT_MAX_CONTEXT_TOKENS = 8192;

function estimateTokens(text: string): number {
  const n = text.trim().length;
  if (n === 0) return 0;
  return Math.ceil(n / 4);
}

function buildBlock(sections: GuardOutput["sections"]): string {
  const out: string[] = [];
  out.push("GLOBAL_CONTEXT");
  out.push("STYLE_PROFILE");
  out.push(...sections.global.style);
  out.push("");
  out.push("WORLDBUILDING_CORE");
  out.push(...sections.global.worldCore);
  out.push("");
  out.push("WORLDBUILDING_TAGGED");
  out.push(...sections.global.worldTagged);
  out.push("");
  out.push("LOCAL_CONTEXT");
  out.push("CANON");
  out.push(...sections.local.canon);
  out.push("");
  out.push("RELATIONSHIPS");
  out.push(...sections.local.relationships);
  out.push("");
  out.push("RECENT EVENTS");
  out.push(...sections.local.recentEvents);
  out.push("");
  out.push("UNCERTAIN");
  out.push(...sections.local.uncertain);
  return out.join("\n");
}

function seedSections(pack: Awaited<ReturnType<typeof buildStoryContextPack>>): GuardOutput["sections"] {
  return {
    global: {
      style: [...pack.styleLines],
      worldCore: [...pack.worldCoreLines],
      worldTagged: [...pack.worldTaggedLines],
    },
    local: {
      canon: [...pack.canonLines],
      relationships: [...pack.relationshipLines],
      recentEvents: [...pack.timelineLines],
      uncertain: [],
    },
    canon: [],
    relationships: [],
    recentEvents: [],
    uncertain: [],
  };
}

function ensureUncertaintyHints(sections: GuardOutput["sections"], sceneRef: string): void {
  if (sections.local.canon.length === 0 && sections.local.relationships.length === 0) {
    sections.local.uncertain.push(
      `- Canon coverage low for ${sceneRef}. Add [TODO: Question] for missing facts before finalizing.`
    );
  }
  if (sections.local.recentEvents.length === 0) {
    sections.local.uncertain.push("- Timeline context missing. Add [TODO: Question] if event order is ambiguous.");
  }
  if (sections.local.uncertain.length === 0) {
    sections.local.uncertain.push("- If any detail is uncertain or absent in CANON/RECENT EVENTS, append [TODO: Question].");
  }
}

function degradeCanonOrRelationship(sections: GuardOutput["sections"]): boolean {
  const canDropRel = sections.local.relationships.length > 0;
  const canDropCanon = sections.local.canon.length > 0;
  if (!canDropRel && !canDropCanon) return false;

  if (canDropCanon && canDropRel) {
    if (sections.local.canon.length >= sections.local.relationships.length) sections.local.canon.pop();
    else sections.local.relationships.pop();
    return true;
  }
  if (canDropCanon) sections.local.canon.pop();
  else sections.local.relationships.pop();
  return true;
}

function trimSectionsToTokenBudget(sections: GuardOutput["sections"], maxContextTokens: number): void {
  while (true) {
    const draftBlock = buildBlock(sections);
    const tokens = estimateTokens(draftBlock);
    if (tokens <= maxContextTokens) return;

    if (sections.global.worldTagged.length > 0) {
      sections.global.worldTagged.pop();
      continue;
    }
    if (sections.global.worldCore.length > 0) {
      sections.global.worldCore.pop();
      continue;
    }
    if (degradeCanonOrRelationship(sections)) continue;
    if (sections.local.recentEvents.length > 0) {
      sections.local.recentEvents.pop();
      continue;
    }
    return;
  }
}

function mirrorLocalSections(sections: GuardOutput["sections"]): void {
  sections.canon = sections.local.canon;
  sections.relationships = sections.local.relationships;
  sections.recentEvents = sections.local.recentEvents;
  sections.uncertain = sections.local.uncertain;
}

export async function buildCanonGuard(db: Queryable, input: GuardInput): Promise<GuardOutput> {
  const maxContextTokens = Math.max(512, Math.min(input.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS, 8192));
  const sceneRef = input.sceneId ? `scene_id=${input.sceneId}` : input.workunitId ? `workunit_id=${input.workunitId}` : "scene_ref=unknown";

  const pack = await buildStoryContextPack(db, {
    storyId: input.storyId,
    sceneId: input.sceneId,
    workunitId: input.workunitId,
    keywords: input.keywords,
  });

  const sections = seedSections(pack);
  ensureUncertaintyHints(sections, sceneRef);
  trimSectionsToTokenBudget(sections, maxContextTokens);
  mirrorLocalSections(sections);

  const block = buildBlock(sections);
  const approxTokens = estimateTokens(block);

  return {
    block,
    sections,
    stats: {
      approx_tokens: Math.min(approxTokens, maxContextTokens),
      max_tokens: maxContextTokens,
      world_core_rows: pack.stats.worldCoreRows,
      world_tagged_rows: pack.stats.worldTaggedRows,
      canon_rows: pack.stats.canonRows,
      timeline_rows: pack.stats.timelineRows,
    },
  };
}

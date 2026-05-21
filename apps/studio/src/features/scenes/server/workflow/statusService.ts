import type { Pool } from "pg";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";

export type WorkflowCommandScope = "story" | "chapter";
export type WorkflowReadiness = "ready" | "needs-context" | "blocked";

export type WorkflowStatusSummary = {
  scope: WorkflowCommandScope;
  storyId: number;
  chapterId: string | null;
  chapterCount: number;
  lastWriteAt: string | null;
  memoryCompleteness: number;
  analysisFlags: {
    activeSnapshots: number;
    sourceDocs: number;
    hasActiveSnapshot: boolean;
  };
  readiness: WorkflowReadiness;
  missing: string[];
  nextAction: string;
};

export type WorkflowContextDigest = {
  scope: WorkflowCommandScope;
  storyId: number;
  chapterId: string | null;
  title: string;
  characters: string[];
  arcs: string[];
  tags: string[];
  styleNotes: string[];
  included: string[];
  missing: string[];
  degraded: string[];
  conflicts: string[];
};

type CountRow = { count: string };
type LastWriteRow = { updated_at: string | null };
type DictionaryCountRow = { tier: string; count: string };
type DictionaryRow = { tier: string; term_key: string; definition: string; agent_instructions: string };
type ArcRow = { name: string; kind: string };
type TagRow = { tag: string };

function chapterNumber(chapterId: string | null): number | null {
  if (!chapterId) return null;
  const value = chapterId.match(/\d+/)?.[0];
  return value ? Number(value) : null;
}

async function safeCount(pool: Pool, sql: string, params: unknown[]): Promise<number> {
  try {
    const res = await pool.query<CountRow>(sql, params);
    return Number(res.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function loadDictionaryCounts(pool: Pool, storyId: number, chapterId: string | null): Promise<Map<string, number>> {
  const chapterNo = chapterNumber(chapterId);
  const res = await pool.query<DictionaryCountRow>(
    `SELECT tier, COUNT(*)::text AS count
     FROM public.story_dictionary
     WHERE (story_id = $1 OR story_id IS NULL)
       AND is_active = true
       AND ($2::int IS NULL OR valid_from_chapter IS NULL OR valid_from_chapter <= $2::int)
       AND ($2::int IS NULL OR valid_to_chapter IS NULL OR valid_to_chapter >= $2::int)
     GROUP BY tier`,
    [storyId, chapterNo]
  );
  return new Map(res.rows.map((row) => [row.tier, Number(row.count)]));
}

async function lastWriteAt(pool: Pool, storyId: number, chapterId: string | null): Promise<string | null> {
  const params: Array<number | string> = [storyId];
  const where = ["story_id = $1"];
  if (chapterId) {
    params.push(chapterId);
    where.push(`chapter_id = $${params.length}`);
  }
  const res = await pool.query<LastWriteRow>(
    `SELECT MAX(updated_at)::text AS updated_at
     FROM public.chapter_draft
     WHERE ${where.join(" AND ")}`,
    params
  );
  return res.rows[0]?.updated_at ?? null;
}

function completeness(args: { sourceDocs: number; dictionaryCounts: Map<string, number>; activeSnapshots: number }): number {
  const slots = [
    args.sourceDocs > 0,
    (args.dictionaryCounts.get("narrative") ?? 0) > 0,
    (args.dictionaryCounts.get("style") ?? 0) > 0,
    args.activeSnapshots > 0,
  ];
  return Math.round((slots.filter(Boolean).length / slots.length) * 100);
}

function deriveReadiness(args: {
  scope: WorkflowCommandScope;
  chapterId: string | null;
  chapterCount: number;
  sourceDocs: number;
  dictionaryCounts: Map<string, number>;
  activeSnapshots: number;
}): Pick<WorkflowStatusSummary, "readiness" | "missing" | "nextAction"> {
  if (args.scope === "chapter" && !args.chapterId) {
    return { readiness: "blocked", missing: ["Chapter selected"], nextAction: "Select or create a chapter before running chapter commands." };
  }

  const missing = [
    args.chapterCount === 0 ? "Source chapter" : null,
    args.sourceDocs === 0 ? "Source material" : null,
    (args.dictionaryCounts.get("narrative") ?? 0) === 0 ? "Characters or narrative memory" : null,
    (args.dictionaryCounts.get("style") ?? 0) === 0 ? "Style notes" : null,
    args.activeSnapshots === 0 ? "Analysis snapshot" : null,
  ].filter((item): item is string => Boolean(item));

  if (args.chapterCount === 0) {
    return { readiness: "needs-context", missing, nextAction: "Create first chapter or ingest source material." };
  }
  if (missing.length > 0) {
    return { readiness: "needs-context", missing, nextAction: "Open context, then fill the missing memory slots before generation." };
  }
  return { readiness: "ready", missing: [], nextAction: "Continue with the next writing command." };
}

export async function getWorkflowStatus(
  pool: Pool,
  input: { storySlug: string; scope: WorkflowCommandScope; chapterId: string | null }
): Promise<WorkflowStatusSummary> {
  const storyId = await resolveStoryId(pool, input.storySlug);
  const chapterFilter = input.scope === "chapter" ? input.chapterId : null;
  const [chapterCount, sourceDocs, activeSnapshots, dictionaryCounts, writeAt] = await Promise.all([
    safeCount(pool, "SELECT COUNT(*)::text AS count FROM public.story_chapter WHERE story_id = $1", [storyId]),
    safeCount(pool, "SELECT COUNT(*)::text AS count FROM public.source_doc WHERE story_id = $1", [storyId]),
    safeCount(
      pool,
      `SELECT COUNT(*)::text AS count
       FROM public.story_active_analysis_snapshot
       WHERE story_id = $1 AND ($2::text IS NULL OR chapter_id = $2::text)`,
      [storyId, chapterFilter]
    ),
    loadDictionaryCounts(pool, storyId, chapterFilter),
    lastWriteAt(pool, storyId, chapterFilter),
  ]);
  const readiness = deriveReadiness({
    scope: input.scope,
    chapterId: input.chapterId,
    chapterCount,
    sourceDocs,
    dictionaryCounts,
    activeSnapshots,
  });

  return {
    scope: input.scope,
    storyId,
    chapterId: chapterFilter,
    chapterCount,
    lastWriteAt: writeAt,
    memoryCompleteness: completeness({ sourceDocs, dictionaryCounts, activeSnapshots }),
    analysisFlags: { activeSnapshots, sourceDocs, hasActiveSnapshot: activeSnapshots > 0 },
    ...readiness,
  };
}

function entryLabel(row: DictionaryRow): string {
  const detail = row.agent_instructions.trim() || row.definition.trim();
  return detail ? `${row.term_key}: ${detail}` : row.term_key;
}

export async function getWorkflowContextDigest(
  pool: Pool,
  input: { storySlug: string; scope: WorkflowCommandScope; chapterId: string | null }
): Promise<WorkflowContextDigest> {
  const storyId = await resolveStoryId(pool, input.storySlug);
  const scopedChapter = input.scope === "chapter" ? input.chapterId : null;
  const chapterNo = chapterNumber(scopedChapter);
  const [dictionary, arcs, tags] = await Promise.all([
    pool.query<DictionaryRow>(
      `SELECT tier, term_key, definition, agent_instructions
       FROM public.story_dictionary
       WHERE (story_id = $1 OR story_id IS NULL)
         AND is_active = true
         AND ($2::int IS NULL OR valid_from_chapter IS NULL OR valid_from_chapter <= $2::int)
         AND ($2::int IS NULL OR valid_to_chapter IS NULL OR valid_to_chapter >= $2::int)
       ORDER BY priority DESC, term_key ASC
       LIMIT 80`,
      [storyId, chapterNo]
    ),
    pool.query<ArcRow>(
      "SELECT name, kind FROM public.story_arc WHERE story_id = $1 ORDER BY order_no ASC, id ASC LIMIT 20",
      [storyId]
    ),
    pool.query<TagRow>(
      "SELECT tag FROM public.story_tag WHERE story_id = $1 ORDER BY tag ASC LIMIT 24",
      [storyId]
    ),
  ]);
  const narrative = dictionary.rows.filter((row) => row.tier === "narrative").map(entryLabel).slice(0, 12);
  const style = dictionary.rows.filter((row) => row.tier === "style").map(entryLabel).slice(0, 8);
  const contextTags = tags.rows.map((row) => row.tag);
  const arcLabels = arcs.rows.map((row) => `${row.name} (${row.kind})`);
  const missing = [
    narrative.length === 0 ? "Characters or narrative memory" : null,
    arcLabels.length === 0 ? "Story arcs" : null,
    style.length === 0 ? "Style notes" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    scope: input.scope,
    storyId,
    chapterId: scopedChapter,
    title: input.scope === "story" ? "Story context snapshot" : `Chapter ${input.chapterId ?? "current"} context snapshot`,
    characters: narrative,
    arcs: arcLabels,
    tags: contextTags,
    styleNotes: style,
    included: [
      narrative.length > 0 ? `Characters: ${narrative.slice(0, 3).join("; ")}` : null,
      arcLabels.length > 0 ? `Arcs: ${arcLabels.join("; ")}` : null,
      contextTags.length > 0 ? `Tags: ${contextTags.join(", ")}` : null,
      style.length > 0 ? `Style notes: ${style.slice(0, 3).join("; ")}` : null,
    ].filter((item): item is string => Boolean(item)),
    missing,
    degraded: contextTags.length === 0 ? ["No story tags are attached yet."] : [],
    conflicts: [],
  };
}

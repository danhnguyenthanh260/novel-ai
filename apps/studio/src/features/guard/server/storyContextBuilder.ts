import type { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

export type StoryContextInput = {
  storyId: number;
  sceneId?: number;
  workunitId?: string;
  chapterId?: string;
  keywords?: string;
};

export type StoryContextPack = {
  styleLines: string[];
  worldCoreLines: string[];
  worldTaggedLines: string[];
  canonLines: string[];
  relationshipLines: string[];
  timelineLines: string[];
  historianGuidance: string[];
  stats: {
    worldCoreRows: number;
    worldTaggedRows: number;
    canonRows: number;
    timelineRows: number;
    relationshipRowsNeo4j: number;
    worldTaggedRowsQdrant: number;
    retrievalWarnings: string[];
    externalLatencyMs: {
      neo4j: number;
      qdrant: number;
      total: number;
    };
    externalRetrievalStatus: "full" | "partial" | "fallback_postgres";
  };
};

type StyleProfileRow = {
  tone_baseline: string;
  darkness_level: number;
  political_intensity: number;
  pacing_bias: number;
  prose_density: number;
};

type AuthorStyleProfileRow = {
  profile_json: unknown;
};

type SceneStyleRow = {
  sentence_complexity: number | null;
  dialogue_ratio: number | null;
  metaphor_density: number | null;
  sensory_sight: number | null;
  sensory_sound: number | null;
  sensory_touch: number | null;
  sensory_smell: number | null;
  sensory_taste: number | null;
};

type WorldRow = {
  id: number;
  category: string;
  content: string;
  importance: number;
  tags: string[] | null;
};

type MemoryCanonRow = {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  tags: string[] | null;
  chapter_id: string | null;
  classification?: string | null;
  is_static?: boolean | null;
};

type LegacyCanonRow = {
  id: number;
  category: string;
  content: string;
  importance: number;
};

type TimelineAnchorRow = {
  event_label: string;
  relative_time: string | null;
  absolute_time: string | null;
  location: string | null;
  participants: string[] | null;
};

type LegacyTimelineRow = {
  id: number;
  event_key: string | null;
  title: string | null;
  body: string;
  start_ts: string | null;
  end_ts: string | null;
};

type Neo4jEdge = {
  src: string;
  rel: string;
  dst: string;
  weight: number;
  hop: number;
};

type QdrantMatch = {
  id: string;
  content: string;
  score: number;
  tags: string[];
  category: string;
};

type RelationshipLineItem = {
  line: string;
  key: string;
  source: "neo4j" | "postgres";
  weight: number;
  hop: number;
  personToPerson: boolean;
};

const MAX_CANON_ROWS = 50;
const MAX_TIMELINE_ROWS = 30;
const MAX_WORLD_ROWS = 80;
const FACTS_TOKEN_BUDGET = 1000;
const GRAPH_TOKEN_BUDGET = 500;
const STYLE_TOKEN_BUDGET = 1000;
const OPEN_LOOPS_TOKEN_BUDGET = 300;
const LOCAL_CHAPTER_WINDOW = 3;
const MESO_CHAPTER_WINDOW = 10;
const MESO_MILESTONE_LIMIT = 6;
const HISTORIAN_CONTEXT_EXTERNAL_ENABLED = readBoolEnv("HISTORIAN_CONTEXT_EXTERNAL_ENABLED", false);
const HISTORIAN_CONTEXT_NEO4J_ENABLED = readBoolEnv("HISTORIAN_CONTEXT_NEO4J_ENABLED", false);
const HISTORIAN_CONTEXT_QDRANT_ENABLED = readBoolEnv("HISTORIAN_CONTEXT_QDRANT_ENABLED", false);
const HISTORIAN_CONTEXT_TIMEOUT_MS = readIntEnv("HISTORIAN_CONTEXT_TIMEOUT_MS", 350, 100, 5000);
const HISTORIAN_CONTEXT_TOTAL_BUDGET_MS = readIntEnv("HISTORIAN_CONTEXT_TOTAL_BUDGET_MS", 800, 200, 10000);
const HISTORIAN_CONTEXT_QDRANT_THRESHOLD = readFloatEnv("HISTORIAN_CONTEXT_QDRANT_THRESHOLD", 0.65, 0, 1);
const HISTORIAN_CONTEXT_QDRANT_TOP_K = readIntEnv("HISTORIAN_CONTEXT_QDRANT_TOP_K", 12, 1, 64);
const HISTORIAN_CONTEXT_NEO4J_LIMIT = readIntEnv("HISTORIAN_CONTEXT_NEO4J_LIMIT", 15, 1, 64);
const HISTORIAN_CONTEXT_CAST_LIMIT = readIntEnv("HISTORIAN_CONTEXT_CAST_LIMIT", 12, 3, 64);
const HISTORIAN_CONTEXT_QDRANT_QUERY_CHARS = readIntEnv("HISTORIAN_CONTEXT_QDRANT_QUERY_CHARS", 1000, 200, 4000);
const HISTORIAN_MCP_BASE_URL = String(process.env.HISTORIAN_MCP_BASE_URL || "").trim().replace(/\/+$/, "");

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? (fallback ? "1" : "0")).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(String(process.env[name] ?? fallback), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function readFloatEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseFloat(String(process.env[name] ?? fallback));
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseTagTokens(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .split(/\s+/)) {
    const t = token.trim();
    if (t.length < 3 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 40);
}

function formatNum(v: number | null | undefined): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "0.000";
  return v.toFixed(3);
}

function estimateTokens(text: string): number {
  const compact = compactText(text);
  if (!compact) return 0;
  return Math.max(1, Math.ceil(compact.length / 4));
}

function enforceBudget(lines: string[], budgetTokens: number): string[] {
  if (budgetTokens <= 0) return [];
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = estimateTokens(line);
    if (used + cost > budgetTokens) break;
    kept.push(line);
    used += cost;
  }
  return kept;
}

function chapterNumeric(chapterId?: string | null): number | null {
  if (!chapterId) return null;
  const digits = chapterId.replace(/\D+/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(text: string): string {
  return compactText(text).toLowerCase();
}

function isLikelyPersonName(text: string): boolean {
  const value = compactText(text);
  if (!value) return false;
  const parts = value.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((p) => /^[A-Z][\p{L}\p{N}_'-]*$/u.test(p));
}

function countNeedle(haystack: string, needle: string): number {
  const hs = haystack.toLowerCase();
  const nd = needle.toLowerCase();
  if (!hs || !nd) return 0;
  let idx = 0;
  let hits = 0;
  while (true) {
    idx = hs.indexOf(nd, idx);
    if (idx < 0) return hits;
    hits += 1;
    idx += nd.length;
  }
}

async function loadLocalProseTail(db: Queryable, storyId: number, chapterIds: string[]): Promise<string> {
  if (chapterIds.length === 0) return "";
  try {
    const rs = await db.query<{ text_content: string | null }>(
      `SELECT COALESCE(v.text_content, '') AS text_content
       FROM public.narrative_scene s
       LEFT JOIN public.narrative_scene_version v ON v.id = s.current_version_id
       WHERE s.story_id = $1
         AND s.is_verified = true
         AND s.status <> 'ARCHIVED'
         AND s.chapter_id = ANY($2::text[])
       ORDER BY s.id DESC
       LIMIT 24`,
      [storyId, chapterIds]
    );
    const text = compactText(rs.rows.map((row) => row.text_content || "").join("\n"));
    if (!text) return "";
    return text.slice(Math.max(0, text.length - HISTORIAN_CONTEXT_QDRANT_QUERY_CHARS));
  } catch {
    return "";
  }
}

function synthesizeSemanticQuery(localProseTail: string, keywordBlob: string): string {
  const combined = compactText([localProseTail, keywordBlob].filter(Boolean).join(" "));
  if (!combined) return "";
  return combined.slice(Math.max(0, combined.length - HISTORIAN_CONTEXT_QDRANT_QUERY_CHARS));
}

async function postBridgeJson(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  globalSignal: AbortSignal
): Promise<{ ok: true; body: Record<string, unknown>; latencyMs: number } | { ok: false; code: "TIMEOUT" | "UNAVAILABLE" | "BAD_PAYLOAD"; latencyMs: number; message: string }> {
  const startedAt = Date.now();
  if (!HISTORIAN_MCP_BASE_URL) {
    return { ok: false, code: "UNAVAILABLE", latencyMs: 0, message: "HISTORIAN_MCP_BASE_URL_MISSING" };
  }

  const controller = new AbortController();
  const onGlobalAbort = () => controller.abort();
  globalSignal.addEventListener("abort", onGlobalAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), Math.max(50, timeoutMs));
  try {
    const res = await fetch(`${HISTORIAN_MCP_BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      return { ok: false, code: "UNAVAILABLE", latencyMs, message: `HTTP_${res.status}` };
    }
    const body = (await res.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, code: "BAD_PAYLOAD", latencyMs, message: "NON_OBJECT_JSON" };
    }
    return { ok: true, body: body as Record<string, unknown>, latencyMs };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startedAt;
    if (controller.signal.aborted || globalSignal.aborted) {
      return { ok: false, code: "TIMEOUT", latencyMs, message: "ABORTED_OR_TIMEOUT" };
    }
    return {
      ok: false,
      code: "UNAVAILABLE",
      latencyMs,
      message: error instanceof Error ? error.message : "FETCH_FAILED",
    };
  } finally {
    clearTimeout(timer);
    globalSignal.removeEventListener("abort", onGlobalAbort);
  }
}

function formatNeo4jEdge(edge: Neo4jEdge): RelationshipLineItem | null {
  const src = compactText(edge.src);
  const rel = compactText(edge.rel || "RELATES_TO").toUpperCase();
  const dst = compactText(edge.dst);
  if (!src || !dst) return null;
  const weight = Number.isFinite(edge.weight) ? Math.max(0, Math.min(1, edge.weight)) : 0;
  const hop = Number.isFinite(edge.hop) ? Math.max(1, Math.min(4, Math.floor(edge.hop))) : 1;
  const key = `${normalizeKey(src)}|${normalizeKey(rel)}|${normalizeKey(dst)}`;
  return {
    line: `- (${rel}|cf:${weight.toFixed(2)}|hop:${hop}) ${src} -> ${dst}`,
    key,
    source: "neo4j",
    weight,
    hop,
    personToPerson: isLikelyPersonName(src) && isLikelyPersonName(dst),
  };
}

function parseRelationshipLine(line: string): RelationshipLineItem | null {
  const parsed = line.match(/^\-\s+\(([^|)]+).*?\)\s+(.+?)\s+\-\>\s+(.+)$/);
  if (!parsed) return null;
  const rel = compactText(parsed[1] || "RELATES_TO").toUpperCase();
  const src = compactText(parsed[2] || "");
  const dst = compactText(parsed[3] || "");
  if (!src || !dst) return null;
  const key = `${normalizeKey(src)}|${normalizeKey(rel)}|${normalizeKey(dst)}`;
  return {
    line,
    key,
    source: "postgres",
    weight: 0.5,
    hop: 1,
    personToPerson: isLikelyPersonName(src) && isLikelyPersonName(dst),
  };
}

function trimRelationshipByPolicy(items: RelationshipLineItem[], budgetTokens: number): string[] {
  if (budgetTokens <= 0 || items.length === 0) return [];
  const tokenCost = (it: RelationshipLineItem) => estimateTokens(it.line);
  const totalTokens = (arr: RelationshipLineItem[]) => arr.reduce((sum, it) => sum + tokenCost(it), 0);
  const dropBy = (
    arr: RelationshipLineItem[],
    pred: (it: RelationshipLineItem) => boolean,
    cmp: (a: RelationshipLineItem, b: RelationshipLineItem) => number
  ): RelationshipLineItem[] => {
    if (totalTokens(arr) <= budgetTokens) return arr;
    const removable = arr.filter(pred).sort(cmp);
    if (removable.length === 0) return arr;
    const removeSet = new Set<string>();
    let current = totalTokens(arr);
    for (const it of removable) {
      if (current <= budgetTokens) break;
      removeSet.add(it.key);
      current -= tokenCost(it);
    }
    return arr.filter((it) => !removeSet.has(it.key));
  };

  let working = [...items];
  working = dropBy(working, (it) => it.hop === 2, (a, b) => a.weight - b.weight);
  working = dropBy(working, () => true, (a, b) => a.weight - b.weight);
  working = dropBy(working, (it) => !it.personToPerson, (a, b) => a.weight - b.weight);

  if (totalTokens(working) > budgetTokens) {
    return enforceBudget(working.map((x) => x.line), budgetTokens);
  }
  return working.map((x) => x.line);
}

function flattenStyleJson(prefix: string, value: unknown, out: string[], depth = 0): void {
  if (depth > 2) return;
  if (value === null || value === undefined) return;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    out.push(`- ${prefix}: ${String(value)}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    const rendered = value
      .slice(0, 6)
      .map((x) => (typeof x === "string" ? compactText(x) : JSON.stringify(x)))
      .join(" | ");
    out.push(`- ${prefix}: ${rendered}`);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenStyleJson(`${prefix}.${k}`, v, out, depth + 1);
    }
  }
}

function renderWorldLine(row: WorldRow): string {
  const tags = Array.isArray(row.tags) && row.tags.length > 0 ? ` | tags:${row.tags.join(",")}` : "";
  return `- [wb:${row.id}] (${row.category}|imp:${row.importance}${tags}) ${compactText(row.content)}`;
}

async function buildKeywordBlob(db: Queryable, storyId: number, sceneId?: number, workunitId?: string, keywords?: string): Promise<string> {
  const explicitKeywords = compactText(keywords ?? "");
  const sceneCtxRes = await db.query<{
    text_content: string | null;
    summary: string | null;
    beats_json: unknown | null;
  }>(
    `SELECT v.text_content, v.summary, v.beats_json
     FROM public.narrative_scene s
     JOIN public.narrative_scene_version v ON v.id = s.current_version_id
     WHERE s.story_id = $1
       AND (
         ($2::bigint IS NOT NULL AND s.id = $2::bigint)
         OR
         ($3::text <> '' AND s.workunit_id = $3::text)
       )
     ORDER BY s.id DESC
     LIMIT 1`,
    [storyId, sceneId ?? null, workunitId ?? ""]
  );
  const sceneBlob = sceneCtxRes.rowCount
    ? compactText(
      [
        sceneCtxRes.rows[0].text_content ?? "",
        sceneCtxRes.rows[0].summary ?? "",
        JSON.stringify(sceneCtxRes.rows[0].beats_json ?? {}),
      ].join(" ")
    ).slice(0, 1600)
    : "";
  return compactText([explicitKeywords, sceneBlob].filter(Boolean).join(" "));
}

async function fetchStyleLines(db: Queryable, storyId: number, sceneId?: number): Promise<string[]> {
  try {
    const mined = await db.query<AuthorStyleProfileRow>(
      `SELECT profile_json
       FROM public.author_style_profile
       WHERE story_id = $1
       LIMIT 1`,
      [storyId]
    );
    if (mined.rowCount) {
      const style = mined.rows[0].profile_json as Record<string, unknown>;
      const lines: string[] = ["- tone_baseline: mined_from_ingest"];
      flattenStyleJson("paragraph", style?.paragraph, lines);
      flattenStyleJson("dialogue", style?.dialogue, lines);
      flattenStyleJson("sentences", style?.sentences, lines);
      flattenStyleJson("punctuation_per_1k", style?.punctuation_per_1k, lines);
      if (lines.length > 1) return lines.slice(0, 20);
    }
  } catch { }

  if (sceneId) {
    try {
      const rs = await db.query<SceneStyleRow>(
        `SELECT p.sentence_complexity, p.dialogue_ratio, p.metaphor_density,
                p.sensory_sight, p.sensory_sound, p.sensory_touch, p.sensory_smell, p.sensory_taste
         FROM public.style_profile_scene p
         WHERE p.story_id = $1
           AND p.scene_id = $2
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT 1`,
        [storyId, sceneId]
      );
      if (rs.rowCount) {
        const row = rs.rows[0];
        return [
          "- tone_baseline: memory_v1",
          `- sentence_complexity: ${formatNum(row.sentence_complexity)}`,
          `- dialogue_ratio: ${formatNum(row.dialogue_ratio)}`,
          `- metaphor_density: ${formatNum(row.metaphor_density)}`,
          `- sensory_sight: ${formatNum(row.sensory_sight)}`,
          `- sensory_sound: ${formatNum(row.sensory_sound)}`,
          `- sensory_touch: ${formatNum(row.sensory_touch)}`,
          `- sensory_smell: ${formatNum(row.sensory_smell)}`,
          `- sensory_taste: ${formatNum(row.sensory_taste)}`,
        ];
      }
    } catch { }
  }

  try {
    const rs = await db.query<StyleProfileRow>(
      `SELECT tone_baseline, darkness_level, political_intensity, pacing_bias, prose_density
       FROM public.story_style_profile
       WHERE story_id = $1
       LIMIT 1`,
      [storyId]
    );
    if (rs.rowCount === 0) {
      return [
        "- tone_baseline: (default)",
        "- darkness_level: 50",
        "- political_intensity: 50",
        "- pacing_bias: 50",
        "- prose_density: 50",
      ];
    }
    const row = rs.rows[0];
    return [
      `- tone_baseline: ${compactText(row.tone_baseline || "(default)")}`,
      `- darkness_level: ${row.darkness_level}`,
      `- political_intensity: ${row.political_intensity}`,
      `- pacing_bias: ${row.pacing_bias}`,
      `- prose_density: ${row.prose_density}`,
    ];
  } catch {
    return [
      "- tone_baseline: (default)",
      "- darkness_level: 50",
      "- political_intensity: 50",
      "- pacing_bias: 50",
      "- prose_density: 50",
    ];
  }
}

export async function buildStoryContextPack(db: Queryable, input: StoryContextInput): Promise<StoryContextPack> {
  const keywordBlob = await buildKeywordBlob(db, input.storyId, input.sceneId, input.workunitId, input.keywords);
  const tagTokens = parseTagTokens(keywordBlob);
  const styleLines = await fetchStyleLines(db, input.storyId, input.sceneId);
  const targetChapterId = (input.chapterId ?? "").trim();
  const targetChapterNum = chapterNumeric(targetChapterId);
  let localChapterIds: string[] = [];
  try {
    const chapterRes = await db.query<{ chapter_id: string }>(
      `SELECT chapter_id
       FROM public.story_chapter
       WHERE story_id = $1
       ORDER BY id ASC`,
      [input.storyId]
    );
    const ordered = chapterRes.rows.map((row) => compactText(row.chapter_id)).filter(Boolean);
    if (ordered.length > 0) {
      const idx = targetChapterId && ordered.includes(targetChapterId)
        ? ordered.indexOf(targetChapterId)
        : ordered.length - 1;
      const start = Math.max(0, idx - (LOCAL_CHAPTER_WINDOW - 1));
      localChapterIds = ordered.slice(start, idx + 1);
    } else if (targetChapterId) {
      localChapterIds = [targetChapterId];
    }
  } catch {
    if (targetChapterId) localChapterIds = [targetChapterId];
  }
  const localProseTail = await loadLocalProseTail(db, input.storyId, localChapterIds);

  const storyMetaRes = await db.query<{ description_md: string | null }>(
    `SELECT description_md FROM public.story_series WHERE id = $1 LIMIT 1`,
    [input.storyId]
  );
  const rawDescription = storyMetaRes.rows[0]?.description_md;
  let summaryOverviewLine = "";
  if (rawDescription && rawDescription.trim().length > 0) {
    summaryOverviewLine = renderWorldLine({
      id: 0,
      category: "overview",
      importance: 100,
      tags: ["pitch"],
      content: compactText(rawDescription).slice(0, 500)
    });
  }

  const worldCoreRes = await db.query<WorldRow>(
    `SELECT id, category, content, importance, tags
     FROM public.story_worldbuilding_note
     WHERE story_id = $1
       AND injection_mode = 'CORE'
     ORDER BY importance DESC, updated_at DESC, id DESC
     LIMIT $2`,
    [input.storyId, MAX_WORLD_ROWS]
  );

  const worldTaggedRes = await db.query<WorldRow>(
    `SELECT id, category, content, importance, tags
     FROM public.story_worldbuilding_note
     WHERE story_id = $1
       AND injection_mode = 'TAGGED'
       AND (
         ($2 <> '' AND content_tsv @@ plainto_tsquery('simple', unaccent($2)))
         OR
         (cardinality($3::text[]) > 0 AND tags && $3::text[])
       )
     ORDER BY importance DESC, updated_at DESC, id DESC
     LIMIT $4`,
    [input.storyId, keywordBlob, tagTokens, MAX_WORLD_ROWS]
  );

  const globalCanonLines: string[] = [];
  const localCanonLines: string[] = [];
  const otherCanonLines: string[] = [];
  const postgresRelationshipLines: string[] = [];
  const localCanonSubjects: string[] = [];
  let canonRows = 0;
  try {
    const memoryCanonRes = await db.query<MemoryCanonRow>(
      `SELECT
         f.subject,
         f.predicate,
         f.object,
         f.confidence,
         f.tags,
         s.chapter_id,
         COALESCE(f.classification, CASE WHEN COALESCE(f.is_static, false) THEN 'STATIC' ELSE 'EPHEMERAL' END) AS classification,
         COALESCE(f.is_static, false) AS is_static
       FROM public.canon_fact f
       JOIN public.narrative_scene s ON s.id = f.scene_id
       WHERE f.story_id = $1 AND s.is_verified = true
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT $2`,
      [input.storyId, MAX_CANON_ROWS]
    );
    canonRows = memoryCanonRes.rowCount ?? 0;
    for (const row of memoryCanonRes.rows) {
      const tags = row.tags && row.tags.length > 0 ? `|${row.tags.join(",")}` : "";
      const line = `- (${row.predicate}|cf:${Number(row.confidence ?? 0).toFixed(2)}${tags}) ${compactText(row.subject)} -> ${compactText(row.object)}`;
      const subject = compactText(row.subject || "");
      if (row.chapter_id && localChapterIds.includes(row.chapter_id) && subject) {
        localCanonSubjects.push(subject);
      }
      if ((row.tags ?? []).includes("relationship") || row.predicate.toLowerCase().includes("relationship")) postgresRelationshipLines.push(line);
      else if (Boolean(row.is_static) || String(row.classification ?? "").toUpperCase() === "STATIC") globalCanonLines.push(line);
      else if (row.chapter_id && localChapterIds.includes(row.chapter_id)) localCanonLines.push(line);
      else otherCanonLines.push(line);
    }
  } catch {
    const fallbackCanonLines: string[] = [];
    const legacyCanonRes = await db.query<LegacyCanonRow>(
      `WITH ranked AS (
         SELECT id, category, content, importance,
           CASE WHEN $2 <> '' AND content_tsv @@ plainto_tsquery('simple', unaccent($2)) THEN 0 ELSE 1 END AS rank_bucket
         FROM public.story_canon_fact
         WHERE story_id = $1
       )
       SELECT id, category, content, importance
       FROM ranked
       ORDER BY rank_bucket ASC, importance DESC, id DESC
       LIMIT $3`,
      [input.storyId, keywordBlob, MAX_CANON_ROWS]
    );
    canonRows = legacyCanonRes.rowCount ?? 0;
    for (const row of legacyCanonRes.rows) {
      const line = `- [${row.id}] (${row.category}|imp:${row.importance}) ${compactText(row.content)}`;
      if (row.category === "relationship") postgresRelationshipLines.push(line);
      else fallbackCanonLines.push(line);
    }
    otherCanonLines.push(...fallbackCanonLines);
  }

  const milestoneLines: string[] = [];
  try {
    let milestoneRows: Array<{
      chapter_from: number;
      chapter_to: number;
      summary_json: unknown;
      quality_score: number | null;
    }> = [];
    if (typeof targetChapterNum === "number") {
      const lower = Math.max(1, targetChapterNum - MESO_CHAPTER_WINDOW);
      const res = await db.query<{
        chapter_from: number;
        chapter_to: number;
        summary_json: unknown;
        quality_score: number | null;
      }>(
        `SELECT chapter_from, chapter_to, summary_json, quality_score
         FROM public.story_milestone
         WHERE story_id = $1
           AND chapter_to < $2
           AND chapter_to >= $3
         ORDER BY chapter_to DESC, id DESC
         LIMIT $4`,
        [input.storyId, targetChapterNum, lower, MESO_MILESTONE_LIMIT]
      );
      milestoneRows = res.rows;
    } else {
      const res = await db.query<{
        chapter_from: number;
        chapter_to: number;
        summary_json: unknown;
        quality_score: number | null;
      }>(
        `SELECT chapter_from, chapter_to, summary_json, quality_score
         FROM public.story_milestone
         WHERE story_id = $1
         ORDER BY chapter_to DESC, id DESC
         LIMIT $2`,
        [input.storyId, MESO_MILESTONE_LIMIT]
      );
      milestoneRows = res.rows;
    }
    for (const row of milestoneRows) {
      const summary = typeof row.summary_json === "object" && row.summary_json !== null
        ? JSON.stringify(row.summary_json)
        : String(row.summary_json ?? "");
      const quality = typeof row.quality_score === "number" ? row.quality_score.toFixed(2) : "n/a";
      milestoneLines.push(
        `- [milestone ch${row.chapter_from}-ch${row.chapter_to}|q:${quality}] ${compactText(summary).slice(0, 260)}`
      );
    }
  } catch {
    // story_milestone is optional before migration rollout.
  }

  let timelineLines: string[] = [];
  let timelineRows = 0;
  try {
    const timelineAnchorRes = await db.query<TimelineAnchorRow>(
      `SELECT a.event_label, a.relative_time, a.absolute_time, a.location, a.participants
       FROM public.timeline_anchor a
       JOIN public.narrative_scene s ON s.id = a.scene_id
       WHERE a.story_id = $1 AND s.is_verified = true
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $2`,
      [input.storyId, MAX_TIMELINE_ROWS]
    );
    timelineRows = timelineAnchorRes.rowCount ?? 0;
    timelineLines = timelineAnchorRes.rows.map((row) => {
      const t = row.absolute_time || row.relative_time || "n/a";
      const loc = row.location ? ` | loc:${compactText(row.location)}` : "";
      const ppl = row.participants && row.participants.length > 0 ? ` | cast:${row.participants.join(",")}` : "";
      return `- (${t}${loc}${ppl}) ${compactText(row.event_label)}`;
    });
  } catch {
    const legacyTimelineRes = await db.query<LegacyTimelineRow>(
      `SELECT id, event_key, title, body, start_ts, end_ts
       FROM public.timeline_event
       WHERE story_id = $1
       ORDER BY COALESCE(start_ts, updated_at) DESC, id DESC
       LIMIT $2`,
      [input.storyId, MAX_TIMELINE_ROWS]
    );
    timelineRows = legacyTimelineRes.rowCount ?? 0;
    timelineLines = legacyTimelineRes.rows.map((ev) => {
      const title = ev.title ? compactText(ev.title) : "(untitled)";
      const body = compactText(ev.body).slice(0, 220);
      const ts = ev.start_ts ?? ev.end_ts ?? "n/a";
      const key = ev.event_key ?? `event:${ev.id}`;
      return `- [${key}] (${ts}) ${title} :: ${body}`;
    });
  }

  let relationshipRowsNeo4j = 0;
  let worldTaggedRowsQdrant = 0;
  const retrievalWarnings: string[] = [];
  let neo4jLatencyMs = 0;
  let qdrantLatencyMs = 0;
  let externalTotalLatencyMs = 0;
  let externalStatus: "full" | "partial" | "fallback_postgres" = "fallback_postgres";
  const worldTaggedLinesPg = worldTaggedRes.rows.map(renderWorldLine);
  let mergedRelationshipLines = [...postgresRelationshipLines];
  let mergedWorldTaggedLines = [...worldTaggedLinesPg];

  if (HISTORIAN_CONTEXT_EXTERNAL_ENABLED && HISTORIAN_MCP_BASE_URL) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const deadlineTimer = setTimeout(() => controller.abort(), HISTORIAN_CONTEXT_TOTAL_BUDGET_MS);
    let attempted = 0;
    let success = 0;
    try {
      const localProseLower = localProseTail.toLowerCase();
      const castScoreMap = new Map<string, number>();
      for (const subject of localCanonSubjects) {
        const key = compactText(subject);
        if (!key) continue;
        const score = 10 + countNeedle(localProseLower, key.toLowerCase());
        castScoreMap.set(key, Math.max(castScoreMap.get(key) ?? 0, score));
      }
      if (castScoreMap.size === 0) {
        for (const token of tagTokens) {
          if (!token) continue;
          castScoreMap.set(token, Math.max(castScoreMap.get(token) ?? 0, 1));
        }
      }
      const cast = [...castScoreMap.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name]) => name)
        .slice(0, HISTORIAN_CONTEXT_CAST_LIMIT);

      const semanticQueryText = synthesizeSemanticQuery(localProseTail, keywordBlob);

      const neoPromise = async () => {
        if (!HISTORIAN_CONTEXT_NEO4J_ENABLED || cast.length === 0) return null;
        attempted += 1;
        const result = await postBridgeJson(
          "/v1/historian/neo4j-neighborhood",
          {
            story_id: input.storyId,
            cast,
            depth: 2,
            limit: HISTORIAN_CONTEXT_NEO4J_LIMIT,
            min_weight: 0,
          },
          HISTORIAN_CONTEXT_TIMEOUT_MS,
          controller.signal
        );
        neo4jLatencyMs = result.latencyMs;
        if (!result.ok) {
          retrievalWarnings.push(`neo4j:${result.code}`);
          return null;
        }
        const ok = Boolean(result.body.ok);
        if (!ok) {
          retrievalWarnings.push(`neo4j:BAD_PAYLOAD`);
          return null;
        }
        const edgesRaw = Array.isArray(result.body.edges) ? result.body.edges : [];
        const neoItems: RelationshipLineItem[] = [];
        for (const row of edgesRaw) {
          if (!row || typeof row !== "object" || Array.isArray(row)) continue;
          const edge: Neo4jEdge = {
            src: String((row as Record<string, unknown>).src || ""),
            rel: String((row as Record<string, unknown>).rel || ""),
            dst: String((row as Record<string, unknown>).dst || ""),
            weight: Number((row as Record<string, unknown>).weight ?? 0),
            hop: Number((row as Record<string, unknown>).hop ?? 1),
          };
          const formatted = formatNeo4jEdge(edge);
          if (formatted) neoItems.push(formatted);
        }
        relationshipRowsNeo4j = neoItems.length;
        success += 1;
        return neoItems;
      };

      const qdrantPromise = async () => {
        if (!HISTORIAN_CONTEXT_QDRANT_ENABLED || !semanticQueryText) return null;
        attempted += 1;
        const result = await postBridgeJson(
          "/v1/historian/qdrant-semantic-search",
          {
            story_id: input.storyId,
            query_text: semanticQueryText,
            collection: "story_worldbuilding",
            top_k: HISTORIAN_CONTEXT_QDRANT_TOP_K,
            threshold: HISTORIAN_CONTEXT_QDRANT_THRESHOLD,
          },
          HISTORIAN_CONTEXT_TIMEOUT_MS,
          controller.signal
        );
        qdrantLatencyMs = result.latencyMs;
        if (!result.ok) {
          retrievalWarnings.push(`qdrant:${result.code}`);
          return null;
        }
        const ok = Boolean(result.body.ok);
        if (!ok) {
          retrievalWarnings.push("qdrant:BAD_PAYLOAD");
          return null;
        }
        const matchesRaw = Array.isArray(result.body.matches) ? result.body.matches : [];
        const matches: QdrantMatch[] = [];
        for (const row of matchesRaw) {
          if (!row || typeof row !== "object" || Array.isArray(row)) continue;
          const rec = row as Record<string, unknown>;
          const score = Number(rec.score ?? 0);
          if (!Number.isFinite(score) || score < HISTORIAN_CONTEXT_QDRANT_THRESHOLD) continue;
          const content = compactText(String(rec.content || ""));
          if (!content) continue;
          const tags = Array.isArray(rec.tags) ? rec.tags.map((x) => compactText(String(x))).filter(Boolean).slice(0, 6) : [];
          matches.push({
            id: compactText(String(rec.id || "")) || "unknown",
            content,
            score: Math.max(0, Math.min(1, score)),
            tags,
            category: compactText(String(rec.category || "semantic")),
          });
        }
        worldTaggedRowsQdrant = matches.length;
        success += 1;
        return matches;
      };

      const [neoSettled, qdrantSettled] = await Promise.allSettled([neoPromise(), qdrantPromise()]);
      const neoItems = neoSettled.status === "fulfilled" ? neoSettled.value : null;
      const qdrantItems = qdrantSettled.status === "fulfilled" ? qdrantSettled.value : null;

      if (neoSettled.status === "rejected") retrievalWarnings.push("neo4j:UNAVAILABLE");
      if (qdrantSettled.status === "rejected") retrievalWarnings.push("qdrant:UNAVAILABLE");

      if (Array.isArray(neoItems) && neoItems.length > 0) {
        const map = new Map<string, RelationshipLineItem>();
        for (const line of postgresRelationshipLines) {
          const parsed = parseRelationshipLine(line);
          if (parsed) map.set(parsed.key, parsed);
        }
        for (const neo of neoItems) {
          const existing = map.get(neo.key);
          if (!existing || existing.source !== "neo4j") map.set(neo.key, neo);
        }
        mergedRelationshipLines = trimRelationshipByPolicy([...map.values()], GRAPH_TOKEN_BUDGET);
      }

      if (Array.isArray(qdrantItems) && qdrantItems.length > 0) {
        const qdrantLines = qdrantItems.map((m) => {
          const tagText = m.tags.length > 0 ? `|tags:${m.tags.join(",")}` : "";
          return `- [qdr:${m.id}|score:${m.score.toFixed(2)}|cat:${m.category}${tagText}] ${m.content}`;
        });
        const seen = new Set<string>();
        const merged: string[] = [];
        for (const line of [...qdrantLines, ...worldTaggedLinesPg]) {
          const key = normalizeKey(line.replace(/\[qdr:[^\]]+\]\s*/g, ""));
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(line);
        }
        mergedWorldTaggedLines = merged;
      }

      if (attempted > 0) {
        externalStatus = success === attempted ? "full" : success > 0 ? "partial" : "fallback_postgres";
      }
      const totalExternalMs = Date.now() - startedAt;
      externalTotalLatencyMs = totalExternalMs;
      if (totalExternalMs > HISTORIAN_CONTEXT_TOTAL_BUDGET_MS) retrievalWarnings.push("external:TIME_BUDGET_EXCEEDED");
    } finally {
      clearTimeout(deadlineTimer);
      if (!neo4jLatencyMs) neo4jLatencyMs = 0;
      if (!qdrantLatencyMs) qdrantLatencyMs = 0;
    }
  } else {
    if (!HISTORIAN_CONTEXT_EXTERNAL_ENABLED) retrievalWarnings.push("external:DISABLED");
    else if (!HISTORIAN_MCP_BASE_URL) retrievalWarnings.push("external:MCP_BASE_MISSING");
  }

  const resolvedWorldCoreLines = worldCoreRes.rows.map(renderWorldLine);
  if (summaryOverviewLine) {
    resolvedWorldCoreLines.unshift(summaryOverviewLine);
  }

  const historianGuidance: string[] = [];
  try {
    const historianRes = await db.query<{
      fact_status: string;
      emotional_target: string | null;
      open_loops: unknown;
      ready_for_writing: boolean;
      degraded_mode: boolean;
      snapshot_id: number;
      completeness_json: unknown;
    }>(
      `SELECT
         s.fact_status,
         s.emotional_target,
         s.open_loops,
         s.ready_for_writing,
         s.degraded_mode,
         s.id AS snapshot_id,
         s.completeness_json
       FROM public.story_active_analysis_snapshot a
       JOIN public.writing_snapshot_v3 s
         ON s.id = a.snapshot_id
        AND s.story_id = a.story_id
       WHERE a.story_id = $1
         AND ($2::text = '' OR a.chapter_id = $2::text)
         AND s.approval_status = 'APPROVED'
         AND s.ready_for_writing = true
       ORDER BY a.updated_at DESC, s.created_at DESC, s.id DESC
       LIMIT 1`,
      [input.storyId, (input.chapterId ?? "").trim()]
    );
    if (historianRes.rowCount) {
      const row = historianRes.rows[0];
      historianGuidance.push(`[HISTORIAN_STATUS]: Fact status is currently ${row.fact_status}.`);
      historianGuidance.push(`[HISTORIAN_SNAPSHOT]: Using clean snapshot #${row.snapshot_id}.`);
      if (row.emotional_target) {
        historianGuidance.push(`[HISTORIAN_TARGET]: Aim for ${row.emotional_target} in this scene.`);
      }
      if (Array.isArray(row.open_loops) && row.open_loops.length > 0) {
        historianGuidance.push(`[HISTORIAN_REMINDER]: unresolved loops: ${row.open_loops.slice(0, 3).join(", ")}`);
      }
      if (row.completeness_json && typeof row.completeness_json === "object" && !Array.isArray(row.completeness_json)) {
        const missing = Object.entries(row.completeness_json as Record<string, unknown>)
          .filter(([, v]) => !Boolean(v))
          .map(([k]) => k);
        if (missing.length > 0) {
          historianGuidance.push(`[HISTORIAN_WARN]: missing dimensions ${missing.join(", ")}.`);
        }
      }
    } else {
      try {
        const scopeRes = await db.query<{
          scope_type: string;
          scope_key: string;
          fact_status: string;
          ready_for_writing: boolean;
          narrative_score: string | number | null;
          snapshot_json: unknown;
          snapshot_id: number;
        }>(
          `SELECT
             s.scope_type,
             s.scope_key,
             s.fact_status,
             s.ready_for_writing,
             s.narrative_score::text AS narrative_score,
             s.snapshot_json,
             s.id AS snapshot_id
           FROM public.writing_scope_snapshot_v1 s
           JOIN public.story_active_analysis_scope_snapshot a
             ON a.story_id = s.story_id
            AND a.snapshot_id = s.id
            AND a.scope_type = s.scope_type
            AND a.scope_key = s.scope_key
           WHERE s.story_id = $1
              AND s.scope_type = 'story'
              AND s.scope_key = 'story:all'
              AND s.approval_status = 'APPROVED'
              AND s.ready_for_writing = true
            ORDER BY a.updated_at DESC, s.created_at DESC
            LIMIT 1`,
          [input.storyId]
        );
        if (scopeRes.rowCount) {
          const row = scopeRes.rows[0];
          historianGuidance.push(`[HISTORIAN_STATUS]: Fallback to approved ${row.scope_type} aggregate (${row.scope_key}) with status ${row.fact_status}.`);
          historianGuidance.push(`[HISTORIAN_SNAPSHOT]: Using aggregate snapshot #${row.snapshot_id}.`);
          const score = Number(row.narrative_score ?? 0);
          if (Number.isFinite(score) && score > 0) {
            historianGuidance.push(`[HISTORIAN_SCORE]: aggregate narrative score ${score.toFixed(3)}.`);
          }
          if (row.snapshot_json && typeof row.snapshot_json === "object" && !Array.isArray(row.snapshot_json)) {
            const coverage = (row.snapshot_json as Record<string, unknown>).coverage;
            if (coverage && typeof coverage === "object" && !Array.isArray(coverage)) {
              const total = Number((coverage as Record<string, unknown>).total ?? 0);
              const approved = Number((coverage as Record<string, unknown>).approved ?? 0);
              if (Number.isFinite(total) && total > 0) {
                historianGuidance.push(`[HISTORIAN_COVERAGE]: ${approved}/${total} chapters approved in story aggregate.`);
              }
            }
          }
        }
      } catch {
        // scope fallback is optional before migration 064
      }
    }
  } catch { }

  const prioritizedCanon = [
    ...globalCanonLines,
    ...localCanonLines,
    ...milestoneLines,
    ...otherCanonLines,
  ];

  const budgetedStyleLines = enforceBudget(styleLines, Math.floor(STYLE_TOKEN_BUDGET * 0.45));
  const worldCoreLines = enforceBudget(resolvedWorldCoreLines, Math.floor(STYLE_TOKEN_BUDGET * 0.35));
  const worldTaggedLines = enforceBudget(mergedWorldTaggedLines, Math.floor(STYLE_TOKEN_BUDGET * 0.2));
  const budgetedCanonLines = enforceBudget(prioritizedCanon, FACTS_TOKEN_BUDGET);
  const parsedRelationshipItems = mergedRelationshipLines
    .map((line) => parseRelationshipLine(line))
    .filter((x): x is RelationshipLineItem => Boolean(x));
  const budgetedRelationshipLines =
    parsedRelationshipItems.length > 0
      ? trimRelationshipByPolicy(parsedRelationshipItems, GRAPH_TOKEN_BUDGET)
      : enforceBudget(mergedRelationshipLines, GRAPH_TOKEN_BUDGET);
  const budgetedHistorianGuidance = enforceBudget(historianGuidance, OPEN_LOOPS_TOKEN_BUDGET);

  return {
    styleLines: budgetedStyleLines,
    worldCoreLines,
    worldTaggedLines,
    canonLines: budgetedCanonLines,
    relationshipLines: budgetedRelationshipLines,
    timelineLines,
    historianGuidance: budgetedHistorianGuidance,
    stats: {
      worldCoreRows: worldCoreRes.rowCount ?? 0,
      worldTaggedRows: worldTaggedRes.rowCount ?? 0,
      canonRows,
      timelineRows,
      relationshipRowsNeo4j,
      worldTaggedRowsQdrant,
      retrievalWarnings: retrievalWarnings.slice(0, 20),
      externalLatencyMs: {
        neo4j: neo4jLatencyMs,
        qdrant: qdrantLatencyMs,
        total: externalTotalLatencyMs,
      },
      externalRetrievalStatus: externalStatus,
    },
  };
}

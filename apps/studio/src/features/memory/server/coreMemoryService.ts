import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

export type CoreMemorySourceKind = "CANON_FACT" | "TIMELINE_ANCHOR" | "STORY_CANON_FACT";
export type CoreMemoryReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CoreMemoryReviewActionKind = "APPROVE" | "REJECT" | "RESET_TO_PENDING";

export type CoreMemoryItem = {
  source_kind: CoreMemorySourceKind;
  source_id: number;
  chapter_id: string | null;
  scene_id: number | null;
  entity_type: string | null;
  classification: string | null;
  subject: string | null;
  predicate: string | null;
  object: string | null;
  event_label: string | null;
  location: string | null;
  participants: string[];
  content: string | null;
  confidence: number;
  source_trace: Record<string, unknown>;
  review_status: CoreMemoryReviewStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  duplicate_count: number;
  normalize_key: string;
};

type ListFilters = {
  status?: string;
  source_kind?: string;
  entity_type?: string;
  classification?: string;
  chapter_id?: string;
  q?: string;
  limit?: string | number;
  cursor?: string | number;
};

type ReviewActionInput = {
  source_kind?: unknown;
  source_id?: unknown;
  action?: unknown;
  note?: unknown;
};

const SOURCE_KINDS: CoreMemorySourceKind[] = ["CANON_FACT", "TIMELINE_ANCHOR", "STORY_CANON_FACT"];
const REVIEW_STATUSES: CoreMemoryReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const REVIEW_ACTIONS: CoreMemoryReviewActionKind[] = ["APPROVE", "REJECT", "RESET_TO_PENDING"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function asUpper(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function parseSourceKind(value: unknown): CoreMemorySourceKind | null {
  const text = asUpper(value) as CoreMemorySourceKind;
  return SOURCE_KINDS.includes(text) ? text : null;
}

function parseReviewStatus(value: unknown): CoreMemoryReviewStatus | null {
  const text = asUpper(value) as CoreMemoryReviewStatus;
  return REVIEW_STATUSES.includes(text) ? text : null;
}

function parseReviewAction(value: unknown): CoreMemoryReviewActionKind | null {
  const text = asUpper(value) as CoreMemoryReviewActionKind;
  return REVIEW_ACTIONS.includes(text) ? text : null;
}

function toTargetStatus(action: CoreMemoryReviewActionKind): CoreMemoryReviewStatus {
  if (action === "APPROVE") return "APPROVED";
  if (action === "REJECT") return "REJECTED";
  return "PENDING";
}

function normalizeKey(item: Omit<CoreMemoryItem, "duplicate_count" | "normalize_key">): string {
  const base = item.source_kind === "TIMELINE_ANCHOR"
    ? `${item.event_label || ""}|${item.location || ""}|${(item.participants || []).join(",")}`
    : `${item.subject || ""}|${item.predicate || ""}|${item.object || item.content || ""}`;
  return base.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 400);
}

function appendDuplicateCounts(items: Omit<CoreMemoryItem, "duplicate_count" | "normalize_key">[]): CoreMemoryItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalizeKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return items.map((item) => {
    const key = normalizeKey(item);
    return {
      ...item,
      normalize_key: key,
      duplicate_count: counts.get(key) || 1,
    };
  });
}

function buildUnifiedCte() {
  return `
    WITH core_union AS (
      SELECT
        'CANON_FACT'::text AS source_kind,
        f.id AS source_id,
        s.chapter_id AS chapter_id,
        f.scene_id AS scene_id,
        COALESCE(NULLIF(f.entity_type, ''), 'OTHER')::text AS entity_type,
        COALESCE(NULLIF(f.classification, ''), 'STATIC')::text AS classification,
        f.subject,
        f.predicate,
        f.object,
        NULL::text AS event_label,
        NULL::text AS location,
        ARRAY[]::text[] AS participants,
        NULL::text AS content,
        COALESCE(f.confidence::float8, 0)::float8 AS confidence,
        COALESCE(f.source_trace, '{}'::jsonb) AS source_trace,
        f.created_at AS created_at
      FROM public.canon_fact f
      LEFT JOIN public.narrative_scene s
        ON s.id = f.scene_id AND s.story_id = f.story_id
      WHERE f.story_id = $1

      UNION ALL

      SELECT
        'TIMELINE_ANCHOR'::text AS source_kind,
        t.id AS source_id,
        s.chapter_id AS chapter_id,
        t.scene_id AS scene_id,
        NULL::text AS entity_type,
        NULL::text AS classification,
        NULL::text AS subject,
        NULL::text AS predicate,
        NULL::text AS object,
        t.event_label,
        t.location,
        COALESCE(t.participants, ARRAY[]::text[]) AS participants,
        NULL::text AS content,
        1::float8 AS confidence,
        COALESCE(t.source_trace, '{}'::jsonb) AS source_trace,
        t.created_at AS created_at
      FROM public.timeline_anchor t
      LEFT JOIN public.narrative_scene s
        ON s.id = t.scene_id AND s.story_id = t.story_id
      WHERE t.story_id = $1

      UNION ALL

      SELECT
        'STORY_CANON_FACT'::text AS source_kind,
        scf.id AS source_id,
        NULL::text AS chapter_id,
        NULL::bigint AS scene_id,
        NULL::text AS entity_type,
        NULL::text AS classification,
        scf.category::text AS subject,
        'states'::text AS predicate,
        scf.content::text AS object,
        NULL::text AS event_label,
        NULL::text AS location,
        ARRAY[]::text[] AS participants,
        scf.content::text AS content,
        LEAST(1::float8, GREATEST(0.2::float8, (COALESCE(scf.importance, 3)::float8 / 5::float8))) AS confidence,
        jsonb_build_object(
          'source_ref', COALESCE(scf.source_ref, ''),
          'category', COALESCE(scf.category, ''),
          'importance', COALESCE(scf.importance, 3)
        ) AS source_trace,
        scf.created_at AS created_at
      FROM public.story_canon_fact scf
      WHERE scf.story_id = $1
    ),
    unified AS (
      SELECT
        cu.*,
        COALESCE(v.review_status, 'PENDING')::text AS review_status,
        v.review_note,
        v.reviewed_by,
        v.reviewed_at
      FROM core_union cu
      LEFT JOIN public.core_memory_vetting_state v
        ON v.story_id = $1
       AND v.source_kind = cu.source_kind
       AND v.source_id = cu.source_id
    )
  `;
}

function buildFilterSql(filters: {
  status: CoreMemoryReviewStatus | null;
  sourceKind: CoreMemorySourceKind | null;
  entityType: string;
  classification: string;
  chapterId: string;
  q: string;
  offset: number;
  limit: number;
}): { whereSql: string; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [filters.offset, filters.limit + 1];
  let idx = 3;

  if (filters.status) {
    idx += 1;
    clauses.push(`review_status = $${idx}`);
    params.push(filters.status);
  }
  if (filters.sourceKind) {
    idx += 1;
    clauses.push(`source_kind = $${idx}`);
    params.push(filters.sourceKind);
  }
  if (filters.entityType) {
    idx += 1;
    clauses.push(`UPPER(COALESCE(entity_type, '')) = $${idx}`);
    params.push(filters.entityType.toUpperCase());
  }
  if (filters.classification) {
    idx += 1;
    clauses.push(`UPPER(COALESCE(classification, '')) = $${idx}`);
    params.push(filters.classification.toUpperCase());
  }
  if (filters.chapterId) {
    idx += 1;
    clauses.push(`COALESCE(chapter_id, '') = $${idx}`);
    params.push(filters.chapterId);
  }
  if (filters.q) {
    idx += 1;
    clauses.push(`(
      COALESCE(subject, '') ILIKE $${idx}
      OR COALESCE(predicate, '') ILIKE $${idx}
      OR COALESCE(object, '') ILIKE $${idx}
      OR COALESCE(event_label, '') ILIKE $${idx}
      OR COALESCE(location, '') ILIKE $${idx}
      OR COALESCE(content, '') ILIKE $${idx}
    )`);
    params.push(`%${filters.q}%`);
  }
  return { whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export async function listCoreMemoryItems(storySlug: string, rawFilters: ListFilters) {
  const storyId = await resolveStoryId(pool, storySlug);
  const status = parseReviewStatus(rawFilters.status);
  const sourceKind = parseSourceKind(rawFilters.source_kind);
  const limit = clampInt(rawFilters.limit, 30, 1, 100);
  const offset = clampInt(rawFilters.cursor, 0, 0, 1_000_000);
  const chapterId = String(rawFilters.chapter_id ?? "").trim();
  const entityType = String(rawFilters.entity_type ?? "").trim();
  const classification = String(rawFilters.classification ?? "").trim();
  const q = String(rawFilters.q ?? "").trim();

  const { whereSql, params } = buildFilterSql({
    status,
    sourceKind,
    entityType,
    classification,
    chapterId,
    q,
    offset,
    limit,
  });

  const listSql = `
    ${buildUnifiedCte()}
    SELECT
      source_kind, source_id, chapter_id, scene_id,
      entity_type, classification,
      subject, predicate, object,
      event_label, location, participants, content,
      confidence, source_trace,
      review_status, review_note, reviewed_by, reviewed_at,
      created_at
    FROM unified
    ${whereSql}
    ORDER BY created_at DESC, source_kind ASC, source_id DESC
    OFFSET $2
    LIMIT $3
  `;
  const listRes = await pool.query(listSql, [storyId, ...params]);
  const hasMore = listRes.rows.length > limit;
  const trimmed = hasMore ? listRes.rows.slice(0, limit) : listRes.rows;

  const items = appendDuplicateCounts(
    trimmed.map((row) => ({
      source_kind: row.source_kind as CoreMemorySourceKind,
      source_id: Number(row.source_id || 0),
      chapter_id: row.chapter_id ? String(row.chapter_id) : null,
      scene_id: Number.isFinite(Number(row.scene_id)) ? Number(row.scene_id) : null,
      entity_type: row.entity_type ? String(row.entity_type) : null,
      classification: row.classification ? String(row.classification) : null,
      subject: row.subject ? String(row.subject) : null,
      predicate: row.predicate ? String(row.predicate) : null,
      object: row.object ? String(row.object) : null,
      event_label: row.event_label ? String(row.event_label) : null,
      location: row.location ? String(row.location) : null,
      participants: Array.isArray(row.participants) ? row.participants.map((x: unknown) => String(x || "")).filter(Boolean) : [],
      content: row.content ? String(row.content) : null,
      confidence: Number(row.confidence || 0),
      source_trace: isRecord(row.source_trace) ? row.source_trace : {},
      review_status: (parseReviewStatus(row.review_status) || "PENDING") as CoreMemoryReviewStatus,
      review_note: row.review_note ? String(row.review_note) : null,
      reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
      reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
      created_at: String(row.created_at || new Date().toISOString()),
    }))
  );

  const countSql = `
    ${buildUnifiedCte()}
    SELECT
      review_status,
      source_kind,
      COUNT(*)::int AS count
    FROM unified
    GROUP BY review_status, source_kind
  `;
  const countRes = await pool.query(countSql, [storyId]);
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const row of countRes.rows) {
    const s = String(row.review_status || "PENDING");
    const k = String(row.source_kind || "");
    const c = Number(row.count || 0);
    byStatus[s] = (byStatus[s] || 0) + c;
    bySource[k] = (bySource[k] || 0) + c;
  }

  return {
    story_id: storyId,
    items,
    counts: {
      by_status: byStatus,
      by_source: bySource,
      total: Object.values(byStatus).reduce((sum, x) => sum + x, 0),
    },
    next_cursor: hasMore ? String(offset + limit) : null,
  };
}

async function sourceExists(
  executor: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number }> },
  storyId: number,
  sourceKind: CoreMemorySourceKind,
  sourceId: number
) {
  if (sourceKind === "CANON_FACT") {
    const res = await executor.query("SELECT 1 FROM public.canon_fact WHERE story_id = $1 AND id = $2 LIMIT 1", [storyId, sourceId]);
    return (res.rowCount || 0) > 0;
  }
  if (sourceKind === "TIMELINE_ANCHOR") {
    const res = await executor.query("SELECT 1 FROM public.timeline_anchor WHERE story_id = $1 AND id = $2 LIMIT 1", [storyId, sourceId]);
    return (res.rowCount || 0) > 0;
  }
  const res = await executor.query("SELECT 1 FROM public.story_canon_fact WHERE story_id = $1 AND id = $2 LIMIT 1", [storyId, sourceId]);
  return (res.rowCount || 0) > 0;
}

export async function applyCoreMemoryReviewActions(
  storySlug: string,
  payload: { actions?: unknown; actor?: unknown }
) {
  const storyId = await resolveStoryIdForWrite(pool, storySlug);
  const actor = String(payload.actor ?? "").trim() || "operator";
  const actionsRaw = Array.isArray(payload.actions) ? payload.actions : [];

  const failedItems: Array<{ index: number; reason: string }> = [];
  const normalized: Array<{ source_kind: CoreMemorySourceKind; source_id: number; action: CoreMemoryReviewActionKind; note: string | null }> = [];
  for (let i = 0; i < actionsRaw.length; i += 1) {
    const row = isRecord(actionsRaw[i]) ? (actionsRaw[i] as ReviewActionInput) : {};
    const sourceKind = parseSourceKind(row.source_kind);
    const action = parseReviewAction(row.action);
    const sourceId = clampInt(row.source_id, -1, -1, Number.MAX_SAFE_INTEGER);
    if (!sourceKind || !action || sourceId <= 0) {
      failedItems.push({ index: i, reason: "INVALID_ACTION_INPUT" });
      continue;
    }
    normalized.push({
      source_kind: sourceKind,
      source_id: sourceId,
      action,
      note: row.note == null ? null : String(row.note).trim().slice(0, 2000),
    });
  }

  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query("BEGIN");
    for (let i = 0; i < normalized.length; i += 1) {
      const row = normalized[i];
      const exists = await sourceExists(client, storyId, row.source_kind, row.source_id);
      if (!exists) {
        failedItems.push({ index: i, reason: "SOURCE_NOT_FOUND" });
        continue;
      }
      const prevRes = await client.query<{ review_status: string }>(
        `SELECT review_status
           FROM public.core_memory_vetting_state
          WHERE story_id = $1
            AND source_kind = $2
            AND source_id = $3
          LIMIT 1`,
        [storyId, row.source_kind, row.source_id]
      );
      const fromStatus = parseReviewStatus(prevRes.rows[0]?.review_status) || "PENDING";
      const toStatus = toTargetStatus(row.action);

      await client.query(
        `INSERT INTO public.core_memory_vetting_state
           (story_id, source_kind, source_id, review_status, review_note, reviewed_by, reviewed_at)
         VALUES
           ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (story_id, source_kind, source_id)
         DO UPDATE SET
           review_status = EXCLUDED.review_status,
           review_note = EXCLUDED.review_note,
           reviewed_by = EXCLUDED.reviewed_by,
           reviewed_at = EXCLUDED.reviewed_at,
           updated_at = now()`,
        [storyId, row.source_kind, row.source_id, toStatus, row.note, actor]
      );
      await client.query(
        `INSERT INTO public.core_memory_vetting_event
           (story_id, source_kind, source_id, action, from_status, to_status, note, actor)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [storyId, row.source_kind, row.source_id, row.action, fromStatus, toStatus, row.note, actor]
      );
      updated += 1;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    story_id: storyId,
    updated_count: updated,
    failed_items: failedItems,
  };
}

export async function listCoreMemoryEvents(
  storySlug: string,
  query: { source_kind?: unknown; source_id?: unknown; limit?: unknown; cursor?: unknown }
) {
  const storyId = await resolveStoryId(pool, storySlug);
  const sourceKind = parseSourceKind(query.source_kind);
  const sourceId = clampInt(query.source_id, -1, -1, Number.MAX_SAFE_INTEGER);
  const limit = clampInt(query.limit, 50, 1, 200);
  const offset = clampInt(query.cursor, 0, 0, 1_000_000);

  const params: Array<number | string> = [storyId];
  const where: string[] = [];
  if (sourceKind) {
    params.push(sourceKind);
    where.push(`source_kind = $${params.length}`);
  }
  if (sourceId > 0) {
    params.push(sourceId);
    where.push(`source_id = $${params.length}`);
  }
  params.push(offset);
  params.push(limit + 1);

  const sql = `
    SELECT
      id, source_kind, source_id, action, from_status, to_status, note, actor, created_at
    FROM public.core_memory_vetting_event
    WHERE story_id = $1
      ${where.length ? `AND ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC
    OFFSET $${params.length - 1}
    LIMIT $${params.length}
  `;
  const res = await pool.query(sql, params);
  const hasMore = res.rows.length > limit;
  const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
  return {
    story_id: storyId,
    items: rows.map((row) => ({
      id: Number(row.id || 0),
      source_kind: String(row.source_kind || ""),
      source_id: Number(row.source_id || 0),
      action: String(row.action || ""),
      from_status: row.from_status ? String(row.from_status) : null,
      to_status: String(row.to_status || ""),
      note: row.note ? String(row.note) : null,
      actor: String(row.actor || ""),
      created_at: String(row.created_at || ""),
    })),
    next_cursor: hasMore ? String(offset + limit) : null,
  };
}

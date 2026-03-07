import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

export type EntityRole = "ACTOR" | "SETTING" | "OBJECT" | "ABSTRACT";
export type EntityType =
  | "PERSON"
  | "FACTION"
  | "AI_AGENT"
  | "LOCATION"
  | "PLANET"
  | "OBJECT"
  | "ABSTRACT"
  | "OTHER";

export type EntityCandidate = {
  source: "saga" | "arc" | "core" | "legacy";
  source_table: "writing_scope_snapshot_v1" | "canon_fact" | "story_canon_fact";
  source_id?: number | null;
  type: EntityType;
  role: EntityRole;
  confidence: number;
  evidence_ref?: string | null;
};

export type ResolvedEntityTruth = {
  entity_key: string;
  canonical_type: EntityType;
  canonical_role: EntityRole;
  status: "AUTO_RESOLVED" | "REQUIRES_HUMAN_REVIEW" | "RESOLVED_BY_USER";
  conflict_type?: string;
  conflict_review_id?: number | null;
};

const ROLE_PRIORITY: Record<string, number> = {
  saga: 100,
  arc: 80,
  core: 60,
  legacy: 40,
};

function normalizeEntityKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

function asUpper(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

export function inferRoleFromType(type: string): EntityRole {
  const t = asUpper(type);
  if (t === "PERSON" || t === "FACTION" || t === "AI_AGENT") return "ACTOR";
  if (t === "LOCATION" || t === "PLANET" || t === "REALM" || t === "TIME_SPACE") return "SETTING";
  if (t === "OBJECT" || t === "ARTIFACT" || t === "ITEM" || t === "SYSTEM") return "OBJECT";
  return "ABSTRACT";
}

function inferTypeFromLegacyCategory(category: string): EntityType {
  const c = asUpper(category);
  if (c === "CHARACTER" || c === "PERSON") return "PERSON";
  if (c === "FACTION") return "FACTION";
  if (c === "LOCATION") return "LOCATION";
  if (c === "PLANET") return "PLANET";
  if (c === "ITEM" || c === "OBJECT" || c === "ARTIFACT") return "OBJECT";
  if (c === "THEME" || c === "LAW" || c === "FORCE") return "ABSTRACT";
  return "OTHER";
}

export function toRoleAndTypeFromLegacyCategory(category: string): { type: EntityType; role: EntityRole } {
  const type = inferTypeFromLegacyCategory(category);
  return { type, role: inferRoleFromType(type) };
}

export async function getEntityTruthOverlayMap(storyId: number): Promise<Map<string, { type: EntityType; role: EntityRole }>> {
  const res = await pool.query<{ entity_key: string; canonical_type: string; canonical_role: string }>(
    `SELECT entity_key, canonical_type, canonical_role
     FROM public.entity_truth_overlay
     WHERE story_id = $1`,
    [storyId]
  ).catch(() => ({ rows: [] as Array<{ entity_key: string; canonical_type: string; canonical_role: string }> }));
  const map = new Map<string, { type: EntityType; role: EntityRole }>();
  for (const row of res.rows) {
    map.set(normalizeEntityKey(row.entity_key), {
      type: (asUpper(row.canonical_type) || "OTHER") as EntityType,
      role: (asUpper(row.canonical_role) || "ABSTRACT") as EntityRole,
    });
  }
  return map;
}

async function ensureConflictReviewRow(args: {
  storyId: number;
  chapterId?: string | null;
  entityKey: string;
  conflictType: string;
  severity: string;
  candidates: EntityCandidate[];
  suggested: { canonical_type: EntityType; canonical_role: EntityRole };
}) {
  const existing = await pool.query<{ id: number }>(
    `SELECT id
     FROM public.entity_conflict_review
     WHERE story_id = $1
       AND entity_key = $2
       AND status = 'REQUIRES_HUMAN_REVIEW'
     ORDER BY id DESC
     LIMIT 1`,
    [args.storyId, args.entityKey]
  ).catch(() => ({ rows: [] as Array<{ id: number }> }));
  const candidateValues = args.candidates.map((c) => ({
    source: c.source,
    source_table: c.source_table,
    source_id: c.source_id ?? null,
    type: c.type,
    role: c.role,
    confidence: c.confidence,
    evidence_ref: c.evidence_ref ?? null,
  }));
  if (existing.rows[0]?.id) {
    await pool.query(
      `UPDATE public.entity_conflict_review
       SET chapter_id = COALESCE($3, chapter_id),
           candidate_values = $4::jsonb,
           authority_scores = $5::jsonb,
           suggested_resolution = $6::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [
        existing.rows[0].id,
        args.storyId,
        args.chapterId ?? null,
        JSON.stringify(candidateValues),
        JSON.stringify(candidateValues.reduce<Record<string, number>>((acc, item) => {
          acc[item.source] = (acc[item.source] || 0) + Number(item.confidence || 0);
          return acc;
        }, {})),
        JSON.stringify(args.suggested),
      ]
    );
    return existing.rows[0].id;
  }
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO public.entity_conflict_review
      (story_id, chapter_id, entity_key, candidate_values, evidence_refs, authority_scores, conflict_type, severity, suggested_resolution, status)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb, 'REQUIRES_HUMAN_REVIEW')
     RETURNING id`,
    [
      args.storyId,
      args.chapterId ?? null,
      args.entityKey,
      JSON.stringify(candidateValues),
      JSON.stringify(candidateValues.map((item) => item.evidence_ref).filter(Boolean)),
      JSON.stringify(candidateValues.reduce<Record<string, number>>((acc, item) => {
        acc[item.source] = (acc[item.source] || 0) + Number(item.confidence || 0);
        return acc;
      }, {})),
      args.conflictType,
      args.severity,
      JSON.stringify(args.suggested),
    ]
  );
  return ins.rows[0].id;
}

export async function resolveEntityTruth(args: {
  storyId: number;
  chapterId?: string | null;
  entityName: string;
  candidates: EntityCandidate[];
  overlay?: Map<string, { type: EntityType; role: EntityRole }>;
  forceHumanOnCritical?: boolean;
}): Promise<ResolvedEntityTruth> {
  const entityKey = normalizeEntityKey(args.entityName);
  const overlayMap = args.overlay ?? (await getEntityTruthOverlayMap(args.storyId));
  const overlay = overlayMap.get(entityKey);
  if (overlay) {
    return {
      entity_key: entityKey,
      canonical_type: overlay.type,
      canonical_role: overlay.role,
      status: "RESOLVED_BY_USER",
    };
  }
  const candidates = args.candidates.filter((c) => c && c.type && c.role);
  if (candidates.length === 0) {
    return {
      entity_key: entityKey,
      canonical_type: "OTHER",
      canonical_role: "ABSTRACT",
      status: "AUTO_RESOLVED",
    };
  }
  const scoreMap = new Map<string, { type: EntityType; role: EntityRole; score: number }>();
  for (const c of candidates) {
    const key = `${c.type}|${c.role}`;
    const base = ROLE_PRIORITY[c.source] ?? 10;
    const delta = Number.isFinite(c.confidence) ? c.confidence : 0.5;
    const prev = scoreMap.get(key);
    const nextScore = (prev?.score || 0) + base + delta;
    scoreMap.set(key, { type: c.type, role: c.role, score: nextScore });
  }
  const ranked = [...scoreMap.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked[1];
  const hasRoleConflict = new Set(candidates.map((c) => c.role)).size > 1;
  const hasTypeConflict = new Set(candidates.map((c) => c.type)).size > 1;
  const lowConfidence = !second ? false : (top.score - second.score) < 25;
  const critical = hasRoleConflict || hasTypeConflict;
  const needsHuman = critical && (args.forceHumanOnCritical ?? true) && lowConfidence;
  if (needsHuman) {
    const reviewId = await ensureConflictReviewRow({
      storyId: args.storyId,
      chapterId: args.chapterId,
      entityKey,
      conflictType: hasRoleConflict ? "ROLE_CONFLICT" : "TYPE_CONFLICT",
      severity: "HIGH",
      candidates,
      suggested: { canonical_type: top.type, canonical_role: top.role },
    });
    return {
      entity_key: entityKey,
      canonical_type: top.type,
      canonical_role: top.role,
      status: "REQUIRES_HUMAN_REVIEW",
      conflict_type: hasRoleConflict ? "ROLE_CONFLICT" : "TYPE_CONFLICT",
      conflict_review_id: reviewId,
    };
  }
  return {
    entity_key: entityKey,
    canonical_type: top.type,
    canonical_role: top.role,
    status: "AUTO_RESOLVED",
  };
}

export async function listEntityConflicts(storySlug: string, raw: {
  status?: string;
  severity?: string;
  limit?: string | number;
  cursor?: string | number;
}) {
  const storyId = await resolveStoryId(pool, storySlug);
  const status = String(raw.status || "").trim().toUpperCase();
  const severity = String(raw.severity || "").trim().toUpperCase();
  const limit = Math.max(1, Math.min(100, Number(raw.limit || 30) || 30));
  const offset = Math.max(0, Number(raw.cursor || 0) || 0);
  const where: string[] = ["story_id = $1"];
  const params: Array<string | number> = [storyId];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    where.push(`severity = $${params.length}`);
  }
  params.push(limit + 1, offset);
  const res = await pool.query(
    `SELECT id, story_id, chapter_id, entity_key, candidate_values, evidence_refs, authority_scores, conflict_type, severity,
            suggested_resolution, status, resolution_action, resolution_payload, actor, created_at, updated_at, resolved_at
     FROM public.entity_conflict_review
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params
  );
  const hasMore = res.rows.length > limit;
  const items = hasMore ? res.rows.slice(0, limit) : res.rows;
  return {
    story_id: storyId,
    items,
    next_cursor: hasMore ? String(offset + limit) : null,
  };
}

export async function applyEntityConflictReview(storySlug: string, payload: {
  actions?: unknown;
  actor?: unknown;
}) {
  const storyId = await resolveStoryIdForWrite(pool, storySlug);
  const actor = String(payload.actor || "").trim() || "operator";
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const client = await pool.connect();
  const failed_items: Array<{ index: number; reason: string }> = [];
  let updated_count = 0;
  const source_updates_applied: Array<Record<string, unknown>> = [];
  try {
    await client.query("BEGIN");
    for (let i = 0; i < actions.length; i += 1) {
      const row = actions[i] as Record<string, unknown>;
      const reviewId = Number(row.review_id || 0);
      const action = asUpper(row.action);
      const note = row.note == null ? null : String(row.note).slice(0, 2000);
      if (!Number.isFinite(reviewId) || reviewId <= 0) {
        failed_items.push({ index: i, reason: "INVALID_REVIEW_ID" });
        continue;
      }
      if (!["SET_CANONICAL_TYPE_OR_ROLE", "PATCH_SOURCE_RECORD", "MERGE_ALIAS", "REJECT_SUGGESTION"].includes(action)) {
        failed_items.push({ index: i, reason: "INVALID_ACTION" });
        continue;
      }
      const reviewRes = await client.query<{
        id: number;
        entity_key: string;
        suggested_resolution: unknown;
        candidate_values: unknown;
      }>(
        `SELECT id, entity_key, suggested_resolution, candidate_values
         FROM public.entity_conflict_review
         WHERE id = $1 AND story_id = $2
         LIMIT 1`,
        [reviewId, storyId]
      );
      if (!reviewRes.rows[0]) {
        failed_items.push({ index: i, reason: "REVIEW_NOT_FOUND" });
        continue;
      }
      const review = reviewRes.rows[0];
      if (action === "SET_CANONICAL_TYPE_OR_ROLE") {
        const canonicalType = asUpper((row.payload as Record<string, unknown> | undefined)?.canonical_type || (review.suggested_resolution as Record<string, unknown> | undefined)?.canonical_type || "OTHER");
        const canonicalRole = asUpper((row.payload as Record<string, unknown> | undefined)?.canonical_role || (review.suggested_resolution as Record<string, unknown> | undefined)?.canonical_role || inferRoleFromType(canonicalType));
        await client.query(
          `INSERT INTO public.entity_truth_overlay
            (story_id, entity_key, canonical_type, canonical_role, confidence, source_of_truth, reviewed_by, review_note)
           VALUES ($1, $2, $3, $4, 1.0, 'HUMAN_REVIEW', $5, $6)
           ON CONFLICT (story_id, entity_key)
           DO UPDATE SET canonical_type = EXCLUDED.canonical_type,
                         canonical_role = EXCLUDED.canonical_role,
                         confidence = EXCLUDED.confidence,
                         source_of_truth = EXCLUDED.source_of_truth,
                         reviewed_by = EXCLUDED.reviewed_by,
                         review_note = EXCLUDED.review_note,
                         updated_at = now()`,
          [storyId, review.entity_key, canonicalType, canonicalRole, actor, note]
        );
        source_updates_applied.push({ type: "overlay_upsert", review_id: reviewId, entity_key: review.entity_key, canonical_type: canonicalType, canonical_role: canonicalRole });
      } else if (action === "PATCH_SOURCE_RECORD") {
        const patch = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>;
        const sourceTable = String(patch.source_table || "");
        const sourceId = Number(patch.source_id || 0);
        if (sourceTable === "story_canon_fact" && sourceId > 0) {
          const newCategory = String(patch.category || "").trim();
          if (newCategory) {
            await client.query(
              `UPDATE public.story_canon_fact SET category = $1 WHERE story_id = $2 AND id = $3`,
              [newCategory, storyId, sourceId]
            );
            source_updates_applied.push({ type: "story_canon_fact_patch", source_id: sourceId, category: newCategory });
          }
        } else if (sourceTable === "canon_fact" && sourceId > 0) {
          const newEntityType = String(patch.entity_type || "").trim();
          if (newEntityType) {
            await client.query(
              `UPDATE public.canon_fact SET entity_type = $1 WHERE story_id = $2 AND id = $3`,
              [newEntityType, storyId, sourceId]
            );
            source_updates_applied.push({ type: "canon_fact_patch", source_id: sourceId, entity_type: newEntityType });
          }
        } else {
          failed_items.push({ index: i, reason: "INVALID_PATCH_PAYLOAD" });
          continue;
        }
      } else if (action === "MERGE_ALIAS") {
        const payloadRow = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>;
        const targetEntityKey = normalizeEntityKey(String(payloadRow.target_entity_key || review.entity_key));
        await client.query(
          `INSERT INTO public.entity_truth_overlay
            (story_id, entity_key, canonical_type, canonical_role, confidence, source_of_truth, reviewed_by, review_note)
           VALUES ($1, $2, 'OTHER', 'ABSTRACT', 0.7, 'HUMAN_REVIEW_ALIAS', $3, $4)
           ON CONFLICT (story_id, entity_key)
           DO UPDATE SET source_of_truth = EXCLUDED.source_of_truth, reviewed_by = EXCLUDED.reviewed_by, review_note = EXCLUDED.review_note, updated_at = now()`,
          [storyId, targetEntityKey, actor, note || "alias merge"]
        );
        source_updates_applied.push({ type: "alias_merge", from: review.entity_key, to: targetEntityKey });
      }
      const finalStatus = action === "REJECT_SUGGESTION" ? "REJECTED" : "RESOLVED_BY_USER";
      await client.query(
        `UPDATE public.entity_conflict_review
         SET status = $1, resolution_action = $2, resolution_payload = $3::jsonb, actor = $4, updated_at = now(), resolved_at = now()
         WHERE id = $5`,
        [finalStatus, action, JSON.stringify((row.payload && typeof row.payload === "object") ? row.payload : {}), actor, reviewId]
      );
      await client.query(
        `INSERT INTO public.entity_conflict_review_event (story_id, review_id, action, actor, note, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [storyId, reviewId, action, actor, note, JSON.stringify((row.payload && typeof row.payload === "object") ? row.payload : {})]
      );
      updated_count += 1;
    }
    await client.query("COMMIT");
    return {
      story_id: storyId,
      updated_count,
      failed_items,
      source_updates_applied,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}


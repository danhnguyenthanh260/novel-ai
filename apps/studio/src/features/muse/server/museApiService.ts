import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

type SnapshotRule = {
  id: number | null;
  type: string;
  rule_text: string;
  why: string | null;
  bad_examples: string[];
  good_examples: string[];
  weight: number;
  is_active: boolean;
};

type MuseRuleType = "AVOID" | "ENFORCE" | "LOGIC" | "PACING" | "VOICE";
type MuseRule = {
  type: MuseRuleType;
  ruleText: string;
  why: string | null;
  badExamples: string[];
  goodExamples: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RULE_TYPES = new Set(["avoid", "enforce", "logic", "pacing", "voice"]);

function parseLimit(value: string | null, fallback = 20): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function parseSceneId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function parseRuleType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const x = value.trim().toLowerCase();
  return RULE_TYPES.has(x) ? x : null;
}

function parseWeight(value: unknown, fallback = 50): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function parseExamples(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, 8);
}

function normalizeExamples(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, 8);
}

function normalizeSnapshotRule(raw: unknown): SnapshotRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type.trim().toLowerCase() : "";
  const ruleText = typeof obj.rule_text === "string" ? obj.rule_text.trim() : "";
  const weightRaw = Number(obj.weight);
  const weight = Number.isFinite(weightRaw) ? Math.max(0, Math.min(100, Math.floor(weightRaw))) : 50;
  const idRaw = Number(obj.id);
  const id = Number.isFinite(idRaw) && idRaw > 0 ? idRaw : null;
  const why = typeof obj.why === "string" ? obj.why.trim() : null;
  const isActive = obj.is_active !== false;
  if (!type || !ruleText) return null;
  return {
    id,
    type,
    rule_text: ruleText,
    why,
    bad_examples: normalizeExamples(obj.bad_examples),
    good_examples: normalizeExamples(obj.good_examples),
    weight,
    is_active: isActive,
  };
}

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

async function ensureSceneInStory(storyId: number, sceneId: number): Promise<boolean> {
  const rs = await pool.query(
    `SELECT 1
     FROM public.narrative_scene
     WHERE story_id = $1 AND id = $2
     LIMIT 1`,
    [storyId, sceneId]
  );
  return Number(rs.rowCount ?? 0) > 0;
}

async function fetchActiveRulesSnapshot(storyId: number): Promise<SnapshotRule[]> {
  const rs = await pool.query<SnapshotRule>(
    `SELECT
       id,
       type,
       rule_text,
       why,
       bad_examples,
       good_examples,
       weight,
       is_active
     FROM public.muse_rules
     WHERE story_id = $1 AND is_active = true
     ORDER BY weight DESC, created_at DESC, id DESC`,
    [storyId]
  );
  return rs.rows.map((r) => ({
    id: r.id,
    type: r.type,
    rule_text: r.rule_text,
    why: r.why ?? null,
    bad_examples: normalizeExamples(r.bad_examples),
    good_examples: normalizeExamples(r.good_examples),
    weight: Number(r.weight ?? 50),
    is_active: true,
  }));
}

export async function getMuseAnalysisResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"), 20);
    const sceneIdParam = req.nextUrl.searchParams.get("scene_id");
    const sceneId = sceneIdParam ? parseSceneId(sceneIdParam) : null;
    if (sceneIdParam && sceneId === null) {
      return NextResponse.json({ ok: false, error: "INVALID_SCENE_ID" }, { status: 400 });
    }

    const rs = await pool.query(
      `SELECT id, story_id, scene_id, raw_content_md, created_by, created_at
       FROM public.muse_analysis
       WHERE story_id = $1
         AND ($2::bigint IS NULL OR scene_id = $2::bigint)
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [storyId, sceneId, limit]
    );
    return NextResponse.json({ ok: true, story_id: storyId, items: rs.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_ANALYSIS_GET_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function postMuseAnalysisResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as {
      scene_id?: number | string | null;
      raw_content_md?: string;
      created_by?: string;
    };

    const rawContent = typeof body.raw_content_md === "string" ? body.raw_content_md.trim() : "";
    if (!rawContent) {
      return NextResponse.json({ ok: false, error: "RAW_CONTENT_REQUIRED" }, { status: 400 });
    }
    const sceneId = body.scene_id == null ? null : parseSceneId(body.scene_id);
    if (body.scene_id != null && sceneId === null) {
      return NextResponse.json({ ok: false, error: "INVALID_SCENE_ID" }, { status: 400 });
    }
    if (sceneId !== null) {
      const inStory = await ensureSceneInStory(storyId, sceneId);
      if (!inStory) return NextResponse.json({ ok: false, error: "SCENE_NOT_IN_STORY" }, { status: 400 });
    }

    const createdBy = typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim() : "ui";
    const rs = await pool.query<{ id: string }>(
      `INSERT INTO public.muse_analysis
         (story_id, scene_id, raw_content_md, created_by)
       VALUES
         ($1, $2, $3, $4)
       RETURNING id`,
      [storyId, sceneId, rawContent, createdBy]
    );
    return NextResponse.json({
      ok: true,
      story_id: storyId,
      id: rs.rows[0]?.id ?? null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_ANALYSIS_POST_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function deleteMuseAnalysisResponse(storySlug: string, id: string): Promise<NextResponse> {
  try {
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const rs = await pool.query<{ id: string }>(
      `DELETE FROM public.muse_analysis
       WHERE story_id = $1 AND id = $2::uuid
       RETURNING id`,
      [storyId, id]
    );
    if (Number(rs.rowCount ?? 0) === 0) {
      return NextResponse.json({ ok: false, error: "ANALYSIS_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, story_id: storyId, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_ANALYSIS_DELETE_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function getMuseRulesResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const includeInactive = (req.nextUrl.searchParams.get("include_inactive") ?? "").trim() === "1";
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

    const params: Array<number | boolean> = [storyId, includeInactive, limit];
    const rs = await pool.query(
      `SELECT
         id, story_id, type, rule_text, why, bad_examples, good_examples,
         weight, is_active, created_at, updated_at
       FROM public.muse_rules
       WHERE story_id = $1
         AND ($2::boolean OR is_active = true)
       ORDER BY is_active DESC, weight DESC, created_at DESC, id DESC
       LIMIT $3`,
      params
    );

    return NextResponse.json({ ok: true, story_id: storyId, items: rs.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_RULES_GET_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function postMuseRulesResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as {
      type?: string;
      rule_text?: string;
      why?: string | null;
      bad_examples?: unknown;
      good_examples?: unknown;
      weight?: number | string;
      is_active?: boolean;
    };
    const type = parseRuleType(body.type);
    const ruleText = typeof body.rule_text === "string" ? body.rule_text.trim() : "";
    const why = typeof body.why === "string" ? body.why.trim() : null;
    if (!type) return NextResponse.json({ ok: false, error: "INVALID_RULE_TYPE" }, { status: 400 });
    if (!ruleText) return NextResponse.json({ ok: false, error: "RULE_TEXT_REQUIRED" }, { status: 400 });

    const rs = await pool.query<{ id: number }>(
      `INSERT INTO public.muse_rules
         (story_id, type, rule_text, why, bad_examples, good_examples, weight, is_active)
       VALUES
         ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8)
       RETURNING id`,
      [
        storyId,
        type,
        ruleText,
        why,
        parseExamples(body.bad_examples),
        parseExamples(body.good_examples),
        parseWeight(body.weight),
        body.is_active !== false,
      ]
    );
    return NextResponse.json({ ok: true, story_id: storyId, id: Number(rs.rows[0]?.id ?? 0) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_RULES_CREATE_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function patchMuseRulesResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as {
      id?: number | string;
      type?: string;
      rule_text?: string;
      why?: string | null;
      bad_examples?: unknown;
      good_examples?: unknown;
      weight?: number | string;
      is_active?: boolean;
    };
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }

    const patch: string[] = [];
    const params: Array<string | number | boolean | string[] | null> = [storyId, id];

    if (body.type !== undefined) {
      const type = parseRuleType(body.type);
      if (!type) return NextResponse.json({ ok: false, error: "INVALID_RULE_TYPE" }, { status: 400 });
      patch.push(`type = $${params.length + 1}`);
      params.push(type);
    }
    if (body.rule_text !== undefined) {
      const ruleText = typeof body.rule_text === "string" ? body.rule_text.trim() : "";
      if (!ruleText) return NextResponse.json({ ok: false, error: "RULE_TEXT_REQUIRED" }, { status: 400 });
      patch.push(`rule_text = $${params.length + 1}`);
      params.push(ruleText);
    }
    if (body.why !== undefined) {
      patch.push(`why = $${params.length + 1}`);
      params.push(typeof body.why === "string" ? body.why.trim() : null);
    }
    if (body.bad_examples !== undefined) {
      patch.push(`bad_examples = $${params.length + 1}::text[]`);
      params.push(parseExamples(body.bad_examples));
    }
    if (body.good_examples !== undefined) {
      patch.push(`good_examples = $${params.length + 1}::text[]`);
      params.push(parseExamples(body.good_examples));
    }
    if (body.weight !== undefined) {
      patch.push(`weight = $${params.length + 1}`);
      params.push(parseWeight(body.weight));
    }
    if (body.is_active !== undefined) {
      patch.push(`is_active = $${params.length + 1}`);
      params.push(Boolean(body.is_active));
    }
    if (patch.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_FIELDS_TO_UPDATE" }, { status: 400 });
    }

    const rs = await pool.query<{ id: number }>(
      `UPDATE public.muse_rules
       SET ${patch.join(", ")}
       WHERE story_id = $1 AND id = $2
       RETURNING id`,
      params
    );
    if (rs.rowCount === 0) return NextResponse.json({ ok: false, error: "RULE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, story_id: storyId, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_RULES_PATCH_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function deleteMuseRulesResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }
    const rs = await pool.query<{ id: number }>(
      `DELETE FROM public.muse_rules
       WHERE story_id = $1 AND id = $2
       RETURNING id`,
      [storyId, id]
    );
    if (rs.rowCount === 0) return NextResponse.json({ ok: false, error: "RULE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, story_id: storyId, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_RULES_DELETE_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function getMuseSnapshotsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"), 50);

    const rs = await pool.query(
      `SELECT id, story_id, action, source_snapshot_id, note, rules_snapshot, created_by, created_at
       FROM public.muse_snapshots
       WHERE story_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [storyId, limit]
    );
    return NextResponse.json({ ok: true, story_id: storyId, items: rs.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_SNAPSHOTS_GET_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function postMuseSnapshotsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as { note?: string; created_by?: string };
    const note = typeof body.note === "string" ? body.note.trim() : null;
    const createdBy = typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim() : "system";
    const snapshot = await fetchActiveRulesSnapshot(storyId);
    const rs = await pool.query<{ id: number }>(
      `INSERT INTO public.muse_snapshots
         (story_id, action, note, rules_snapshot, created_by)
       VALUES
         ($1, 'MANUAL', $2, $3::jsonb, $4)
       RETURNING id`,
      [storyId, note, JSON.stringify(snapshot), createdBy]
    );
    return NextResponse.json({ ok: true, story_id: storyId, id: Number(rs.rows[0]?.id ?? 0), count: snapshot.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_SNAPSHOT_CREATE_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function patchMuseSnapshotsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as {
      snapshot_id?: number | string;
      mode?: "apply" | "rollback";
      note?: string;
      created_by?: string;
    };
    const snapshotId = Number(body.snapshot_id);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_SNAPSHOT_ID" }, { status: 400 });
    }
    const mode = body.mode === "rollback" ? "ROLLBACK" : "APPLY";
    const note = typeof body.note === "string" ? body.note.trim() : null;
    const createdBy = typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim() : "system";

    await client.query("BEGIN");
    const snapRes = await client.query<{ rules_snapshot: unknown }>(
      `SELECT rules_snapshot
       FROM public.muse_snapshots
       WHERE story_id = $1 AND id = $2
       FOR UPDATE`,
      [storyId, snapshotId]
    );
    if (snapRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "SNAPSHOT_NOT_FOUND" }, { status: 404 });
    }
    const rawRules = Array.isArray(snapRes.rows[0]?.rules_snapshot) ? (snapRes.rows[0]?.rules_snapshot as unknown[]) : [];
    const rules = rawRules.map(normalizeSnapshotRule).filter((x): x is SnapshotRule => Boolean(x));

    await client.query(`UPDATE public.muse_rules SET is_active = false WHERE story_id = $1`, [storyId]);

    for (const rule of rules) {
      if (rule.id) {
        const up = await client.query<{ id: number }>(
          `UPDATE public.muse_rules
           SET
             type = $3,
             rule_text = $4,
             why = $5,
             bad_examples = $6::text[],
             good_examples = $7::text[],
             weight = $8,
             is_active = true
           WHERE story_id = $1 AND id = $2
           RETURNING id`,
          [storyId, rule.id, rule.type, rule.rule_text, rule.why, rule.bad_examples, rule.good_examples, rule.weight]
        );
        if (Number(up.rowCount ?? 0) > 0) continue;
      }
      await client.query(
        `INSERT INTO public.muse_rules
           (story_id, type, rule_text, why, bad_examples, good_examples, weight, is_active)
         VALUES
           ($1, $2, $3, $4, $5::text[], $6::text[], $7, true)`,
        [storyId, rule.type, rule.rule_text, rule.why, rule.bad_examples, rule.good_examples, rule.weight]
      );
    }

    const activeRes = await client.query<SnapshotRule>(
      `SELECT
         id, type, rule_text, why, bad_examples, good_examples, weight, is_active
       FROM public.muse_rules
       WHERE story_id = $1 AND is_active = true
       ORDER BY weight DESC, created_at DESC, id DESC`,
      [storyId]
    );

    const auditSnapshot = activeRes.rows.map((r) => ({
      id: Number(r.id ?? 0) || null,
      type: r.type,
      rule_text: r.rule_text,
      why: r.why ?? null,
      bad_examples: normalizeExamples(r.bad_examples),
      good_examples: normalizeExamples(r.good_examples),
      weight: Number(r.weight ?? 50),
      is_active: true,
    }));

    const auditRes = await client.query<{ id: number }>(
      `INSERT INTO public.muse_snapshots
         (story_id, action, source_snapshot_id, note, rules_snapshot, created_by)
       VALUES
         ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id`,
      [storyId, mode, snapshotId, note, JSON.stringify(auditSnapshot), createdBy]
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      story_id: storyId,
      source_snapshot_id: snapshotId,
      audit_snapshot_id: Number(auditRes.rows[0]?.id ?? 0),
      applied_count: auditSnapshot.length,
    });
  } catch (error: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    const msg = error instanceof Error ? error.message : "MUSE_SNAPSHOT_APPLY_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

export async function fetchMuseRulesForStream(storyId: number): Promise<MuseRule[]> {
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

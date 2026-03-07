import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { diffLines } from "diff";
import type { PoolClient } from "pg";
import { getAgentDrawerResponse as getAgentDrawerServiceResponse } from "@/features/agents/server/agentDrawerService";

type AgentRunRow = {
  id: number;
  job_id: number | null;
  task_id: number | null;
  story_id: number;
  chapter_id: string | null;
  agent_name: string;
  prompt_version_id: number | null;
  model_name: string | null;
  input_hash: string;
  output_hash: string | null;
  latency_ms: number | null;
  token_in: number | null;
  token_out: number | null;
  status: string;
  error_code: string | null;
  quality_json: unknown;
  context_snapshot_id: number | null;
  strategy_profile_version_id: number | null;
  rationale_summary: string | null;
  created_at: string;
};

async function resolveStoryId(slug: string): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  const id = Number(res.rows[0]?.id ?? 0);
  if (!id) throw new Error("NOT_FOUND");
  return id;
}

type AgentProfileRow = {
  id: number;
  species_name: string;
  nick_name: string;
  base_dna_id: number | null;
  experience_pts: string;
  level: number;
  is_sealed: boolean;
  created_at: string;
  updated_at: string;
};

type AgentEquipmentSlotRow = {
  id: number;
  agent_profile_id: number;
  story_id: number;
  slot_type: string;
  artifact_ref_type: string;
  artifact_id: string;
  stats_mod: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AgentProfileEventRow = {
  id: number;
  agent_profile_id: number;
  story_id: number | null;
  action: string;
  details_json: unknown;
  actor: string;
  created_at: string;
};

function parseBoolFlag(raw: string | null, fallback: boolean): boolean {
  if (!raw) return fallback;
  const val = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(val)) return true;
  if (["0", "false", "no", "off"].includes(val)) return false;
  return fallback;
}

function computeAgentLevel(xp: number): number {
  const safeXp = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const level = Math.floor(Math.sqrt(safeXp / 1000)) + 1;
  return Math.max(1, Math.min(100, level));
}

async function insertAgentProfileEvent(
  client: PoolClient,
  args: {
    agentProfileId: number;
    storyId?: number | null;
    action: "CREATE_PROFILE" | "SEAL" | "UNSEAL" | "XP_RECALC" | "SLOT_ATTACH" | "SLOT_REPLACE";
    actor?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const actor = (args.actor || "studio").trim() || "studio";
  await client.query(
    `INSERT INTO public.agent_profile_event
       (agent_profile_id, story_id, action, details_json, actor)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [args.agentProfileId, args.storyId ?? null, args.action, JSON.stringify(args.details || {}), actor]
  );
}

export async function getAgentProfilesResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const speciesName = (req.nextUrl.searchParams.get("species_name") ?? "").trim();
    const sealedOnly = parseBoolFlag(req.nextUrl.searchParams.get("sealed_only"), false);
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 200);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 200));

    const where: string[] = [];
    const params: Array<string | number | boolean> = [];
    if (speciesName) {
      params.push(speciesName);
      where.push(`p.species_name = $${params.length}`);
    }
    if (sealedOnly) {
      params.push(true);
      where.push(`p.is_sealed = $${params.length}`);
    }
    const paramsForProfiles = [...params];
    paramsForProfiles.push(limit);
    const limitParam = paramsForProfiles.length;

    const sql = `
      SELECT
        p.id,
        p.species_name,
        p.nick_name,
        p.base_dna_id,
        p.experience_pts::text,
        p.level,
        p.is_sealed,
        p.created_at::text,
        p.updated_at::text
      FROM public.agent_profiles p
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY p.level DESC, p.experience_pts DESC, p.id DESC
      LIMIT $${limitParam}
    `;
    const rows = await pool.query<AgentProfileRow>(sql, paramsForProfiles);

    const profileIds = rows.rows.map((x) => Number(x.id)).filter((x) => Number.isFinite(x) && x > 0);
    let activeSlotsByProfile = new Map<number, number>();
    if (profileIds.length > 0) {
      const slotRes = await pool.query<{ agent_profile_id: number; active_slots: string }>(
        `SELECT agent_profile_id, COUNT(*)::text AS active_slots
         FROM public.agent_equipment_slots
         WHERE story_id = $1
           AND is_active = true
           AND agent_profile_id = ANY($2::bigint[])
         GROUP BY agent_profile_id`,
        [storyId, profileIds]
      );
      activeSlotsByProfile = new Map(
        slotRes.rows.map((x) => [Number(x.agent_profile_id), Number(x.active_slots || 0)])
      );
    }

    const items = rows.rows.map((row) => ({
      ...row,
      experience_pts: Number(row.experience_pts || 0),
      active_slot_count: activeSlotsByProfile.get(Number(row.id)) || 0,
    }));
    return NextResponse.json({ ok: true, story_id: storyId, items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_PROFILES_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

function sanitizeVisualProfile(input: unknown): Record<string, string> {
  const obj = isPlainObject(input) ? input : {};
  const pick = (key: string, fallback: string): string => {
    const raw = obj[key];
    return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 80) : fallback;
  };
  return {
    skin: pick("skin", "mint_core"),
    frame: pick("frame", "bronze_ring"),
    badge: pick("badge", "split_master"),
    title: pick("title", ""),
    fx_level: pick("fx_level", "low"),
  };
}

export async function getAgentDrawerResponse(
  req: NextRequest,
  storySlug: string,
  agentNameRaw: string
): Promise<NextResponse> {
  return getAgentDrawerServiceResponse(req, storySlug, agentNameRaw);
}

export async function patchAgentVisualProfileResponse(
  req: NextRequest,
  storySlug: string,
  agentNameRaw: string
): Promise<NextResponse> {
  try {
    await resolveStoryId(storySlug);
    const agentName = decodeURIComponent(agentNameRaw || "").trim();
    if (!agentName) {
      return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const profileIdRaw = Number(body.profile_id ?? 0);
    const visualProfile = sanitizeVisualProfile(body.visual_profile);
    const profileId = Number.isFinite(profileIdRaw) && profileIdRaw > 0 ? Math.floor(profileIdRaw) : null;

    let targetProfileId = profileId;
    if (!targetProfileId) {
      const res = await pool.query<{ id: number }>(
        `SELECT id
         FROM public.agent_profiles
         WHERE species_name = $1
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
        [agentName]
      );
      targetProfileId = Number(res.rows[0]?.id ?? 0);
    }
    if (!targetProfileId) {
      return NextResponse.json({ ok: false, error: "AGENT_PROFILE_NOT_FOUND" }, { status: 404 });
    }
    try {
      await pool.query(
        `UPDATE public.agent_profiles
         SET visual_profile_json = $2::jsonb, updated_at = now()
         WHERE id = $1`,
        [targetProfileId, JSON.stringify(visualProfile)]
      );
    } catch (error: unknown) {
      if (error && typeof error === "object" && (error as { code?: string }).code === "42703") {
        return NextResponse.json({ ok: false, error: "VISUAL_PROFILE_SCHEMA_MISSING" }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, profile_id: targetProfileId, visual_profile: visualProfile });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "PATCH_AGENT_VISUAL_PROFILE_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentProfileResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const speciesName = typeof body.species_name === "string" ? body.species_name.trim() : "";
    const nickName = typeof body.nick_name === "string" ? body.nick_name.trim() : "";
    const baseDnaIdRaw = Number(body.base_dna_id ?? 0);
    const baseDnaId = Number.isFinite(baseDnaIdRaw) && baseDnaIdRaw > 0 ? Math.floor(baseDnaIdRaw) : null;

    if (!speciesName) {
      return NextResponse.json({ ok: false, error: "SPECIES_NAME_REQUIRED" }, { status: 400 });
    }
    await client.query("BEGIN");
    if (baseDnaId) {
      const dnaRes = await client.query<{ id: number }>(
        `SELECT id FROM public.agent_prompt_version WHERE id = $1 LIMIT 1`,
        [baseDnaId]
      );
      if ((dnaRes.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "BASE_DNA_NOT_FOUND" }, { status: 404 });
      }
    }
    const row = await client.query<{ id: number }>(
      `INSERT INTO public.agent_profiles
         (species_name, nick_name, base_dna_id, experience_pts, level, is_sealed)
       VALUES ($1, $2, $3, 0, 1, false)
       RETURNING id`,
      [speciesName, nickName || speciesName, baseDnaId]
    );
    await insertAgentProfileEvent(client, {
      agentProfileId: Number(row.rows[0].id),
      action: "CREATE_PROFILE",
      details: { species_name: speciesName, nick_name: nickName || speciesName, base_dna_id: baseDnaId },
    });
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: Number(row.rows[0].id) });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "CREATE_AGENT_PROFILE_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function getAgentProfileSlotsResponse(
  req: NextRequest,
  storySlug: string,
  profileIdRaw: string
): Promise<NextResponse> {
  try {
    const defaultStoryId = await resolveStoryId(storySlug);
    const profileId = Number(profileIdRaw || 0);
    const storyIdRaw = Number(req.nextUrl.searchParams.get("story_id") || defaultStoryId);
    const activeOnly = parseBoolFlag(req.nextUrl.searchParams.get("active_only"), true);
    if (!Number.isFinite(profileId) || profileId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_PROFILE_ID" }, { status: 400 });
    }
    if (!Number.isFinite(storyIdRaw) || storyIdRaw <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_STORY_ID" }, { status: 400 });
    }
    const params: Array<number | boolean> = [profileId, storyIdRaw];
    const where = ["agent_profile_id = $1", "story_id = $2"];
    if (activeOnly) {
      params.push(true);
      where.push(`is_active = $${params.length}`);
    }
    const rows = await pool.query<AgentEquipmentSlotRow>(
      `SELECT
         id, agent_profile_id, story_id, slot_type, artifact_ref_type, artifact_id, stats_mod, is_active,
         created_at::text, updated_at::text
       FROM public.agent_equipment_slots
       WHERE ${where.join(" AND ")}
       ORDER BY is_active DESC, updated_at DESC, id DESC`,
      params
    );
    return NextResponse.json({
      ok: true,
      profile_id: profileId,
      story_id: storyIdRaw,
      items: rows.rows.map((row) => ({
        ...row,
        stats_mod: isPlainObject(row.stats_mod) ? row.stats_mod : {},
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_PROFILE_SLOTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentProfileSlotResponse(
  req: NextRequest,
  storySlug: string,
  profileIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const defaultStoryId = await resolveStoryId(storySlug);
    const profileId = Number(profileIdRaw || 0);
    if (!Number.isFinite(profileId) || profileId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_PROFILE_ID" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const storyIdRaw = Number(body.story_id ?? defaultStoryId);
    const slotTypeRaw = typeof body.slot_type === "string" ? body.slot_type.trim().toUpperCase() : "";
    const artifactRefType = typeof body.artifact_ref_type === "string" && body.artifact_ref_type.trim()
      ? body.artifact_ref_type.trim().toUpperCase()
      : "UNKNOWN";
    const artifactId = typeof body.artifact_id === "string" ? body.artifact_id.trim() : "";
    const statsMod = isPlainObject(body.stats_mod) ? body.stats_mod : {};
    const allowedSlotTypes = new Set(["DNA", "WEAPON_PROMPT", "SKILL_GEM", "MEMORY_SHARD"]);

    if (!Number.isFinite(storyIdRaw) || storyIdRaw <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_STORY_ID" }, { status: 400 });
    }
    if (!allowedSlotTypes.has(slotTypeRaw)) {
      return NextResponse.json({ ok: false, error: "INVALID_SLOT_TYPE" }, { status: 400 });
    }
    if (!artifactId) {
      return NextResponse.json({ ok: false, error: "ARTIFACT_ID_REQUIRED" }, { status: 400 });
    }

    await client.query("BEGIN");
    const profileRes = await client.query<{ is_sealed: boolean }>(
      `SELECT is_sealed FROM public.agent_profiles WHERE id = $1 LIMIT 1`,
      [profileId]
    );
    if ((profileRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "AGENT_PROFILE_NOT_FOUND" }, { status: 404 });
    }
    if (Boolean(profileRes.rows[0].is_sealed) && slotTypeRaw === "DNA") {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "SEALED_PROFILE_DNA_IMMUTABLE" }, { status: 409 });
    }

    const existingActiveRes = await client.query<{ id: number }>(
      `SELECT id
       FROM public.agent_equipment_slots
       WHERE agent_profile_id = $1
         AND story_id = $2
         AND slot_type = $3
         AND is_active = true
       LIMIT 1`,
      [profileId, storyIdRaw, slotTypeRaw]
    );
    const hadActive = (existingActiveRes.rowCount ?? 0) > 0;

    await client.query(
      `UPDATE public.agent_equipment_slots
       SET is_active = false, updated_at = now()
       WHERE agent_profile_id = $1
         AND story_id = $2
         AND slot_type = $3
         AND is_active = true`,
      [profileId, storyIdRaw, slotTypeRaw]
    );

    const insertRes = await client.query<{ id: number }>(
      `INSERT INTO public.agent_equipment_slots
         (agent_profile_id, story_id, slot_type, artifact_ref_type, artifact_id, stats_mod, is_active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, true)
       RETURNING id`,
      [profileId, storyIdRaw, slotTypeRaw, artifactRefType, artifactId, JSON.stringify(statsMod)]
    );
    await insertAgentProfileEvent(client, {
      agentProfileId: profileId,
      storyId: storyIdRaw,
      action: hadActive ? "SLOT_REPLACE" : "SLOT_ATTACH",
      details: {
        slot_type: slotTypeRaw,
        artifact_ref_type: artifactRefType,
        artifact_id: artifactId,
        new_slot_id: Number(insertRes.rows[0].id),
      },
    });
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: Number(insertRes.rows[0].id) });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "UPSERT_AGENT_PROFILE_SLOT_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function postAgentProfileSealResponse(
  req: NextRequest,
  storySlug: string,
  profileIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const profileId = Number(profileIdRaw || 0);
    if (!Number.isFinite(profileId) || profileId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_PROFILE_ID" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "studio";
    await client.query("BEGIN");
    const updateRes = await client.query<{ id: number }>(
      `UPDATE public.agent_profiles
       SET is_sealed = true, updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [profileId]
    );
    if ((updateRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "AGENT_PROFILE_NOT_FOUND" }, { status: 404 });
    }
    await insertAgentProfileEvent(client, {
      agentProfileId: profileId,
      action: "SEAL",
      actor,
    });
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, profile_id: profileId, is_sealed: true });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "SEAL_AGENT_PROFILE_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function postAgentProfileUnsealResponse(
  req: NextRequest,
  storySlug: string,
  profileIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const profileId = Number(profileIdRaw || 0);
    if (!Number.isFinite(profileId) || profileId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_PROFILE_ID" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "studio";
    await client.query("BEGIN");
    const updateRes = await client.query<{ id: number }>(
      `UPDATE public.agent_profiles
       SET is_sealed = false, updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [profileId]
    );
    if ((updateRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "AGENT_PROFILE_NOT_FOUND" }, { status: 404 });
    }
    await insertAgentProfileEvent(client, {
      agentProfileId: profileId,
      action: "UNSEAL",
      actor,
    });
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, profile_id: profileId, is_sealed: false });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "UNSEAL_AGENT_PROFILE_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function postAgentProfileRecomputeLevelResponse(
  req: NextRequest,
  storySlug: string,
  profileIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryId(storySlug);
    const profileId = Number(profileIdRaw || 0);
    if (!Number.isFinite(profileId) || profileId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_PROFILE_ID" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "studio";
    const chapterId = typeof body.chapter_id === "string" && body.chapter_id.trim() ? body.chapter_id.trim() : null;

    await client.query("BEGIN");
    const profileRes = await client.query<{ id: number; species_name: string }>(
      `SELECT id, species_name
       FROM public.agent_profiles
       WHERE id = $1
       LIMIT 1`,
      [profileId]
    );
    if ((profileRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "AGENT_PROFILE_NOT_FOUND" }, { status: 404 });
    }
    const speciesName = String(profileRes.rows[0].species_name || "").trim();
    if (!speciesName) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "AGENT_PROFILE_SPECIES_MISSING" }, { status: 409 });
    }

    const where: string[] = ["story_id = $1", "agent_name = $2"];
    const params: Array<string | number> = [storyId, speciesName];
    if (chapterId) {
      params.push(chapterId);
      where.push(`chapter_id = $${params.length}`);
    }
    const aggRes = await client.query<{ xp: string }>(
      `SELECT COALESCE(SUM(GREATEST(COALESCE(token_in, 0), 0) + GREATEST(COALESCE(token_out, 0), 0)), 0)::text AS xp
       FROM public.agent_run_trace
       WHERE ${where.join(" AND ")}`,
      params
    );
    const xp = Number(aggRes.rows[0]?.xp || 0);
    const level = computeAgentLevel(xp);
    await client.query(
      `UPDATE public.agent_profiles
       SET experience_pts = $2, level = $3, updated_at = now()
       WHERE id = $1`,
      [profileId, xp, level]
    );
    await insertAgentProfileEvent(client, {
      agentProfileId: profileId,
      storyId,
      action: "XP_RECALC",
      actor,
      details: { chapter_id: chapterId, experience_pts: xp, level },
    });
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, profile_id: profileId, experience_pts: xp, level });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "RECOMPUTE_AGENT_PROFILE_LEVEL_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function getAgentProfileEventsResponse(
  req: NextRequest,
  storySlug: string,
  profileIdRaw: string
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const profileId = Number(profileIdRaw || 0);
    if (!Number.isFinite(profileId) || profileId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_PROFILE_ID" }, { status: 400 });
    }
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 50);
    const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));
    const rows = await pool.query<AgentProfileEventRow>(
      `SELECT id, agent_profile_id, story_id, action, details_json, actor, created_at::text
       FROM public.agent_profile_event
       WHERE agent_profile_id = $1
         AND (story_id = $2 OR story_id IS NULL)
       ORDER BY id DESC
       LIMIT $3`,
      [profileId, storyId, limit]
    );
    return NextResponse.json({
      ok: true,
      profile_id: profileId,
      story_id: storyId,
      items: rows.rows.map((row) => ({
        ...row,
        details_json: isPlainObject(row.details_json) ? row.details_json : {},
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_PROFILE_EVENTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function getAgentRunsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const chapterId = (req.nextUrl.searchParams.get("chapter_id") ?? "").trim();
    const status = (req.nextUrl.searchParams.get("status") ?? "").trim().toUpperCase();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];

    if (agentName) {
      params.push(agentName);
      where.push(`agent_name = $${params.length}`);
    }
    if (chapterId) {
      params.push(chapterId);
      where.push(`chapter_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    params.push(limit);

    const sql = `
      SELECT
        id, job_id, task_id, story_id, chapter_id, agent_name, prompt_version_id, model_name,
        input_hash, output_hash, latency_ms, token_in, token_out, status, error_code,
        quality_json, context_snapshot_id, strategy_profile_version_id, rationale_summary, created_at::text
      FROM public.agent_run_trace
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `;
    const rows = await pool.query<AgentRunRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_RUNS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function getAgentRunDetailResponse(
  _req: NextRequest,
  storySlug: string,
  runIdRaw: string
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const runId = Number(runIdRaw || 0);
    if (!runId) return NextResponse.json({ ok: false, error: "INVALID_RUN_ID" }, { status: 400 });

    const row = await pool.query<AgentRunRow>(
      `SELECT
         id, job_id, task_id, story_id, chapter_id, agent_name, prompt_version_id, model_name,
         input_hash, output_hash, latency_ms, token_in, token_out, status, error_code,
         quality_json, context_snapshot_id, strategy_profile_version_id, rationale_summary, created_at::text
       FROM public.agent_run_trace
       WHERE id = $1
         AND story_id = $2
       LIMIT 1`,
      [runId, storyId]
    );
    if (!row.rowCount) return NextResponse.json({ ok: false, error: "RUN_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, item: row.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_RUN_DETAIL_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentMetricRow = {
  agent_name: string;
  total_runs: string;
  done_runs: string;
  failed_runs: string;
  timeout_runs: string;
  avg_latency_ms: string | null;
  meta_leak_runs: string;
};

export async function getAgentMetricsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const from = (req.nextUrl.searchParams.get("from") ?? "").trim();
    const to = (req.nextUrl.searchParams.get("to") ?? "").trim();

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];

    if (from) {
      params.push(from);
      where.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`created_at <= $${params.length}::timestamptz`);
    }

    const sql = `
      SELECT
        agent_name,
        COUNT(*)::text AS total_runs,
        COUNT(*) FILTER (WHERE status = 'DONE')::text AS done_runs,
        COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_runs,
        COUNT(*) FILTER (WHERE status = 'TIMEOUT')::text AS timeout_runs,
        ROUND(AVG(latency_ms)::numeric, 2)::text AS avg_latency_ms,
        COUNT(*) FILTER (WHERE COALESCE((quality_json->>'meta_leak')::boolean, false))::text AS meta_leak_runs
      FROM public.agent_run_trace
      WHERE ${where.join(" AND ")}
      GROUP BY agent_name
      ORDER BY agent_name ASC
    `;
    const rows = await pool.query<AgentMetricRow>(sql, params);

    const items = rows.rows.map((r) => {
      const total = Number(r.total_runs || 0);
      const done = Number(r.done_runs || 0);
      const failed = Number(r.failed_runs || 0);
      const timeout = Number(r.timeout_runs || 0);
      const metaLeak = Number(r.meta_leak_runs || 0);
      return {
        agent_name: r.agent_name,
        total_runs: total,
        done_runs: done,
        failed_runs: failed,
        timeout_runs: timeout,
        success_rate: total > 0 ? done / total : 0,
        failure_rate: total > 0 ? failed / total : 0,
        timeout_rate: total > 0 ? timeout / total : 0,
        avg_latency_ms: r.avg_latency_ms ? Number(r.avg_latency_ms) : null,
        meta_leak_rate: total > 0 ? metaLeak / total : 0,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_METRICS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentCoverageItem = {
  agent_name: string;
  expected_count: number;
  traced_count: number;
  coverage_rate: number;
  below_threshold: boolean;
};

export async function getAgentCoverageHealthResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const from = (req.nextUrl.searchParams.get("from") ?? "").trim();
    const to = (req.nextUrl.searchParams.get("to") ?? "").trim();
    const thresholdRaw = Number(req.nextUrl.searchParams.get("threshold") ?? 0.99);
    const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, Math.min(1, thresholdRaw)) : 0.99;

    const taskWhere: string[] = ["story_id = $1"];
    const traceWhere: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];

    if (from) {
      params.push(from);
      taskWhere.push(`created_at >= $${params.length}::timestamptz`);
      traceWhere.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      taskWhere.push(`created_at <= $${params.length}::timestamptz`);
      traceWhere.push(`created_at <= $${params.length}::timestamptz`);
    }

    const sql = `
      WITH expected_raw AS (
        SELECT 'NARRATIVE_START'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_START'
        UNION ALL
        SELECT 'NARRATIVE_STYLIST'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_STYLIST'
        UNION ALL
        SELECT 'NARRATIVE_CRITIC'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_CRITIC'
        UNION ALL
        SELECT 'NARRATIVE_REFINE'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_REFINE'
        UNION ALL
        SELECT 'NARRATIVE_FINALIZE'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'NARRATIVE_FINALIZE'
        UNION ALL
        SELECT 'SPLITTER'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'CHAPTER_SPLIT_LLM'
        UNION ALL
        SELECT 'SPLIT_CRITIC'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'CHAPTER_SPLIT_LLM'
        UNION ALL
        SELECT 'SUPERVISOR'::text AS agent_name, COUNT(*)::int AS expected_count
        FROM public.ingest_task
        WHERE ${taskWhere.join(" AND ")} AND task_type = 'CHAPTER_SPLIT_LLM'
      ),
      traced AS (
        SELECT agent_name, COUNT(DISTINCT task_id)::int AS traced_count
        FROM public.agent_run_trace
        WHERE ${traceWhere.join(" AND ")}
          AND agent_name IN (
            'NARRATIVE_START',
            'NARRATIVE_STYLIST',
            'NARRATIVE_CRITIC',
            'NARRATIVE_REFINE',
            'NARRATIVE_FINALIZE',
            'SPLITTER',
            'SPLIT_CRITIC',
            'SUPERVISOR'
          )
          AND task_id IS NOT NULL
        GROUP BY agent_name
      )
      SELECT
        e.agent_name,
        e.expected_count,
        COALESCE(t.traced_count, 0)::int AS traced_count
      FROM expected_raw e
      LEFT JOIN traced t ON t.agent_name = e.agent_name
      ORDER BY e.agent_name ASC
    `;

    const rows = await pool.query<{ agent_name: string; expected_count: number; traced_count: number }>(sql, params);
    const items: AgentCoverageItem[] = rows.rows.map((r) => {
      const expected = Number(r.expected_count || 0);
      const traced = Number(r.traced_count || 0);
      const coverageRate = expected > 0 ? traced / expected : 1;
      return {
        agent_name: r.agent_name,
        expected_count: expected,
        traced_count: traced,
        coverage_rate: coverageRate,
        below_threshold: expected > 0 && coverageRate < threshold,
      };
    });

    const overallExpected = items.reduce((acc, x) => acc + x.expected_count, 0);
    const overallTraced = items.reduce((acc, x) => acc + x.traced_count, 0);
    const overallCoverage = overallExpected > 0 ? overallTraced / overallExpected : 1;
    const alerts = items.filter((x) => x.below_threshold);

    return NextResponse.json({
      ok: true,
      threshold,
      summary: {
        overall_expected: overallExpected,
        overall_traced: overallTraced,
        overall_coverage: overallCoverage,
        alert_count: alerts.length,
      },
      items,
      alerts,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_COVERAGE_HEALTH_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentAlertItem = {
  alert_type: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  agent_name: string | null;
  metric_name: string;
  metric_value: number;
  threshold: number;
  message: string;
};

export async function getAgentAlertsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const from = (req.nextUrl.searchParams.get("from") ?? "").trim();
    const to = (req.nextUrl.searchParams.get("to") ?? "").trim();
    const failureSpikeThreshold = Number(req.nextUrl.searchParams.get("failure_spike_threshold") ?? 3);
    const timeoutRateThreshold = Number(req.nextUrl.searchParams.get("timeout_rate_threshold") ?? 0.1);
    const metaLeakRateThreshold = Number(req.nextUrl.searchParams.get("meta_leak_rate_threshold") ?? 0.01);

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];
    if (from) {
      params.push(from);
      where.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`created_at <= $${params.length}::timestamptz`);
    }

    const failureRows = await pool.query<{ agent_name: string; error_code: string | null; c: string }>(
      `SELECT agent_name, error_code, COUNT(*)::text AS c
       FROM public.agent_run_trace
       WHERE ${where.join(" AND ")}
         AND status = 'FAILED'
       GROUP BY agent_name, error_code
       HAVING COUNT(*) >= $${params.length + 1}
       ORDER BY COUNT(*) DESC
       LIMIT 40`,
      [...params, Math.max(1, Math.floor(failureSpikeThreshold))]
    );

    const rateRows = await pool.query<{ agent_name: string; total_runs: string; timeout_runs: string; meta_leak_runs: string }>(
      `SELECT
         agent_name,
         COUNT(*)::text AS total_runs,
         COUNT(*) FILTER (WHERE status = 'TIMEOUT')::text AS timeout_runs,
         COUNT(*) FILTER (WHERE COALESCE((quality_json->>'meta_leak')::boolean, false))::text AS meta_leak_runs
       FROM public.agent_run_trace
       WHERE ${where.join(" AND ")}
       GROUP BY agent_name
       ORDER BY agent_name ASC`,
      params
    );

    const items: AgentAlertItem[] = [];
    for (const r of failureRows.rows) {
      const count = Number(r.c || 0);
      const sev: AgentAlertItem["severity"] = count >= 10 ? "CRITICAL" : count >= 5 ? "WARN" : "INFO";
      items.push({
        alert_type: "ERROR_SPIKE",
        severity: sev,
        agent_name: r.agent_name,
        metric_name: `error_code:${r.error_code || "UNKNOWN"}`,
        metric_value: count,
        threshold: Math.max(1, Math.floor(failureSpikeThreshold)),
        message: `${r.agent_name} error spike (${r.error_code || "UNKNOWN"}): ${count}`,
      });
    }

    for (const r of rateRows.rows) {
      const total = Number(r.total_runs || 0);
      if (total <= 0) continue;
      const timeoutRate = Number(r.timeout_runs || 0) / total;
      const metaLeakRate = Number(r.meta_leak_runs || 0) / total;
      if (timeoutRate >= timeoutRateThreshold) {
        items.push({
          alert_type: "TIMEOUT_RATE",
          severity: timeoutRate >= timeoutRateThreshold * 2 ? "CRITICAL" : "WARN",
          agent_name: r.agent_name,
          metric_name: "timeout_rate",
          metric_value: timeoutRate,
          threshold: timeoutRateThreshold,
          message: `${r.agent_name} timeout rate ${(timeoutRate * 100).toFixed(1)}%`,
        });
      }
      if (metaLeakRate >= metaLeakRateThreshold) {
        items.push({
          alert_type: "META_LEAK_RATE",
          severity: metaLeakRate >= metaLeakRateThreshold * 3 ? "CRITICAL" : "WARN",
          agent_name: r.agent_name,
          metric_name: "meta_leak_rate",
          metric_value: metaLeakRate,
          threshold: metaLeakRateThreshold,
          message: `${r.agent_name} meta leak rate ${(metaLeakRate * 100).toFixed(2)}%`,
        });
      }
    }

    items.sort((a, b) => {
      const rank = { CRITICAL: 3, WARN: 2, INFO: 1 };
      const ra = rank[a.severity];
      const rb = rank[b.severity];
      if (ra !== rb) return rb - ra;
      return b.metric_value - a.metric_value;
    });
    return NextResponse.json({ ok: true, items: items.slice(0, 60) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_ALERTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentErrorTaxonomyRow = {
  taxonomy: string;
  hit_count: string;
};

type AgentErrorTaxonomyAgentRow = {
  taxonomy: string;
  agent_name: string;
  hit_count: string;
};

const TAXONOMY_ORDER = ["META_LEAK", "EMPTY_OUTPUT", "ENTITY_DRIFT", "BUDGET_MISS"] as const;

export async function getAgentErrorTaxonomyResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const from = (req.nextUrl.searchParams.get("from") ?? "").trim();
    const to = (req.nextUrl.searchParams.get("to") ?? "").trim();
    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];
    if (from) {
      params.push(from);
      where.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`created_at <= $${params.length}::timestamptz`);
    }

    const classify = `
      CASE
        WHEN COALESCE((quality_json->>'meta_leak')::boolean, false)
             OR COALESCE(error_code, '') ILIKE '%META_LEAK%'
        THEN 'META_LEAK'
        WHEN COALESCE(error_code, '') ILIKE '%EMPTY%'
             OR COALESCE((quality_json->>'empty_output')::boolean, false)
        THEN 'EMPTY_OUTPUT'
        WHEN COALESCE(error_code, '') ILIKE '%ENTITY%'
             OR COALESCE((quality_json->>'entity_drift')::boolean, false)
             OR COALESCE((quality_json->>'character_drift_detected')::boolean, false)
        THEN 'ENTITY_DRIFT'
        WHEN COALESCE(error_code, '') ILIKE '%WORD_BUDGET%'
             OR COALESCE(error_code, '') ILIKE '%BUDGET%'
             OR COALESCE((quality_json->>'word_budget_underflow')::boolean, false)
             OR COALESCE((quality_json->>'word_budget_overflow')::boolean, false)
        THEN 'BUDGET_MISS'
        ELSE NULL
      END
    `;

    const totalRows = await pool.query<{ total_runs: string }>(
      `SELECT COUNT(*)::text AS total_runs
       FROM public.agent_run_trace
       WHERE ${where.join(" AND ")}`,
      params
    );
    const totalRuns = Number(totalRows.rows[0]?.total_runs ?? 0);

    const rows = await pool.query<AgentErrorTaxonomyRow>(
      `SELECT taxonomy, COUNT(*)::text AS hit_count
       FROM (
         SELECT ${classify} AS taxonomy
         FROM public.agent_run_trace
         WHERE ${where.join(" AND ")}
       ) x
       WHERE taxonomy IS NOT NULL
       GROUP BY taxonomy`,
      params
    );

    const byAgentRows = await pool.query<AgentErrorTaxonomyAgentRow>(
      `SELECT taxonomy, agent_name, COUNT(*)::text AS hit_count
       FROM (
         SELECT
           agent_name,
           ${classify} AS taxonomy
         FROM public.agent_run_trace
         WHERE ${where.join(" AND ")}
       ) x
       WHERE taxonomy IS NOT NULL
       GROUP BY taxonomy, agent_name`,
      params
    );

    const countMap = new Map<string, number>();
    for (const row of rows.rows) {
      countMap.set(row.taxonomy, Number(row.hit_count || 0));
    }

    const byTaxonomyAgent = new Map<string, Array<{ agent_name: string; hit_count: number }>>();
    for (const row of byAgentRows.rows) {
      const list = byTaxonomyAgent.get(row.taxonomy) ?? [];
      list.push({ agent_name: row.agent_name, hit_count: Number(row.hit_count || 0) });
      byTaxonomyAgent.set(row.taxonomy, list);
    }
    for (const [k, list] of byTaxonomyAgent.entries()) {
      list.sort((a, b) => b.hit_count - a.hit_count || a.agent_name.localeCompare(b.agent_name));
      byTaxonomyAgent.set(k, list.slice(0, 5));
    }

    const items = TAXONOMY_ORDER.map((taxonomy) => {
      const count = countMap.get(taxonomy) ?? 0;
      return {
        taxonomy,
        hit_count: count,
        hit_rate: totalRuns > 0 ? count / totalRuns : 0,
        top_agents: byTaxonomyAgent.get(taxonomy) ?? [],
      };
    });

    return NextResponse.json({
      ok: true,
      summary: {
        total_runs: totalRuns,
        total_hits: items.reduce((acc, x) => acc + x.hit_count, 0),
      },
      items,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_ERROR_TAXONOMY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentPromptImpactRow = {
  agent_name: string;
  prompt_version_id: number | null;
  total_runs: string;
  done_runs: string;
  failed_runs: string;
  avg_latency_ms: string | null;
  p95_latency_ms: string | null;
  meta_leak_runs: string;
};

export async function getAgentPromptImpactResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const from = (req.nextUrl.searchParams.get("from") ?? "").trim();
    const to = (req.nextUrl.searchParams.get("to") ?? "").trim();

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];
    if (from) {
      params.push(from);
      where.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`created_at <= $${params.length}::timestamptz`);
    }

    const rows = await pool.query<AgentPromptImpactRow>(
      `SELECT
         agent_name,
         prompt_version_id,
         COUNT(*)::text AS total_runs,
         COUNT(*) FILTER (WHERE status = 'DONE')::text AS done_runs,
         COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_runs,
         ROUND(AVG(latency_ms)::numeric, 2)::text AS avg_latency_ms,
         ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2)::text AS p95_latency_ms,
         COUNT(*) FILTER (WHERE COALESCE((quality_json->>'meta_leak')::boolean, false))::text AS meta_leak_runs
       FROM public.agent_run_trace
       WHERE ${where.join(" AND ")}
       GROUP BY agent_name, prompt_version_id
       ORDER BY COUNT(*) DESC, agent_name ASC
       LIMIT 300`,
      params
    );

    const items = rows.rows.map((r) => {
      const total = Number(r.total_runs || 0);
      const done = Number(r.done_runs || 0);
      const failed = Number(r.failed_runs || 0);
      const meta = Number(r.meta_leak_runs || 0);
      return {
        agent_name: r.agent_name,
        prompt_version_id: r.prompt_version_id,
        total_runs: total,
        success_rate: total > 0 ? done / total : 0,
        failure_rate: total > 0 ? failed / total : 0,
        meta_leak_rate: total > 0 ? meta / total : 0,
        avg_latency_ms: r.avg_latency_ms ? Number(r.avg_latency_ms) : null,
        p95_latency_ms: r.p95_latency_ms ? Number(r.p95_latency_ms) : null,
      };
    });
    return NextResponse.json({ ok: true, items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_PROMPT_IMPACT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentPromptVersionRow = {
  version_id: number;
  profile_id: number;
  agent_name: string;
  scope: string;
  story_id: number | null;
  chapter_id: string | null;
  version_no: number;
  status: string;
  created_by: string;
  created_at: string;
  change_note: string | null;
  system_prompt: string;
  developer_prompt: string | null;
  output_contract_json: unknown;
  guardrail_json: unknown;
};

const ALLOWED_SCOPES = new Set(["global", "story", "chapter"]);
const MIN_CANARY_SAMPLES = 20;
const MAX_FAILURE_RATE_DELTA = 0.02;
const MAX_META_LEAK_RATE_DELTA = 0.01;
const MAX_GOLDEN_FAILURE_RATE_DELTA = 0.01;
const DEFAULT_PROMOTE_LOOKBACK_HOURS = 168;
const SHADOW_REQUIRE_FOR_PROMOTION = String(process.env.AGENT_PROMOTE_REQUIRE_SHADOW ?? "").toLowerCase() === "true";
const SHADOW_MIN_SAMPLES = (() => {
  const raw = Number(process.env.AGENT_PROMOTE_SHADOW_MIN_SAMPLES ?? 20);
  return Number.isFinite(raw) ? Math.max(1, Math.min(10000, Math.floor(raw))) : 20;
})();
const SHADOW_MAX_FAILURE_RATE_DELTA = (() => {
  const raw = Number(process.env.AGENT_PROMOTE_SHADOW_MAX_FAILURE_RATE_DELTA ?? 0.01);
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.01;
})();
const SHADOW_MAX_LATENCY_DELTA_MS = (() => {
  const raw = Number(process.env.AGENT_PROMOTE_SHADOW_MAX_LATENCY_DELTA_MS ?? 250);
  return Number.isFinite(raw) ? Math.max(0, Math.min(60000, Math.floor(raw))) : 250;
})();
const ALLOWED_PROMOTION_REASON_TEMPLATE = new Set([
  "CANARY_SUCCESS",
  "QUALITY_FIX",
  "INCIDENT_MITIGATION",
  "MANUAL_OVERRIDE",
]);
const CONTRACT_ALLOWED_KEYS = new Set(["schema_version", "type", "required_fields", "max_output_chars", "notes", "strict"]);
const GUARDRAIL_ALLOWED_KEYS = new Set(["meta_leak_block", "max_retries", "entity_lock", "word_budget_min", "word_budget_max", "notes"]);

function parseGoldenChaptersEnv(): string[] {
  const raw = process.env.AGENT_PROMOTE_GOLDEN_CHAPTERS ?? "";
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => Boolean(x));
}

function parseGoldenMinRunsEnv(): number {
  const minGoldenRunsRaw = Number(process.env.AGENT_PROMOTE_GOLDEN_MIN_RUNS ?? 5);
  return Number.isFinite(minGoldenRunsRaw) ? Math.max(1, Math.min(1000, Math.floor(minGoldenRunsRaw))) : 5;
}

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01");
}

async function loadGoldenPolicyByStory(client: PoolClient, storyId: number): Promise<{
  chapterIds: string[];
  minRuns: number;
  source: "story_policy" | "env_fallback";
}> {
  try {
    const res = await client.query<{ golden_chapter_ids: unknown; golden_min_runs: number }>(
      `SELECT golden_chapter_ids, golden_min_runs
       FROM public.story_quality_policy
       WHERE story_id = $1
       LIMIT 1`,
      [storyId],
    );
    if ((res.rowCount ?? 0) > 0) {
      const row = res.rows[0];
      const chapterIds = Array.isArray(row.golden_chapter_ids)
        ? row.golden_chapter_ids.map((x) => String(x || "").trim()).filter((x) => Boolean(x))
        : [];
      const minRunsRaw = Number(row.golden_min_runs ?? 5);
      const minRuns = Number.isFinite(minRunsRaw) ? Math.max(1, Math.min(1000, Math.floor(minRunsRaw))) : 5;
      return { chapterIds, minRuns, source: "story_policy" };
    }
  } catch (error: unknown) {
    if (!isUndefinedTableError(error)) throw error;
  }

  return {
    chapterIds: parseGoldenChaptersEnv(),
    minRuns: parseGoldenMinRunsEnv(),
    source: "env_fallback",
  };
}

async function loadGoldenRegressionPerf(
  client: PoolClient,
  args: {
    storyId: number;
    candidateVersionId: number;
    baselineVersionId: number | null;
    lookbackHours: number;
    chapterIds: string[];
  },
): Promise<{
  candidateRuns: number;
  candidateFailureRate: number;
  baselineRuns: number;
  baselineFailureRate: number;
}> {
  const { storyId, candidateVersionId, baselineVersionId, lookbackHours, chapterIds } = args;
  if (!baselineVersionId || chapterIds.length === 0) {
    return {
      candidateRuns: 0,
      candidateFailureRate: 0,
      baselineRuns: 0,
      baselineFailureRate: 0,
    };
  }
  const perfRes = await client.query<{
    prompt_version_id: number;
    total_runs: string;
    failed_runs: string;
  }>(
    `SELECT
       prompt_version_id,
       COUNT(*)::text AS total_runs,
       COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_runs
     FROM public.agent_run_trace
     WHERE story_id = $1
       AND prompt_version_id IN ($2, $3)
       AND chapter_id = ANY($4::text[])
       AND created_at >= NOW() - make_interval(hours => $5::int)
     GROUP BY prompt_version_id`,
    [storyId, baselineVersionId, candidateVersionId, chapterIds, lookbackHours],
  );
  const byVersion = new Map<number, { total: number; failed: number }>();
  for (const row of perfRes.rows) {
    byVersion.set(Number(row.prompt_version_id), {
      total: Number(row.total_runs || 0),
      failed: Number(row.failed_runs || 0),
    });
  }
  const candidate = byVersion.get(candidateVersionId) || { total: 0, failed: 0 };
  const baseline = byVersion.get(baselineVersionId) || { total: 0, failed: 0 };
  return {
    candidateRuns: candidate.total,
    candidateFailureRate: candidate.total > 0 ? candidate.failed / candidate.total : 1,
    baselineRuns: baseline.total,
    baselineFailureRate: baseline.total > 0 ? baseline.failed / baseline.total : 0,
  };
}

async function loadShadowPromotionPerf(
  client: PoolClient,
  args: {
    storyId: number;
    candidateVersionId: number;
    baselineVersionId: number | null;
    lookbackHours: number;
  },
): Promise<{
  sampleCount: number;
  candidateFailureRate: number;
  baselineFailureRate: number;
  avgLatencyDeltaMs: number | null;
}> {
  const { storyId, candidateVersionId, baselineVersionId, lookbackHours } = args;
  if (!baselineVersionId) {
    return {
      sampleCount: 0,
      candidateFailureRate: 0,
      baselineFailureRate: 0,
      avgLatencyDeltaMs: null,
    };
  }
  try {
    const res = await client.query<{
      sample_count: string;
      candidate_failed: string;
      baseline_failed: string;
      avg_latency_delta_ms: string | null;
    }>(
      `WITH paired AS (
         SELECT
           srp.id,
           ar_active.status AS active_status,
           ar_shadow.status AS shadow_status,
           ar_active.latency_ms AS active_latency_ms,
           ar_shadow.latency_ms AS shadow_latency_ms
         FROM public.shadow_run_pair srp
         JOIN public.agent_run_trace ar_shadow ON ar_shadow.id = srp.shadow_run_trace_id
         LEFT JOIN public.agent_run_trace ar_active ON ar_active.id = srp.active_run_trace_id
         WHERE srp.story_id = $1
           AND srp.shadow_prompt_version_id = $2
           AND ar_shadow.prompt_version_id = $2
           AND (
             srp.active_prompt_version_id IS NULL
             OR srp.active_prompt_version_id = $3
           )
           AND (ar_active.id IS NULL OR ar_active.prompt_version_id = $3)
           AND srp.pair_status IN ('PAIRED', 'COMPARED')
           AND srp.created_at >= NOW() - make_interval(hours => $4::int)
       )
       SELECT
         COUNT(*)::text AS sample_count,
         COUNT(*) FILTER (WHERE COALESCE(upper(shadow_status), '') = 'FAILED')::text AS candidate_failed,
         COUNT(*) FILTER (WHERE COALESCE(upper(active_status), '') = 'FAILED')::text AS baseline_failed,
         AVG(
           CASE
             WHEN shadow_latency_ms IS NOT NULL AND active_latency_ms IS NOT NULL
               THEN (shadow_latency_ms - active_latency_ms)::numeric
             ELSE NULL
           END
         )::text AS avg_latency_delta_ms
       FROM paired`,
      [storyId, candidateVersionId, baselineVersionId, lookbackHours],
    );
    const row = res.rows[0];
    const sampleCount = Number(row?.sample_count || 0);
    if (sampleCount <= 0) {
      return {
        sampleCount: 0,
        candidateFailureRate: 0,
        baselineFailureRate: 0,
        avgLatencyDeltaMs: null,
      };
    }
    const candidateFailed = Number(row?.candidate_failed || 0);
    const baselineFailed = Number(row?.baseline_failed || 0);
    const avgLatencyDeltaMsRaw = Number(row?.avg_latency_delta_ms ?? NaN);
    return {
      sampleCount,
      candidateFailureRate: candidateFailed / Math.max(1, sampleCount),
      baselineFailureRate: baselineFailed / Math.max(1, sampleCount),
      avgLatencyDeltaMs: Number.isFinite(avgLatencyDeltaMsRaw) ? avgLatencyDeltaMsRaw : null,
    };
  } catch (error: unknown) {
    if (isUndefinedTableError(error)) {
      return {
        sampleCount: 0,
        candidateFailureRate: 0,
        baselineFailureRate: 0,
        avgLatencyDeltaMs: null,
      };
    }
    throw error;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatePromptContracts(
  agentName: string,
  outputContract: Record<string, unknown>,
  guardrail: Record<string, unknown>
): string | null {
  for (const key of Object.keys(outputContract)) {
    if (!CONTRACT_ALLOWED_KEYS.has(key)) return `OUTPUT_CONTRACT_KEY_NOT_ALLOWED:${key}`;
  }
  for (const key of Object.keys(guardrail)) {
    if (!GUARDRAIL_ALLOWED_KEYS.has(key)) return `GUARDRAIL_KEY_NOT_ALLOWED:${key}`;
  }
  if ("required_fields" in outputContract) {
    const required = outputContract.required_fields;
    if (!Array.isArray(required) || required.some((x) => typeof x !== "string" || !x.trim())) {
      return "OUTPUT_CONTRACT_REQUIRED_FIELDS_INVALID";
    }
  }
  if ("max_output_chars" in outputContract) {
    const maxChars = Number(outputContract.max_output_chars);
    if (!Number.isFinite(maxChars) || maxChars <= 0) return "OUTPUT_CONTRACT_MAX_OUTPUT_CHARS_INVALID";
  }
  if (agentName === "NARRATIVE_CRITIC") {
    const required = Array.isArray(outputContract.required_fields) ? outputContract.required_fields.map((x) => String(x)) : [];
    if (!required.includes("summary") || !required.includes("patches")) {
      return "CRITIC_CONTRACT_REQUIRED_FIELDS_MISSING";
    }
  }
  return null;
}

export async function getAgentPromptsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const scope = (req.nextUrl.searchParams.get("scope") ?? "").trim();
    const chapterId = (req.nextUrl.searchParams.get("chapter_id") ?? "").trim();

    const where: string[] = [];
    const params: Array<string | number> = [];

    if (agentName) {
      params.push(agentName);
      where.push(`app.agent_name = $${params.length}`);
    }
    if (scope) {
      if (!ALLOWED_SCOPES.has(scope)) return NextResponse.json({ ok: false, error: "INVALID_SCOPE" }, { status: 400 });
      params.push(scope);
      where.push(`app.scope = $${params.length}`);
    }
    if (chapterId) {
      params.push(chapterId);
      where.push(`app.chapter_id = $${params.length}`);
    }

    // default story scoping: include matching story + global
    params.push(storyId);
    where.push(`(app.story_id = $${params.length} OR app.story_id IS NULL)`);

    const sql = `
      SELECT
        apv.id AS version_id,
        app.id AS profile_id,
        app.agent_name,
        app.scope,
        app.story_id,
        app.chapter_id,
        apv.version_no,
        apv.status,
        apv.created_by,
        apv.created_at::text,
        apv.change_note,
        apv.system_prompt,
        apv.developer_prompt,
        apv.output_contract_json,
        apv.guardrail_json
      FROM public.agent_prompt_profile app
      JOIN public.agent_prompt_version apv ON apv.profile_id = app.id
      WHERE ${where.join(" AND ")}
      ORDER BY app.agent_name ASC, app.scope ASC, COALESCE(app.chapter_id, '') ASC, apv.version_no DESC
      LIMIT 300
    `;
    const rows = await pool.query<AgentPromptVersionRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_PROMPTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentPromptResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryId(storySlug);
    const body = (await req.json()) as Record<string, unknown>;
    const agentName = typeof body.agent_name === "string" ? body.agent_name.trim() : "";
    const scope = typeof body.scope === "string" ? body.scope.trim() : "story";
    const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : null;
    const createdBy = typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim() : "studio";
    const changeNote = typeof body.change_note === "string" ? body.change_note : null;
    const systemPrompt = typeof body.system_prompt === "string" ? body.system_prompt.trim() : "";
    const developerPrompt = typeof body.developer_prompt === "string" ? body.developer_prompt : null;
    const outputContract = isPlainObject(body.output_contract_json) ? body.output_contract_json : {};
    const guardrail = isPlainObject(body.guardrail_json) ? body.guardrail_json : {};

    if (!agentName) return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    if (!ALLOWED_SCOPES.has(scope)) return NextResponse.json({ ok: false, error: "INVALID_SCOPE" }, { status: 400 });
    if (!systemPrompt) return NextResponse.json({ ok: false, error: "SYSTEM_PROMPT_REQUIRED" }, { status: 400 });
    if (scope === "chapter" && !chapterId) return NextResponse.json({ ok: false, error: "CHAPTER_ID_REQUIRED" }, { status: 400 });
    const contractErr = validatePromptContracts(agentName, outputContract, guardrail);
    if (contractErr) return NextResponse.json({ ok: false, error: contractErr }, { status: 400 });

    const profileStoryId = scope === "global" ? null : storyId;

    await client.query("BEGIN");
    const existingProfile = await client.query<{ id: number }>(
      `SELECT id
       FROM public.agent_prompt_profile
       WHERE agent_name = $1
         AND scope = $2
         AND COALESCE(story_id, 0) = COALESCE($3, 0)
         AND COALESCE(chapter_id, '') = COALESCE($4, '')
       LIMIT 1`,
      [agentName, scope, profileStoryId, scope === "chapter" ? chapterId : null]
    );
    let profileId = Number(existingProfile.rows[0]?.id ?? 0);
    if (!profileId) {
      const profileRes = await client.query<{ id: number }>(
        `INSERT INTO public.agent_prompt_profile
           (agent_name, scope, story_id, chapter_id, status, created_by)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
         RETURNING id`,
        [agentName, scope, profileStoryId, scope === "chapter" ? chapterId : null, createdBy]
      );
      profileId = Number(profileRes.rows[0].id);
    } else {
      await client.query(
        `UPDATE public.agent_prompt_profile SET status = 'ACTIVE' WHERE id = $1`,
        [profileId]
      );
    }

    const nextVerRes = await client.query<{ next_no: number }>(
      `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no
       FROM public.agent_prompt_version
       WHERE profile_id = $1`,
      [profileId]
    );
    const versionNo = Number(nextVerRes.rows[0]?.next_no ?? 1);

    const versionRes = await client.query<{ id: number }>(
      `INSERT INTO public.agent_prompt_version
         (profile_id, version_no, system_prompt, developer_prompt, output_contract_json, guardrail_json, change_note, status, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'DRAFT', $8)
       RETURNING id`,
      [profileId, versionNo, systemPrompt, developerPrompt, JSON.stringify(outputContract), JSON.stringify(guardrail), changeNote, createdBy]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, profile_id: profileId, version_id: Number(versionRes.rows[0].id), version_no: versionNo });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "CREATE_AGENT_PROMPT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function postAgentPromptPromoteActiveResponse(
  req: NextRequest,
  storySlug: string,
  versionIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryId(storySlug);
    const versionId = Number(versionIdRaw || 0);
    if (!versionId) return NextResponse.json({ ok: false, error: "INVALID_VERSION_ID" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const author = typeof body.author === "string" && body.author.trim() ? body.author.trim() : "studio";
    const approvedBy = typeof body.approved_by === "string" ? body.approved_by.trim() : "";
    const reasonTemplateRaw = typeof body.reason_template === "string" ? body.reason_template.trim().toUpperCase() : "CANARY_SUCCESS";
    const reasonTemplate = reasonTemplateRaw || "CANARY_SUCCESS";
    const reasonNote = typeof body.reason === "string" ? body.reason.trim() : "";
    const lookbackHoursRaw = Number(body.lookback_hours ?? DEFAULT_PROMOTE_LOOKBACK_HOURS);
    const lookbackHours = Number.isFinite(lookbackHoursRaw) ? Math.max(1, Math.min(24 * 30, Math.floor(lookbackHoursRaw))) : DEFAULT_PROMOTE_LOOKBACK_HOURS;
    const minCandidateSamplesRaw = Number(body.min_candidate_samples ?? MIN_CANARY_SAMPLES);
    const minCandidateSamples = Number.isFinite(minCandidateSamplesRaw) ? Math.max(1, Math.min(10000, Math.floor(minCandidateSamplesRaw))) : MIN_CANARY_SAMPLES;
    const goldenPolicy = await loadGoldenPolicyByStory(client, storyId);
    const goldenChapterIds = goldenPolicy.chapterIds;
    const minGoldenRuns = goldenPolicy.minRuns;

    if (!approvedBy) return NextResponse.json({ ok: false, error: "APPROVED_BY_REQUIRED" }, { status: 400 });
    if (!ALLOWED_PROMOTION_REASON_TEMPLATE.has(reasonTemplate)) {
      return NextResponse.json({ ok: false, error: "INVALID_REASON_TEMPLATE" }, { status: 400 });
    }

    await client.query("BEGIN");
    const rowRes = await client.query<{ profile_id: number; agent_name: string; status: string }>(
      `SELECT apv.profile_id, app.agent_name, apv.status
       FROM public.agent_prompt_version apv
       JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
       WHERE apv.id = $1
       LIMIT 1`,
      [versionId]
    );
    if (!rowRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    }
    const profileId = Number(rowRes.rows[0].profile_id);
    const agentName = rowRes.rows[0].agent_name;
    const candidateStatus = String(rowRes.rows[0].status || "").toUpperCase();

    const baselineRes = await client.query<{ id: number }>(
      `SELECT id
       FROM public.agent_prompt_version
       WHERE profile_id = $1
         AND status = 'ACTIVE'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [profileId]
    );
    const baselineVersionId = baselineRes.rowCount ? Number(baselineRes.rows[0].id) : null;
    const isBootstrap = !baselineVersionId;
    if (baselineVersionId === versionId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "ALREADY_ACTIVE" }, { status: 409 });
    }
    if (candidateStatus === "ARCHIVED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CANDIDATE_ARCHIVED" }, { status: 409 });
    }

    const perfRes = await client.query<{
      prompt_version_id: number;
      total_runs: string;
      failed_runs: string;
      meta_leak_runs: string;
    }>(
      `SELECT
         prompt_version_id,
         COUNT(*)::text AS total_runs,
         COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_runs,
         COUNT(*) FILTER (WHERE COALESCE((quality_json->>'meta_leak')::boolean, false))::text AS meta_leak_runs
       FROM public.agent_run_trace
       WHERE prompt_version_id IN ($1, $2)
         AND created_at >= NOW() - make_interval(hours => $3::int)
       GROUP BY prompt_version_id`,
      [baselineVersionId ?? -1, versionId, lookbackHours]
    );
    const perf = new Map<number, { total: number; failed: number; metaLeak: number }>();
    for (const row of perfRes.rows) {
      perf.set(Number(row.prompt_version_id), {
        total: Number(row.total_runs || 0),
        failed: Number(row.failed_runs || 0),
        metaLeak: Number(row.meta_leak_runs || 0),
      });
    }
    const candidate = perf.get(versionId) || { total: 0, failed: 0, metaLeak: 0 };
    const baseline = baselineVersionId
      ? perf.get(baselineVersionId) || { total: 0, failed: 0, metaLeak: 0 }
      : { total: 0, failed: 0, metaLeak: 0 };
    const allowBootstrapManualOverride = isBootstrap && reasonTemplate === "MANUAL_OVERRIDE";
    if (!allowBootstrapManualOverride && candidate.total < minCandidateSamples) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_MIN_SAMPLE",
          details: { candidate_runs: candidate.total, required: minCandidateSamples, lookback_hours: lookbackHours },
        },
        { status: 409 }
      );
    }
    const candidateFailureRate = candidate.total > 0 ? candidate.failed / candidate.total : 1;
    const baselineFailureRate = baseline.total > 0 ? baseline.failed / baseline.total : 0;
    if (!isBootstrap && candidateFailureRate > baselineFailureRate + MAX_FAILURE_RATE_DELTA) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_FAILURE_RATE_REGRESSION",
          details: { candidate_failure_rate: candidateFailureRate, baseline_failure_rate: baselineFailureRate },
        },
        { status: 409 }
      );
    }
    const candidateMetaLeakRate = candidate.total > 0 ? candidate.metaLeak / candidate.total : 1;
    const baselineMetaLeakRate = baseline.total > 0 ? baseline.metaLeak / baseline.total : 0;
    if (!isBootstrap && candidateMetaLeakRate > baselineMetaLeakRate + MAX_META_LEAK_RATE_DELTA) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_META_LEAK_REGRESSION",
          details: { candidate_meta_leak_rate: candidateMetaLeakRate, baseline_meta_leak_rate: baselineMetaLeakRate },
        },
        { status: 409 }
      );
    }
    const goldenPerf = await loadGoldenRegressionPerf(client, {
      storyId,
      candidateVersionId: versionId,
      baselineVersionId,
      lookbackHours,
      chapterIds: goldenChapterIds,
    });
    if (
      !isBootstrap &&
      goldenChapterIds.length > 0 &&
      (goldenPerf.candidateRuns < minGoldenRuns || goldenPerf.baselineRuns < minGoldenRuns)
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_GOLDEN_MIN_SAMPLE",
          details: {
            golden_chapters: goldenChapterIds,
            candidate_runs: goldenPerf.candidateRuns,
            baseline_runs: goldenPerf.baselineRuns,
            required: minGoldenRuns,
          },
        },
        { status: 409 },
      );
    }
    if (
      !isBootstrap &&
      goldenChapterIds.length > 0 &&
      goldenPerf.candidateFailureRate > goldenPerf.baselineFailureRate + MAX_GOLDEN_FAILURE_RATE_DELTA
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_GOLDEN_REGRESSION",
          details: {
            golden_chapters: goldenChapterIds,
            candidate_failure_rate: goldenPerf.candidateFailureRate,
            baseline_failure_rate: goldenPerf.baselineFailureRate,
          },
        },
        { status: 409 },
      );
    }
    const shadowPerf = await loadShadowPromotionPerf(client, {
      storyId,
      candidateVersionId: versionId,
      baselineVersionId,
      lookbackHours,
    });
    if (
      !isBootstrap &&
      SHADOW_REQUIRE_FOR_PROMOTION &&
      shadowPerf.sampleCount < SHADOW_MIN_SAMPLES
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_SHADOW_MIN_SAMPLE",
          details: {
            shadow_samples: shadowPerf.sampleCount,
            required: SHADOW_MIN_SAMPLES,
          },
        },
        { status: 409 },
      );
    }
    if (
      !isBootstrap &&
      shadowPerf.sampleCount > 0 &&
      shadowPerf.candidateFailureRate > shadowPerf.baselineFailureRate + SHADOW_MAX_FAILURE_RATE_DELTA
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_SHADOW_FAILURE_REGRESSION",
          details: {
            shadow_candidate_failure_rate: shadowPerf.candidateFailureRate,
            shadow_baseline_failure_rate: shadowPerf.baselineFailureRate,
            shadow_samples: shadowPerf.sampleCount,
          },
        },
        { status: 409 },
      );
    }
    if (
      !isBootstrap &&
      shadowPerf.sampleCount > 0 &&
      shadowPerf.avgLatencyDeltaMs != null &&
      shadowPerf.avgLatencyDeltaMs > SHADOW_MAX_LATENCY_DELTA_MS
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "PROMOTE_GUARD_SHADOW_LATENCY_REGRESSION",
          details: {
            shadow_avg_latency_delta_ms: shadowPerf.avgLatencyDeltaMs,
            threshold_ms: SHADOW_MAX_LATENCY_DELTA_MS,
            shadow_samples: shadowPerf.sampleCount,
          },
        },
        { status: 409 },
      );
    }

    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ARCHIVED'
       WHERE profile_id = $1
         AND status = 'ACTIVE'`,
      [profileId]
    );
    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ACTIVE'
       WHERE id = $1`,
      [versionId]
    );
    await client.query(
      `UPDATE public.agent_prompt_experiment
       SET status = 'COMPLETED', end_at = now()
       WHERE (baseline_version_id = $1 OR candidate_version_id = $1)
         AND status = 'RUNNING'`,
      [versionId]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'PROMOTE_ACTIVE', $4, $5, $6)`,
      [
        agentName,
        baselineVersionId,
        versionId,
        `${reasonTemplate}${reasonNote ? ` | ${reasonNote}` : ""}`,
        author,
        approvedBy,
      ]
    );
    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      version_id: versionId,
      status: "ACTIVE",
      guardrail: {
        lookback_hours: lookbackHours,
        min_candidate_samples: minCandidateSamples,
        candidate_runs: candidate.total,
        candidate_failure_rate: candidateFailureRate,
        baseline_failure_rate: baselineFailureRate,
        candidate_meta_leak_rate: candidateMetaLeakRate,
        baseline_meta_leak_rate: baselineMetaLeakRate,
        golden_chapters: goldenChapterIds,
        golden_candidate_runs: goldenPerf.candidateRuns,
        golden_baseline_runs: goldenPerf.baselineRuns,
        golden_candidate_failure_rate: goldenPerf.candidateFailureRate,
        golden_baseline_failure_rate: goldenPerf.baselineFailureRate,
        golden_policy_source: goldenPolicy.source,
        shadow_required: SHADOW_REQUIRE_FOR_PROMOTION,
        shadow_min_samples: SHADOW_MIN_SAMPLES,
        shadow_samples: shadowPerf.sampleCount,
        shadow_candidate_failure_rate: shadowPerf.candidateFailureRate,
        shadow_baseline_failure_rate: shadowPerf.baselineFailureRate,
        shadow_avg_latency_delta_ms: shadowPerf.avgLatencyDeltaMs,
        shadow_max_failure_rate_delta: SHADOW_MAX_FAILURE_RATE_DELTA,
        shadow_max_latency_delta_ms: SHADOW_MAX_LATENCY_DELTA_MS,
      },
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "PROMOTE_AGENT_PROMPT_ACTIVE_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function postAgentPromptPromoteCanaryResponse(
  req: NextRequest,
  storySlug: string,
  versionIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryId(storySlug);
    const versionId = Number(versionIdRaw || 0);
    if (!versionId) return NextResponse.json({ ok: false, error: "INVALID_VERSION_ID" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const trafficPercentRaw = Number(body.traffic_percent ?? 10);
    const trafficPercent = Math.max(1, Math.min(100, Number.isFinite(trafficPercentRaw) ? trafficPercentRaw : 10));

    await client.query("BEGIN");
    const verRes = await client.query<{
      profile_id: number;
      status: string;
      agent_name: string;
      scope: string;
      p_story_id: number | null;
      chapter_id: string | null;
    }>(
      `SELECT
         apv.profile_id,
         apv.status,
         app.agent_name,
         app.scope,
         app.story_id AS p_story_id,
         app.chapter_id
       FROM public.agent_prompt_version apv
       JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
       WHERE apv.id = $1
       LIMIT 1`,
      [versionId]
    );
    if (!verRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    }
    const row = verRes.rows[0];

    const baselineRes = await client.query<{ id: number }>(
      `SELECT id
       FROM public.agent_prompt_version
       WHERE profile_id = $1
         AND status = 'ACTIVE'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [row.profile_id]
    );
    if (!baselineRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "ACTIVE_BASELINE_REQUIRED" }, { status: 409 });
    }
    const baselineVersionId = Number(baselineRes.rows[0].id);
    if (baselineVersionId === versionId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CANDIDATE_MUST_DIFFER_FROM_BASELINE" }, { status: 409 });
    }

    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'CANARY'
       WHERE id = $1`,
      [versionId]
    );

    await client.query(
      `UPDATE public.agent_prompt_experiment
       SET status = 'PAUSED', end_at = now()
       WHERE agent_name = $1
         AND scope = $2
         AND COALESCE(story_id, 0) = COALESCE($3, 0)
         AND COALESCE(chapter_id, '') = COALESCE($4, '')
         AND status = 'RUNNING'`,
      [row.agent_name, row.scope, row.p_story_id, row.chapter_id]
    );

    const expRes = await client.query<{ id: number }>(
      `INSERT INTO public.agent_prompt_experiment
         (agent_name, scope, story_id, chapter_id, baseline_version_id, candidate_version_id, traffic_percent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RUNNING')
       RETURNING id`,
      [row.agent_name, row.scope, row.p_story_id ?? (row.scope === "global" ? null : storyId), row.chapter_id, baselineVersionId, versionId, trafficPercent]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'PROMOTE_CANARY', 'CANARY_START', 'studio', 'studio')`,
      [row.agent_name, baselineVersionId, versionId]
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      experiment_id: Number(expRes.rows[0].id),
      baseline_version_id: baselineVersionId,
      candidate_version_id: versionId,
      traffic_percent: trafficPercent,
      status: "RUNNING",
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "PROMOTE_AGENT_PROMPT_CANARY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function postAgentPromptArchiveResponse(
  req: NextRequest,
  storySlug: string,
  versionIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const versionId = Number(versionIdRaw || 0);
    if (!versionId) return NextResponse.json({ ok: false, error: "INVALID_VERSION_ID" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "ARCHIVE_BY_OPERATOR";

    await client.query("BEGIN");
    const rowRes = await client.query<{ profile_id: number; agent_name: string; status: string }>(
      `SELECT apv.profile_id, app.agent_name, apv.status
       FROM public.agent_prompt_version apv
       JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
       WHERE apv.id = $1
       LIMIT 1`,
      [versionId]
    );
    if (!rowRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    }
    const row = rowRes.rows[0];
    if (row.status === "ACTIVE") {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "ACTIVE_PROMPT_CANNOT_BE_ARCHIVED_DIRECTLY" }, { status: 409 });
    }

    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ARCHIVED'
       WHERE id = $1`,
      [versionId]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'ARCHIVE', $4, 'studio', 'studio')`,
      [row.agent_name, null, versionId, reason]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, version_id: versionId, status: "ARCHIVED" });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "ARCHIVE_PROMPT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function postAgentPromptRollbackResponse(
  req: NextRequest,
  storySlug: string,
  versionIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const fromVersionId = Number(versionIdRaw || 0);
    if (!fromVersionId) return NextResponse.json({ ok: false, error: "INVALID_VERSION_ID" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const targetVersionId = Number(body.to_version_id ?? 0);
    if (!targetVersionId) return NextResponse.json({ ok: false, error: "TARGET_VERSION_ID_REQUIRED" }, { status: 400 });
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "ROLLBACK_BY_OPERATOR";

    await client.query("BEGIN");
    const fromRes = await client.query<{ profile_id: number; agent_name: string }>(
      `SELECT apv.profile_id, app.agent_name
       FROM public.agent_prompt_version apv
       JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
       WHERE apv.id = $1
       LIMIT 1`,
      [fromVersionId]
    );
    const toRes = await client.query<{ profile_id: number }>(
      `SELECT profile_id
       FROM public.agent_prompt_version
       WHERE id = $1
       LIMIT 1`,
      [targetVersionId]
    );
    if (!fromRes.rowCount || !toRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    }
    const profileId = Number(fromRes.rows[0].profile_id);
    if (profileId !== Number(toRes.rows[0].profile_id)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "ROLLBACK_PROFILE_MISMATCH" }, { status: 409 });
    }
    const agentName = fromRes.rows[0].agent_name;

    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ARCHIVED'
       WHERE profile_id = $1
         AND status = 'ACTIVE'`,
      [profileId]
    );
    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ACTIVE'
       WHERE id = $1`,
      [targetVersionId]
    );
    await client.query(
      `UPDATE public.agent_prompt_experiment
       SET status = 'ROLLED_BACK', end_at = now()
       WHERE status = 'RUNNING'
         AND (baseline_version_id = $1 OR candidate_version_id = $1 OR baseline_version_id = $2 OR candidate_version_id = $2)`,
      [fromVersionId, targetVersionId]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'ROLLBACK', $4, 'studio', 'studio')`,
      [agentName, fromVersionId, targetVersionId, reason]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, from_version_id: fromVersionId, to_version_id: targetVersionId, status: "ACTIVE" });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "ROLLBACK_PROMPT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

type AgentExperimentRow = {
  id: number;
  agent_name: string;
  scope: string;
  story_id: number | null;
  chapter_id: string | null;
  baseline_version_id: number;
  candidate_version_id: number;
  traffic_percent: number;
  status: string;
  start_at: string;
  end_at: string | null;
};

export async function getAgentExperimentsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const status = (req.nextUrl.searchParams.get("status") ?? "").trim().toUpperCase();
    const where: string[] = [`(story_id = $1 OR story_id IS NULL)`];
    const params: Array<string | number> = [storyId];
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const sql = `
      SELECT
        id, agent_name, scope, story_id, chapter_id, baseline_version_id, candidate_version_id,
        traffic_percent, status, start_at::text, end_at::text
      FROM public.agent_prompt_experiment
      WHERE ${where.join(" AND ")}
      ORDER BY start_at DESC, id DESC
      LIMIT 200
    `;
    const rows = await pool.query<AgentExperimentRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_EXPERIMENTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function getAgentPromptDiffResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    await resolveStoryId(storySlug);
    const leftId = Number(req.nextUrl.searchParams.get("left_version_id") ?? 0);
    const rightId = Number(req.nextUrl.searchParams.get("right_version_id") ?? 0);
    if (!leftId || !rightId) return NextResponse.json({ ok: false, error: "LEFT_RIGHT_VERSION_ID_REQUIRED" }, { status: 400 });

    const rows = await pool.query<{
      id: number;
      system_prompt: string;
      developer_prompt: string | null;
    }>(
      `SELECT id, system_prompt, developer_prompt
       FROM public.agent_prompt_version
       WHERE id IN ($1, $2)`,
      [leftId, rightId]
    );
    if ((rows.rowCount ?? 0) < 2) return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    const left = rows.rows.find((r) => Number(r.id) === leftId)!;
    const right = rows.rows.find((r) => Number(r.id) === rightId)!;

    const leftText = `${left.system_prompt}\n\n[developer]\n${left.developer_prompt ?? ""}`;
    const rightText = `${right.system_prompt}\n\n[developer]\n${right.developer_prompt ?? ""}`;
    const chunks = diffLines(leftText, rightText).map((c) => ({
      added: Boolean(c.added),
      removed: Boolean(c.removed),
      value: c.value,
      count: c.count ?? 0,
    }));
    return NextResponse.json({ ok: true, left_version_id: leftId, right_version_id: rightId, chunks });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_PROMPT_DIFF_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentFeedbackRow = {
  id: number;
  story_id: number;
  chapter_id: string | null;
  agent_name: string;
  run_trace_id: number | null;
  feedback_source: string;
  feedback_type: string;
  feedback_text: string;
  weight: string;
  status: string;
  created_by: string;
  created_at: string;
};

const ALLOWED_FEEDBACK_SOURCE = new Set(["HUMAN", "SUPERVISOR", "CRITIC", "SYSTEM"]);
const ALLOWED_FEEDBACK_TYPE = new Set(["KEEP", "AVOID", "FIX", "RULE"]);
const ALLOWED_FEEDBACK_STATUS = new Set(["ACTIVE", "MUTED", "ARCHIVED"]);

export async function getAgentFeedbackResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const status = (req.nextUrl.searchParams.get("status") ?? "").trim().toUpperCase();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];
    if (agentName) {
      params.push(agentName);
      where.push(`agent_name = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    params.push(limit);

    const sql = `
      SELECT
        id, story_id, chapter_id, agent_name, run_trace_id, feedback_source, feedback_type,
        feedback_text, weight::text, status, created_by, created_at::text
      FROM public.agent_feedback_loop
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `;
    const rows = await pool.query<AgentFeedbackRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_FEEDBACK_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentFeedbackResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const body = (await req.json()) as Record<string, unknown>;
    const agentName = typeof body.agent_name === "string" ? body.agent_name.trim() : "";
    const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : null;
    const runTraceId = Number(body.run_trace_id ?? 0) || null;
    const feedbackSource = typeof body.feedback_source === "string" ? body.feedback_source.trim().toUpperCase() : "HUMAN";
    const feedbackType = typeof body.feedback_type === "string" ? body.feedback_type.trim().toUpperCase() : "FIX";
    const feedbackText = typeof body.feedback_text === "string" ? body.feedback_text.trim() : "";
    const weightRaw = Number(body.weight ?? 1);
    const weight = Number.isFinite(weightRaw) ? Math.max(0.1, Math.min(10, weightRaw)) : 1;
    const createdBy = typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim() : "studio";

    if (!agentName) return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    if (!feedbackText) return NextResponse.json({ ok: false, error: "FEEDBACK_TEXT_REQUIRED" }, { status: 400 });
    if (!ALLOWED_FEEDBACK_SOURCE.has(feedbackSource)) return NextResponse.json({ ok: false, error: "INVALID_FEEDBACK_SOURCE" }, { status: 400 });
    if (!ALLOWED_FEEDBACK_TYPE.has(feedbackType)) return NextResponse.json({ ok: false, error: "INVALID_FEEDBACK_TYPE" }, { status: 400 });

    const row = await pool.query<{ id: number }>(
      `INSERT INTO public.agent_feedback_loop
         (story_id, chapter_id, agent_name, run_trace_id, feedback_source, feedback_type, feedback_text, weight, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9)
       RETURNING id`,
      [storyId, chapterId, agentName, runTraceId, feedbackSource, feedbackType, feedbackText, weight, createdBy]
    );
    return NextResponse.json({ ok: true, id: Number(row.rows[0].id) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "POST_AGENT_FEEDBACK_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentFeedbackMuteResponse(
  _req: NextRequest,
  storySlug: string,
  feedbackIdRaw: string
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const feedbackId = Number(feedbackIdRaw || 0);
    if (!feedbackId) return NextResponse.json({ ok: false, error: "INVALID_FEEDBACK_ID" }, { status: 400 });

    const row = await pool.query<{ id: number }>(
      `UPDATE public.agent_feedback_loop
       SET status = 'MUTED'
       WHERE id = $1
         AND story_id = $2
         AND status <> 'MUTED'
       RETURNING id`,
      [feedbackId, storyId]
    );
    if (!row.rowCount) return NextResponse.json({ ok: false, error: "FEEDBACK_NOT_FOUND_OR_MUTED" }, { status: 404 });
    return NextResponse.json({ ok: true, id: feedbackId, status: "MUTED" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUTE_AGENT_FEEDBACK_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentMemoryRow = {
  id: number;
  story_id: number;
  chapter_id: string | null;
  agent_name: string;
  source_run_trace_id: number | null;
  memory_type: string;
  memory_text: string;
  embedding_json: unknown;
  score: string;
  tags: unknown;
  created_at: string;
};

const ALLOWED_MEMORY_TYPE = new Set(["POSITIVE_EXAMPLE", "NEGATIVE_PATTERN", "STYLE_ANCHOR"]);

export async function getAgentMemoryResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const memoryType = (req.nextUrl.searchParams.get("memory_type") ?? "").trim().toUpperCase();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];
    if (agentName) {
      params.push(agentName);
      where.push(`agent_name = $${params.length}`);
    }
    if (memoryType) {
      params.push(memoryType);
      where.push(`memory_type = $${params.length}`);
    }
    params.push(limit);
    const sql = `
      SELECT
        id, story_id, chapter_id, agent_name, source_run_trace_id, memory_type, memory_text,
        embedding_json, score::text, tags, created_at::text
      FROM public.agent_memory_vector
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `;
    const rows = await pool.query<AgentMemoryRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_MEMORY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentMemoryResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const body = (await req.json()) as Record<string, unknown>;
    const agentName = typeof body.agent_name === "string" ? body.agent_name.trim() : "";
    const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : null;
    const sourceRunTraceId = Number(body.source_run_trace_id ?? 0) || null;
    const memoryType = typeof body.memory_type === "string" ? body.memory_type.trim().toUpperCase() : "";
    const memoryText = typeof body.memory_text === "string" ? body.memory_text.trim() : "";
    const scoreRaw = Number(body.score ?? 0);
    const score = Number.isFinite(scoreRaw) ? Math.max(-100, Math.min(100, scoreRaw)) : 0;
    const tags = isPlainObject(body.tags) ? body.tags : {};
    const embedding = Array.isArray(body.embedding_json) ? body.embedding_json : [];
    const embeddingSafe = embedding.filter((x) => Number.isFinite(Number(x))).map((x) => Number(x));

    if (!agentName) return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    if (!memoryText) return NextResponse.json({ ok: false, error: "MEMORY_TEXT_REQUIRED" }, { status: 400 });
    if (!ALLOWED_MEMORY_TYPE.has(memoryType)) return NextResponse.json({ ok: false, error: "INVALID_MEMORY_TYPE" }, { status: 400 });

    const row = await pool.query<{ id: number }>(
      `INSERT INTO public.agent_memory_vector
         (story_id, chapter_id, agent_name, source_run_trace_id, memory_type, memory_text, embedding_json, score, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
       RETURNING id`,
      [storyId, chapterId, agentName, sourceRunTraceId, memoryType, memoryText, JSON.stringify(embeddingSafe), score, JSON.stringify(tags)]
    );
    return NextResponse.json({ ok: true, id: Number(row.rows[0].id) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "POST_AGENT_MEMORY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na <= 0 || nb <= 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function postAgentMemoryRetrieveResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const body = (await req.json()) as Record<string, unknown>;
    const agentName = typeof body.agent_name === "string" ? body.agent_name.trim() : "";
    const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : null;
    const embedding = Array.isArray(body.context_embedding) ? body.context_embedding : [];
    const contextEmbedding = embedding.filter((x) => Number.isFinite(Number(x))).map((x) => Number(x));
    const thresholdRaw = Number(body.similarity_threshold ?? 0.2);
    const similarityThreshold = Number.isFinite(thresholdRaw) ? Math.max(-1, Math.min(1, thresholdRaw)) : 0.2;
    const topKRaw = Number(body.top_k ?? 5);
    const topK = Math.max(1, Math.min(20, Number.isFinite(topKRaw) ? topKRaw : 5));

    if (!agentName) return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    if (contextEmbedding.length === 0) return NextResponse.json({ ok: false, error: "CONTEXT_EMBEDDING_REQUIRED" }, { status: 400 });

    const rows = await pool.query<AgentMemoryRow>(
      `SELECT
         id, story_id, chapter_id, agent_name, source_run_trace_id, memory_type, memory_text,
         embedding_json, score::text, tags, created_at::text
       FROM public.agent_memory_vector
       WHERE story_id = $1
         AND agent_name = $2
         AND (chapter_id = $3 OR chapter_id IS NULL)
       ORDER BY created_at DESC
       LIMIT 300`,
      [storyId, agentName, chapterId]
    );
    const scored = rows.rows
      .map((r) => {
        const emb = Array.isArray(r.embedding_json) ? r.embedding_json : [];
        const v = emb.filter((x) => Number.isFinite(Number(x))).map((x) => Number(x));
        return {
          ...r,
          similarity: cosineSimilarity(contextEmbedding, v),
        };
      })
      .filter((r) => r.similarity >= similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity || Number(b.score || 0) - Number(a.score || 0))
      .slice(0, topK);

    return NextResponse.json({ ok: true, items: scored });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "RETRIEVE_AGENT_MEMORY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentExperimentPauseResponse(
  _req: NextRequest,
  storySlug: string,
  experimentIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const experimentId = Number(experimentIdRaw || 0);
    if (!experimentId) return NextResponse.json({ ok: false, error: "INVALID_EXPERIMENT_ID" }, { status: 400 });

    const expRes = await client.query<{ id: number }>(
      `UPDATE public.agent_prompt_experiment
       SET status = 'PAUSED', end_at = now()
       WHERE id = $1
         AND status = 'RUNNING'
       RETURNING id`,
      [experimentId]
    );
    if (!expRes.rowCount) return NextResponse.json({ ok: false, error: "EXPERIMENT_NOT_RUNNING" }, { status: 409 });
    return NextResponse.json({ ok: true, experiment_id: experimentId, status: "PAUSED" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "PAUSE_EXPERIMENT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function postAgentExperimentRollbackResponse(
  _req: NextRequest,
  storySlug: string,
  experimentIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const experimentId = Number(experimentIdRaw || 0);
    if (!experimentId) return NextResponse.json({ ok: false, error: "INVALID_EXPERIMENT_ID" }, { status: 400 });

    await client.query("BEGIN");
    const expRes = await client.query<{
      id: number;
      agent_name: string;
      baseline_version_id: number;
      candidate_version_id: number;
      status: string;
    }>(
      `SELECT id, agent_name, baseline_version_id, candidate_version_id, status
       FROM public.agent_prompt_experiment
       WHERE id = $1
       LIMIT 1`,
      [experimentId]
    );
    if (!expRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "EXPERIMENT_NOT_FOUND" }, { status: 404 });
    }
    const exp = expRes.rows[0];

    await client.query(
      `UPDATE public.agent_prompt_experiment
       SET status = 'ROLLED_BACK', end_at = now()
       WHERE id = $1`,
      [experimentId]
    );
    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ACTIVE'
       WHERE id = $1`,
      [exp.baseline_version_id]
    );
    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ARCHIVED'
       WHERE id = $1`,
      [exp.candidate_version_id]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'ROLLBACK', 'ROLLBACK_EXPERIMENT', 'studio', 'studio')`,
      [exp.agent_name, exp.candidate_version_id, exp.baseline_version_id]
    );
    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      experiment_id: experimentId,
      status: "ROLLED_BACK",
      baseline_version_id: exp.baseline_version_id,
      candidate_version_id: exp.candidate_version_id,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "ROLLBACK_EXPERIMENT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function getAgentContextSnapshotResponse(
  _req: NextRequest,
  storySlug: string,
  snapshotIdRaw: string
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const snapshotId = Number(snapshotIdRaw || 0);
    if (!snapshotId) return NextResponse.json({ ok: false, error: "INVALID_SNAPSHOT_ID" }, { status: 400 });

    const row = await pool.query<{
      id: number;
      story_id: number;
      chapter_id: string | null;
      snapshot_json: unknown;
      snapshot_hash: string;
      created_at: string;
    }>(
      `SELECT id, story_id, chapter_id, snapshot_json, snapshot_hash, created_at::text
       FROM public.agent_context_snapshot
       WHERE id = $1
         AND story_id = $2
       LIMIT 1`,
      [snapshotId, storyId]
    );
    if (!row.rowCount) return NextResponse.json({ ok: false, error: "SNAPSHOT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, item: row.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_CONTEXT_SNAPSHOT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentTuningEventRow = {
  id: number;
  agent_name: string;
  from_version_id: number | null;
  to_version_id: number;
  action: string;
  reason: string;
  author: string;
  approved_by: string | null;
  created_at: string;
};

export async function getAgentTuningEventsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));

    const where: string[] = [];
    const params: Array<string | number> = [];
    if (agentName) {
      params.push(agentName);
      where.push(`ev.agent_name = $${params.length}`);
    }
    params.push(storyId);
    where.push(`(pr.story_id = $${params.length} OR pr.story_id IS NULL)`);
    params.push(limit);

    const sql = `
      SELECT
        ev.id,
        ev.agent_name,
        ev.from_version_id,
        ev.to_version_id,
        ev.action,
        ev.reason,
        ev.author,
        ev.approved_by,
        ev.created_at::text
      FROM public.agent_tuning_event ev
      JOIN public.agent_prompt_version v ON v.id = ev.to_version_id
      JOIN public.agent_prompt_profile pr ON pr.id = v.profile_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ev.created_at DESC, ev.id DESC
      LIMIT $${params.length}
    `;
    const rows = await pool.query<AgentTuningEventRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_TUNING_EVENTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

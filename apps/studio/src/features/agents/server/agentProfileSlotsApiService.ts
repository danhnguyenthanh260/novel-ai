
/* eslint-disable complexity */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import {
  computeAgentLevel,
  isPlainObject,
  parseBoolFlag,
  resolveStoryId,
} from "@/features/agents/server/agentGovernanceServerUtils";
import { insertAgentProfileEvent } from "@/features/agents/server/agentProfileEvents";

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


/* eslint-disable complexity */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { getAgentDrawerResponse as getAgentDrawerServiceResponse } from "@/features/agents/server/agentDrawerService";
import { insertAgentProfileEvent } from "@/features/agents/server/agentProfileEvents";
import {
  isPlainObject,
  parseBoolFlag,
  resolveStoryId,
} from "@/features/agents/server/agentGovernanceServerUtils";

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

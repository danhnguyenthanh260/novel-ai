import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

const MODES = new Set(["CORE", "TAGGED", "MANUAL_ONLY"]);

const DEFAULT_STYLE = {
  tone_baseline: "",
  darkness_level: 50,
  political_intensity: 50,
  pacing_bias: 50,
  prose_density: 50,
};

function clampPercent(value: unknown, fallback = 50): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseImportance(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, Math.floor(n)));
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out.slice(0, 30);
}

function parseMode(value: unknown): "CORE" | "TAGGED" | "MANUAL_ONLY" {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "CORE";
  if (!MODES.has(raw)) return "CORE";
  return raw as "CORE" | "TAGGED" | "MANUAL_ONLY";
}

export async function getStyleProfileResponse(storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const res = await pool.query(
      `SELECT
         story_id,
         tone_baseline,
         darkness_level,
         political_intensity,
         pacing_bias,
         prose_density,
         created_at,
         updated_at
       FROM public.story_style_profile
       WHERE story_id = $1
       LIMIT 1`,
      [storyId]
    );
    return NextResponse.json({
      ok: true,
      story_id: storyId,
      profile: res.rowCount ? res.rows[0] : { story_id: storyId, ...DEFAULT_STYLE },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "STYLE_PROFILE_GET_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function putStyleProfileResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as {
      tone_baseline?: string;
      darkness_level?: number | string;
      political_intensity?: number | string;
      pacing_bias?: number | string;
      prose_density?: number | string;
    };
    const toneBaseline = typeof body.tone_baseline === "string" ? body.tone_baseline.trim() : DEFAULT_STYLE.tone_baseline;
    const darknessLevel = clampPercent(body.darkness_level, DEFAULT_STYLE.darkness_level);
    const politicalIntensity = clampPercent(body.political_intensity, DEFAULT_STYLE.political_intensity);
    const pacingBias = clampPercent(body.pacing_bias, DEFAULT_STYLE.pacing_bias);
    const proseDensity = clampPercent(body.prose_density, DEFAULT_STYLE.prose_density);

    const res = await pool.query(
      `INSERT INTO public.story_style_profile
        (story_id, tone_baseline, darkness_level, political_intensity, pacing_bias, prose_density)
       VALUES
        ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (story_id) DO UPDATE SET
        tone_baseline = EXCLUDED.tone_baseline,
        darkness_level = EXCLUDED.darkness_level,
        political_intensity = EXCLUDED.political_intensity,
        pacing_bias = EXCLUDED.pacing_bias,
        prose_density = EXCLUDED.prose_density,
        updated_at = now()
       RETURNING
        story_id,
        tone_baseline,
        darkness_level,
        political_intensity,
        pacing_bias,
        prose_density,
        created_at,
        updated_at`,
      [storyId, toneBaseline, darknessLevel, politicalIntensity, pacingBias, proseDensity]
    );

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      profile: res.rows[0],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "STYLE_PROFILE_PUT_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function getWorldbuildingResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const category = (req.nextUrl.searchParams.get("category") ?? "").trim();
    const mode = (req.nextUrl.searchParams.get("injection_mode") ?? "").trim().toUpperCase();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const includeFull = (req.nextUrl.searchParams.get("include_full") ?? "").trim() === "1";
    const limit = Math.min(parsePositiveInt(req.nextUrl.searchParams.get("limit"), 80), 200);

    const params: Array<string | number | string[]> = [storyId];
    const where: string[] = ["story_id = $1"];
    if (category) {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    if (mode && MODES.has(mode)) {
      params.push(mode);
      where.push(`injection_mode = $${params.length}`);
    }
    if (q) {
      params.push(q);
      where.push(`content_tsv @@ plainto_tsquery('simple', unaccent($${params.length}))`);
    }

    params.push(limit);
    const res = await pool.query(
      `SELECT
         id, story_id, category, importance, injection_mode, tags, created_at, updated_at,
         left(content, 280) AS preview,
         CASE WHEN $${params.length + 1}::boolean THEN content ELSE NULL END AS content
       FROM public.story_worldbuilding_note
       WHERE ${where.join(" AND ")}
       ORDER BY importance DESC, updated_at DESC, id DESC
       LIMIT $${params.length}`,
      [...params, includeFull]
    );

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      items: res.rows,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "WORLD_BUILDING_GET_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function postWorldbuildingResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as {
      category?: string;
      content?: string;
      importance?: number | string;
      injection_mode?: string;
      tags?: unknown;
    };
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!category) return NextResponse.json({ ok: false, error: "CATEGORY_REQUIRED" }, { status: 400 });
    if (!content) return NextResponse.json({ ok: false, error: "CONTENT_REQUIRED" }, { status: 400 });

    const res = await pool.query(
      `INSERT INTO public.story_worldbuilding_note
        (story_id, category, content, importance, injection_mode, tags)
       VALUES
        ($1, $2, $3, $4, $5, $6::text[])
       RETURNING id`,
      [storyId, category, content, parseImportance(body.importance), parseMode(body.injection_mode), parseTags(body.tags)]
    );
    return NextResponse.json({ ok: true, story_id: storyId, id: Number(res.rows[0]?.id ?? 0) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "WORLD_BUILDING_CREATE_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function patchWorldbuildingResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as {
      id?: number | string;
      category?: string;
      content?: string;
      importance?: number | string;
      injection_mode?: string;
      tags?: unknown;
    };
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }

    const patch: string[] = [];
    const params: Array<string | number | string[]> = [storyId, id];
    if (typeof body.category === "string") {
      patch.push(`category = $${params.length + 1}`);
      params.push(body.category.trim());
    }
    if (typeof body.content === "string") {
      patch.push(`content = $${params.length + 1}`);
      params.push(body.content.trim());
    }
    if (body.importance !== undefined) {
      patch.push(`importance = $${params.length + 1}`);
      params.push(parseImportance(body.importance));
    }
    if (body.injection_mode !== undefined) {
      patch.push(`injection_mode = $${params.length + 1}`);
      params.push(parseMode(body.injection_mode));
    }
    if (body.tags !== undefined) {
      patch.push(`tags = $${params.length + 1}::text[]`);
      params.push(parseTags(body.tags));
    }
    if (patch.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_FIELDS_TO_UPDATE" }, { status: 400 });
    }

    const updated = await pool.query(
      `UPDATE public.story_worldbuilding_note
       SET ${patch.join(", ")}
       WHERE story_id = $1 AND id = $2
       RETURNING id`,
      params
    );
    if (updated.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "NOTE_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, story_id: storyId, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "WORLD_BUILDING_UPDATE_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function deleteWorldbuildingResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }
    const deleted = await pool.query(
      `DELETE FROM public.story_worldbuilding_note
       WHERE story_id = $1 AND id = $2
       RETURNING id`,
      [storyId, id]
    );
    if (deleted.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "NOTE_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, story_id: storyId, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "WORLD_BUILDING_DELETE_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

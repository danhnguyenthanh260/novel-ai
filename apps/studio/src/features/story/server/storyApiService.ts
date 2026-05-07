/* eslint-disable max-lines */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { createStory, listStories, type StoryStatus } from "@/features/scenes/server/workflow/repoStory";

const SLUG_RE = /^[a-z0-9_]+$/;
const STATUS_SET = new Set<StoryStatus>(["ACTIVE", "ARCHIVED", "DRAFT"]);

type CreateStoryPayload = {
  slug: string;
  title: string;
  status: StoryStatus;
  systemPrompt: string | null;
  toneProfileJson: Record<string, unknown>;
  defaultLlmParamsJson: Record<string, unknown>;
  settingsJson: Record<string, unknown>;
};

type SceneReadRow = {
  id: number;
  idx: number;
  title: string | null;
  text_content: string | null;
};

type ChapterRow = {
  chapter_id: string;
  scene_count: number;
  first_scene_idx: number;
  updated_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function chapterSortKey(chapterId: string): number {
  const m = chapterId.match(/(\d+)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]);
}

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

function parseStatus(raw: unknown): StoryStatus | undefined {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "ACTIVE";
  return STATUS_SET.has(value as StoryStatus) ? (value as StoryStatus) : undefined;
}

function parseCreateStoryPayload(body: Record<string, unknown>): { payload: CreateStoryPayload } | { response: NextResponse } {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug || !SLUG_RE.test(slug)) return { response: badRequest("INVALID_SLUG") };

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { response: badRequest("MISSING_TITLE") };

  const status = parseStatus(body.status);
  if (!status) return { response: badRequest("INVALID_STATUS") };

  const systemPromptRaw = body.system_prompt;
  if (systemPromptRaw !== undefined && systemPromptRaw !== null && typeof systemPromptRaw !== "string") {
    return { response: badRequest("INVALID_SYSTEM_PROMPT") };
  }

  return {
    payload: {
      slug,
      title,
      status,
      systemPrompt: typeof systemPromptRaw === "string" ? systemPromptRaw : null,
      toneProfileJson: asObject(body.tone_profile_json),
      defaultLlmParamsJson: asObject(body.default_llm_params_json),
      settingsJson: asObject(body.settings_json),
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

export async function getStoriesResponse(): Promise<NextResponse> {
  const items = await listStories(pool);
  return NextResponse.json({ items });
}

export async function postStoriesResponse(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const parsed = parseCreateStoryPayload(body);
    if ("response" in parsed) return parsed.response;

    const created = await createStory(pool, parsed.payload);

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "STORY_SLUG_EXISTS" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "CREATE_STORY_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type ChapterReadRow = {
  chapter_id: string;
  title: string | null;
  arc_id: number | null;
  arc_name: string | null;
  scene_count: number;
  first_scene_idx: number;
  updated_at: string;
  is_stable: boolean;
  version: number | null;
};

export async function getStoryChaptersResponse(slug: string): Promise<NextResponse> {
  const storyRes = await pool.query<{ id: number }>(
    `SELECT id
     FROM public.story_series
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );
  const storyId = Number(storyRes.rows[0]?.id ?? 0);
  if (!storyId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const chaptersRes = await pool.query<ChapterReadRow>(
      `WITH chapter_union AS (
         SELECT
           ns.story_id,
           ns.chapter_id::text AS chapter_id,
           COUNT(*)::int AS scene_count,
           MIN(ns.idx)::int AS first_scene_idx,
           MAX(ns.updated_at)::text AS updated_at
         FROM public.narrative_scene ns
         WHERE ns.story_id = $1
           AND ns.status <> 'ARCHIVED'
         GROUP BY ns.story_id, ns.chapter_id
         UNION
         SELECT
           st.story_id,
           st.chapter_id::text AS chapter_id,
           0::int AS scene_count,
           0::int AS first_scene_idx,
           st.updated_at::text AS updated_at
         FROM public.narrative_chapter_staging st
         WHERE st.story_id = $1
         UNION
         SELECT
           cd.story_id,
           cd.chapter_id::text AS chapter_id,
           0::int AS scene_count,
           0::int AS first_scene_idx,
           cd.updated_at::text AS updated_at
         FROM public.chapter_draft cd
         WHERE cd.story_id = $1
         UNION
         SELECT
           sc.story_id,
           sc.chapter_id::text AS chapter_id,
           0::int AS scene_count,
           0::int AS first_scene_idx,
           sc.updated_at::text AS updated_at
         FROM public.story_chapter sc
         WHERE sc.story_id = $1
         UNION
         SELECT
           sd.story_id,
           COALESCE(
             sd.origin->>'chapter_id',
             CASE
               WHEN (sd.origin->>'source_path') IS NOT NULL AND (sd.origin->>'source_path') ~ 'CHAPTER \d+'
               THEN 'ch' || LPAD(regexp_replace(sd.origin->>'source_path', '.*CHAPTER (\d+).*', '\\1'), 2, '0')
               ELSE 'ch01'
             END
           ) AS chapter_id,
           0::int AS scene_count,
           0::int AS first_scene_idx,
           sd.created_at::text AS updated_at
         FROM public.source_doc sd
         WHERE sd.story_id = $1
           AND sd.doc_type = 'ingest_chapter'
       ),
       chapter_agg AS (
         SELECT
           cu.story_id,
           cu.chapter_id,
           MAX(cu.scene_count)::int AS scene_count,
           NULLIF(MIN(NULLIF(cu.first_scene_idx, 0)), 0)::int AS first_scene_idx,
           MAX(cu.updated_at)::text AS updated_at
         FROM chapter_union cu
         GROUP BY cu.story_id, cu.chapter_id
       )
       SELECT
         ca.chapter_id,
         sc.title AS title,
         sc.arc_id AS arc_id,
         sa.name AS arc_name,
         ca.scene_count,
         COALESCE(ca.first_scene_idx, 0)::int AS first_scene_idx,
         ca.updated_at,
         bool_or(COALESCE(sd.is_stable, false)) AS is_stable,
         MAX(sd.version) AS version
       FROM chapter_agg ca
       LEFT JOIN public.story_chapter sc
         ON sc.story_id = ca.story_id
         AND LOWER(TRIM(sc.chapter_id)) = LOWER(TRIM(ca.chapter_id))
       LEFT JOIN public.story_arc sa
         ON sa.id = sc.arc_id
         AND sa.story_id = ca.story_id
       LEFT JOIN public.source_doc sd
         ON sd.story_id = ca.story_id
         AND sd.doc_type = 'ingest_chapter'
         AND (
           NULLIF(regexp_replace(ca.chapter_id, '[^0-9]', '', 'g'), '')::int
           =
           NULLIF(regexp_replace(
             COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')),
             '[^0-9]', '', 'g'
           ), '')::int
         )
       GROUP BY ca.chapter_id, sc.title, sc.arc_id, sa.name, ca.scene_count, ca.first_scene_idx, ca.updated_at
       ORDER BY ca.chapter_id ASC`,
      [storyId]
    );

    const items = chaptersRes.rows
      .map((r) => ({
        chapter_id: r.chapter_id,
        title: r.title ? r.title : undefined,
        arc_id: r.arc_id ? Number(r.arc_id) : null,
        arc_name: r.arc_name ? String(r.arc_name) : null,
        scene_count: Number(r.scene_count),
        first_scene_idx: Number(r.first_scene_idx),
        updated_at: r.updated_at,
        is_stable: Boolean(r.is_stable),
        version: r.version !== null ? Number(r.version) : null,
      }))
      .sort((a, b) => chapterSortKey(a.chapter_id) - chapterSortKey(b.chapter_id));

    return NextResponse.json({ ok: true, items });
  } catch (error: unknown) {
    console.error("GET_STORY_CHAPTERS_FAILED", error);
    const msg = error instanceof Error ? error.message : "GET_STORY_CHAPTERS_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function listStoryArcsResponse(slug: string): Promise<NextResponse> {
  const storyRes = await pool.query<{ id: number }>(
    `SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  const storyId = Number(storyRes.rows[0]?.id ?? 0);
  if (!storyId) return badRequest("STORY_NOT_FOUND");

  const arcsRes = await pool.query(
    `SELECT id, name, slug, kind, order_no FROM public.story_arc WHERE story_id = $1 ORDER BY order_no ASC, id ASC`,
    [storyId]
  );
  return NextResponse.json({ items: arcsRes.rows });
}

export async function postStoryArcResponse(req: NextRequest, slug: string): Promise<NextResponse> {
  const storyRes = await pool.query<{ id: number }>(
    `SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  const storyId = Number(storyRes.rows[0]?.id ?? 0);
  if (!storyId) return badRequest("STORY_NOT_FOUND");

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return badRequest("MISSING_NAME");

    const kind = String(body.kind || "").trim().toLowerCase() || "main";
    if (kind !== "main" && kind !== "sub") return badRequest("INVALID_KIND");

    const arcSlug = String(body.slug || name.toLowerCase().replace(/[^a-z0-9]/g, "-")).trim();

    const insertRes = await pool.query(
      `INSERT INTO public.story_arc (story_id, name, slug, kind) VALUES ($1, $2, $3, $4) RETURNING id`,
      [storyId, name, arcSlug, kind]
    );
    return NextResponse.json({ ok: true, id: insertRes.rows[0].id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function deleteStoryArcResponse(slug: string, arcId: number): Promise<NextResponse> {
  const storyRes = await pool.query<{ id: number }>(
    `SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  const storyId = Number(storyRes.rows[0]?.id ?? 0);
  if (!storyId) return badRequest("STORY_NOT_FOUND");

  await pool.query(
    `DELETE FROM public.story_arc WHERE id = $1 AND story_id = $2`,
    [arcId, storyId]
  );
  return NextResponse.json({ ok: true });
}

export async function assignChapterToArcResponse(req: NextRequest, slug: string): Promise<NextResponse> {
  const storyRes = await pool.query<{ id: number }>(
    `SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  const storyId = Number(storyRes.rows[0]?.id ?? 0);
  if (!storyId) return badRequest("STORY_NOT_FOUND");

  try {
    const body = await req.json();
    console.log("[ASSIGN_ARC_BODY]", JSON.stringify(body));
    const chapterId = String(body.chapter_id || "").trim();
    const arcIdRaw = body.arc_id;
    const arcId = arcIdRaw === null || arcIdRaw === undefined || arcIdRaw === ""
      ? null
      : Number(arcIdRaw);

    if (!chapterId) return badRequest("MISSING_CHAPTER_ID");
    if (arcId !== null && (!Number.isFinite(arcId) || arcId <= 0)) return badRequest("INVALID_ARC_ID");

    console.log(`[ASSIGN_ARC] storyId=${storyId} slug=${slug} chapterId=${chapterId} arcId=${arcId}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (arcId !== null) {
        const arcRes = await client.query<{ id: number }>(
          `SELECT id
           FROM public.story_arc
           WHERE id = $1
             AND story_id = $2
           LIMIT 1`,
          [arcId, storyId]
        );
        if (!arcRes.rowCount) {
          await client.query("ROLLBACK");
          return badRequest("INVALID_ARC_ID");
        }
      }

      await client.query(
        `INSERT INTO public.story_chapter (story_id, chapter_id, arc_id, updated_at)
         VALUES ($1, LOWER(TRIM($2)), $3, now())
         ON CONFLICT (story_id, chapter_id)
         DO UPDATE SET arc_id = EXCLUDED.arc_id, updated_at = now()`,
        [storyId, chapterId, arcId]
      );

      const mapVersionRes = await client.query<{ id: number }>(
        `SELECT id FROM public.story_map_version WHERE story_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [storyId]
      );
      const mapVersionId = mapVersionRes.rows[0]?.id;
      let mapRowsUpdated = 0;
      if (mapVersionId) {
        const mapUpdateRes = await client.query(
          `UPDATE public.story_scene_map
           SET arc_id = $1
           WHERE chapter_id = $2 AND map_version_id = $3`,
          [arcId, chapterId, mapVersionId]
        );
        mapRowsUpdated = Number(mapUpdateRes.rowCount || 0);
      }

      await client.query("COMMIT");
      return NextResponse.json({ ok: true, map_rows_updated: mapRowsUpdated });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function getStoryChapterReadResponse(slug: string, chapterId: string): Promise<NextResponse> {
  const storyRes = await pool.query<{ id: number; title: string }>(
    `SELECT id, title
     FROM public.story_series
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );
  const story = storyRes.rows[0];
  if (!story) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Get all chapters for navigation
  const allChaptersRes = await pool.query<{ chapter_id: string; title: string | null }>(
    `WITH chapter_union AS (
       SELECT ns.chapter_id::text AS chapter_id
       FROM public.narrative_scene ns
       WHERE ns.story_id = $1
         AND ns.status <> 'ARCHIVED'
       GROUP BY ns.chapter_id
       UNION
       SELECT st.chapter_id::text AS chapter_id
       FROM public.narrative_chapter_staging st
       WHERE st.story_id = $1
       GROUP BY st.chapter_id
       UNION
       SELECT cd.chapter_id::text AS chapter_id
       FROM public.chapter_draft cd
       WHERE cd.story_id = $1
       GROUP BY cd.chapter_id
       UNION
       SELECT sc.chapter_id::text AS chapter_id
       FROM public.story_chapter sc
       WHERE sc.story_id = $1
       GROUP BY sc.chapter_id
       UNION
       SELECT
         COALESCE(
           sd.origin->>'chapter_id',
           CASE
             WHEN (sd.origin->>'source_path') IS NOT NULL AND (sd.origin->>'source_path') ~ 'CHAPTER \d+'
             THEN 'ch' || LPAD(regexp_replace(sd.origin->>'source_path', '.*CHAPTER (\d+).*', '\\1'), 2, '0')
             ELSE 'ch01'
           END
         ) AS chapter_id
       FROM public.source_doc sd
       WHERE sd.story_id = $1
         AND sd.doc_type = 'ingest_chapter'
     )
     SELECT cu.chapter_id, sc.title
     FROM chapter_union cu
     LEFT JOIN public.story_chapter sc
       ON sc.story_id = $1
       AND sc.chapter_id = cu.chapter_id`,
    [story.id]
  );

  const all_chapters = allChaptersRes.rows.sort((a, b) => chapterSortKey(a.chapter_id) - chapterSortKey(b.chapter_id));
  const currentIndex = all_chapters.findIndex(c => c.chapter_id === chapterId);
  const prev_chapter_id = currentIndex > 0 ? all_chapters[currentIndex - 1].chapter_id : null;
  const next_chapter_id = currentIndex >= 0 && currentIndex < all_chapters.length - 1 ? all_chapters[currentIndex + 1].chapter_id : null;

  const scenesRes = await pool.query<SceneReadRow>(
    `SELECT
       s.id,
       s.idx,
       s.title,
       v.text_content
     FROM public.narrative_scene s
     LEFT JOIN public.narrative_scene_version v
       ON v.id = s.current_version_id
     WHERE s.story_id = $1
       AND s.chapter_id::text = $2
       AND s.status <> 'ARCHIVED'
     ORDER BY s.idx ASC, s.id ASC`,
    [story.id, chapterId]
  );

  const scenes = scenesRes.rows.map((r) => ({
    id: Number(r.id),
    idx: Number(r.idx),
    title: r.title,
    text_content: r.text_content ?? "",
  }));

  if (scenes.length === 0) {
    const draftRes = await pool.query<{ full_text: string | null }>(
      `SELECT full_text
       FROM public.chapter_draft
       WHERE story_id = $1
         AND chapter_id::text = $2
       ORDER BY version_no DESC
       LIMIT 1`,
      [story.id, chapterId]
    );
    const chapterDraftProse = (draftRes.rows[0]?.full_text || "").trim();
    if (chapterDraftProse) {
      return NextResponse.json({
        ok: true,
        story: { slug, title: story.title },
        chapter_id: chapterId,
        prev_chapter_id,
        next_chapter_id,
        all_chapters,
        scenes: [
          {
            id: 0,
            idx: 1,
            title: "Draft",
            text_content: chapterDraftProse,
          },
        ],
        source: "chapter_draft",
      });
    }

    const stagingRes = await pool.query<{ user_prose: string | null; llm_prose: string | null }>(
      `SELECT user_prose, llm_prose
       FROM public.narrative_chapter_staging
       WHERE story_id = $1
         AND chapter_id::text = $2
       LIMIT 1`,
      [story.id, chapterId]
    );
    const staging = stagingRes.rows[0];
    const draftProse = (staging?.user_prose || staging?.llm_prose || "").trim();

    if (draftProse) {
      return NextResponse.json({
        ok: true,
        story: { slug, title: story.title },
        chapter_id: chapterId,
        prev_chapter_id,
        next_chapter_id,
        all_chapters,
        scenes: [
          {
            id: 0,
            idx: 1,
            title: "Draft (unsplit)",
            text_content: draftProse,
          },
        ],
        source: "staging",
      });
    }

    // FINAL FALLBACK: source_doc
    const sourceRes = await pool.query<{ raw_text: string }>(
      `SELECT raw_text
       FROM public.source_doc
       WHERE story_id = $1
         AND doc_type = 'ingest_chapter'
         AND is_stable = true
         AND (
           COALESCE(origin->>'chapter_id', '') = $2
           OR
           NULLIF(regexp_replace($2, '[^0-9]', '', 'g'), '')::int
           =
           NULLIF(regexp_replace(
             COALESCE(origin->>'chapter_id', replace(origin->>'source_path', 'chapter:', '')),
             '[^0-9]', '', 'g'
           ), '')::int
         )
       LIMIT 1`,
      [story.id, chapterId]
    );
    const sourceText = (sourceRes.rows[0]?.raw_text || "").trim();

    if (sourceText) {
      return NextResponse.json({
        ok: true,
        story: { slug, title: story.title },
        chapter_id: chapterId,
        prev_chapter_id,
        next_chapter_id,
        all_chapters,
        scenes: [
          {
            id: 0,
            idx: 1,
            title: "Canonical Source",
            text_content: sourceText,
          },
        ],
        source: "canonical",
      });
    }

    return NextResponse.json({ error: "CHAPTER_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    story: { slug, title: story.title },
    chapter_id: chapterId,
    prev_chapter_id,
    next_chapter_id,
    all_chapters,
    scenes,
  });
}

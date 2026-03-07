import type { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

export type LibraryStatus = "draft" | "published" | "archived" | "private";

export type StoryPublicCard = {
  slug: string;
  title: string;
  library_status: LibraryStatus;
  summary_md: string | null;
  cover_image_path: string | null;
  updated_at: string;
  tags: string[];
  cautions: string[];
};

export type StoryPublicDetail = {
  id: number;
  slug: string;
  title: string;
  library_status: LibraryStatus;
  created_at: string;
  updated_at: string;
  description_md: string | null;
  author_note_md: string | null;
  summary_md: string | null;
  cover_image_path: string | null;
  background_image_path: string | null;
  caution_other_md: string | null;
  tags: string[];
  cautions: string[];
  gallery: Array<{ id: number; path: string; caption_md: string | null; sort_order: number }>;
};

export type StoryMetaPatch = {
  title?: string;
  library_status?: LibraryStatus;
  description_md?: string | null;
  author_note_md?: string | null;
  summary_md?: string | null;
  caution_other_md?: string | null;
  background_image_path?: string | null;
  tags?: string[];
  cautions?: string[];
};

type StoryImageRow = {
  id: number;
  path: string;
  caption_md: string | null;
  sort_order: number;
};

function normalizeList(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const cleaned = String(v ?? "").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export async function getStoryIdBySlug(db: Queryable, slug: string): Promise<number | null> {
  const res = await db.query<{ id: number }>(
    `SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  return Number(res.rows[0]?.id ?? 0) || null;
}

export async function listShelfStories(
  db: Queryable,
  args: { q?: string; tags?: string[]; cautions?: string[]; limit?: number; scope?: "all" | "published" }
): Promise<StoryPublicCard[]> {
  const limit = Math.max(1, Math.min(200, args.limit ?? 100));
  const params: unknown[] = [];
  const where: string[] = [];

  if ((args.scope ?? "all") === "published") {
    params.push("published");
    where.push(`s.library_status = $${params.length}`);
  }

  if (args.q && args.q.trim()) {
    params.push(`%${args.q.trim().toLowerCase()}%`);
    const i = params.length;
    where.push(`(lower(s.title) LIKE $${i} OR lower(coalesce(s.summary_md, '')) LIKE $${i})`);
  }

  const tags = normalizeList(args.tags);
  if (tags && tags.length > 0) {
    params.push(tags.map((t) => t.toLowerCase()));
    const i = params.length;
    where.push(
      `EXISTS (
         SELECT 1 FROM public.story_tag st
         WHERE st.story_id = s.id
           AND lower(st.tag) = ANY($${i}::text[])
       )`
    );
  }

  const cautions = normalizeList(args.cautions);
  if (cautions && cautions.length > 0) {
    params.push(cautions.map((c) => c.toLowerCase()));
    const i = params.length;
    where.push(
      `EXISTS (
         SELECT 1 FROM public.story_caution sc
         WHERE sc.story_id = s.id
           AND lower(sc.code) = ANY($${i}::text[])
       )`
    );
  }

  params.push(limit);

  const sql = `
    SELECT
      s.slug,
      s.title,
      s.library_status,
      s.summary_md,
      s.cover_image_path,
      s.updated_at::text AS updated_at,
      COALESCE(
        (
          SELECT array_agg(st.tag ORDER BY st.tag)
          FROM public.story_tag st
          WHERE st.story_id = s.id
        ),
        ARRAY[]::text[]
      ) AS tags,
      COALESCE(
        (
          SELECT array_agg(sc.code ORDER BY sc.code)
          FROM public.story_caution sc
          WHERE sc.story_id = s.id
        ),
        ARRAY[]::text[]
      ) AS cautions
    FROM public.story_series s
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY s.updated_at DESC, s.id DESC
    LIMIT $${params.length}
  `;

  const res = await db.query<StoryPublicCard>(sql, params);
  return res.rows.map((r) => ({
    ...r,
    tags: Array.isArray(r.tags) ? r.tags : [],
    cautions: Array.isArray(r.cautions) ? r.cautions : [],
  }));
}

export async function getStoryPublicDetailBySlug(db: Queryable, slug: string): Promise<StoryPublicDetail | null> {
  const baseRes = await db.query<
    Omit<StoryPublicDetail, "tags" | "cautions" | "gallery"> & { id: number; library_status: LibraryStatus }
  >(
    `SELECT
       id,
       slug,
       title,
       library_status,
       created_at::text AS created_at,
       updated_at::text AS updated_at,
       description_md,
       author_note_md,
       summary_md,
       cover_image_path,
       background_image_path,
       caution_other_md
     FROM public.story_series
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );
  const row = baseRes.rows[0];
  if (!row) return null;

  const [tagsRes, cautionsRes, galleryRes] = await Promise.all([
    db.query<{ tag: string }>(
      `SELECT tag FROM public.story_tag WHERE story_id = $1 ORDER BY tag ASC`,
      [row.id]
    ),
    db.query<{ code: string }>(
      `SELECT code FROM public.story_caution WHERE story_id = $1 ORDER BY code ASC`,
      [row.id]
    ),
    db.query<StoryImageRow>(
      `SELECT id, path, caption_md, sort_order
       FROM public.story_image
       WHERE story_id = $1
         AND kind = 'gallery'
       ORDER BY sort_order ASC, id ASC`,
      [row.id]
    ),
  ]);

  return {
    ...row,
    tags: tagsRes.rows.map((x) => x.tag),
    cautions: cautionsRes.rows.map((x) => x.code),
    gallery: galleryRes.rows.map((g) => ({
      id: Number(g.id),
      path: g.path,
      caption_md: g.caption_md,
      sort_order: Number(g.sort_order),
    })),
  };
}

export async function getStoryMetaBySlug(db: Queryable, slug: string): Promise<StoryPublicDetail | null> {
  const baseRes = await db.query<
    Omit<StoryPublicDetail, "tags" | "cautions" | "gallery"> & { id: number; library_status: LibraryStatus }
  >(
    `SELECT
       id,
       slug,
       title,
       library_status,
       created_at::text AS created_at,
       updated_at::text AS updated_at,
       description_md,
       author_note_md,
       summary_md,
       cover_image_path,
       background_image_path,
       caution_other_md
     FROM public.story_series
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );
  const row = baseRes.rows[0];
  if (!row) return null;

  const [tagsRes, cautionsRes, galleryRes] = await Promise.all([
    db.query<{ tag: string }>(
      `SELECT tag FROM public.story_tag WHERE story_id = $1 ORDER BY tag ASC`,
      [row.id]
    ),
    db.query<{ code: string }>(
      `SELECT code FROM public.story_caution WHERE story_id = $1 ORDER BY code ASC`,
      [row.id]
    ),
    db.query<StoryImageRow>(
      `SELECT id, path, caption_md, sort_order
       FROM public.story_image
       WHERE story_id = $1
         AND kind = 'gallery'
       ORDER BY sort_order ASC, id ASC`,
      [row.id]
    ),
  ]);

  return {
    ...row,
    tags: tagsRes.rows.map((x) => x.tag),
    cautions: cautionsRes.rows.map((x) => x.code),
    gallery: galleryRes.rows.map((g) => ({
      id: Number(g.id),
      path: g.path,
      caption_md: g.caption_md,
      sort_order: Number(g.sort_order),
    })),
  };
}

export async function patchStoryMetaBySlug(db: Pool, slug: string, patch: StoryMetaPatch): Promise<StoryPublicDetail | null> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const storyId = await getStoryIdBySlug(client, slug);
    if (!storyId) {
      await client.query("ROLLBACK");
      return null;
    }

    const sets: string[] = [];
    const params: unknown[] = [storyId];
    if (patch.title !== undefined) {
      params.push(patch.title);
      sets.push(`title = $${params.length}`);
    }
    if (patch.library_status !== undefined) {
      params.push(patch.library_status);
      sets.push(`library_status = $${params.length}`);
    }
    if (patch.description_md !== undefined) {
      params.push(patch.description_md);
      sets.push(`description_md = $${params.length}`);
    }
    if (patch.author_note_md !== undefined) {
      params.push(patch.author_note_md);
      sets.push(`author_note_md = $${params.length}`);
    }
    if (patch.summary_md !== undefined) {
      params.push(patch.summary_md);
      sets.push(`summary_md = $${params.length}`);
    }
    if (patch.caution_other_md !== undefined) {
      params.push(patch.caution_other_md);
      sets.push(`caution_other_md = $${params.length}`);
    }
    if (patch.background_image_path !== undefined) {
      params.push(patch.background_image_path);
      sets.push(`background_image_path = $${params.length}`);
    }

    if (sets.length > 0) {
      sets.push("updated_at = now()");
      await client.query(
        `UPDATE public.story_series
         SET ${sets.join(", ")}
         WHERE id = $1`,
        params
      );
    }

    const tags = normalizeList(patch.tags);
    if (tags !== undefined) {
      await client.query(`DELETE FROM public.story_tag WHERE story_id = $1`, [storyId]);
      for (const tag of tags) {
        await client.query(
          `INSERT INTO public.story_tag(story_id, tag)
           VALUES ($1, $2)
           ON CONFLICT (story_id, tag) DO NOTHING`,
          [storyId, tag]
        );
      }
    }

    const cautions = normalizeList(patch.cautions);
    if (cautions !== undefined) {
      await client.query(`DELETE FROM public.story_caution WHERE story_id = $1`, [storyId]);
      for (const code of cautions) {
        await client.query(
          `INSERT INTO public.story_caution(story_id, code)
           VALUES ($1, $2)
           ON CONFLICT (story_id, code) DO NOTHING`,
          [storyId, code]
        );
      }
    }

    await client.query("COMMIT");
    return getStoryMetaBySlug(db, slug);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setStoryCoverImagePath(db: Queryable, storyId: number, path: string): Promise<void> {
  await db.query(
    `UPDATE public.story_series
     SET cover_image_path = $2, updated_at = now()
     WHERE id = $1`,
    [storyId, path]
  );

  await db.query(
    `INSERT INTO public.story_image(story_id, kind, path, sort_order)
     VALUES ($1, 'cover', $2, 0)
     ON CONFLICT (story_id, kind) WHERE kind = 'cover'
     DO UPDATE SET path = EXCLUDED.path`,
    [storyId, path]
  );
}

export async function setStoryBackgroundImagePath(db: Queryable, storyId: number, path: string): Promise<void> {
  await db.query(
    `UPDATE public.story_series
     SET background_image_path = $2, updated_at = now()
     WHERE id = $1`,
    [storyId, path]
  );
}

export async function insertStoryGalleryImage(
  db: Queryable,
  args: { storyId: number; path: string; captionMd?: string | null; sortOrder?: number }
): Promise<number> {
  const res = await db.query<{ id: number }>(
    `INSERT INTO public.story_image(story_id, kind, path, caption_md, sort_order)
     VALUES ($1, 'gallery', $2, $3, $4)
     RETURNING id`,
    [args.storyId, args.path, args.captionMd ?? null, args.sortOrder ?? 0]
  );
  return Number(res.rows[0]?.id ?? 0);
}

export async function deleteStoryImageById(
  db: Queryable,
  args: { storyId: number; imageId: number }
): Promise<{ path: string; kind: string } | null> {
  const res = await db.query<{ path: string; kind: string }>(
    `DELETE FROM public.story_image
     WHERE id = $1
       AND story_id = $2
     RETURNING path, kind`,
    [args.imageId, args.storyId]
  );
  return res.rows[0] ?? null;
}
export async function deleteStoryBySlug(db: Queryable, slug: string): Promise<boolean> {
  if (slug === "default") return false;
  const res = await db.query(
    `DELETE FROM public.story_series WHERE slug = $1`,
    [slug]
  );
  return (res.rowCount ?? 0) > 0;
}

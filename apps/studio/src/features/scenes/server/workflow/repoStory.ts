import type { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

export type StoryStatus = "ACTIVE" | "ARCHIVED" | "DRAFT";

export type StoryRow = {
  id: number;
  slug: string;
  title: string;
  status: StoryStatus;
  system_prompt: string | null;
  tone_profile_json: Record<string, unknown>;
  default_llm_params_json: Record<string, unknown>;
  settings_json: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type StoryCreateInput = {
  slug: string;
  title: string;
  status?: StoryStatus;
  systemPrompt?: string | null;
  toneProfileJson?: Record<string, unknown>;
  defaultLlmParamsJson?: Record<string, unknown>;
  settingsJson?: Record<string, unknown>;
};

export type StoryUpdateInput = {
  title?: string;
  status?: StoryStatus;
  systemPrompt?: string | null;
  toneProfileJson?: Record<string, unknown>;
  defaultLlmParamsJson?: Record<string, unknown>;
  settingsJson?: Record<string, unknown>;
};

function normalizeSettingsJson(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const out = value && typeof value === "object" ? { ...value } : {};
  const rawLang = typeof out.writing_language === "string" ? out.writing_language.trim().toLowerCase() : "en";
  out.writing_language = rawLang === "vi" ? "vi" : "en";
  if (out.use_v3_core !== undefined) {
    out.use_v3_core = Boolean(out.use_v3_core);
  }
  return out;
}

export async function getStoryBySlug(db: Queryable, slug: string): Promise<StoryRow | null> {
  const res = await db.query<StoryRow>(
    `SELECT id, slug, title, status, system_prompt, tone_profile_json, default_llm_params_json, settings_json, created_at, updated_at
     FROM public.story_series
     WHERE slug = $1`,
    [slug]
  );
  return res.rows[0] ?? null;
}

export async function ensureStoryBySlug(
  db: Queryable,
  args: { slug: string; title?: string | null }
): Promise<StoryRow> {
  const existing = await getStoryBySlug(db, args.slug);
  if (existing) return existing;
  const title = args.title ?? args.slug;
  const insertRes = await db.query<StoryRow>(
    `INSERT INTO public.story_series(slug, title, status)
     VALUES ($1, $2, 'ACTIVE')
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
     RETURNING id, slug, title, status, system_prompt, tone_profile_json, default_llm_params_json, settings_json, created_at, updated_at`,
    [args.slug, title]
  );
  return insertRes.rows[0]!;
}

export async function listStories(
  db: Queryable
): Promise<Array<Pick<StoryRow, "slug" | "title" | "status" | "updated_at" | "settings_json">>> {
  const res = await db.query<Pick<StoryRow, "slug" | "title" | "status" | "updated_at" | "settings_json">>(
    `SELECT slug, title, status, settings_json, updated_at
     FROM public.story_series
     ORDER BY
       CASE status
         WHEN 'ACTIVE' THEN 0
         WHEN 'DRAFT' THEN 1
         ELSE 2
       END ASC,
       COALESCE(NULLIF(title, ''), slug) ASC,
       slug ASC`
  );
  return res.rows;
}

export async function createStory(db: Queryable, input: StoryCreateInput): Promise<StoryRow> {
  const res = await db.query<StoryRow>(
    `INSERT INTO public.story_series(
       slug, title, status, system_prompt, tone_profile_json, default_llm_params_json, settings_json
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
     RETURNING id, slug, title, status, system_prompt, tone_profile_json, default_llm_params_json, settings_json, created_at, updated_at`,
    [
      input.slug,
      input.title,
      input.status ?? "ACTIVE",
      input.systemPrompt ?? null,
      JSON.stringify(input.toneProfileJson ?? {}),
      JSON.stringify(input.defaultLlmParamsJson ?? {}),
      JSON.stringify(normalizeSettingsJson(input.settingsJson)),
    ]
  );
  return res.rows[0]!;
}

export async function updateStoryBySlug(
  db: Queryable,
  slug: string,
  patch: StoryUpdateInput
): Promise<StoryRow | null> {
  const sets: string[] = [];
  const params: Array<string | null> = [slug];

  if (patch.title !== undefined) {
    params.push(patch.title);
    sets.push(`title = $${params.length}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.systemPrompt !== undefined) {
    params.push(patch.systemPrompt ?? null);
    sets.push(`system_prompt = $${params.length}`);
  }
  if (patch.toneProfileJson !== undefined) {
    params.push(JSON.stringify(patch.toneProfileJson));
    sets.push(`tone_profile_json = $${params.length}::jsonb`);
  }
  if (patch.defaultLlmParamsJson !== undefined) {
    params.push(JSON.stringify(patch.defaultLlmParamsJson));
    sets.push(`default_llm_params_json = $${params.length}::jsonb`);
  }
  if (patch.settingsJson !== undefined) {
    params.push(JSON.stringify(normalizeSettingsJson(patch.settingsJson)));
    sets.push(`settings_json = $${params.length}::jsonb`);
  }

  if (sets.length === 0) {
    return getStoryBySlug(db, slug);
  }

  sets.push("updated_at = now()");

  const sql = `
    UPDATE public.story_series
    SET ${sets.join(", ")}
    WHERE slug = $1
    RETURNING id, slug, title, status, system_prompt, tone_profile_json, default_llm_params_json, settings_json, created_at, updated_at
  `;

  const res = await db.query<StoryRow>(sql, params);
  return res.rows[0] ?? null;
}

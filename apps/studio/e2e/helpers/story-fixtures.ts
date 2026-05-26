import type { APIRequestContext } from "@playwright/test";
import { Pool } from "pg";

export type StoryFixture = {
  slug: string;
  title: string;
};

const DEFAULT_DATABASE_URL = "postgresql://novel:novelpass@127.0.0.1:5433/novel";
const E2E_CAST = [
  { key: "mara", name: "Mara Voss", status: "active cartographer investigating the ghost district" },
  { key: "fen", name: "Fen", status: "active guide from block K-7" },
  { key: "orren", name: "Orren", status: "elder witness from block K-7" },
  { key: "elara", name: "Director Elara Voss", status: "Bureau director connected to the erased district" },
] as const;

const E2E_LOCATION_FACTS = [
  "Bureau archive",
  "block K-7",
  "ghost district",
  "unregistered eastern passage",
] as const;

const E2E_OBJECT_FACTS = [
  "pre-reform survey",
  "registry cylinder",
  "forbidden municipal map",
] as const;

function databaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

function chapterNumberFromId(chapterId: string): number {
  return Number.parseInt(chapterId.replace(/\D/g, "") || "1", 10) || 1;
}

function chapterLabel(chapterId: string): string {
  return `Chapter ${chapterNumberFromId(chapterId)}`;
}

function seedProseForChapter(chapterId: string): string {
  const chapterNo = chapterNumberFromId(chapterId);
  const label = chapterLabel(chapterId);
  return [
    `${label} readiness seed.`,
    "Mara Voss studies a forbidden municipal map in the Bureau of Cartographic Records while Fen waits near the service stairs.",
    "The official ledger says block K-7 does not exist, but Orren and the residents have kept the ghost district alive through hidden routes, old survey marks, and careful trust.",
    `For ${label}, Mara must protect the proof, follow Fen through the unmapped passage, and choose whether to expose Director Elara Voss before the city erases another district.`,
    "Important anchors: Bureau archive, pre-reform survey, block K-7, registry cylinder, and the unregistered eastern passage.",
    `Continuity hook ${chapterNo}: the next scene should preserve Mara's guilt, Fen's guarded urgency, and the risk that someone inside the Bureau is watching them.`,
  ].join("\n\n");
}

async function withDb<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

async function resolveStoryId(pool: Pool, slug: string): Promise<number> {
  const res = await pool.query<{ id: string | number }>(
    "SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1",
    [slug]
  );
  const storyId = Number(res.rows[0]?.id ?? 0);
  if (!storyId) throw new Error(`E2E_STORY_NOT_FOUND:${slug}`);
  return storyId;
}

async function seedStoryBasics(pool: Pool, storyId: number, slug: string): Promise<void> {
  await pool.query(
    `UPDATE public.story_series
     SET description_md = COALESCE(description_md, $2),
         updated_at = now()
     WHERE id = $1`,
    [
      storyId,
      "A cartographer discovers a ghost district erased from the official map and must decide whether proof is worth destroying her family legacy.",
    ]
  );

  await pool.query(
    `INSERT INTO public.story_style_profile (story_id, tone_baseline, darkness_level, political_intensity, pacing_bias, prose_density)
     VALUES ($1, 'tense literary mystery with concrete sensory detail', 55, 65, 55, 60)
     ON CONFLICT (story_id) DO UPDATE
     SET tone_baseline = EXCLUDED.tone_baseline,
         darkness_level = EXCLUDED.darkness_level,
         political_intensity = EXCLUDED.political_intensity,
         pacing_bias = EXCLUDED.pacing_bias,
         prose_density = EXCLUDED.prose_density,
         updated_at = now()`,
    [storyId]
  );

  for (const character of E2E_CAST) {
    await pool.query(
      `INSERT INTO public.story_canon_fact (story_id, category, content, importance, source_ref)
       SELECT $1, 'character', $2, 5, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM public.story_canon_fact
         WHERE story_id = $1 AND source_ref = $3
       )`,
      [storyId, character.name, `e2e:${slug}:character:${character.key}`]
    );
  }

  for (const location of E2E_LOCATION_FACTS) {
    await pool.query(
      `INSERT INTO public.story_canon_fact (story_id, category, content, importance, source_ref)
       SELECT $1, 'location', $2, 5, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM public.story_canon_fact
         WHERE story_id = $1 AND source_ref = $3
       )`,
      [storyId, location, `e2e:${slug}:location:${location.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`]
    );
  }

  for (const item of E2E_OBJECT_FACTS) {
    await pool.query(
      `INSERT INTO public.story_canon_fact (story_id, category, content, importance, source_ref)
       SELECT $1, 'item', $2, 5, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM public.story_canon_fact
         WHERE story_id = $1 AND source_ref = $3
       )`,
      [storyId, item, `e2e:${slug}:item:${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`]
    );
  }
}

async function seedPreviousContinuity(pool: Pool, storyId: number, chapterId: string): Promise<void> {
  const chapterNo = chapterNumberFromId(chapterId);
  if (chapterNo <= 1) return;

  const previousChapterId = `ch${String(chapterNo - 1).padStart(2, "0")}`;
  const previousFacts = [
    `Mara Voss carried proof from ${previousChapterId} into ${chapterId}.`,
    "Fen knows a route through the unregistered eastern passage.",
    "The Bureau is watching the ghost district investigation.",
  ];
  const unresolvedLoops = [
    {
      id: `e2e-loop-${previousChapterId}`,
      description: "Who inside the Bureau benefits from erasing block K-7?",
      started_at: previousChapterId,
    },
  ];

  await pool.query(
    `INSERT INTO public.chapter_ledger
       (story_id, chapter_id, added_facts, modified_states, resolved_loops, unresolved_loops, metadata_json)
     VALUES ($1, $2, $3::jsonb, '[]'::jsonb, '[]'::jsonb, $4::jsonb, $5::jsonb)
     ON CONFLICT (story_id, chapter_id) DO UPDATE
     SET added_facts = EXCLUDED.added_facts,
         modified_states = EXCLUDED.modified_states,
         unresolved_loops = EXCLUDED.unresolved_loops,
         metadata_json = EXCLUDED.metadata_json,
         is_stale = false,
         stale_reason = NULL,
         updated_at = now()`,
    [
      storyId,
      previousChapterId,
      JSON.stringify(previousFacts),
      JSON.stringify(unresolvedLoops),
      JSON.stringify({ source: "e2e_seed", next_chapter_id: chapterId }),
    ]
  );

  await pool.query(
    `INSERT INTO public.story_milestone
       (story_id, chapter_from, chapter_to, summary_json, source_hash, quality_score, created_by)
     VALUES ($1, $2, $2, $3::jsonb, $4, 0.95, 'e2e_seed')
     ON CONFLICT (story_id, chapter_from, chapter_to, source_hash) WHERE source_hash IS NOT NULL AND source_hash <> ''
     DO UPDATE
     SET summary_json = EXCLUDED.summary_json,
         quality_score = EXCLUDED.quality_score,
         updated_at = now(),
         is_stale = false,
         stale_reason = NULL`,
    [
      storyId,
      previousChapterId,
      JSON.stringify({
        summary: `${previousChapterId} leaves Mara, Fen, and Orren protecting proof of the erased district while the Bureau closes in.`,
        characters: E2E_CAST.map((item) => item.name),
      }),
      `e2e:${storyId}:${previousChapterId}:milestone`,
    ]
  );
}

async function seedVerifiedMemoryScene(pool: Pool, storyId: number, chapterId: string): Promise<void> {
  const workunitId = `e2e-memory-${chapterId}`;
  const prose = seedProseForChapter(chapterId);
  const sceneRes = await pool.query<{ id: string | number }>(
    `INSERT INTO public.narrative_scene
       (story_id, chapter_id, idx, draft_text, status, title, workunit_id, is_verified)
     VALUES ($1, $2, 0, $3, 'APPROVED', $4, $5, true)
     ON CONFLICT (story_id, workunit_id) DO UPDATE
     SET chapter_id = EXCLUDED.chapter_id,
         draft_text = EXCLUDED.draft_text,
         status = EXCLUDED.status,
         title = EXCLUDED.title,
         is_verified = true,
         updated_at = now()
     RETURNING id`,
    [storyId, chapterId, prose, `${chapterLabel(chapterId)} E2E memory anchor`, workunitId]
  );
  const sceneId = Number(sceneRes.rows[0].id);

  const versionRes = await pool.query<{ id: string | number }>(
    `INSERT INTO public.narrative_scene_version
       (story_id, scene_id, version_no, kind, text_content, summary, beats_json, eval_json)
     VALUES ($1, $2, 1, 'draft', $3, $4, $5::jsonb, $6::jsonb)
     ON CONFLICT (story_id, scene_id, version_no) DO UPDATE
     SET text_content = EXCLUDED.text_content,
         summary = EXCLUDED.summary,
         beats_json = EXCLUDED.beats_json,
         eval_json = EXCLUDED.eval_json
     RETURNING id`,
    [
      storyId,
      sceneId,
      prose,
      `${chapterLabel(chapterId)} anchors Mara, Fen, Orren, the Bureau archive, block K-7, and the pre-reform survey.`,
      JSON.stringify([
        {
          label: "Map evidence",
          location: "Bureau archive",
          characters: E2E_CAST.map((item) => item.name),
        },
      ]),
      JSON.stringify({ source: "e2e_seed", ready_for_writing: true }),
    ]
  );
  const versionId = Number(versionRes.rows[0].id);

  await pool.query(
    `UPDATE public.narrative_scene
     SET current_version_id = $2, is_verified = true, updated_at = now()
     WHERE id = $1`,
    [sceneId, versionId]
  );

  const canonFacts = [
    ...E2E_CAST.map((character) => ({
      subject: character.name,
      predicate: "status",
      object: character.status,
      entityType: "PERSON",
      tags: ["cast", "character"],
    })),
    ...E2E_LOCATION_FACTS.map((location) => ({
      subject: chapterLabel(chapterId),
      predicate: "location",
      object: location,
      entityType: "LOCATION",
      tags: ["setting"],
    })),
    ...E2E_OBJECT_FACTS.map((item) => ({
      subject: chapterLabel(chapterId),
      predicate: "object",
      object: item,
      entityType: "ITEM",
      tags: ["object"],
    })),
  ];
  for (const fact of canonFacts) {
    await pool.query(
      `INSERT INTO public.canon_fact
         (story_id, scene_id, scene_version_id, algo_version, subject, predicate, object, confidence, tags, source_trace, entity_type, classification, is_static)
       VALUES ($1, $2, $3, 'e2e_seed', $4, $5, $6, 0.95, $7::text[], $8::jsonb, $9, 'STATIC', true)
       ON CONFLICT (scene_version_id, algo_version, subject, predicate, object) DO UPDATE
       SET confidence = EXCLUDED.confidence,
           tags = EXCLUDED.tags,
           source_trace = EXCLUDED.source_trace,
           entity_type = EXCLUDED.entity_type,
           classification = EXCLUDED.classification,
           is_static = true`,
      [
        storyId,
        sceneId,
        versionId,
        fact.subject,
        fact.predicate,
        fact.object,
        fact.tags,
        JSON.stringify({ source: "e2e_seed", chapter_id: chapterId }),
        fact.entityType,
      ]
    );
  }

  const timelineRows = [
    {
      event: "Mara Voss finds the pre-reform survey inside the Bureau archive",
      time: "chapter-start",
      location: "Bureau archive",
      participants: ["Mara Voss", "Fen"],
    },
    {
      event: "Fen guides Mara toward block K-7 through the unregistered eastern passage",
      time: "chapter-middle",
      location: "unregistered eastern passage",
      participants: ["Mara Voss", "Fen"],
    },
    {
      event: "Orren confirms the ghost district evidence and the risk of Bureau surveillance",
      time: "chapter-end",
      location: "block K-7",
      participants: ["Mara Voss", "Fen", "Orren"],
    },
  ];
  for (const row of timelineRows) {
    await pool.query(
      `INSERT INTO public.timeline_anchor
         (story_id, scene_id, scene_version_id, algo_version, event_label, relative_time, location, participants, source_trace)
       VALUES ($1, $2, $3, 'e2e_seed', $4, $5, $6, $7::text[], $8::jsonb)
       ON CONFLICT (scene_version_id, algo_version, event_label) DO UPDATE
       SET relative_time = EXCLUDED.relative_time,
           location = EXCLUDED.location,
           participants = EXCLUDED.participants,
           source_trace = EXCLUDED.source_trace`,
      [
        storyId,
        sceneId,
        versionId,
        row.event,
        row.time,
        row.location,
        row.participants,
        JSON.stringify({ source: "e2e_seed", chapter_id: chapterId }),
      ]
    );
  }
}

async function seedApprovedWritingSnapshot(pool: Pool, storyId: number, chapterId: string): Promise<void> {
  await pool.query(
    `DELETE FROM public.writing_snapshot_v3
     WHERE story_id = $1
       AND chapter_id = $2
       AND snapshot_json->>'source' = 'e2e_seed'`,
    [storyId, chapterId]
  );

  await pool.query(
    `INSERT INTO public.writing_snapshot_v3
       (story_id, chapter_id, fact_status, narrative_score, emotional_target, open_loops, snapshot_json,
        degraded_mode, completeness_json, ready_for_writing, approval_status, pre_chapter_profile_json,
        post_chapter_profile_json, truth_context_pack_json, analysis_delta_report_json)
     VALUES ($1, $2, 'CLEAN', 0.95, $3, $4::jsonb, $5::jsonb, false, $6::jsonb, true, 'APPROVED', $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb)`,
    [
      storyId,
      chapterId,
      "tense resolve under Bureau surveillance",
      JSON.stringify([
        {
          id: `e2e-open-loop-${chapterId}`,
          description: "Who inside the Bureau benefits from erasing block K-7?",
        },
      ]),
      JSON.stringify({
        source: "e2e_seed",
        chapter_id: chapterId,
        characters: E2E_CAST.map((item) => ({
          name: item.name,
          current_state: item.status,
        })),
        cast: E2E_CAST.map((item) => item.name),
        setting_facts: E2E_LOCATION_FACTS,
        object_facts: E2E_OBJECT_FACTS,
        timeline: [
          "Mara Voss studies the forbidden municipal map inside the Bureau archive.",
          "Fen protects the route into block K-7 through the unregistered eastern passage.",
          "Orren can confirm the ghost district evidence if the Bureau does not silence him first.",
        ],
      }),
      JSON.stringify({
        coverage: "complete",
        source: "e2e_seed",
      }),
      JSON.stringify({
        chapter_id: chapterId,
        primary_characters: E2E_CAST.map((item) => item.name),
        location_anchors: E2E_LOCATION_FACTS,
      }),
      JSON.stringify({
        chapter_id: chapterId,
        open_threads: ["ghost district erasure", "Bureau surveillance"],
      }),
      JSON.stringify({
        allowed_characters: E2E_CAST.map((item) => item.name),
        canonical_settings: E2E_LOCATION_FACTS,
        canonical_objects: E2E_OBJECT_FACTS,
      }),
      JSON.stringify({
        source: "e2e_seed",
        blocking_deltas: [],
      }),
    ]
  );
}

export async function seedChapterWritingContext(slug: string, chapterId: string): Promise<void> {
  await withDb(async (pool) => {
    const storyId = await resolveStoryId(pool, slug);
    await seedStoryBasics(pool, storyId, slug);
    await seedPreviousContinuity(pool, storyId, chapterId);
    await seedVerifiedMemoryScene(pool, storyId, chapterId);
    await seedApprovedWritingSnapshot(pool, storyId, chapterId);

    await pool.query(
      `INSERT INTO public.story_chapter (story_id, chapter_id, title, summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (story_id, chapter_id) DO UPDATE
       SET title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           updated_at = now()`,
      [
        storyId,
        chapterId,
        chapterLabel(chapterId),
        `E2E context-ready slot for ${chapterLabel(chapterId)}.`,
      ]
    );

    await pool.query(
      `INSERT INTO public.narrative_chapter_staging (story_id, chapter_id, llm_prose, user_prose, plan_json, status)
       VALUES ($1, $2, $3, $3, $4::jsonb, 'STAGED')
       ON CONFLICT (story_id, chapter_id) DO UPDATE
       SET llm_prose = EXCLUDED.llm_prose,
           user_prose = EXCLUDED.user_prose,
           plan_json = EXCLUDED.plan_json,
           status = 'STAGED',
           updated_at = now()`,
      [
        storyId,
        chapterId,
        seedProseForChapter(chapterId),
        JSON.stringify({
          source: "e2e_seed",
          context_guard: {
            location_anchor: "Bureau archive",
            active_plot_threads: ["ghost district erasure", "Bureau surveillance"],
            important_objects: ["pre-reform survey", "registry cylinder"],
          },
        }),
      ]
    );
  });
}

export async function seedStoryWritingContext(slug: string, chapterIds: string[] = ["ch01"]): Promise<void> {
  for (const chapterId of chapterIds) {
    await seedChapterWritingContext(slug, chapterId);
  }
}

function makeTestSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `e2e_test_${ts}_${rand}`;
}

export async function createTestStory(
  request: APIRequestContext,
  baseURL: string,
  overrides: Partial<{ title: string; slug: string }> = {}
): Promise<StoryFixture> {
  const slug = overrides.slug ?? makeTestSlug();
  const title = overrides.title ?? "E2E Test Novel — Five Chapter Flow";

  const res = await request.post(`${baseURL}/api/stories`, {
    data: {
      slug,
      title,
      status: "ACTIVE",
      system_prompt: null,
      tone_profile_json: {},
      default_llm_params_json: {},
    },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Failed to create test story (${res.status()}): ${body}`);
  }

  return { slug, title };
}

export async function archiveTestStory(
  request: APIRequestContext,
  baseURL: string,
  slug: string
): Promise<void> {
  try {
    await request.patch(`${baseURL}/api/stories/${encodeURIComponent(slug)}`, {
      data: { status: "ARCHIVED" },
    });
  } catch {
    // Best-effort cleanup; do not fail tests on cleanup error
  }
}

export function writeWorkspaceUrl(slug: string): string {
  return `/stories/${encodeURIComponent(slug)}/write`;
}

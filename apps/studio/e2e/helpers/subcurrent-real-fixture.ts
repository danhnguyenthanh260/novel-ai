import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

type ManifestChapter = {
  index: number;
  title: string;
  url: string;
  file: string;
  sha256?: string;
};

type Manifest = {
  story_title: string;
  source_url: string;
  scraped_at_utc: string;
  chapters: ManifestChapter[];
};

type LoadedChapter = ManifestChapter & {
  chapterId: string;
  text: string;
  sha256: string;
};

const DEFAULT_DATABASE_URL = "postgresql://novel:novelpass@127.0.0.1:5433/novel";
const REPO_ROOT = path.resolve(process.cwd(), "../..");
const SUBCURRENT_DIR = path.join(REPO_ROOT, ".runtime/story-sources/the-subcurrent");
const MANIFEST_PATH = path.join(SUBCURRENT_DIR, "manifest.json");

const CAST = [
  {
    key: "kuro",
    name: "Kuro",
    status:
      "alive in Noctis, newly aware that the space around him can answer faintly after the Hollow-related check",
  },
  {
    key: "mike",
    name: "Mike",
    status:
      "alive in Noctis, tracking Hollow symbols, sensor logs, and the unexplained twelve-second freeze",
  },
  {
    key: "cerin",
    name: "Cerin",
    status:
      "alive in Noctis, recently brought into Kuro and Mike's investigation and studying energy maps",
  },
  {
    key: "halden",
    name: "Professor Halden",
    status:
      "remote observer who receives the anomalous cluster stabilization report after the local resonance event",
  },
] as const;

const LOCATION_FACTS = ["Noctis", "Firel", "the Hollow", "Kuro's apartment", "restricted library archive"] as const;
const OBJECT_FACTS = [
  "silk-paper map",
  "Mike's tablet",
  "Hollow scans",
  "sensor logs",
  "energy maps",
] as const;

function databaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function chapterId(index: number): string {
  return `ch${String(index).padStart(2, "0")}`;
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`SUBCURRENT_SOURCE_MISSING:${MANIFEST_PATH}`);
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

function loadChapters(maxIndex: number): { manifest: Manifest; chapters: LoadedChapter[] } {
  const manifest = loadManifest();
  const chapters = manifest.chapters
    .filter((chapter) => chapter.index <= maxIndex)
    .map((chapter) => {
      const file = path.join(SUBCURRENT_DIR, chapter.file);
      const text = readFileSync(file, "utf8");
      return {
        ...chapter,
        chapterId: chapterId(chapter.index),
        text,
        sha256: chapter.sha256 || sha256(text),
      };
    });
  if (chapters.length < maxIndex) {
    throw new Error(`SUBCURRENT_INCOMPLETE_SOURCE:expected_${maxIndex}_got_${chapters.length}`);
  }
  return { manifest, chapters };
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
  if (!storyId) throw new Error(`SUBCURRENT_STORY_NOT_FOUND:${slug}`);
  return storyId;
}

function compactSummary(chapter: LoadedChapter): string {
  const body = chapter.text.replace(/\s+/g, " ").trim();
  const head = body.slice(0, 700);
  const tail = body.slice(Math.max(0, body.length - 700));
  return `${chapter.title}. Source-grounded excerpt head: ${head} ... Source-grounded ending: ${tail}`;
}

async function seedStoryBasics(pool: Pool, storyId: number, manifest: Manifest): Promise<void> {
  await pool.query(
    `UPDATE public.story_series
     SET description_md = $2,
         system_prompt = $3,
         updated_at = now()
     WHERE id = $1`,
    [
      storyId,
      `${manifest.story_title}: coming-of-age cosmic anomaly fiction centered on Kuro, Mike, Cerin, Noctis, and the Hollow. Source: ${manifest.source_url}`,
      [
        "Continue The Subcurrent from source-grounded context only.",
        "Use chapters 1-10 as style_gold and continuity truth for this run.",
        "Generated prose remains draft-only until the author approves it.",
      ].join("\n"),
    ]
  );

  await pool.query(
    `INSERT INTO public.story_style_profile
       (story_id, tone_baseline, darkness_level, political_intensity, pacing_bias, prose_density)
     VALUES ($1, $2, 58, 35, 48, 68)
     ON CONFLICT (story_id) DO UPDATE
     SET tone_baseline = EXCLUDED.tone_baseline,
         darkness_level = EXCLUDED.darkness_level,
         political_intensity = EXCLUDED.political_intensity,
         pacing_bias = EXCLUDED.pacing_bias,
         prose_density = EXCLUDED.prose_density,
         updated_at = now()`,
    [
      storyId,
      "slow-burn psychological sci-fi mystery; restrained third-person close perspective; concrete ordinary details disturbed by anomalous spatial/current imagery; quiet dialogue; delayed exposition; unease through subtraction, resonance, waiting, and small sensory discontinuities",
    ]
  );
}

async function seedSourceDoc(pool: Pool, storyId: number, chapter: LoadedChapter): Promise<void> {
  await pool.query(
    `INSERT INTO public.source_doc
       (story_id, doc_type, origin, raw_text, raw_text_sha256, char_len, is_stable, version)
     VALUES ($1, 'ingest_chapter', $2::jsonb, $3, $4, $5, true, 1)
     ON CONFLICT (story_id, raw_text_sha256) DO UPDATE
     SET origin = EXCLUDED.origin,
         raw_text = EXCLUDED.raw_text,
         char_len = EXCLUDED.char_len,
         is_stable = true,
         version = EXCLUDED.version`,
    [
      storyId,
      JSON.stringify({
        source: "royalroad_author_reference",
        source_url: chapter.url,
        title: chapter.title,
        chapter_id: chapter.chapterId,
        style_band: "style_gold",
      }),
      chapter.text,
      chapter.sha256,
      chapter.text.length,
    ]
  );
}

async function seedStoryChapter(pool: Pool, storyId: number, chapter: LoadedChapter): Promise<void> {
  await pool.query(
    `INSERT INTO public.story_chapter (story_id, chapter_id, title, summary)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (story_id, chapter_id) DO UPDATE
     SET title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         updated_at = now()`,
    [storyId, chapter.chapterId, chapter.title, compactSummary(chapter)]
  );
}

async function seedMemoryScene(pool: Pool, storyId: number, chapter: LoadedChapter): Promise<number> {
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
    [
      storyId,
      chapter.chapterId,
      chapter.text,
      `${chapter.title} source memory anchor`,
      `subcurrent-source-${chapter.chapterId}`,
    ]
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
      chapter.text,
      compactSummary(chapter),
      JSON.stringify([{ label: chapter.title, source_chapter_id: chapter.chapterId }]),
      JSON.stringify({
        source: "subcurrent_real_e2e_seed",
        ready_for_writing: true,
        style_band: "style_gold",
      }),
    ]
  );
  const versionId = Number(versionRes.rows[0].id);
  await pool.query(
    `UPDATE public.narrative_scene
     SET current_version_id = $2, is_verified = true, updated_at = now()
     WHERE id = $1`,
    [sceneId, versionId]
  );
  return sceneId;
}

async function seedCanonAndTimeline(pool: Pool, storyId: number, sceneId: number): Promise<void> {
  const versionRes = await pool.query<{ current_version_id: string | number }>(
    "SELECT current_version_id FROM public.narrative_scene WHERE id = $1",
    [sceneId]
  );
  const versionId = Number(versionRes.rows[0]?.current_version_id ?? 0);
  if (!versionId) throw new Error("SUBCURRENT_SCENE_VERSION_MISSING");

  for (const character of CAST) {
    await pool.query(
      `INSERT INTO public.canon_fact
         (story_id, scene_id, scene_version_id, algo_version, subject, predicate, object, confidence, tags, source_trace, entity_type, classification, is_static)
       VALUES ($1, $2, $3, 'subcurrent_real_seed', $4, 'current_state', $5, 0.92, ARRAY['cast','character'], $6::jsonb, 'PERSON', 'STATIC', true)
       ON CONFLICT (scene_version_id, algo_version, subject, predicate, object) DO UPDATE
       SET confidence = EXCLUDED.confidence,
           tags = EXCLUDED.tags,
           source_trace = EXCLUDED.source_trace,
           classification = EXCLUDED.classification,
           is_static = true`,
      [
        storyId,
        sceneId,
        versionId,
        character.name,
        character.status,
        JSON.stringify({ source: "chapter_10_boundary", chapter_id: "ch10", key: character.key }),
      ]
    );
  }

  const timelineRows = [
    {
      event: "Kuro senses a subtle current after being struck by a grey electric bike",
      time: "chapter-10-afternoon",
      location: "Noctis",
      participants: ["Kuro"],
    },
    {
      event: "Mike and Cerin find Hollow-matching symbols and old Noctis underground maps in the restricted library archive",
      time: "chapter-10-late-afternoon",
      location: "restricted library archive",
      participants: ["Mike", "Cerin"],
    },
    {
      event: "Kuro, Mike, and Cerin decide they may need to return to the Hollow with protection",
      time: "chapter-10-evening",
      location: "Kuro's apartment",
      participants: ["Kuro", "Mike", "Cerin"],
    },
    {
      event: "A twelve-second local resonance check stabilizes and Professor Halden receives a report that the subjects remain intact",
      time: "chapter-10-ending",
      location: "Noctis",
      participants: ["Kuro", "Mike", "Cerin", "Professor Halden"],
    },
  ];

  for (const row of timelineRows) {
    await pool.query(
      `INSERT INTO public.timeline_anchor
         (story_id, scene_id, scene_version_id, algo_version, event_label, relative_time, location, participants, source_trace)
       VALUES ($1, $2, $3, 'subcurrent_real_seed', $4, $5, $6, $7::text[], $8::jsonb)
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
        JSON.stringify({ source: "chapter_10_boundary", chapter_id: "ch10" }),
      ]
    );
  }

  for (const content of [...LOCATION_FACTS, ...OBJECT_FACTS]) {
    await pool.query(
      `INSERT INTO public.story_canon_fact (story_id, category, content, importance, source_ref)
       SELECT $1, $2, $3, 5, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM public.story_canon_fact
         WHERE story_id = $1 AND source_ref = $4
       )`,
      [
        storyId,
        LOCATION_FACTS.includes(content as (typeof LOCATION_FACTS)[number]) ? "location" : "item",
        content,
        `subcurrent:chapter-10:${content.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      ]
    );
  }
}

async function seedLedgerAndSnapshot(pool: Pool, storyId: number, chapter: LoadedChapter): Promise<void> {
  const isBoundary = chapter.chapterId === "ch10";
  const addedFacts = isBoundary
    ? [
        "Kuro senses a faint current-like spatial response after the accident and later in his room.",
        "Mike and Cerin recover maps and symbols that match Hollow scans.",
        "Kuro, Mike, and Cerin agree that returning to the Hollow may be necessary but protection is required.",
        "A remote system logs anomalous cluster stabilization and Professor Halden notes that the subjects remain intact.",
      ]
    : [`${chapter.title} is approved source continuity for The Subcurrent style_gold band.`];

  const unresolvedLoops = isBoundary
    ? [
        {
          id: "subcurrent-loop-hollow-return",
          description: "What exactly waited in the Hollow, and why did the resonance check leave the subjects intact?",
          started_at: "ch10",
        },
        {
          id: "subcurrent-loop-halden",
          description: "What does Professor Halden know about Kuro, Mike, Cerin, and the anomalous cluster?",
          started_at: "ch10",
        },
      ]
    : [
        {
          id: `subcurrent-style-${chapter.chapterId}`,
          description: `${chapter.title} contributes style and continuity evidence.`,
          started_at: chapter.chapterId,
        },
      ];

  await pool.query(
    `INSERT INTO public.chapter_ledger
       (story_id, chapter_id, added_facts, modified_states, resolved_loops, unresolved_loops, metadata_json)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, '[]'::jsonb, $5::jsonb, $6::jsonb)
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
      chapter.chapterId,
      JSON.stringify(addedFacts),
      JSON.stringify(CAST.map((item) => `${item.name}: ${item.status}`)),
      JSON.stringify(unresolvedLoops),
      JSON.stringify({
        source: "subcurrent_real_e2e_seed",
        source_chapter_title: chapter.title,
        style_band: "style_gold",
      }),
    ]
  );

  await pool.query(
    `INSERT INTO public.story_milestone
       (story_id, chapter_from, chapter_to, summary_json, source_hash, quality_score, created_by)
     VALUES ($1, $2, $2, $3::jsonb, $4, 0.93, 'subcurrent_real_e2e_seed')
     ON CONFLICT (story_id, chapter_from, chapter_to, source_hash) WHERE source_hash IS NOT NULL AND source_hash <> ''
     DO UPDATE
     SET summary_json = EXCLUDED.summary_json,
         quality_score = EXCLUDED.quality_score,
         updated_at = now(),
         is_stale = false,
         stale_reason = NULL`,
    [
      storyId,
      chapter.chapterId,
      JSON.stringify({
        title: chapter.title,
        summary: compactSummary(chapter),
        style_band: "style_gold",
      }),
      `subcurrent:${storyId}:${chapter.chapterId}:${chapter.sha256}`,
    ]
  );

  if (!isBoundary) return;

  await pool.query(
    `DELETE FROM public.writing_snapshot_v3
     WHERE story_id = $1
       AND chapter_id = 'ch10'
       AND snapshot_json->>'source' = 'subcurrent_real_e2e_seed'`,
    [storyId]
  );

  await pool.query(
    `INSERT INTO public.writing_snapshot_v3
       (story_id, chapter_id, fact_status, narrative_score, emotional_target, open_loops, snapshot_json,
        degraded_mode, completeness_json, ready_for_writing, approval_status, pre_chapter_profile_json,
        post_chapter_profile_json, truth_context_pack_json, analysis_delta_report_json)
     VALUES ($1, 'ch10', 'CLEAN', 0.91, $2, $3::jsonb, $4::jsonb, false, $5::jsonb, true, 'APPROVED', $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)`,
    [
      storyId,
      "quiet dread, analytical curiosity, and the first calm recognition that an outside observer now knows they exist",
      JSON.stringify(unresolvedLoops),
      JSON.stringify({
        source: "subcurrent_real_e2e_seed",
        chapter_id: "ch10",
        boundary_state:
          "Kuro, Mike, and Cerin are in Kuro's room after the tablet/time freeze; the Hollow is waiting; Halden has observed the anomalous cluster.",
        cast: CAST.map((item) => ({ name: item.name, current_state: item.status })),
      }),
      JSON.stringify({
        coverage: "source_grounded_chapters_1_10",
        style_gold: ["ch01", "ch02", "ch03", "ch04", "ch05", "ch06", "ch07", "ch08", "ch09", "ch10"],
      }),
      JSON.stringify({
        chapter_id: "ch10",
        primary_characters: CAST.map((item) => item.name),
        location_anchors: LOCATION_FACTS,
      }),
      JSON.stringify({
        chapter_id: "ch11",
        expected_opening_pressure: "the aftermath of the twelve-second resonance check",
        open_threads: unresolvedLoops,
      }),
      JSON.stringify({
        allowed_characters: CAST.map((item) => item.name),
        canonical_settings: LOCATION_FACTS,
        canonical_objects: OBJECT_FACTS,
        forbidden: [
          "Do not resolve the Hollow's full nature in Chapter 11.",
          "Do not turn the chapter into an exposition report.",
          "Do not ignore the twelve-second timestamp jump.",
        ],
      }),
      JSON.stringify({
        source: "subcurrent_real_e2e_seed",
        blocking_deltas: [],
      }),
    ]
  );
}

async function seedTargetChapter(pool: Pool, storyId: number): Promise<void> {
  await pool.query(
    `INSERT INTO public.story_chapter (story_id, chapter_id, title, summary)
     VALUES ($1, 'ch11', 'Chapter 11 Draft Target', $2)
     ON CONFLICT (story_id, chapter_id) DO UPDATE
     SET title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         updated_at = now()`,
    [
      storyId,
      "Draft-only target chapter. Continue after Chapter 10 using chapters 1-10 as style_gold and continuity source.",
    ]
  );
}

export async function seedSubcurrentRealContext(slug: string): Promise<{ storyId: number; sourceChapters: number }> {
  const { manifest, chapters } = loadChapters(10);
  await withDb(async (pool) => {
    const storyId = await resolveStoryId(pool, slug);
    await seedStoryBasics(pool, storyId, manifest);
    let boundarySceneId = 0;
    for (const chapter of chapters) {
      await seedSourceDoc(pool, storyId, chapter);
      await seedStoryChapter(pool, storyId, chapter);
      const sceneId = await seedMemoryScene(pool, storyId, chapter);
      await seedLedgerAndSnapshot(pool, storyId, chapter);
      if (chapter.chapterId === "ch10") boundarySceneId = sceneId;
    }
    if (!boundarySceneId) throw new Error("SUBCURRENT_BOUNDARY_SCENE_MISSING");
    await seedCanonAndTimeline(pool, storyId, boundarySceneId);
    await seedTargetChapter(pool, storyId);
  });

  return withDb(async (pool) => ({
    storyId: await resolveStoryId(pool, slug),
    sourceChapters: chapters.length,
  }));
}

export function subcurrentOutputPath(fileName: string): string {
  return path.join(SUBCURRENT_DIR, "generated", fileName);
}

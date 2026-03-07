import type { Pool, PoolClient } from "pg";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

type Queryable = Pool | PoolClient;

type StoryConfig = {
  story_id: number;
  map_locked: boolean;
  thread_orphan_n: number;
};

type MapStateRow = {
  story_id: number;
  active_version_id: number | null;
  working_version_id: number | null;
};

type SceneMapRow = {
  id: number;
  chapter_id: string;
  sequence_no: number;
  act_label: string | null;
  arc_id: number | null;
  arc_name: string | null;
  beat_count: number;
  thread_coverage_count: number;
  thread_types: string[] | null;
  thread_ids: number[] | null;
};

type SceneListRow = {
  id: number;
  chapter_id: string;
  idx: number;
  title: string | null;
  status: string;
  workunit_id: string | null;
};

type ArcRow = {
  id: number;
  slug: string;
  name: string;
  kind: "main" | "sub";
  act_model: 3 | 5;
  order_no: number;
};

type ThreadRow = {
  id: number;
  slug: string;
  name: string;
  type: "plot_line" | "character_arc";
  importance: number;
  color: string | null;
};

type BeatRow = {
  id: number;
  beat_idx: number;
  goal: string;
  conflict: string;
  outcome: string;
  pov: string;
  thread_ids: number[];
  arc_id: number | null;
  notes_json: Record<string, unknown>;
};

type ExportSceneRow = {
  scene_id: number;
  chapter_id: string;
  sequence_no: number;
  act_label: string | null;
  arc_id: number | null;
};

type ExportBeatRow = {
  scene_id: number;
  beat_idx: number;
  goal: string;
  conflict: string;
  outcome: string;
  pov: string;
  thread_ids: number[];
  arc_id: number | null;
  notes_json: Record<string, unknown>;
};

function sanitizeText(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function parseSmallInt(input: unknown, fallback: number): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function parseThreadIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of input) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const id = Math.floor(n);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function parseNotes(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function chapterOrderOf(chapterId: string): number {
  const m = chapterId.match(/\d+/);
  if (!m) return Number.MAX_SAFE_INTEGER - 1;
  return Number(m[0]);
}

async function getStoryConfig(db: Queryable, storyId: number): Promise<StoryConfig> {
  try {
    const res = await db.query<{
      id: number;
      map_locked: boolean;
      settings_json: Record<string, unknown> | null;
    }>(
      `SELECT id, map_locked, settings_json
       FROM public.story_series
       WHERE id = $1
       LIMIT 1`,
      [storyId]
    );
    if (res.rowCount === 0) throw new Error("STORY_NOT_FOUND");
    const row = res.rows[0]!;
    const rawN = Number((row.settings_json ?? {})["thread_orphan_n"]);
    const threadOrphanN = Number.isFinite(rawN) ? Math.max(1, Math.min(200, Math.floor(rawN))) : 5;
    return {
      story_id: Number(row.id),
      map_locked: Boolean(row.map_locked),
      thread_orphan_n: threadOrphanN,
    };
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code ?? "")
        : "";
    // Backward compatibility for envs not yet migrated to Stage 3 schema.
    if (code !== "42703") throw error;
    const fallback = await db.query<{ id: number }>(
      `SELECT id
       FROM public.story_series
       WHERE id = $1
       LIMIT 1`,
      [storyId]
    );
    if (fallback.rowCount === 0) throw new Error("STORY_NOT_FOUND");
    return {
      story_id: Number(fallback.rows[0].id),
      map_locked: false,
      thread_orphan_n: 5,
    };
  }
}

async function ensureMapStateRow(db: Queryable, storyId: number): Promise<MapStateRow> {
  await db.query(
    `INSERT INTO public.story_map_state(story_id, active_version_id, working_version_id)
     VALUES ($1, NULL, NULL)
     ON CONFLICT (story_id) DO NOTHING`,
    [storyId]
  );
  const res = await db.query<MapStateRow>(
    `SELECT story_id, active_version_id, working_version_id
     FROM public.story_map_state
     WHERE story_id = $1
     LIMIT 1`,
    [storyId]
  );
  return res.rows[0]!;
}

async function nextVersionNo(db: Queryable, storyId: number): Promise<number> {
  const res = await db.query<{ next_no: number }>(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no
     FROM public.story_map_version
     WHERE story_id = $1`,
    [storyId]
  );
  return Number(res.rows[0]?.next_no ?? 1);
}

async function createMapVersion(
  db: Queryable,
  args: {
    storyId: number;
    status: "draft" | "committed";
    createdBy?: string | null;
    note?: string | null;
  }
): Promise<number> {
  const versionNo = await nextVersionNo(db, args.storyId);
  const ins = await db.query<{ id: number }>(
    `INSERT INTO public.story_map_version(story_id, version_no, status, created_by, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [args.storyId, versionNo, args.status, args.createdBy ?? null, args.note ?? null]
  );
  return Number(ins.rows[0].id);
}

async function seedSceneMapFromNarrative(db: Queryable, storyId: number, mapVersionId: number): Promise<void> {
  await db.query(
    `INSERT INTO public.story_scene_map(map_version_id, scene_id, chapter_id, sequence_no, act_label, arc_id)
     SELECT $2, s.id, s.chapter_id, COALESCE(s.idx, 0), NULL, NULL
     FROM public.narrative_scene s
     WHERE s.story_id = $1
     ON CONFLICT (map_version_id, scene_id) DO NOTHING`,
    [storyId, mapVersionId]
  );
}

async function cloneMapVersion(db: Queryable, fromVersionId: number, toVersionId: number): Promise<void> {
  await db.query(
    `INSERT INTO public.story_scene_map(map_version_id, scene_id, chapter_id, sequence_no, act_label, arc_id)
     SELECT $2, scene_id, chapter_id, sequence_no, act_label, arc_id
     FROM public.story_scene_map
     WHERE map_version_id = $1`,
    [fromVersionId, toVersionId]
  );

  await db.query(
    `INSERT INTO public.story_beat(
       map_version_id, scene_id, beat_idx, goal, conflict, outcome, pov, thread_ids, arc_id, notes_json
     )
     SELECT
       $2, scene_id, beat_idx, goal, conflict, outcome, pov, thread_ids, arc_id, notes_json
     FROM public.story_beat
     WHERE map_version_id = $1`,
    [fromVersionId, toVersionId]
  );
}

async function ensureWorkingVersion(
  db: Queryable,
  storyId: number,
  createdBy?: string
): Promise<{ mapVersionId: number; state: MapStateRow }> {
  const state = await ensureMapStateRow(db, storyId);
  if (state.working_version_id) {
    // Keep working map aligned with newly ingested narrative scenes.
    await seedSceneMapFromNarrative(db, storyId, state.working_version_id);
    return { mapVersionId: state.working_version_id, state };
  }

  const newDraftId = await createMapVersion(db, {
    storyId,
    status: "draft",
    createdBy: createdBy ?? null,
    note: "auto checkout",
  });

  if (state.active_version_id) {
    await cloneMapVersion(db, state.active_version_id, newDraftId);
  } else {
    await seedSceneMapFromNarrative(db, storyId, newDraftId);
  }
  // Add any scenes created after active snapshot was made.
  await seedSceneMapFromNarrative(db, storyId, newDraftId);

  await db.query(
    `UPDATE public.story_map_state
     SET working_version_id = $2, updated_at = now()
     WHERE story_id = $1`,
    [storyId, newDraftId]
  );

  return {
    mapVersionId: newDraftId,
    state: {
      story_id: storyId,
      active_version_id: state.active_version_id,
      working_version_id: newDraftId,
    },
  };
}

async function resolveLatestVersionId(db: Queryable, storyId: number, createdBy?: string): Promise<number> {
  const state = await ensureMapStateRow(db, storyId);
  if (state.active_version_id) return state.active_version_id;
  if (state.working_version_id) return state.working_version_id;
  const ensured = await ensureWorkingVersion(db, storyId, createdBy);
  return ensured.mapVersionId;
}

async function ensureSceneMapRow(
  db: Queryable,
  args: { mapVersionId: number; sceneId: number; storyId: number }
): Promise<void> {
  await db.query(
    `INSERT INTO public.story_scene_map(map_version_id, scene_id, chapter_id, sequence_no, act_label, arc_id)
     SELECT $1, s.id, s.chapter_id, COALESCE(s.idx, 0), NULL, NULL
     FROM public.narrative_scene s
     WHERE s.story_id = $2 AND s.id = $3
     ON CONFLICT (map_version_id, scene_id) DO NOTHING`,
    [args.mapVersionId, args.storyId, args.sceneId]
  );
}

async function compactBeatIndices(db: Queryable, mapVersionId: number, sceneId: number): Promise<void> {
  await db.query(
    `WITH ranked AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY beat_idx ASC, id ASC) - 1 AS new_idx
       FROM public.story_beat
       WHERE map_version_id = $1 AND scene_id = $2
     )
     UPDATE public.story_beat b
     SET beat_idx = ranked.new_idx
     FROM ranked
     WHERE b.id = ranked.id
       AND b.beat_idx <> ranked.new_idx`,
    [mapVersionId, sceneId]
  );
}

export async function resolveStoryForMapRead(pool: Pool, storySlug: string): Promise<{ storyId: number; config: StoryConfig }> {
  const storyId = await resolveStoryId(pool, storySlug);
  const config = await getStoryConfig(pool, storyId);
  return { storyId, config };
}

export async function resolveStoryForMapWrite(pool: Pool, storySlug: string): Promise<{ storyId: number; config: StoryConfig }> {
  const storyId = await resolveStoryIdForWrite(pool, storySlug);
  const config = await getStoryConfig(pool, storyId);
  if (config.map_locked) throw new Error("MAP_LOCKED");
  return { storyId, config };
}
export async function getMapOverview(
  pool: Pool,
  args: { storyId: number; includeMeta?: boolean; createdBy?: string }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { mapVersionId, state } = await ensureWorkingVersion(client, args.storyId, args.createdBy);

    const scenesRes = await client.query<SceneListRow>(
      `SELECT id, chapter_id, idx, title, status, workunit_id
       FROM public.narrative_scene
       WHERE story_id = $1
       ORDER BY chapter_id ASC, idx ASC, id ASC`,
      [args.storyId]
    );

    const mapRes = await client.query<SceneMapRow>(
      `SELECT
         sm.scene_id AS id,
         sm.chapter_id,
         sm.sequence_no,
         sm.act_label,
         sm.arc_id,
         a.name AS arc_name,
         COUNT(b.id)::int AS beat_count,
         COALESCE(COUNT(DISTINCT t.thread_id) FILTER (WHERE t.thread_id IS NOT NULL), 0)::int AS thread_coverage_count,
         COALESCE(array_agg(DISTINCT st.type) FILTER (WHERE st.type IS NOT NULL), ARRAY[]::text[]) AS thread_types,
         COALESCE(array_agg(DISTINCT t.thread_id) FILTER (WHERE t.thread_id IS NOT NULL), ARRAY[]::bigint[]) AS thread_ids
       FROM public.story_scene_map sm
       LEFT JOIN public.story_arc a ON a.id = sm.arc_id
       LEFT JOIN public.story_beat b ON b.map_version_id = sm.map_version_id AND b.scene_id = sm.scene_id
       LEFT JOIN LATERAL unnest(COALESCE(b.thread_ids, ARRAY[]::bigint[])) AS t(thread_id) ON TRUE
       LEFT JOIN public.story_thread st ON st.id = t.thread_id
       WHERE sm.map_version_id = $1
       GROUP BY sm.scene_id, sm.chapter_id, sm.sequence_no, sm.act_label, sm.arc_id, a.name`,
      [mapVersionId]
    );

    const mapByScene = new Map<number, SceneMapRow>();
    for (const row of mapRes.rows) mapByScene.set(Number(row.id), row);

    const chaptersMap = new Map<string, Array<Record<string, unknown>>>();
    for (const scene of scenesRes.rows) {
      const mapped = mapByScene.get(Number(scene.id));
      const chapter = mapped?.chapter_id ?? scene.chapter_id;
      if (!chaptersMap.has(chapter)) chaptersMap.set(chapter, []);
      const beatCount = Number(mapped?.beat_count ?? 0);
      chaptersMap.get(chapter)!.push({
        id: scene.id,
        chapter_id: chapter,
        idx: scene.idx,
        title: scene.title,
        status: scene.status,
        workunit_id: scene.workunit_id,
        sequence_no: Number(mapped?.sequence_no ?? scene.idx ?? 0),
        act_label: mapped?.act_label ?? null,
        arc_id: mapped?.arc_id ?? null,
        arc_name: mapped?.arc_name ?? null,
        beat_count: beatCount,
        thread_coverage_count: Number(mapped?.thread_coverage_count ?? 0),
        thread_types: mapped?.thread_types ?? [],
        thread_ids: (mapped?.thread_ids ?? []).map((n) => Number(n)),
        is_orphan: beatCount === 0,
      });
    }

    const chapters = [...chaptersMap.entries()]
      .sort((a, b) => chapterOrderOf(a[0]) - chapterOrderOf(b[0]) || a[0].localeCompare(b[0]))
      .map(([chapter_id, scenes]) => ({
        chapter_id,
        scenes: scenes.sort(
          (a, b) =>
            Number(a.sequence_no ?? 0) - Number(b.sequence_no ?? 0) ||
            Number(a.idx ?? 0) - Number(b.idx ?? 0) ||
            Number(a.id ?? 0) - Number(b.id ?? 0)
        ),
      }));

    const payload: Record<string, unknown> = {
      story_id: args.storyId,
      map_version_id: mapVersionId,
      chapters,
    };

    if (args.includeMeta) {
      payload.state = state;
      const arcRes = await client.query<ArcRow>(
        `SELECT id, slug, name, kind, act_model, order_no
         FROM public.story_arc
         WHERE story_id = $1
         ORDER BY order_no ASC, id ASC`,
        [args.storyId]
      );
      const threadRes = await client.query<ThreadRow>(
        `SELECT id, slug, name, type, importance, color
         FROM public.story_thread
         WHERE story_id = $1
         ORDER BY importance DESC, id ASC`,
        [args.storyId]
      );
      payload.arcs = arcRes.rows;
      payload.threads = threadRes.rows;
    }

    await client.query("COMMIT");
    return payload;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function getSceneDrawerDetail(
  pool: Pool,
  args: { storyId: number; sceneId: number; createdBy?: string }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { mapVersionId } = await ensureWorkingVersion(client, args.storyId, args.createdBy);
    await ensureSceneMapRow(client, { mapVersionId, sceneId: args.sceneId, storyId: args.storyId });

    const sceneRes = await client.query(
      `SELECT id, chapter_id, idx, title, status, workunit_id
       FROM public.narrative_scene
       WHERE story_id = $1 AND id = $2
       LIMIT 1`,
      [args.storyId, args.sceneId]
    );
    if (sceneRes.rowCount === 0) throw new Error("SCENE_NOT_FOUND");

    const mapRes = await client.query(
      `SELECT chapter_id, sequence_no, act_label, arc_id
       FROM public.story_scene_map
       WHERE map_version_id = $1 AND scene_id = $2
       LIMIT 1`,
      [mapVersionId, args.sceneId]
    );

    const beatRes = await client.query<BeatRow>(
      `SELECT id, beat_idx, goal, conflict, outcome, pov, thread_ids, arc_id, notes_json
       FROM public.story_beat
       WHERE map_version_id = $1 AND scene_id = $2
       ORDER BY beat_idx ASC, id ASC`,
      [mapVersionId, args.sceneId]
    );

    const arcRes = await client.query<ArcRow>(
      `SELECT id, slug, name, kind, act_model, order_no
       FROM public.story_arc
       WHERE story_id = $1
       ORDER BY order_no ASC, id ASC`,
      [args.storyId]
    );

    const threadRes = await client.query<ThreadRow>(
      `SELECT id, slug, name, type, importance, color
       FROM public.story_thread
       WHERE story_id = $1
       ORDER BY importance DESC, id ASC`,
      [args.storyId]
    );

    await client.query("COMMIT");
    return {
      story_id: args.storyId,
      map_version_id: mapVersionId,
      scene: {
        ...sceneRes.rows[0],
        ...(mapRes.rows[0] ?? {}),
      },
      beats: beatRes.rows.map((row) => ({
        ...row,
        thread_ids: Array.isArray(row.thread_ids) ? row.thread_ids.map((v) => Number(v)) : [],
      })),
      arcs: arcRes.rows,
      threads: threadRes.rows,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function patchSceneMapMeta(
  pool: Pool,
  args: {
    storyId: number;
    sceneId: number;
    chapterId?: string;
    sequenceNo?: number;
    actLabel?: string | null;
    arcId?: number | null;
    createdBy?: string;
  }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { mapVersionId } = await ensureWorkingVersion(client, args.storyId, args.createdBy);
    await ensureSceneMapRow(client, { mapVersionId, sceneId: args.sceneId, storyId: args.storyId });

    const updates: string[] = [];
    const params: Array<string | number | null> = [mapVersionId, args.sceneId];
    if (args.chapterId !== undefined) {
      updates.push(`chapter_id = $${params.length + 1}`);
      params.push(args.chapterId);
    }
    if (args.sequenceNo !== undefined) {
      updates.push(`sequence_no = $${params.length + 1}`);
      params.push(Math.max(0, Math.floor(args.sequenceNo)));
    }
    if (args.actLabel !== undefined) {
      updates.push(`act_label = $${params.length + 1}`);
      params.push(args.actLabel);
    }
    if (args.arcId !== undefined) {
      updates.push(`arc_id = $${params.length + 1}`);
      params.push(args.arcId);
    }
    if (updates.length === 0) throw new Error("NO_FIELDS_TO_UPDATE");

    const sql = `UPDATE public.story_scene_map
                 SET ${updates.join(", ")}, updated_at = now()
                 WHERE map_version_id = $1 AND scene_id = $2
                 RETURNING scene_id`;
    const res = await client.query(sql, params);
    if (res.rowCount === 0) throw new Error("SCENE_MAP_NOT_FOUND");
    await client.query("COMMIT");
    return {
      ok: true,
      map_version_id: mapVersionId,
      scene_id: args.sceneId,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
export async function appendBeat(
  pool: Pool,
  args: {
    storyId: number;
    sceneId: number;
    goal?: string;
    conflict?: string;
    outcome?: string;
    pov?: string;
    threadIds?: number[];
    arcId?: number | null;
    notesJson?: Record<string, unknown>;
    createdBy?: string;
  }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { mapVersionId } = await ensureWorkingVersion(client, args.storyId, args.createdBy);
    await ensureSceneMapRow(client, { mapVersionId, sceneId: args.sceneId, storyId: args.storyId });

    const nextRes = await client.query<{ next_idx: number }>(
      `SELECT COALESCE(MAX(beat_idx), -1) + 1 AS next_idx
       FROM public.story_beat
       WHERE map_version_id = $1 AND scene_id = $2`,
      [mapVersionId, args.sceneId]
    );
    const nextIdx = Number(nextRes.rows[0]?.next_idx ?? 0);
    const ins = await client.query<{ id: number }>(
      `INSERT INTO public.story_beat(
         map_version_id, scene_id, beat_idx, goal, conflict, outcome, pov, thread_ids, arc_id, notes_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::bigint[], $9, $10::jsonb)
       RETURNING id`,
      [
        mapVersionId,
        args.sceneId,
        nextIdx,
        args.goal ?? "",
        args.conflict ?? "",
        args.outcome ?? "",
        args.pov ?? "",
        args.threadIds ?? [],
        args.arcId ?? null,
        args.notesJson ?? {},
      ]
    );
    await client.query("COMMIT");
    return {
      ok: true,
      map_version_id: mapVersionId,
      scene_id: args.sceneId,
      beat_id: Number(ins.rows[0].id),
      beat_idx: nextIdx,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function patchBeat(
  pool: Pool,
  args: {
    storyId: number;
    beatId: number;
    goal?: string;
    conflict?: string;
    outcome?: string;
    pov?: string;
    threadIds?: number[];
    arcId?: number | null;
    notesJson?: Record<string, unknown>;
    createdBy?: string;
  }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { mapVersionId } = await ensureWorkingVersion(client, args.storyId, args.createdBy);
    const beatRes = await client.query<{ id: number; scene_id: number }>(
      `SELECT id, scene_id
       FROM public.story_beat
       WHERE id = $1 AND map_version_id = $2
       LIMIT 1`,
      [args.beatId, mapVersionId]
    );
    if (beatRes.rowCount === 0) throw new Error("BEAT_NOT_FOUND");

    const updates: string[] = [];
    const params: Array<string | number | number[] | Record<string, unknown> | null> = [args.beatId, mapVersionId];
    if (args.goal !== undefined) {
      updates.push(`goal = $${params.length + 1}`);
      params.push(args.goal);
    }
    if (args.conflict !== undefined) {
      updates.push(`conflict = $${params.length + 1}`);
      params.push(args.conflict);
    }
    if (args.outcome !== undefined) {
      updates.push(`outcome = $${params.length + 1}`);
      params.push(args.outcome);
    }
    if (args.pov !== undefined) {
      updates.push(`pov = $${params.length + 1}`);
      params.push(args.pov);
    }
    if (args.threadIds !== undefined) {
      updates.push(`thread_ids = $${params.length + 1}::bigint[]`);
      params.push(args.threadIds);
    }
    if (args.arcId !== undefined) {
      updates.push(`arc_id = $${params.length + 1}`);
      params.push(args.arcId);
    }
    if (args.notesJson !== undefined) {
      updates.push(`notes_json = $${params.length + 1}::jsonb`);
      params.push(args.notesJson);
    }
    if (updates.length === 0) throw new Error("NO_FIELDS_TO_UPDATE");

    await client.query(
      `UPDATE public.story_beat
       SET ${updates.join(", ")}, updated_at = now()
       WHERE id = $1 AND map_version_id = $2`,
      params
    );
    await client.query("COMMIT");
    return { ok: true, beat_id: args.beatId, map_version_id: mapVersionId };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteBeat(
  pool: Pool,
  args: {
    storyId: number;
    beatId: number;
    createdBy?: string;
  }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { mapVersionId } = await ensureWorkingVersion(client, args.storyId, args.createdBy);
    const beatRes = await client.query<{ scene_id: number }>(
      `DELETE FROM public.story_beat
       WHERE id = $1 AND map_version_id = $2
       RETURNING scene_id`,
      [args.beatId, mapVersionId]
    );
    if (beatRes.rowCount === 0) throw new Error("BEAT_NOT_FOUND");
    const sceneId = Number(beatRes.rows[0].scene_id);
    await compactBeatIndices(client, mapVersionId, sceneId);
    await client.query("COMMIT");
    return { ok: true, beat_id: args.beatId, scene_id: sceneId, map_version_id: mapVersionId };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function reorderBeats(
  pool: Pool,
  args: {
    storyId: number;
    sceneId: number;
    beatIds: number[];
    createdBy?: string;
  }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { mapVersionId } = await ensureWorkingVersion(client, args.storyId, args.createdBy);
    const listRes = await client.query<{ id: number }>(
      `SELECT id
       FROM public.story_beat
       WHERE map_version_id = $1 AND scene_id = $2
       ORDER BY beat_idx ASC, id ASC`,
      [mapVersionId, args.sceneId]
    );
    const existing = listRes.rows.map((r) => Number(r.id));
    if (existing.length !== args.beatIds.length) throw new Error("REORDER_SIZE_MISMATCH");
    const setA = new Set(existing);
    const setB = new Set(args.beatIds);
    if (setA.size !== setB.size) throw new Error("REORDER_DUPLICATE_IDS");
    for (const id of setA) {
      if (!setB.has(id)) throw new Error("REORDER_ID_SET_MISMATCH");
    }

    const offset = 100000;
    await client.query(
      `UPDATE public.story_beat
       SET beat_idx = beat_idx + $3
       WHERE map_version_id = $1 AND scene_id = $2`,
      [mapVersionId, args.sceneId, offset]
    );
    for (let i = 0; i < args.beatIds.length; i += 1) {
      await client.query(
        `UPDATE public.story_beat
         SET beat_idx = $4, updated_at = now()
         WHERE id = $1 AND map_version_id = $2 AND scene_id = $3`,
        [args.beatIds[i], mapVersionId, args.sceneId, i]
      );
    }
    await compactBeatIndices(client, mapVersionId, args.sceneId);
    await client.query("COMMIT");
    return {
      ok: true,
      map_version_id: mapVersionId,
      scene_id: args.sceneId,
      beat_ids: args.beatIds,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
export async function checkoutMapDraft(
  pool: Pool,
  args: { storyId: number; createdBy?: string; note?: string }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const state = await ensureMapStateRow(client, args.storyId);
    const newDraftId = await createMapVersion(client, {
      storyId: args.storyId,
      status: "draft",
      createdBy: args.createdBy ?? null,
      note: args.note ?? "checkout",
    });
    if (state.active_version_id) {
      await cloneMapVersion(client, state.active_version_id, newDraftId);
    } else {
      await seedSceneMapFromNarrative(client, args.storyId, newDraftId);
    }
    await client.query(
      `UPDATE public.story_map_state
       SET working_version_id = $2, updated_at = now()
       WHERE story_id = $1`,
      [args.storyId, newDraftId]
    );
    await client.query("COMMIT");
    return {
      ok: true,
      story_id: args.storyId,
      working_version_id: newDraftId,
      source_active_version_id: state.active_version_id,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function commitMapWorking(
  pool: Pool,
  args: { storyId: number; createdBy?: string; note?: string }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const state = await ensureMapStateRow(client, args.storyId);
    if (!state.working_version_id) throw new Error("WORKING_VERSION_NOT_FOUND");

    await client.query(
      `UPDATE public.story_map_version
       SET status = 'committed', note = COALESCE($3, note)
       WHERE id = $1 AND story_id = $2`,
      [state.working_version_id, args.storyId, args.note ?? null]
    );

    const nextDraftId = await createMapVersion(client, {
      storyId: args.storyId,
      status: "draft",
      createdBy: args.createdBy ?? null,
      note: "post commit working copy",
    });
    await cloneMapVersion(client, state.working_version_id, nextDraftId);

    await client.query(
      `UPDATE public.story_map_state
       SET active_version_id = $2, working_version_id = $3, updated_at = now()
       WHERE story_id = $1`,
      [args.storyId, state.working_version_id, nextDraftId]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      story_id: args.storyId,
      active_version_id: state.working_version_id,
      working_version_id: nextDraftId,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function restoreMapVersion(
  pool: Pool,
  args: { storyId: number; versionNo: number; createdBy?: string }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const targetRes = await client.query<{ id: number }>(
      `SELECT id
       FROM public.story_map_version
       WHERE story_id = $1 AND version_no = $2
       LIMIT 1`,
      [args.storyId, args.versionNo]
    );
    if (targetRes.rowCount === 0) throw new Error("MAP_VERSION_NOT_FOUND");
    const targetId = Number(targetRes.rows[0].id);
    const nextDraftId = await createMapVersion(client, {
      storyId: args.storyId,
      status: "draft",
      createdBy: args.createdBy ?? null,
      note: `restore from v${args.versionNo}`,
    });
    await cloneMapVersion(client, targetId, nextDraftId);
    await client.query(
      `INSERT INTO public.story_map_state(story_id, active_version_id, working_version_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (story_id) DO UPDATE
       SET active_version_id = EXCLUDED.active_version_id,
           working_version_id = EXCLUDED.working_version_id,
           updated_at = now()`,
      [args.storyId, targetId, nextDraftId]
    );
    await client.query("COMMIT");
    return {
      ok: true,
      story_id: args.storyId,
      active_version_id: targetId,
      working_version_id: nextDraftId,
      version_no: args.versionNo,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function validateMapStructure(
  pool: Pool,
  args: { storyId: number; createdBy?: string }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const config = await getStoryConfig(client, args.storyId);
    const { mapVersionId } = await ensureWorkingVersion(client, args.storyId, args.createdBy);

    const sceneRes = await client.query<{
      scene_id: number;
      chapter_id: string;
      sequence_no: number;
      beat_count: number;
    }>(
      `SELECT
         sm.scene_id,
         sm.chapter_id,
         sm.sequence_no,
         COALESCE(count(b.id), 0)::int AS beat_count
       FROM public.story_scene_map sm
       LEFT JOIN public.story_beat b
         ON b.map_version_id = sm.map_version_id
        AND b.scene_id = sm.scene_id
       WHERE sm.map_version_id = $1
       GROUP BY sm.scene_id, sm.chapter_id, sm.sequence_no
       ORDER BY sm.chapter_id ASC, sm.sequence_no ASC, sm.scene_id ASC`,
      [mapVersionId]
    );

    const sequenceIssues: Array<Record<string, unknown>> = [];
    const orphanScenes: Array<Record<string, unknown>> = [];
    const chapterMaxSeq = new Map<number, number>();
    for (const row of sceneRes.rows) {
      const chapOrder = chapterOrderOf(row.chapter_id);
      const currentMax = chapterMaxSeq.get(chapOrder) ?? Number.NEGATIVE_INFINITY;
      if (row.sequence_no < currentMax) {
        sequenceIssues.push({
          type: "SCENE_SEQUENCE_NON_INCREASING_IN_CHAPTER",
          scene_id: row.scene_id,
          chapter_id: row.chapter_id,
          sequence_no: row.sequence_no,
        });
      }
      chapterMaxSeq.set(chapOrder, Math.max(currentMax, row.sequence_no));
      if (Number(row.beat_count) === 0) {
        orphanScenes.push({
          scene_id: row.scene_id,
          chapter_id: row.chapter_id,
          sequence_no: row.sequence_no,
        });
      }
    }

    const orderedByChapter = [...sceneRes.rows].sort(
      (a, b) => chapterOrderOf(a.chapter_id) - chapterOrderOf(b.chapter_id) || a.sequence_no - b.sequence_no || a.scene_id - b.scene_id
    );
    let maxPrevSeq = Number.NEGATIVE_INFINITY;
    let prevChapter = Number.NEGATIVE_INFINITY;
    for (const row of orderedByChapter) {
      const chap = chapterOrderOf(row.chapter_id);
      if (chap > prevChapter && row.sequence_no < maxPrevSeq) {
        sequenceIssues.push({
          type: "GLOBAL_SEQUENCE_CHAPTER_INVERSION",
          scene_id: row.scene_id,
          chapter_id: row.chapter_id,
          sequence_no: row.sequence_no,
          max_prev_sequence_no: maxPrevSeq,
        });
      }
      prevChapter = chap;
      maxPrevSeq = Math.max(maxPrevSeq, row.sequence_no);
    }

    const threadUseRes = await client.query<{
      thread_id: number;
      scene_count: number;
      last_seen_seq: number | null;
    }>(
      `WITH scene_order AS (
         SELECT
           sm.scene_id,
           ROW_NUMBER() OVER (
             ORDER BY
               NULLIF(regexp_replace(sm.chapter_id, '\\D', '', 'g'), '')::int NULLS LAST,
               sm.chapter_id ASC,
               sm.sequence_no ASC,
               sm.scene_id ASC
           ) AS pos
         FROM public.story_scene_map sm
         WHERE sm.map_version_id = $1
       ),
       exploded AS (
         SELECT
           t.thread_id::bigint AS thread_id,
           so.pos
         FROM public.story_beat b
         JOIN scene_order so ON so.scene_id = b.scene_id
         JOIN LATERAL unnest(COALESCE(b.thread_ids, ARRAY[]::bigint[])) AS t(thread_id) ON TRUE
         WHERE b.map_version_id = $1
       )
       SELECT
         e.thread_id,
         COUNT(DISTINCT e.pos)::int AS scene_count,
         MAX(e.pos)::int AS last_seen_seq
       FROM exploded e
       GROUP BY e.thread_id`,
      [mapVersionId]
    );

    const totalSceneCount = sceneRes.rows.length;
    const threadStats = new Map<number, { scene_count: number; last_seen_seq: number | null }>();
    for (const row of threadUseRes.rows) {
      threadStats.set(Number(row.thread_id), {
        scene_count: Number(row.scene_count),
        last_seen_seq: row.last_seen_seq === null ? null : Number(row.last_seen_seq),
      });
    }

    const threadRes = await client.query<ThreadRow>(
      `SELECT id, slug, name, type, importance, color
       FROM public.story_thread
       WHERE story_id = $1`,
      [args.storyId]
    );

    const orphanThreads: Array<Record<string, unknown>> = [];
    for (const thread of threadRes.rows) {
      const stat = threadStats.get(Number(thread.id));
      if (!stat) {
        orphanThreads.push({
          thread_id: thread.id,
          slug: thread.slug,
          name: thread.name,
          reason: "NEVER_APPEARS",
        });
        continue;
      }
      const gap = stat.last_seen_seq === null ? totalSceneCount : Math.max(0, totalSceneCount - stat.last_seen_seq);
      if (gap > config.thread_orphan_n) {
        orphanThreads.push({
          thread_id: thread.id,
          slug: thread.slug,
          name: thread.name,
          reason: "GAP_EXCEEDS_THRESHOLD",
          gap,
          threshold: config.thread_orphan_n,
          last_seen_scene_pos: stat.last_seen_seq,
        });
      }
    }

    await client.query("COMMIT");
    return {
      ok: true,
      story_id: args.storyId,
      map_version_id: mapVersionId,
      threshold: config.thread_orphan_n,
      summary: {
        sequence_issues_count: sequenceIssues.length,
        orphan_scenes_count: orphanScenes.length,
        orphan_threads_count: orphanThreads.length,
      },
      sequence_issues: sequenceIssues,
      orphan_scenes: orphanScenes,
      orphan_threads: orphanThreads,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function getMapMetrics(
  pool: Pool,
  args: { storyId: number; createdBy?: string }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const config = await getStoryConfig(client, args.storyId);
    const { mapVersionId } = await ensureWorkingVersion(client, args.storyId, args.createdBy);

    const byChapterRes = await client.query<{
      chapter_id: string;
      total_scenes: number;
      scenes_with_beats: number;
      orphan_scenes: number;
    }>(
      `SELECT
         sm.chapter_id,
         COUNT(*)::int AS total_scenes,
         COUNT(*) FILTER (WHERE beat_stats.beat_count > 0)::int AS scenes_with_beats,
         COUNT(*) FILTER (WHERE beat_stats.beat_count = 0)::int AS orphan_scenes
       FROM public.story_scene_map sm
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS beat_count
         FROM public.story_beat b
         WHERE b.map_version_id = sm.map_version_id
           AND b.scene_id = sm.scene_id
       ) beat_stats ON TRUE
       WHERE sm.map_version_id = $1
       GROUP BY sm.chapter_id
       ORDER BY sm.chapter_id`,
      [mapVersionId]
    );

    const summaryRes = await client.query<{ total_scenes: number; scenes_with_beats: number }>(
      `SELECT
         COUNT(*)::int AS total_scenes,
         COUNT(*) FILTER (WHERE beat_stats.beat_count > 0)::int AS scenes_with_beats
       FROM public.story_scene_map sm
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS beat_count
         FROM public.story_beat b
         WHERE b.map_version_id = sm.map_version_id
           AND b.scene_id = sm.scene_id
       ) beat_stats ON TRUE
       WHERE sm.map_version_id = $1`,
      [mapVersionId]
    );

    const threadStatsRes = await client.query<{
      thread_id: number;
      scene_count: number;
      last_seen_seq: number | null;
    }>(
      `WITH scene_order AS (
         SELECT
           sm.scene_id,
           ROW_NUMBER() OVER (
             ORDER BY
               NULLIF(regexp_replace(sm.chapter_id, '\\D', '', 'g'), '')::int NULLS LAST,
               sm.chapter_id ASC,
               sm.sequence_no ASC,
               sm.scene_id ASC
           ) AS pos
         FROM public.story_scene_map sm
         WHERE sm.map_version_id = $1
       ),
       exploded AS (
         SELECT
           t.thread_id::bigint AS thread_id,
           so.pos
         FROM public.story_beat b
         JOIN scene_order so ON so.scene_id = b.scene_id
         JOIN LATERAL unnest(COALESCE(b.thread_ids, ARRAY[]::bigint[])) AS t(thread_id) ON TRUE
         WHERE b.map_version_id = $1
       )
       SELECT
         e.thread_id,
         COUNT(DISTINCT e.pos)::int AS scene_count,
         MAX(e.pos)::int AS last_seen_seq
       FROM exploded e
       GROUP BY e.thread_id`,
      [mapVersionId]
    );

    const threadRes = await client.query<ThreadRow>(
      `SELECT id, slug, name, type, importance, color
       FROM public.story_thread
       WHERE story_id = $1
       ORDER BY importance DESC, id ASC`,
      [args.storyId]
    );

    const totalScenes = Number(summaryRes.rows[0]?.total_scenes ?? 0);
    const scenesWithBeats = Number(summaryRes.rows[0]?.scenes_with_beats ?? 0);
    const coveragePct = totalScenes > 0 ? Math.round((scenesWithBeats * 10000) / totalScenes) / 100 : 0;

    const threadUsage = new Map<number, { scene_count: number; last_seen_seq: number | null }>();
    for (const row of threadStatsRes.rows) {
      threadUsage.set(Number(row.thread_id), {
        scene_count: Number(row.scene_count),
        last_seen_seq: row.last_seen_seq === null ? null : Number(row.last_seen_seq),
      });
    }

    const threadsOverdue: Array<Record<string, unknown>> = [];
    for (const thread of threadRes.rows) {
      const usage = threadUsage.get(Number(thread.id));
      if (!usage) {
        threadsOverdue.push({
          thread_id: thread.id,
          slug: thread.slug,
          name: thread.name,
          gap: totalScenes,
          threshold: config.thread_orphan_n,
        });
        continue;
      }
      const gap = usage.last_seen_seq === null ? totalScenes : Math.max(0, totalScenes - usage.last_seen_seq);
      if (gap > config.thread_orphan_n) {
        threadsOverdue.push({
          thread_id: thread.id,
          slug: thread.slug,
          name: thread.name,
          gap,
          threshold: config.thread_orphan_n,
          last_seen_scene_pos: usage.last_seen_seq,
        });
      }
    }

    await client.query("COMMIT");
    return {
      ok: true,
      story_id: args.storyId,
      map_version_id: mapVersionId,
      coverage: {
        total_scenes: totalScenes,
        scenes_with_beats: scenesWithBeats,
        pct: coveragePct,
      },
      by_chapter: byChapterRes.rows,
      thread_orphan_n: config.thread_orphan_n,
      threads_overdue: threadsOverdue,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function exportLatestMapState(
  pool: Pool,
  args: { storyId: number; createdBy?: string }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mapVersionId = await resolveLatestVersionId(client, args.storyId, args.createdBy);

    const arcRes = await client.query<ArcRow>(
      `SELECT id, slug, name, kind, act_model, order_no
       FROM public.story_arc
       WHERE story_id = $1
       ORDER BY order_no ASC, id ASC`,
      [args.storyId]
    );
    const threadRes = await client.query<ThreadRow>(
      `SELECT id, slug, name, type, importance, color
       FROM public.story_thread
       WHERE story_id = $1
       ORDER BY importance DESC, id ASC`,
      [args.storyId]
    );
    const sceneMapRes = await client.query<ExportSceneRow>(
      `SELECT scene_id, chapter_id, sequence_no, act_label, arc_id
       FROM public.story_scene_map
       WHERE map_version_id = $1
       ORDER BY chapter_id ASC, sequence_no ASC, scene_id ASC`,
      [mapVersionId]
    );
    const beatRes = await client.query<ExportBeatRow>(
      `SELECT scene_id, beat_idx, goal, conflict, outcome, pov, thread_ids, arc_id, notes_json
       FROM public.story_beat
       WHERE map_version_id = $1
       ORDER BY scene_id ASC, beat_idx ASC, id ASC`,
      [mapVersionId]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      story_id: args.storyId,
      map_version_id: mapVersionId,
      payload: {
        story: { story_id: args.storyId },
        arcs: arcRes.rows,
        threads: threadRes.rows,
        scenes: sceneMapRes.rows,
        beats: beatRes.rows,
      },
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function importMapState(
  pool: Pool,
  args: {
    storyId: number;
    payload: Record<string, unknown>;
    createdBy?: string;
  }
): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { mapVersionId } = await ensureWorkingVersion(client, args.storyId, args.createdBy);
    const payload = args.payload ?? {};
    const arcsIn = Array.isArray(payload.arcs) ? payload.arcs : [];
    const threadsIn = Array.isArray(payload.threads) ? payload.threads : [];
    const scenesIn = Array.isArray(payload.scenes) ? payload.scenes : [];
    const beatsIn = Array.isArray(payload.beats) ? payload.beats : [];

    const arcMap = new Map<number, number>();
    for (const raw of arcsIn) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const srcId = Number(obj.id);
      const slug = sanitizeText(obj.slug);
      const name = sanitizeText(obj.name) || slug;
      if (!slug || !name) continue;
      const kind = sanitizeText(obj.kind) === "sub" ? "sub" : "main";
      const actModel = Number(obj.act_model) === 5 ? 5 : 3;
      const orderNo = parseSmallInt(obj.order_no, 0);
      const up = await client.query<{ id: number }>(
        `INSERT INTO public.story_arc(story_id, slug, name, kind, act_model, order_no)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (story_id, slug) DO UPDATE
         SET name = EXCLUDED.name,
             kind = EXCLUDED.kind,
             act_model = EXCLUDED.act_model,
             order_no = EXCLUDED.order_no
         RETURNING id`,
        [args.storyId, slug, name, kind, actModel, orderNo]
      );
      const newId = Number(up.rows[0].id);
      if (Number.isFinite(srcId) && srcId > 0) arcMap.set(srcId, newId);
    }

    const threadMap = new Map<number, number>();
    for (const raw of threadsIn) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const srcId = Number(obj.id);
      const slug = sanitizeText(obj.slug);
      const name = sanitizeText(obj.name) || slug;
      if (!slug || !name) continue;
      const type = sanitizeText(obj.type) === "character_arc" ? "character_arc" : "plot_line";
      const importance = Math.max(1, Math.min(5, parseSmallInt(obj.importance, 3)));
      const color = sanitizeText(obj.color) || null;
      const up = await client.query<{ id: number }>(
        `INSERT INTO public.story_thread(story_id, slug, name, type, importance, color)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (story_id, slug) DO UPDATE
         SET name = EXCLUDED.name,
             type = EXCLUDED.type,
             importance = EXCLUDED.importance,
             color = EXCLUDED.color
         RETURNING id`,
        [args.storyId, slug, name, type, importance, color]
      );
      const newId = Number(up.rows[0].id);
      if (Number.isFinite(srcId) && srcId > 0) threadMap.set(srcId, newId);
    }

    await client.query(`DELETE FROM public.story_beat WHERE map_version_id = $1`, [mapVersionId]);
    await client.query(`DELETE FROM public.story_scene_map WHERE map_version_id = $1`, [mapVersionId]);

    const sceneIdsRaw = scenesIn
      .map((raw) => (raw && typeof raw === "object" ? Number((raw as Record<string, unknown>).scene_id) : NaN))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.floor(n));
    const sceneIds = [...new Set(sceneIdsRaw)];
    const sceneCheckRes = sceneIds.length
      ? await client.query<{ id: number; chapter_id: string; idx: number }>(
          `SELECT id, chapter_id, idx
           FROM public.narrative_scene
           WHERE story_id = $1
             AND id = ANY($2::bigint[])`,
          [args.storyId, sceneIds]
        )
      : { rows: [] as Array<{ id: number; chapter_id: string; idx: number }> };
    const sceneExists = new Map<number, { chapter_id: string; idx: number }>();
    for (const row of sceneCheckRes.rows) {
      sceneExists.set(Number(row.id), {
        chapter_id: row.chapter_id,
        idx: Number(row.idx),
      });
    }

    for (const raw of scenesIn) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const sceneId = Math.floor(Number(obj.scene_id));
      if (!sceneExists.has(sceneId)) continue;
      const fallback = sceneExists.get(sceneId)!;
      const chapterId = sanitizeText(obj.chapter_id) || fallback.chapter_id;
      const sequenceNo = Math.max(0, parseSmallInt(obj.sequence_no, fallback.idx));
      const actLabel = sanitizeText(obj.act_label) || null;
      const srcArcId = Number(obj.arc_id);
      const arcId = Number.isFinite(srcArcId) && srcArcId > 0 ? (arcMap.get(srcArcId) ?? null) : null;
      await client.query(
        `INSERT INTO public.story_scene_map(map_version_id, scene_id, chapter_id, sequence_no, act_label, arc_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [mapVersionId, sceneId, chapterId, sequenceNo, actLabel, arcId]
      );
    }

    const validSceneIds = new Set<number>(sceneExists.keys());
    for (const raw of beatsIn) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const sceneId = Math.floor(Number(obj.scene_id));
      if (!validSceneIds.has(sceneId)) continue;
      const beatIdx = Math.max(0, parseSmallInt(obj.beat_idx, 0));
      const goal = sanitizeText(obj.goal);
      const conflict = sanitizeText(obj.conflict);
      const outcome = sanitizeText(obj.outcome);
      const pov = sanitizeText(obj.pov);
      const srcArcId = Number(obj.arc_id);
      const arcId = Number.isFinite(srcArcId) && srcArcId > 0 ? (arcMap.get(srcArcId) ?? null) : null;
      const threadIdsRaw = parseThreadIds(obj.thread_ids);
      const threadIds = threadIdsRaw
        .map((id) => threadMap.get(id))
        .filter((id): id is number => Number.isFinite(Number(id)) && Number(id) > 0);
      const notesJson = parseNotes(obj.notes_json);
      await client.query(
        `INSERT INTO public.story_beat(
           map_version_id, scene_id, beat_idx, goal, conflict, outcome, pov, thread_ids, arc_id, notes_json
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::bigint[], $9, $10::jsonb)`,
        [mapVersionId, sceneId, beatIdx, goal, conflict, outcome, pov, threadIds, arcId, notesJson]
      );
    }

    for (const sceneId of validSceneIds) {
      await compactBeatIndices(client, mapVersionId, sceneId);
    }

    await client.query("COMMIT");
    return {
      ok: true,
      story_id: args.storyId,
      map_version_id: mapVersionId,
      imported: {
        arcs: arcMap.size,
        threads: threadMap.size,
        scenes: validSceneIds.size,
        beats: beatsIn.length,
      },
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export const mapInput = {
  sanitizeText,
  parseSmallInt,
  parseThreadIds,
  parseNotes,
};

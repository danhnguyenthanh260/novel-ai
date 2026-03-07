import type { Pool, PoolClient } from "pg";
import { parseSlug } from "./slug";
import type { EvalJson, SceneRow, SceneStatus, SceneVersionRow, VersionKind } from "./types";

type Queryable = Pool | PoolClient;

function chapterKeyFromSlug(workunitId: string): { chapterKey: string; idx: number } {
  const { chapterId, idx } = parseSlug(workunitId);
  const padded = String(Math.abs(chapterId)).padStart(2, "0");
  const prefix = chapterId < 0 ? "-ch" : "ch";
  return { chapterKey: `${prefix}${padded}`, idx };
}

export async function getSceneById(db: Queryable, args: { storyId: number; sceneId: number }): Promise<SceneRow | null> {
  const res = await db.query<SceneRow>(
    `SELECT id, story_id, workunit_id, chapter_id, idx, title, status, current_version_id, created_at, updated_at
     FROM public.narrative_scene
     WHERE story_id = $1 AND id = $2`,
    [args.storyId, args.sceneId]
  );
  return res.rows[0] ?? null;
}

export async function getSceneForUpdateById(
  db: Queryable,
  args: { storyId: number; sceneId: number }
): Promise<SceneRow | null> {
  const res = await db.query<SceneRow>(
    `SELECT id, story_id, workunit_id, chapter_id, idx, title, status, current_version_id, created_at, updated_at
     FROM public.narrative_scene
     WHERE story_id = $1 AND id = $2
     FOR UPDATE`,
    [args.storyId, args.sceneId]
  );
  return res.rows[0] ?? null;
}

export async function getSceneForUpdateByWorkunit(
  db: Queryable,
  args: { storyId: number; workunitId: string }
): Promise<SceneRow | null> {
  const res = await db.query<SceneRow>(
    `SELECT id, story_id, workunit_id, chapter_id, idx, title, status, current_version_id, created_at, updated_at
     FROM public.narrative_scene
     WHERE story_id = $1 AND workunit_id = $2
     FOR UPDATE`,
    [args.storyId, args.workunitId]
  );
  return res.rows[0] ?? null;
}

export async function getCurrentVersion(
  db: Queryable,
  args: { storyId: number; scene: SceneRow }
): Promise<SceneVersionRow | null> {
  if (!args.scene.current_version_id) return null;
  const res = await db.query<SceneVersionRow>(
    `SELECT id, story_id, scene_id, version_no, kind, text_content, beats_json, eval_json, summary, created_at
     FROM public.narrative_scene_version
     WHERE story_id = $1 AND id = $2`,
    [args.storyId, args.scene.current_version_id]
  );
  return res.rows[0] ?? null;
}

export async function insertVersion(
  db: Queryable,
  args: {
    storyId: number;
    sceneId: number;
    kind: VersionKind;
    textContent?: string | null;
    beatsJson?: unknown | null;
    summary?: string | null;
    evalJson?: EvalJson | null;
  }
): Promise<SceneVersionRow> {
  const nextRes = await db.query<{ next_no: number }>(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no
     FROM public.narrative_scene_version
     WHERE story_id = $1 AND scene_id = $2`,
    [args.storyId, args.sceneId]
  );
  const versionNo = Number(nextRes.rows[0]?.next_no ?? 1);
  const insertRes = await db.query<SceneVersionRow>(
    `INSERT INTO public.narrative_scene_version
      (story_id, scene_id, version_no, kind, text_content, beats_json, eval_json, summary)
     VALUES
      ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
     RETURNING id, story_id, scene_id, version_no, kind, text_content, beats_json, eval_json, summary, created_at`,
    [
      args.storyId,
      args.sceneId,
      versionNo,
      args.kind,
      args.textContent ?? null,
      args.beatsJson ?? null,
      args.evalJson ?? null,
      args.summary ?? null,
    ]
  );
  return insertRes.rows[0]!;
}

export async function updateScene(
  db: Queryable,
  args: {
    storyId: number;
    sceneId: number;
    status?: SceneStatus;
    currentVersionId?: number | null;
    title?: string | null;
  }
): Promise<void> {
  const updates: string[] = ["updated_at = NOW()"];
  const params: Array<string | number | null> = [args.storyId, args.sceneId];
  let idx = 3;
  if (args.status) {
    updates.push(`status = $${idx}`);
    params.push(args.status);
    idx += 1;
  }
  if (args.currentVersionId !== undefined) {
    updates.push(`current_version_id = $${idx}`);
    params.push(args.currentVersionId);
    idx += 1;
  }
  if (args.title !== undefined) {
    updates.push(`title = $${idx}`);
    params.push(args.title);
  }
  await db.query(`UPDATE public.narrative_scene SET ${updates.join(", ")} WHERE story_id = $1 AND id = $2`, params);
}

export async function updateVersionEval(
  db: Queryable,
  args: { storyId: number; versionId: number; evalJson: EvalJson }
): Promise<void> {
  await db.query(
    `UPDATE public.narrative_scene_version
     SET eval_json = $3::jsonb
     WHERE story_id = $1 AND id = $2`,
    [args.storyId, args.versionId, args.evalJson]
  );
}

export async function getOrCreateSceneByWorkunit(
  db: Queryable,
  args: { storyId: number; workunitId: string; title?: string | null }
): Promise<SceneRow> {
  const { chapterKey, idx } = chapterKeyFromSlug(args.workunitId);
  const existing = await getSceneForUpdateByWorkunit(db, { storyId: args.storyId, workunitId: args.workunitId });
  if (existing) {
    if (args.title && !existing.title) {
      await updateScene(db, { storyId: args.storyId, sceneId: existing.id, title: args.title });
      const updated = await getSceneById(db, { storyId: args.storyId, sceneId: existing.id });
      return updated ?? existing;
    }
    return existing;
  }
  const res = await db.query<SceneRow>(
    `INSERT INTO public.narrative_scene (story_id, workunit_id, chapter_id, idx, title, status, draft_text)
     VALUES ($1, $2, $3, $4, $5, 'DRAFTING', '')
     RETURNING id, story_id, workunit_id, chapter_id, idx, title, status, current_version_id, created_at, updated_at`,
    [args.storyId, args.workunitId, chapterKey, idx, args.title ?? null]
  );
  return res.rows[0]!;
}

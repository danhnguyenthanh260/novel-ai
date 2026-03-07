import type { Pool } from "pg";
import { logRunError, logRunOk } from "../runLogger";
import { getOrCreateSceneByWorkunit } from "../repoScene";

export async function runIntake(
  pool: Pool,
  args: {
    storyId: number;
    workunitId: string;
    title?: string | null;
    idea?: string | null;
  }
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const scene = await getOrCreateSceneByWorkunit(client, {
      storyId: args.storyId,
      workunitId: args.workunitId,
      title: args.title ?? null,
    });
    await logRunOk(client, {
      storyId: args.storyId,
      sceneId: scene.id,
      step: "intake",
      input: { workunit_id: args.workunitId, title: args.title ?? null, idea: args.idea ?? null },
      output: { scene_id: scene.id, chapter_id: scene.chapter_id, idx: scene.idx, status: scene.status },
      llmParams: {},
    });
    await client.query("COMMIT");
    return { ok: true, scene_id: scene.id, status: scene.status };
  } catch (error: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    try {
      await logRunError(pool, {
        storyId: args.storyId,
        sceneId: null,
        step: "intake",
        input: { workunit_id: args.workunitId, title: args.title ?? null, idea: args.idea ?? null },
        output: { ok: false },
        llmParams: {},
        error,
      });
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

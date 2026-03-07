import type { Pool } from "pg";
import { logRunError, logRunOk } from "../runLogger";
import { getSceneForUpdateById, getSceneForUpdateByWorkunit, updateScene } from "../repoScene";
import { assertTransition, isLocked } from "../stateMachine";

export async function runLock(
  pool: Pool,
  args: {
    storyId: number;
    sceneId?: number;
    workunitId?: string;
  }
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const scene = args.sceneId
      ? await getSceneForUpdateById(client, { storyId: args.storyId, sceneId: args.sceneId })
      : args.workunitId
        ? await getSceneForUpdateByWorkunit(client, { storyId: args.storyId, workunitId: args.workunitId })
        : null;
    if (!scene) throw new Error("SCENE_NOT_FOUND");
    if (isLocked(scene.status)) throw new Error("SCENE_ALREADY_LOCKED");

    assertTransition(scene.status, "LOCKED");
    await updateScene(client, { storyId: args.storyId, sceneId: scene.id, status: "LOCKED" });
    await logRunOk(client, {
      storyId: args.storyId,
      sceneId: scene.id,
      step: "lock",
      input: { action: "lock", workunit_id: args.workunitId ?? null },
      output: { scene_id: scene.id, status: "LOCKED" },
      llmParams: {},
    });
    await client.query("COMMIT");
    return { ok: true, scene_id: scene.id, status: "LOCKED" as const };
  } catch (error: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    try {
      await logRunError(pool, {
        storyId: args.storyId,
        sceneId: typeof args.sceneId === "number" ? args.sceneId : null,
        step: "lock",
        input: { action: "lock", workunit_id: args.workunitId ?? null },
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

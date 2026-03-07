import type { Pool } from "pg";
import { logRunOk } from "../runLogger";
import { insertVersion, updateScene } from "../repoScene";
import { isLocked } from "../stateMachine";
import type { LlmParams } from "../types";
import { logStepErrorQuiet, rollbackQuiet } from "./stepRuntime";
import { resolveSceneForUpdate, sceneRefFromArgs } from "./stepScene";

export async function runOutline(
  pool: Pool,
  args: {
    storyId: number;
    sceneId?: number;
    workunitId?: string;
    beatsJson?: unknown | null;
    textContent?: string | null;
    summary?: string | null;
    llmParams?: LlmParams;
  }
) {
  const client = await pool.connect();
  const sceneRef = sceneRefFromArgs(args);
  try {
    await client.query("BEGIN");
    const scene = await resolveSceneForUpdate(client, args);
    if (!scene) throw new Error("SCENE_NOT_FOUND");
    if (isLocked(scene.status)) throw new Error("SCENE_LOCKED");

    const version = await insertVersion(client, {
      sceneId: scene.id,
      storyId: args.storyId,
      kind: "outline",
      beatsJson: args.beatsJson ?? null,
      textContent: args.textContent ?? null,
      summary: args.summary ?? null,
    });
    await updateScene(client, { storyId: args.storyId, sceneId: scene.id, currentVersionId: version.id, status: "DRAFTING" });

    await logRunOk(client, {
      storyId: args.storyId,
      sceneId: scene.id,
      step: "outline",
      input: { scene_id: scene.id, workunit_id: args.workunitId ?? null },
      output: { version_id: version.id, version_no: version.version_no, status: "DRAFTING" },
      llmParams: args.llmParams ?? {},
    });

    await client.query("COMMIT");
    return { ok: true, scene_id: scene.id, version_id: version.id, version_no: version.version_no, status: "DRAFTING" as const };
  } catch (error: unknown) {
    await rollbackQuiet(client);
    await logStepErrorQuiet(pool, {
      storyId: args.storyId,
      sceneId: typeof args.sceneId === "number" ? args.sceneId : null,
      step: "outline",
      input: { scene_ref: sceneRef },
      llmParams: args.llmParams ?? {},
      error,
    });
    throw error;
  } finally {
    client.release();
  }
}

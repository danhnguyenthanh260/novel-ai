import type { Pool } from "pg";
import { logRunError, logRunOk } from "../runLogger";
import { getSceneForUpdateById, updateScene } from "../repoScene";
import { assertTransition } from "../stateMachine";

export async function runUnlock(
    pool: Pool,
    args: {
        storyId: number;
        sceneId: number;
    }
) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const scene = await getSceneForUpdateById(client, { storyId: args.storyId, sceneId: args.sceneId });
        if (!scene) throw new Error("SCENE_NOT_FOUND");

        assertTransition(scene.status, "DRAFTING");
        await updateScene(client, { storyId: args.storyId, sceneId: scene.id, status: "DRAFTING" });

        await logRunOk(client, {
            storyId: args.storyId,
            sceneId: scene.id,
            step: "unlock",
            input: { action: "unlock" },
            output: { scene_id: scene.id, status: "DRAFTING" },
            llmParams: {},
        });

        await client.query("COMMIT");
        return { ok: true, scene_id: scene.id, status: "DRAFTING" as const };
    } catch (error: unknown) {
        try {
            await client.query("ROLLBACK");
        } catch { }
        try {
            await logRunError(pool, {
                storyId: args.storyId,
                sceneId: args.sceneId,
                step: "unlock",
                input: { action: "unlock" },
                output: { ok: false },
                llmParams: {},
                error,
            });
        } catch { }
        throw error;
    } finally {
        client.release();
    }
}

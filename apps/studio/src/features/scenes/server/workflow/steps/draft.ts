import type { Pool } from "pg";
import { logRunOk } from "../runLogger";
import { insertVersion, updateScene } from "../repoScene";
import { assertTransition, isLocked } from "../stateMachine";
import type { LlmParams } from "../types";
import { buildCanonGuard } from "@/features/guard/server/canonGuard";
import { logStepErrorQuiet, rollbackQuiet } from "./stepRuntime";
import { resolveSceneForUpdate, sceneRefFromArgs } from "./stepScene";

function buildGuardKeywords(textContent: string, summary?: string | null): string {
  const pieces = [summary ?? "", textContent].join(" ").replace(/\s+/g, " ").trim();
  return pieces.slice(0, 800);
}

export async function runDraft(
  pool: Pool,
  args: {
    storyId: number;
    sceneId?: number;
    workunitId?: string;
    textContent: string;
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
    assertTransition(scene.status, "DRAFTED");
    const guard = await buildCanonGuard(client, {
      storyId: args.storyId,
      sceneId: scene.id,
      workunitId: scene.workunit_id ?? args.workunitId,
      keywords: buildGuardKeywords(args.textContent, args.summary),
    });

    const version = await insertVersion(client, {
      sceneId: scene.id,
      storyId: args.storyId,
      kind: "draft",
      textContent: args.textContent,
      summary: args.summary ?? null,
    });
    await updateScene(client, { storyId: args.storyId, sceneId: scene.id, currentVersionId: version.id, status: "DRAFTED" });

    await logRunOk(client, {
      storyId: args.storyId,
      sceneId: scene.id,
      step: "draft",
      input: {
        scene_id: scene.id,
        workunit_id: args.workunitId ?? null,
        kind: "draft",
        guard_stats: guard.stats,
      },
      output: {
        version_id: version.id,
        version_no: version.version_no,
        status: "DRAFTED",
        guard_tokens: guard.stats.approx_tokens,
      },
      llmParams: args.llmParams ?? {},
    });

    await client.query("COMMIT");
    return {
      ok: true,
      scene_id: scene.id,
      version_id: version.id,
      version_no: version.version_no,
      status: "DRAFTED" as const,
      guard: {
        approx_tokens: guard.stats.approx_tokens,
        max_tokens: guard.stats.max_tokens,
      },
    };
  } catch (error: unknown) {
    await rollbackQuiet(client);
    await logStepErrorQuiet(pool, {
      storyId: args.storyId,
      sceneId: typeof args.sceneId === "number" ? args.sceneId : null,
      step: "draft",
      input: { scene_ref: sceneRef },
      llmParams: args.llmParams ?? {},
      error,
    });
    throw error;
  } finally {
    client.release();
  }
}

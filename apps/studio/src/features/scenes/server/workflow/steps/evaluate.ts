import type { Pool } from "pg";
import { logRunOk } from "../runLogger";
import {
  getCurrentVersion,
  updateScene,
  updateVersionEval,
} from "../repoScene";
import { assertTransition, isLocked } from "../stateMachine";
import type { EvalJson, LlmParams } from "../types";
import { logStepErrorQuiet, rollbackQuiet } from "./stepRuntime";
import { resolveSceneForUpdate, sceneRefFromArgs } from "./stepScene";

function buildStubEval(llmParams?: LlmParams): EvalJson {
  return {
    rubric: { logic: 3, pacing: 3, consistency: 3, voice: 3 },
    overall: 3,
    issues: ["Can bo sung mo ta dong luc nhan vat ro hon."],
    suggestions: ["Tang lien ket giua xung dot va hanh dong o doan ket."],
    meta: {
      model: String(llmParams?.model ?? process.env.LLM_MODEL ?? "stub-model"),
      prompt_rev: String(llmParams?.prompt_rev ?? "eval_v1"),
      ts: new Date().toISOString(),
    },
  };
}

export async function runEvaluate(
  pool: Pool,
  args: {
    storyId: number;
    sceneId?: number;
    workunitId?: string;
    mode: "manual" | "llm";
    evalJson?: EvalJson;
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
    if (!scene.current_version_id) throw new Error("NO_CURRENT_VERSION");

    const currentVersion = await getCurrentVersion(client, { storyId: args.storyId, scene });
    if (!currentVersion) throw new Error("CURRENT_VERSION_NOT_FOUND");
    const evalJson = args.mode === "manual" ? args.evalJson : buildStubEval(args.llmParams);
    if (!evalJson) throw new Error("MISSING_EVAL_JSON");

    await updateVersionEval(client, { storyId: args.storyId, versionId: scene.current_version_id, evalJson });
    assertTransition(scene.status, "EVALUATED");
    await updateScene(client, { storyId: args.storyId, sceneId: scene.id, status: "EVALUATED" });

    await logRunOk(client, {
      storyId: args.storyId,
      sceneId: scene.id,
      step: "evaluate",
      input: {
        mode: args.mode,
        scene_id: scene.id,
        workunit_id: args.workunitId ?? null,
        current_version_id: scene.current_version_id,
      },
      output: {
        scene_id: scene.id,
        version_id: scene.current_version_id,
        status: "EVALUATED",
      },
      llmParams: args.llmParams ?? {},
    });

    await client.query("COMMIT");
    return { ok: true, scene_id: scene.id, version_id: scene.current_version_id, status: "EVALUATED" as const };
  } catch (error: unknown) {
    await rollbackQuiet(client);
    await logStepErrorQuiet(pool, {
      storyId: args.storyId,
      sceneId: typeof args.sceneId === "number" ? args.sceneId : null,
      step: "evaluate",
      input: { mode: args.mode, scene_ref: sceneRef },
      llmParams: args.llmParams ?? {},
      error,
    });
    throw error;
  } finally {
    client.release();
  }
}

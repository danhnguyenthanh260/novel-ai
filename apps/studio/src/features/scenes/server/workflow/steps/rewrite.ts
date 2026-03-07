import type { Pool } from "pg";
import { logRunOk } from "../runLogger";
import { getCurrentVersion, insertVersion, updateScene } from "../repoScene";
import { assertTransition, isLocked } from "../stateMachine";
import type { LlmParams, SceneRow, SceneVersionRow, SceneStatus } from "../types";
import { buildCanonGuard } from "@/features/guard/server/canonGuard";
import { logStepErrorQuiet, rollbackQuiet } from "./stepRuntime";
import { resolveSceneForUpdate, sceneRefFromArgs } from "./stepScene";

function buildRewriteFromCurrent(text: string | null, evalJson: unknown | null, guardBlock: string): string {
  const evalHint = evalJson ? JSON.stringify(evalJson) : "no_eval";
  return `[CANON_GUARD]
${guardBlock}
[/CANON_GUARD]

${text ?? ""}

[REWRITE_HINT:${evalHint}]`;
}

function buildGuardKeywords(text: string | null, summary?: string | null): string {
  const pieces = [summary ?? "", text ?? ""].join(" ").replace(/\s+/g, " ").trim();
  return pieces.slice(0, 800);
}

function ensureTodoQuestion(text: string): string {
  return text.includes("[TODO: Question]") ? text : `${text}\n\n[TODO: Question] Clarify uncertain canon or timeline details.`;
}

function resolveRewriteText(args: { mode: "manual" | "llm"; textContent?: string | null }, currentText: string | null, evalJson: unknown | null, guardBlock: string): string {
  if (args.mode === "manual") return (args.textContent ?? "").trim();
  return buildRewriteFromCurrent(currentText, evalJson, guardBlock);
}

function validateSceneForRewrite(status: SceneStatus): void {
  if (isLocked(status)) throw new Error("SCENE_LOCKED");
  if (status !== "EVALUATED" && status !== "REVISED") throw new Error("INVALID_STATUS_FOR_REWRITE");
}

function requireScene(scene: SceneRow | null): SceneRow {
  if (!scene) throw new Error("SCENE_NOT_FOUND");
  return scene;
}

function requireCurrentVersion(version: SceneVersionRow | null): SceneVersionRow {
  if (!version) throw new Error("NO_CURRENT_VERSION");
  return version;
}

function finalizeRewriteText(args: { mode: "manual" | "llm" }, nextText: string, uncertainCount: number): string {
  return args.mode === "llm" && uncertainCount > 0 ? ensureTodoQuestion(nextText) : nextText;
}

export async function runRewrite(
  pool: Pool,
  args: {
    storyId: number;
    sceneId?: number;
    workunitId?: string;
    mode: "manual" | "llm";
    textContent?: string | null;
    summary?: string | null;
    llmParams?: LlmParams;
  }
) {
  const client = await pool.connect();
  const sceneRef = sceneRefFromArgs(args);
  try {
    await client.query("BEGIN");
    const scene = requireScene(await resolveSceneForUpdate(client, args));
    validateSceneForRewrite(scene.status);

    const currentVersion = requireCurrentVersion(await getCurrentVersion(client, { storyId: args.storyId, scene }));
    const guard = await buildCanonGuard(client, {
      storyId: args.storyId,
      sceneId: scene.id,
      workunitId: scene.workunit_id ?? args.workunitId,
      keywords: buildGuardKeywords(currentVersion.text_content, args.summary),
    });
    const nextText = resolveRewriteText(args, currentVersion.text_content, currentVersion.eval_json, guard.block);
    const guardedText = finalizeRewriteText(args, nextText, guard.sections.uncertain.length);
    if (!nextText) throw new Error("MISSING_REWRITE_TEXT");

    assertTransition(scene.status, "REVISED");
    const version = await insertVersion(client, {
      sceneId: scene.id,
      storyId: args.storyId,
      kind: "rewrite",
      textContent: guardedText,
      summary: args.summary ?? null,
    });
    await updateScene(client, { storyId: args.storyId, sceneId: scene.id, currentVersionId: version.id, status: "REVISED" });

    await logRunOk(client, {
      storyId: args.storyId,
      sceneId: scene.id,
      step: "rewrite",
      input: {
        scene_id: scene.id,
        mode: args.mode,
        workunit_id: args.workunitId ?? null,
        guard_stats: guard.stats,
      },
      output: {
        version_id: version.id,
        version_no: version.version_no,
        status: "REVISED",
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
      status: "REVISED" as const,
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
      step: "rewrite",
      input: { scene_ref: sceneRef, mode: args.mode },
      llmParams: args.llmParams ?? {},
      error,
    });
    throw error;
  } finally {
    client.release();
  }
}

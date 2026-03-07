import { parseSceneId } from "@/features/scenes/server/workflow/routeUtils";
import type { EvalJson, LlmParams } from "@/features/scenes/server/workflow/types";

type JsonBody = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asLlmParams(value: unknown): LlmParams {
  return (value ?? {}) as LlmParams;
}

function asMode(value: unknown): "llm" | "manual" {
  return value === "llm" ? "llm" : "manual";
}

export function buildDraftPayload(body: JsonBody) {
  return {
    sceneId: parseSceneId(body.scene_id),
    workunitId: asString(body.workunit_id),
    textContent: body.text_content as string,
    summary: asNullableString(body.summary),
    llmParams: asLlmParams(body.llm_params),
  };
}

export function buildOutlinePayload(body: JsonBody) {
  return {
    sceneId: parseSceneId(body.scene_id),
    workunitId: asString(body.workunit_id),
    beatsJson: body.beats_json ?? null,
    textContent: asNullableString(body.text_content),
    summary: asNullableString(body.summary),
    llmParams: asLlmParams(body.llm_params),
  };
}

export function buildRewritePayload(body: JsonBody) {
  return {
    sceneId: parseSceneId(body.scene_id),
    workunitId: asString(body.workunit_id),
    mode: asMode(body.mode),
    textContent: asNullableString(body.text_content),
    summary: asNullableString(body.summary),
    llmParams: asLlmParams(body.llm_params),
  };
}

export function buildEvaluatePayload(body: JsonBody) {
  return {
    sceneId: parseSceneId(body.scene_id),
    workunitId: asString(body.workunit_id),
    mode: asMode(body.mode),
    evalJson: body.eval_json as EvalJson | undefined,
    llmParams: asLlmParams(body.llm_params),
  };
}

export function buildIntakePayload(body: JsonBody) {
  return {
    workunitId: body.workunit_id as string,
    title: asNullableString(body.title),
    idea: asNullableString(body.idea),
  };
}

export function buildLockPayload(body: JsonBody) {
  return {
    sceneId: parseSceneId(body.scene_id),
    workunitId: asString(body.workunit_id),
  };
}

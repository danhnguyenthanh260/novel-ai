import { NextRequest } from "next/server";
import { pool } from "@/server/db/pool";
import { buildMessages, overlapRatio } from "@/features/prompts/server/musePromptBuilder";
import { parseMuseStreamRequest } from "@/features/muse/server/museStream/requestParser";
import { buildMuseRulesInjection, buildMuseStoryContext } from "@/features/muse/server/museStream/storyContext";
import { toMuseClientSse } from "@/features/muse/server/museStream/streamTransform";
import {
  buildMuseUpstreamPayload,
  fetchUpstreamWithFallback,
  upstreamUnavailableResponse,
} from "@/features/muse/server/museStream/upstreamClient";

export async function postMuseStreamResponse(req: NextRequest): Promise<Response> {
  const parsed = await parseMuseStreamRequest(req);

  if (!parsed.focusText) {
    return Response.json({ error: "MISSING_FOCUS_TEXT" }, { status: 400 });
  }
  if (!parsed.storySlug || !Number.isFinite(parsed.sceneId)) {
    return Response.json({ error: "MISSING_STORY_OR_SCENE" }, { status: 400 });
  }

  const storyContext = await buildMuseStoryContext(pool, parsed.storySlug, parsed.sceneId, parsed.focusText);
  const rulesInjection = buildMuseRulesInjection(storyContext.rules);
  const repeatRisk = parsed.history.length > 0 && parsed.history.some((h) => overlapRatio(parsed.focusText, h) > 0.28);
  const messages = buildMessages({
    focusText: parsed.focusText,
    history: parsed.history,
    mode: parsed.mode,
    writingLanguage: parsed.writingLanguage,
    repeatRisk,
    rulesInjection,
    contextInjection: storyContext.contextInjection,
  });

  const payload = buildMuseUpstreamPayload({
    body: parsed.body,
    mode: parsed.mode,
    messages,
  });
  const llmBase = process.env.LLM_API_BASE!;
  const apiKey = process.env.LLM_API_KEY ?? "local";

  let upstream: Response;
  try {
    upstream = await fetchUpstreamWithFallback({
      base: llmBase,
      apiKey,
      payload,
    });
  } catch (error) {
    return upstreamUnavailableResponse(error);
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    return new Response(errText || "LLM_STREAM_FAILED", { status: 500 });
  }

  return toMuseClientSse(upstream);
}

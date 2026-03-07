import { NextRequest } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";
import { buildCanonGuard } from "@/features/guard/server/canonGuard";
import { parseDraftStreamRequest } from "@/features/pipeline/server/draftStream/requestParser";
import {
  buildMessagesWithGuard,
  buildMessagesWithLanguage,
  getStoryPreferredWritingLanguage,
  resolveWritingLanguage,
} from "@/features/pipeline/server/draftStream/messageBuilder";
import { buildUpstreamPayload, fetchUpstreamWithFallback, toSseResponse } from "@/features/pipeline/server/draftStream/upstreamClient";
import type { WritingLanguage } from "@/features/pipeline/server/draftStream/types";

async function buildDraftMessages(parsed: Awaited<ReturnType<typeof parseDraftStreamRequest>>): Promise<unknown[]> {
  let writingLanguage: WritingLanguage = resolveWritingLanguage(parsed.requestedLang);
  if (!parsed.storySlug) {
    return buildMessagesWithLanguage(parsed.originalMessages, writingLanguage);
  }

  try {
    const storyId = await resolveStoryId(pool, parsed.storySlug);
    try {
      const storyLang = await getStoryPreferredWritingLanguage(pool, storyId);
      if (!parsed.requestedLang && storyLang) writingLanguage = storyLang;
    } catch {}

    const guard = await buildCanonGuard(pool, {
      storyId,
      sceneId: parsed.sceneId,
      workunitId: parsed.workunitId,
      keywords: parsed.keywords,
      maxContextTokens: parsed.maxContextTokens,
    });
    return buildMessagesWithGuard(parsed.originalMessages, writingLanguage, guard.block);
  } catch {
    return buildMessagesWithLanguage(parsed.originalMessages, writingLanguage);
  }
}

function upstreamUnavailableResponse(error: unknown): Response {
  return Response.json(
    {
      error: "LLM_UPSTREAM_UNREACHABLE",
      detail: error instanceof Error ? error.message : String(error),
    },
    { status: 502 }
  );
}

export async function postDraftStreamResponse(req: NextRequest): Promise<Response> {
  const parsed = await parseDraftStreamRequest(req);
  const messages = await buildDraftMessages(parsed);
  const llmBase = process.env.LLM_API_BASE!;
  const apiKey = process.env.LLM_API_KEY ?? "local";
  const payload = buildUpstreamPayload(parsed.body, messages);

  let upstream: Response;
  try {
    upstream = await fetchUpstreamWithFallback({
      base: llmBase,
      apiKey,
      payload,
    });
  } catch (err) {
    return upstreamUnavailableResponse(err);
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    return new Response(errText || "LLM_STREAM_FAILED", { status: 500 });
  }

  return toSseResponse(upstream);
}

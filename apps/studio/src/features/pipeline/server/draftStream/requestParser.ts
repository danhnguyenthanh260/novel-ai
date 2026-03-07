import { NextRequest } from "next/server";
import type { DraftStreamParsedBody } from "@/features/pipeline/server/draftStream/types";

function parseSceneId(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  return undefined;
}

export async function parseDraftStreamRequest(req: NextRequest): Promise<DraftStreamParsedBody> {
  const raw = await req.json();
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const maxContextTokensRaw = body.max_context_tokens;

  return {
    body,
    storySlug: typeof body.story_slug === "string" ? body.story_slug.trim() : "",
    sceneId: parseSceneId(body.scene_id),
    workunitId: typeof body.workunit_id === "string" ? body.workunit_id.trim() : undefined,
    keywords: typeof body.guard_keywords === "string" ? body.guard_keywords : undefined,
    maxContextTokens:
      typeof maxContextTokensRaw === "number" && Number.isFinite(maxContextTokensRaw) ? maxContextTokensRaw : undefined,
    originalMessages: Array.isArray(body.messages) ? body.messages : [],
    requestedLang: typeof body.writing_language === "string" ? body.writing_language.trim().toLowerCase() : "",
  };
}

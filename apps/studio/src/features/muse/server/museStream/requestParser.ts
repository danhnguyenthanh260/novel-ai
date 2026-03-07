import { NextRequest } from "next/server";
import { focusTextFromBody, normalizeHistory, normalizeMode } from "@/features/prompts/server/musePromptBuilder";
import type { MuseStreamParsedRequest } from "@/features/muse/server/museStream/types";

export async function parseMuseStreamRequest(req: NextRequest): Promise<MuseStreamParsedRequest> {
  const body = (await req.json()) as Record<string, unknown>;
  const mode = normalizeMode(body.mode);
  const history = normalizeHistory(body.history);
  const focusText = focusTextFromBody(body);
  const storySlug = typeof body.storySlug === "string" ? body.storySlug.trim() : "";
  const sceneId = typeof body.sceneId === "number" ? body.sceneId : Number(body.sceneId);
  const requestedLang = typeof body.writing_language === "string" ? body.writing_language.trim().toLowerCase() : "";
  const writingLanguage: "en" | "vi" = requestedLang === "vi" ? "vi" : "en";

  return {
    body,
    mode,
    history,
    focusText,
    storySlug,
    sceneId,
    writingLanguage,
  };
}

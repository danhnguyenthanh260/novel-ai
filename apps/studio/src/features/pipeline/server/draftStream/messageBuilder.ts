import { Pool } from "pg";
import type { WritingLanguage } from "@/features/pipeline/server/draftStream/types";

export function resolveWritingLanguage(requestedLang: string): WritingLanguage {
  return requestedLang === "vi" ? "vi" : "en";
}

export async function getStoryPreferredWritingLanguage(pool: Pool, storyId: number): Promise<WritingLanguage | null> {
  const storyRes = await pool.query<{ settings_json: Record<string, unknown> | null }>(
    `SELECT settings_json
     FROM public.story_series
     WHERE id = $1
     LIMIT 1`,
    [storyId]
  );
  const settingsLang =
    typeof storyRes.rows[0]?.settings_json?.writing_language === "string"
      ? String(storyRes.rows[0]?.settings_json?.writing_language).trim().toLowerCase()
      : "";
  if (settingsLang === "vi") return "vi";
  if (settingsLang === "en") return "en";
  return null;
}

export function languageSystemPrompt(writingLanguage: WritingLanguage): string {
  return writingLanguage === "vi"
    ? "Output language: Vietnamese. Keep responses in Vietnamese unless user explicitly asks otherwise."
    : "Output language: English. Keep responses in English unless user explicitly asks otherwise.";
}

export function buildMessagesWithLanguage(messages: unknown[], writingLanguage: WritingLanguage): unknown[] {
  return [
    {
      role: "system",
      content: languageSystemPrompt(writingLanguage),
    },
    ...messages,
  ];
}

export function buildMessagesWithGuard(messages: unknown[], writingLanguage: WritingLanguage, guardBlock: string): unknown[] {
  return [
    {
      role: "system",
      content: languageSystemPrompt(writingLanguage),
    },
    {
      role: "system",
      content:
        "Canon Retrieval Guard. Follow this context strictly. If uncertain, include [TODO: Question].\n\n" + guardBlock,
    },
    ...messages,
  ];
}

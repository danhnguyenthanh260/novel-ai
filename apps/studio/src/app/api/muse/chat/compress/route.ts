import { NextRequest, NextResponse } from "next/server";
import {
  buildIdentityAssertion,
  byteLengthUtf8,
  callChatCompletionJson,
  loadMuseStoryContext,
  normalizeMuseHistory,
  parseSceneId,
} from "@/app/api/muse/_shared";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 350 * 1024;

type CompressOutput = {
  core_thesis: string;
  emotional_arc: string[];
  critical_events: string[];
  unresolved_risks: string[];
  style_notes: string[];
  constraints_for_next_step: string[];
};

function parseOutput(raw: string): CompressOutput | null {
  let jsonRaw = raw.trim();
  if (jsonRaw.startsWith("```")) {
    jsonRaw = jsonRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  try {
    const obj = JSON.parse(jsonRaw) as Record<string, unknown>;
    const coreThesis = typeof obj.core_thesis === "string" ? obj.core_thesis.trim() : "";
    if (!coreThesis) return null;
    const list = (key: string) =>
      (Array.isArray(obj[key]) ? obj[key] : [])
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((x) => x.length > 0)
        .slice(0, 8);
    return {
      core_thesis: coreThesis,
      emotional_arc: list("emotional_arc"),
      critical_events: list("critical_events"),
      unresolved_risks: list("unresolved_risks"),
      style_notes: list("style_notes"),
      constraints_for_next_step: list("constraints_for_next_step"),
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const storySlug = typeof body.storySlug === "string" ? body.storySlug.trim() : "";
    const sceneId = parseSceneId(body.sceneId);
    const chapterText = typeof body.chapter_text === "string" ? body.chapter_text.trim() : "";
    const history = normalizeMuseHistory(body.history);
    const lockedBlocks = (Array.isArray(body.locked_blocks) ? body.locked_blocks : [])
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x.length > 0)
      .slice(0, 12)
      .map((x) => (x.length > 260 ? `${x.slice(0, 257)}...` : x));
    const requestedLang = typeof body.writing_language === "string" ? body.writing_language.trim().toLowerCase() : "";
    const writingLanguage: "en" | "vi" = requestedLang === "vi" ? "vi" : "en";

    if (!storySlug || !sceneId) {
      return NextResponse.json({ ok: false, error: "MISSING_STORY_OR_SCENE" }, { status: 400 });
    }
    if (!chapterText) {
      return NextResponse.json({ ok: false, error: "CHAPTER_TEXT_REQUIRED" }, { status: 400 });
    }
    if (byteLengthUtf8(chapterText) > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "MUSE_PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const story = await loadMuseStoryContext(storySlug, sceneId);
    const historyText = history.length > 0 ? history.map((x, idx) => `${idx + 1}. ${x}`).join("\n") : "(none)";
    const lockHint = lockedBlocks.length > 0 ? lockedBlocks.map((x, idx) => `${idx + 1}. ${x}`).join("\n") : "(none)";
    const userPrompt =
      `${story.rulesInjection ? `${story.rulesInjection}\n` : ""}` +
      `CHAPTER_TEXT:\n${chapterText}\n\n` +
      `LOCKED_BLOCK_HINTS:\n${lockHint}\n\n` +
      `PREVIOUS_IDEAS (last 5):\n${historyText}\n\n` +
      "TASK:\n" +
      "Summarize chapter into stable writing constraints for next step.\n" +
      "Do not rewrite chapter. Do not invent new events.\n" +
      "Return STRICT JSON only with this schema:\n" +
      '{ "core_thesis":"string", "emotional_arc":["string"], "critical_events":["string"], "unresolved_risks":["string"], "style_notes":["string"], "constraints_for_next_step":["string"] }\n';

    const completion = await callChatCompletionJson({
      messages: [
        {
          role: "system",
          content:
            buildIdentityAssertion(story, writingLanguage) +
            "You are Muse Chat (Compress mode).\nOutput strict JSON only. No markdown.\n",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 800,
      timeoutMs: 20000,
    });

    const parsed = parseOutput(completion.content);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "MUSE_COMPRESS_INVALID_JSON" }, { status: 422 });
    }
    return NextResponse.json({ ok: true, item: parsed });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_COMPRESS_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

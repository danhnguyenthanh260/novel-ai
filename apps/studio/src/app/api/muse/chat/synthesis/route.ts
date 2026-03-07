import { NextRequest, NextResponse } from "next/server";
import {
  buildIdentityAssertion,
  callChatCompletionJson,
  focusTextFromContext,
  loadMuseStoryContext,
  normalizeMuseScope,
  normalizeMuseContext,
  normalizeMuseHistory,
  parseCompressedSummary,
  parseSceneId,
} from "@/app/api/muse/_shared";

export const runtime = "nodejs";

type SynthBeat = {
  id: string;
  goal: string;
  conflict: string;
  turn: string;
};

type SynthOutput = {
  intent: string;
  macro_anchor: string;
  beats: SynthBeat[];
  questions_for_user: string[];
};

function parseIdeas(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, 12);
}

function parseOutput(raw: string): SynthOutput | null {
  let jsonRaw = raw.trim();
  if (jsonRaw.startsWith("```")) {
    jsonRaw = jsonRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  try {
    const obj = JSON.parse(jsonRaw) as Record<string, unknown>;
    const intent = typeof obj.intent === "string" ? obj.intent.trim() : "";
    const macroAnchor = typeof obj.macro_anchor === "string" ? obj.macro_anchor.trim() : "";
    const beatsRaw = Array.isArray(obj.beats) ? obj.beats : [];
    const beats = beatsRaw
      .map((x, idx) => {
        if (!x || typeof x !== "object" || Array.isArray(x)) return null;
        const row = x as Record<string, unknown>;
        const goal = typeof row.goal === "string" ? row.goal.trim() : "";
        const conflict = typeof row.conflict === "string" ? row.conflict.trim() : "";
        const turn = typeof row.turn === "string" ? row.turn.trim() : "";
        const idRaw = typeof row.id === "string" ? row.id.trim() : `b${idx + 1}`;
        if (!goal || !conflict || !turn) return null;
        return { id: idRaw || `b${idx + 1}`, goal, conflict, turn };
      })
      .filter((x): x is SynthBeat => Boolean(x))
      .slice(0, 8);
    const questions = (Array.isArray(obj.questions_for_user) ? obj.questions_for_user : [])
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x.length > 0)
      .slice(0, 8);
    if (!intent || beats.length === 0) return null;
    return { intent, macro_anchor: macroAnchor, beats, questions_for_user: questions };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const storySlug = typeof body.storySlug === "string" ? body.storySlug.trim() : "";
    const sceneId = parseSceneId(body.sceneId);
    const scope = normalizeMuseScope(body.scope);
    const ideas = parseIdeas(body.ideas);
    const history = normalizeMuseHistory(body.history);
    const context = normalizeMuseContext(body.context ?? body);
    const compressed = parseCompressedSummary(body.compressed);
    const focus = focusTextFromContext(context);
    const requestedLang = typeof body.writing_language === "string" ? body.writing_language.trim().toLowerCase() : "";
    const writingLanguage: "en" | "vi" = requestedLang === "vi" ? "vi" : "en";

    if (!storySlug || !sceneId) {
      return NextResponse.json({ ok: false, error: "MISSING_STORY_OR_SCENE" }, { status: 400 });
    }
    if (ideas.length === 0) {
      return NextResponse.json({ ok: false, error: "IDEAS_REQUIRED" }, { status: 400 });
    }
    if (scope === "chapter" && !compressed) {
      return NextResponse.json({ ok: false, error: "MUSE_COMPRESS_REQUIRED" }, { status: 400 });
    }
    if (scope === "selection" && !context.selection) {
      return NextResponse.json({ ok: false, error: "SELECTION_REQUIRED" }, { status: 400 });
    }

    const story = await loadMuseStoryContext(storySlug, sceneId);
    const ideasText = ideas.map((x, idx) => `${idx + 1}. ${x}`).join("\n");
    const historyText = history.length > 0 ? history.map((x, idx) => `${idx + 1}. ${x}`).join("\n") : "(none)";
    const compressedText = compressed
      ? [
          `core_thesis: ${compressed.core_thesis}`,
          `emotional_arc: ${compressed.emotional_arc.join(" | ") || "(none)"}`,
          `critical_events: ${compressed.critical_events.join(" | ") || "(none)"}`,
          `unresolved_risks: ${compressed.unresolved_risks.join(" | ") || "(none)"}`,
          `style_notes: ${compressed.style_notes.join(" | ") || "(none)"}`,
          `constraints_for_next_step: ${compressed.constraints_for_next_step.join(" | ") || "(none)"}`,
        ].join("\n")
      : "";
    const focusText = scope === "chapter" ? "(chapter scope uses compressed summary)" : focus || "(none)";
    const userPrompt =
      `${story.rulesInjection ? `${story.rulesInjection}\n` : ""}` +
      `SCOPE: ${scope}\n\n` +
      `IDEAS:\n${ideasText}\n\n` +
      `FOCUS_TEXT:\n${focusText}\n\n` +
      `${compressedText ? `COMPRESSED_SUMMARY:\n${compressedText}\n\n` : ""}` +
      `PREVIOUS_IDEAS (last 5):\n${historyText}\n\n` +
      "TASK:\n" +
      "Synthesize a coherent short intent and 3-6 beats from IDEAS.\n" +
      "For chapter scope, preserve the chapter thesis and produce micro beats for current scene only.\n" +
      "Beats must be practical for scene writing and avoid repeating PREVIOUS_IDEAS patterns.\n" +
      "Return STRICT JSON only using this exact schema:\n" +
      '{ "intent": "string", "macro_anchor": "string", "beats": [{ "id": "b1", "goal": "string", "conflict": "string", "turn": "string" }], "questions_for_user": ["string"] }\n';

    const completion = await callChatCompletionJson({
      messages: [
        {
          role: "system",
          content:
            buildIdentityAssertion(story, writingLanguage) +
            "You are Muse Chat (Synthesis mode).\nOutput must be strict JSON only. No markdown, no prose around JSON.\n",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.55,
      maxTokens: 800,
      timeoutMs: 20000,
    });

    const parsed = parseOutput(completion.content);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "MUSE_SYNTHESIS_INVALID_JSON" }, { status: 422 });
    }
    return NextResponse.json({ ok: true, item: parsed });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_SYNTHESIS_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

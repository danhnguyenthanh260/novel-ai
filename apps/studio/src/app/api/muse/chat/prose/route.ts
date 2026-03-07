import { NextRequest, NextResponse } from "next/server";
import {
  buildIdentityAssertion,
  callChatCompletionJson,
  focusTextFromContext,
  loadMuseStoryContext,
  normalizeMuseScope,
  normalizeMuseTargetRange,
  normalizeMuseContext,
  normalizeMuseHistory,
  parseCompressedSummary,
  parseSceneId,
} from "@/app/api/muse/_shared";

export const runtime = "nodejs";

type ApprovedBeat = {
  id: string;
  goal: string;
  conflict: string;
  turn: string;
};

function normalizeApprovedBeats(raw: unknown): ApprovedBeat[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x, idx) => {
      if (!x || typeof x !== "object" || Array.isArray(x)) return null;
      const row = x as Record<string, unknown>;
      const goal = typeof row.goal === "string" ? row.goal.trim() : "";
      const conflict = typeof row.conflict === "string" ? row.conflict.trim() : "";
      const turn = typeof row.turn === "string" ? row.turn.trim() : "";
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `b${idx + 1}`;
      if (!goal || !conflict || !turn) return null;
      return { id, goal, conflict, turn };
    })
    .filter((x): x is ApprovedBeat => Boolean(x))
    .slice(0, 8);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const storySlug = typeof body.storySlug === "string" ? body.storySlug.trim() : "";
    const sceneId = parseSceneId(body.sceneId);
    const scope = normalizeMuseScope(body.scope);
    const targetRange = normalizeMuseTargetRange(body.target_range);
    const beats = normalizeApprovedBeats(body.approved_beats);
    const history = normalizeMuseHistory(body.history);
    const context = normalizeMuseContext(body.context ?? body);
    const compressed = parseCompressedSummary(body.compressed);
    const lockedSpansPresent = body.locked_spans_present === true;
    const focus = focusTextFromContext(context);
    const requestedLang = typeof body.writing_language === "string" ? body.writing_language.trim().toLowerCase() : "";
    const writingLanguage: "en" | "vi" = requestedLang === "vi" ? "vi" : "en";
    if (!storySlug || !sceneId) {
      return NextResponse.json({ ok: false, error: "MISSING_STORY_OR_SCENE" }, { status: 400 });
    }
    if (beats.length === 0) {
      return NextResponse.json({ ok: false, error: "APPROVED_BEATS_REQUIRED" }, { status: 400 });
    }
    if (scope === "chapter" && !compressed) {
      return NextResponse.json({ ok: false, error: "MUSE_COMPRESS_REQUIRED" }, { status: 400 });
    }
    if (targetRange === "rewrite_scene" && !context.selection) {
      return NextResponse.json({ ok: false, error: "SELECTION_REQUIRED_FOR_REWRITE" }, { status: 400 });
    }

    const story = await loadMuseStoryContext(storySlug, sceneId);
    const beatsText = beats
      .map((b, idx) => `${idx + 1}. [${b.id}] goal=${b.goal}; conflict=${b.conflict}; turn=${b.turn}`)
      .join("\n");
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
    const targetRule =
      targetRange === "patch_short"
        ? "Write between 120 and 250 words."
        : targetRange === "rewrite_scene"
          ? "Write between 700 and 1200 words."
          : "Write between 300 and 500 words.";

    const userPrompt =
      `${story.rulesInjection ? `${story.rulesInjection}\n` : ""}` +
      `SCOPE: ${scope}\n` +
      `TARGET_RANGE: ${targetRange}\n\n` +
      `APPROVED_BEATS:\n${beatsText}\n\n` +
      `FOCUS_TEXT:\n${focus || "(none)"}\n\n` +
      `${compressedText ? `COMPRESSED_SUMMARY:\n${compressedText}\n\n` : ""}` +
      `PREVIOUS_IDEAS (last 5):\n${historyText}\n\n` +
      "TASK:\n" +
      "Write cohesive prose based on APPROVED_BEATS.\n" +
      `${targetRule}\n` +
      "Keep emotional thesis and consequences explicit, not softened.\n" +
      "Do not edit or restate locked blocks.\n" +
      "Avoid repeating PREVIOUS_IDEAS wording.\n" +
      "Return prose text only.\n";

    const completion = await callChatCompletionJson({
      messages: [
        {
          role: "system",
          content:
            buildIdentityAssertion(story, writingLanguage) +
            "You are Muse Chat (Prose mode).\nReturn prose only. No headings or bullets unless necessary in narration.\n",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.72,
      maxTokens: 1000,
      timeoutMs: 20000,
    });

    const prose = completion.content.trim();
    if (!prose) {
      return NextResponse.json({ ok: false, error: "MUSE_PROSE_EMPTY" }, { status: 422 });
    }
    if (lockedSpansPresent && (prose.includes("[[LOCK]]") || prose.includes("[[/LOCK]]"))) {
      return NextResponse.json({ ok: false, error: "MUSE_LOCK_VIOLATION" }, { status: 422 });
    }

    return NextResponse.json({ ok: true, prose });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUSE_PROSE_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

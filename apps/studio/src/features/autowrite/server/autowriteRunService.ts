import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { buildStoryContextPack } from "@/features/guard/server/storyContextBuilder";
import { runDraft } from "@/features/scenes/server/workflow/steps/draft";
import { callChatCompletionJson } from "@/app/api/muse/_shared";
import {
  buildCriticPrompt,
  buildJudgePrompt,
  buildWriterRound1Prompt,
  buildWriterRound2Prompt,
  renderAutowriteContextBlock,
} from "@/features/prompts/server/autowritePromptBuilder";

type CriticIssue = {
  category: string;
  severity: number;
  issue: string;
  evidence: string[];
  why_it_matters: string;
  fix_hint: string;
};

type CriticKeep = {
  claim: string;
  evidence: string[];
  keep_reason: string;
  risk_if_changed: string;
};

type PatchItem = {
  id: string;
  patch_type: string;
  target: string;
  instruction: string;
  constraints?: string[];
};

type CriticOutput = {
  summary: string;
  attack: CriticIssue[];
  steelman: CriticKeep[];
  must_fix: PatchItem[];
  nice_to_have: PatchItem[];
  risk_flags: string[];
};

type JudgePatch = {
  id: string;
  priority: "must" | "should" | "could";
  patch_type: string;
  target: string;
  instruction: string;
  tests: string[];
};

type JudgeOutput = {
  verdict: "accept" | "revise" | "rewrite";
  scores: {
    canon: number;
    logic: number;
    pacing: number;
    tone: number;
    pov: number;
    clarity: number;
  };
  threshold_pass: boolean;
  rationale: string;
  patch_list: JudgePatch[];
  stop_reason: string;
};

function parseSceneId(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_SCENE_ID");
  return Math.floor(n);
}

function normalizeLanguage(raw: unknown): "en" | "vi" {
  const x = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return x === "vi" ? "vi" : "en";
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const cleaned = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    : trimmed;
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj as Record<string, unknown>;
  } catch {}
  return null;
}

function toStringArray(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, limit);
}

function parseCritic(raw: string): CriticOutput {
  const obj = parseJsonObject(raw);
  if (!obj) throw new Error("AUTOWRITE_CRITIC_JSON_INVALID");
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const attackRaw = Array.isArray(obj.attack) ? obj.attack : [];
  const steelmanRaw = Array.isArray(obj.steelman) ? obj.steelman : [];
  const mustFixRaw = Array.isArray(obj.must_fix) ? obj.must_fix : [];
  const niceRaw = Array.isArray(obj.nice_to_have) ? obj.nice_to_have : [];
  const attack = attackRaw
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const item = row as Record<string, unknown>;
      return {
        category: String(item.category ?? "unknown").trim(),
        severity: Math.max(1, Math.min(5, Number(item.severity ?? 3) || 3)),
        issue: String(item.issue ?? "").trim(),
        evidence: toStringArray(item.evidence, 3),
        why_it_matters: String(item.why_it_matters ?? "").trim(),
        fix_hint: String(item.fix_hint ?? "").trim(),
      };
    })
    .filter((x): x is CriticIssue => Boolean(x && x.issue));
  const steelman = steelmanRaw
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const item = row as Record<string, unknown>;
      return {
        claim: String(item.claim ?? "").trim(),
        evidence: toStringArray(item.evidence, 3),
        keep_reason: String(item.keep_reason ?? "").trim(),
        risk_if_changed: String(item.risk_if_changed ?? "").trim(),
      };
    })
    .filter((x): x is CriticKeep => Boolean(x && x.claim));
  const parsePatch = (row: unknown, idx: number): PatchItem | null => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const item = row as Record<string, unknown>;
    const instruction = String(item.instruction ?? "").trim();
    if (!instruction) return null;
    return {
      id: String(item.id ?? `P${idx + 1}`).trim() || `P${idx + 1}`,
      patch_type: String(item.patch_type ?? "clarify").trim(),
      target: String(item.target ?? "unspecified").trim(),
      instruction,
      constraints: toStringArray(item.constraints, 5),
    };
  };
  const must_fix = mustFixRaw.map(parsePatch).filter((x): x is PatchItem => Boolean(x)).slice(0, 12);
  const nice_to_have = niceRaw.map(parsePatch).filter((x): x is PatchItem => Boolean(x)).slice(0, 12);
  return {
    summary,
    attack,
    steelman,
    must_fix,
    nice_to_have,
    risk_flags: toStringArray(obj.risk_flags, 10),
  };
}

function parseJudge(raw: string): JudgeOutput {
  const obj = parseJsonObject(raw);
  if (!obj) throw new Error("AUTOWRITE_JUDGE_JSON_INVALID");
  const verdictRaw = String(obj.verdict ?? "").trim().toLowerCase();
  const verdict: JudgeOutput["verdict"] =
    verdictRaw === "accept" || verdictRaw === "revise" || verdictRaw === "rewrite" ? verdictRaw : "revise";
  const scoresObj =
    obj.scores && typeof obj.scores === "object" && !Array.isArray(obj.scores) ? (obj.scores as Record<string, unknown>) : {};
  const score = (k: string) => Math.max(0, Math.min(10, Number(scoresObj[k] ?? 0) || 0));
  const patchRaw = Array.isArray(obj.patch_list) ? obj.patch_list : [];
  const patch_list = patchRaw
    .map((row, idx) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const item = row as Record<string, unknown>;
      const instruction = String(item.instruction ?? "").trim();
      if (!instruction) return null;
      const priorityRaw = String(item.priority ?? "should").trim().toLowerCase();
      const priority: JudgePatch["priority"] =
        priorityRaw === "must" || priorityRaw === "should" || priorityRaw === "could" ? priorityRaw : "should";
      return {
        id: String(item.id ?? `P${idx + 1}`).trim() || `P${idx + 1}`,
        priority,
        patch_type: String(item.patch_type ?? "clarify").trim(),
        target: String(item.target ?? "unspecified").trim(),
        instruction,
        tests: toStringArray(item.tests, 5),
      };
    })
    .filter((x): x is JudgePatch => Boolean(x))
    .slice(0, 16);
  return {
    verdict,
    scores: {
      canon: score("canon"),
      logic: score("logic"),
      pacing: score("pacing"),
      tone: score("tone"),
      pov: score("pov"),
      clarity: score("clarity"),
    },
    threshold_pass: Boolean(obj.threshold_pass),
    rationale: typeof obj.rationale === "string" ? obj.rationale.trim() : "",
    patch_list,
    stop_reason: typeof obj.stop_reason === "string" ? obj.stop_reason.trim() : "",
  };
}

async function loadScene(storyId: number, sceneId: number): Promise<{
  id: number;
  workunit_id: string | null;
  status: string;
  current_text: string;
}> {
  const rs = await pool.query<{
    id: number;
    workunit_id: string | null;
    status: string;
    current_text: string | null;
  }>(
    `SELECT s.id, s.workunit_id, s.status, COALESCE(v.text_content, '') AS current_text
     FROM public.narrative_scene s
     LEFT JOIN public.narrative_scene_version v ON v.id = s.current_version_id
     WHERE s.story_id = $1 AND s.id = $2
     LIMIT 1`,
    [storyId, sceneId]
  );
  const row = rs.rows[0];
  if (!row) throw new Error("SCENE_NOT_FOUND");
  return {
    id: row.id,
    workunit_id: row.workunit_id,
    status: row.status,
    current_text: row.current_text ?? "",
  };
}

export async function postAutowriteRunResponse(
  req: NextRequest,
  storySlug: string
): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sceneId = parseSceneId(body.scene_id);
    const writingLanguage = normalizeLanguage(body.writing_language);
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const scene = await loadScene(storyId, sceneId);
    if (scene.status === "LOCKED") {
      return NextResponse.json({ ok: false, error: "SCENE_LOCKED" }, { status: 409 });
    }

    const sceneSpecInput = typeof body.scene_spec === "string" ? body.scene_spec.trim() : "";
    const sceneSpec =
      sceneSpecInput ||
      [
        `Story: ${storySlug}`,
        `Scene ID: ${sceneId}`,
        `Workunit: ${scene.workunit_id ?? "(none)"}`,
        "Write a coherent scene that advances plot while preserving canon and timeline.",
      ].join("\n");

    const pack = await buildStoryContextPack(pool, {
      storyId,
      sceneId,
      workunitId: scene.workunit_id ?? undefined,
      keywords: sceneSpec,
    });
    const contextBlock = renderAutowriteContextBlock({
      canon: pack.canonLines.slice(0, 20),
      timeline: pack.timelineLines.slice(0, 10),
      style: pack.styleLines.slice(0, 12),
      historianGuidance: pack.historianGuidance.slice(0, 8),
    });

    const writer1 = await callChatCompletionJson({
      messages: [{ role: "user", content: buildWriterRound1Prompt({ sceneSpec, contextBlock, currentText: scene.current_text, writingLanguage }) }],
      temperature: 0.8,
      maxTokens: 1100,
      timeoutMs: 20000,
    });
    let draftText = writer1.content.trim();
    if (!draftText) throw new Error("AUTOWRITE_WRITER_EMPTY");

    const critic1Raw = await callChatCompletionJson({
      messages: [{ role: "user", content: buildCriticPrompt({ sceneSpec, contextBlock, draftText, writingLanguage }) }],
      temperature: 0.45,
      maxTokens: 900,
      timeoutMs: 20000,
    });
    const critic1 = parseCritic(critic1Raw.content);

    const judge1Raw = await callChatCompletionJson({
      messages: [{ role: "user", content: buildJudgePrompt({ sceneSpec, draftText, critic: critic1, writingLanguage }) }],
      temperature: 0.35,
      maxTokens: 700,
      timeoutMs: 20000,
    });
    let judge = parseJudge(judge1Raw.content);
    const roundHistory: Array<Record<string, unknown>> = [
      {
        round: 1,
        critic_summary: critic1.summary,
        attack_count: critic1.attack.length,
        must_fix_count: critic1.must_fix.length,
        verdict: judge.verdict,
        scores: judge.scores,
        patch_list: judge.patch_list,
      },
    ];

    let roundsUsed = 1;
    if (judge.verdict !== "accept") {
      const writer2 = await callChatCompletionJson({
        messages: [{ role: "user", content: buildWriterRound2Prompt({ draftText, patchList: judge.patch_list, writingLanguage }) }],
        temperature: 0.7,
        maxTokens: 1100,
        timeoutMs: 20000,
      });
      const revised = writer2.content.trim();
      if (revised) draftText = revised;
      roundsUsed = 2;

      const critic2Raw = await callChatCompletionJson({
        messages: [{ role: "user", content: buildCriticPrompt({ sceneSpec, contextBlock, draftText, writingLanguage }) }],
        temperature: 0.45,
        maxTokens: 900,
        timeoutMs: 20000,
      });
      const critic2 = parseCritic(critic2Raw.content);
      const judge2Raw = await callChatCompletionJson({
        messages: [{ role: "user", content: buildJudgePrompt({ sceneSpec, draftText, critic: critic2, writingLanguage }) }],
        temperature: 0.35,
        maxTokens: 700,
        timeoutMs: 20000,
      });
      judge = parseJudge(judge2Raw.content);
      roundHistory.push({
        round: 2,
        critic_summary: critic2.summary,
        attack_count: critic2.attack.length,
        must_fix_count: critic2.must_fix.length,
        verdict: judge.verdict,
        scores: judge.scores,
        patch_list: judge.patch_list,
      });
    }

    const summary = judge.rationale || `autowrite_v1 rounds=${roundsUsed} verdict=${judge.verdict}`;
    const saved = await runDraft(pool, {
      storyId,
      sceneId,
      textContent: draftText,
      summary,
      llmParams: {
        mode: "autowrite_v1",
        rounds_used: roundsUsed,
        final_verdict: judge.verdict,
      },
    });

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      scene_id: sceneId,
      rounds_used: roundsUsed,
      final_verdict: judge.verdict,
      final_scores: judge.scores,
      version_id: saved.version_id,
      version_no: saved.version_no,
      status: saved.status,
      final_text: draftText,
      patch_history: roundHistory,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "AUTOWRITE_FAILED";
    const status =
      msg.includes("LOCKED") || msg.includes("STORY_ARCHIVED")
        ? 409
        : msg.includes("NOT_FOUND")
          ? 404
          : msg.includes("INVALID_SCENE_ID")
            ? 400
            : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

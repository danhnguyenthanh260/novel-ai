/* eslint-disable max-lines */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { runDraft } from "@/features/scenes/server/workflow/steps/draft";
import { runOutline } from "@/features/scenes/server/workflow/steps/outline";
import { runRewrite } from "@/features/scenes/server/workflow/steps/rewrite";
import { runEvaluate } from "@/features/scenes/server/workflow/steps/evaluate";
import { runIntake } from "@/features/scenes/server/workflow/steps/intake";
import { runLock } from "@/features/scenes/server/workflow/steps/lock";
import { runUnlock } from "@/features/scenes/server/workflow/steps/unlock";
import { runChapterPlanning } from "@/features/scenes/server/workflow/steps/chapterPlanning";
import { getScenesApiErrorMessage, getScenesApiStatusFromMessage } from "@/features/scenes/server/scenesApi/errorMapper";
import {
  buildDraftPayload,
  buildEvaluatePayload,
  buildIntakePayload,
  buildLockPayload,
  buildOutlinePayload,
  buildRewritePayload,
} from "@/features/scenes/server/scenesApi/payloadBuilders";
import { parseVirtualScenesFromText, VirtualScene } from "@/features/autowrite/server/virtualSceneProvider";
import { enqueueChapterWriteV3, invalidateDownstream } from "@/features/autowrite/server/writingPipelineService";
import {
  buildApprovalGateEvent,
  buildArtifactPreviewEvent,
  buildChapterWritingTimelineEvents,
  buildFailureRecoveryEvent,
  buildWorkflowProgressEvent,
} from "@/features/chat-orchestration/server/timelineEvents";

function isWritingV2ProductionEnabled(): boolean {
  const raw = (process.env.WRITING_V2_PRODUCTION ?? "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function buildChapterOutputContractV1(targetWords: number) {
  const target = Math.max(400, Number(targetWords || 1500));
  const min = Math.max(400, Math.floor(target * 0.75));
  const max = Math.max(min + 200, Math.floor(target * 1.25));
  return {
    word_range: { min, target, max },
    scene_range: { min: 3, max: 6 },
    pacing_target: "balanced_progression",
    voice_target: "consistent_story_voice",
    taboo_constraints: [] as string[],
  };
}

function parseWritingIntentMode(raw: unknown): "CONTINUE_CANON" | "RETCON_REWRITE" {
  return String(raw || "").trim().toUpperCase() === "RETCON_REWRITE" ? "RETCON_REWRITE" : "CONTINUE_CANON";
}

function chapterGoalFromPlan(plan: Record<string, unknown>, fallback: string): string {
  const summary = typeof plan.summary === "string" ? plan.summary.trim() : "";
  const title = typeof plan.title === "string" ? plan.title.trim() : "";
  const text = fallback.trim() || summary || title;
  return text || "Write the next chapter from the approved plan.";
}

function targetWordCountFromPlan(plan: Record<string, unknown>, fallback: number): number {
  const contract = plan.chapter_output_contract_v1;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return fallback;
  const wordRange = (contract as Record<string, unknown>).word_range;
  if (!wordRange || typeof wordRange !== "object" || Array.isArray(wordRange)) return fallback;
  const target = Number((wordRange as Record<string, unknown>).target);
  return Number.isFinite(target) && target > 0 ? Math.floor(target) : fallback;
}

async function enqueueCanonicalChapterWriteV3(args: {
  storyId: number;
  chapterId: string;
  plan: Record<string, unknown>;
  userPrompt: string;
  targetWordCount: number;
}) {
  const result = await enqueueChapterWriteV3({
    storyId: args.storyId,
    chapterId: args.chapterId,
    instructions: chapterGoalFromPlan(args.plan, args.userPrompt),
    targetWordCount: args.targetWordCount,
    plan: args.plan,
  });
  return {
    ok: true,
    job_id: result.jobId,
    chapter_id: result.chapterId,
    status: "RUNNING",
    task_type: "CHAPTER_WRITE_V3",
  };
}

type QualityGateReportV1 = {
  pass: boolean;
  fail_codes: string[];
  checks: {
    memory_context: { pass: boolean; detail: string };
    canon_continuity: { pass: boolean; detail: string };
    structure_pacing: { pass: boolean; detail: string };
    style_tone: { pass: boolean; detail: string };
    quality_score: { pass: boolean; detail: string };
  };
};

function computeQualityGateReportV1(args: {
  proseReady: boolean;
  proseWordCount: number;
  contract: ReturnType<typeof buildChapterOutputContractV1>;
  integrityReport: { location_verified: boolean; objects_tracked: string[]; character_drift_detected: boolean } | null;
  historianSnapshot: {
    fact_status?: string;
    narrative_score?: number;
    snapshot_v3?: Record<string, unknown>;
  } | null;
  memoryRuntimeV5: Record<string, unknown>;
}): QualityGateReportV1 {
  const failCodes: string[] = [];
  const degradedReasons = Array.isArray(args.memoryRuntimeV5.degraded_reasons)
    ? args.memoryRuntimeV5.degraded_reasons.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const hasEvidenceRefs =
    !!args.memoryRuntimeV5 &&
    typeof args.memoryRuntimeV5 === "object" &&
    !!(args.memoryRuntimeV5.evidence_refs && typeof args.memoryRuntimeV5.evidence_refs === "object");
  const memoryContextPass = hasEvidenceRefs && degradedReasons.length === 0;
  if (!memoryContextPass) failCodes.push("FAIL_MEMORY_CONTEXT");

  const canonPass =
    args.proseReady &&
    !!args.integrityReport &&
    args.integrityReport.location_verified &&
    !args.integrityReport.character_drift_detected &&
    String(args.historianSnapshot?.fact_status || "").toUpperCase() === "CLEAN";
  if (!canonPass) failCodes.push("FAIL_CANON_CONFLICT");

  const inWordRange =
    args.proseWordCount >= args.contract.word_range.min &&
    args.proseWordCount <= args.contract.word_range.max;
  const continuityPass = args.proseReady && !!args.integrityReport && inWordRange;
  if (!continuityPass) failCodes.push("FAIL_CONTINUITY");

  const styleSimilarity = Number(
    ((args.historianSnapshot?.snapshot_v3 || {}).external_signals as Record<string, unknown> | undefined)?.qdrant
      ? ((args.historianSnapshot?.snapshot_v3 || {}).external_signals as Record<string, unknown>).qdrant &&
      Number((((args.historianSnapshot?.snapshot_v3 || {}).external_signals as Record<string, unknown>).qdrant as Record<string, unknown>).style_similarity || 0)
      : 0
  );
  const stylePass = args.proseReady && (styleSimilarity <= 0 || styleSimilarity >= 0.55);
  if (!stylePass) failCodes.push("FAIL_STYLE");

  const narrativeScore = Number(args.historianSnapshot?.narrative_score || 0);
  const qualityScorePass = args.proseReady && narrativeScore >= 0.3;
  if (!qualityScorePass) failCodes.push("FAIL_QUALITY_SCORE");

  return {
    pass: failCodes.length === 0,
    fail_codes: failCodes,
    checks: {
      memory_context: {
        pass: memoryContextPass,
        detail: memoryContextPass ? "memory evidence and non-degraded lanes present" : "missing evidence refs or degraded memory lanes",
      },
      canon_continuity: {
        pass: canonPass,
        detail: canonPass ? "integrity and historian fact_status clean" : "integrity/canon mismatch detected",
      },
      structure_pacing: {
        pass: continuityPass,
        detail: continuityPass ? "word budget and continuity range acceptable" : "word budget or continuity constraint failed",
      },
      style_tone: {
        pass: stylePass,
        detail: stylePass ? "style signal acceptable" : "style similarity below threshold",
      },
      quality_score: {
        pass: qualityScorePass,
        detail: qualityScorePass ? "narrative score >= 0.30" : "narrative score below threshold",
      },
    },
  };
}

export async function getScenesListResponse(
  req: NextRequest,
  storySlug: string,
  options?: { includeWorkunitSearch?: boolean; includeStoryColumns?: boolean }
): Promise<NextResponse> {
  const storyId = await resolveStoryId(pool, storySlug);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const chapterId = (req.nextUrl.searchParams.get("chapter_id") ?? "").trim();
  const includeWorkunitSearch = Boolean(options?.includeWorkunitSearch);
  const includeStoryColumns = Boolean(options?.includeStoryColumns);

  const params: Array<string | number> = [storyId];
  const where: string[] = [`story_id = $1`];

  if (chapterId) {
    params.push(chapterId);
    where.push(`chapter_id = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    const conditions = [
      `COALESCE(title,'') ILIKE $${params.length}`,
      `chapter_id ILIKE $${params.length}`,
      `CAST(idx AS text) ILIKE $${params.length}`,
    ];
    if (includeWorkunitSearch) {
      conditions.push(`COALESCE(workunit_id,'') ILIKE $${params.length}`);
    }
    where.push(`(${conditions.join("\n      OR ")})`);
  }

  const selectCols = includeStoryColumns
    ? `id, story_id, workunit_id, chapter_id, idx, title, status, current_version_id, created_at, updated_at`
    : `id, chapter_id, idx, title, status, current_version_id, created_at, updated_at`;

  const sql = `
    SELECT ${selectCols}
    FROM narrative_scene
    WHERE ${where.join(" AND ")}
    ORDER BY chapter_id ASC, idx ASC
    LIMIT 200
  `;

  const { rows } = await pool.query(sql, params);

  // --- V3 BRIDGE START ---
  // If no scenes found in narrative_scene, check for V3 ChapterDraft
  if (rows.length === 0 && chapterId && (process.env.V3_BRIDGE_ENABLED !== "0")) {
    const draftRes = await pool.query<{ full_text: string }>(
      `SELECT full_text FROM public.chapter_draft
       WHERE story_id = $1 AND chapter_id = $2 AND status = 'DRAFT'
       ORDER BY version_no DESC LIMIT 1`,
      [storyId, chapterId]
    );
    if (draftRes.rowCount && draftRes.rows[0].full_text) {
      const virtualScenes = parseVirtualScenesFromText(draftRes.rows[0].full_text);
      return NextResponse.json({
        items: virtualScenes.map(v => ({
          ...v,
          id: -1, // Mark as virtual for legacy UI
          current_version_id: null,
          created_at: new Date(),
          updated_at: new Date()
        }))
      });
    }
  }
  // --- V3 BRIDGE END ---

  return NextResponse.json({ items: rows });
}

export async function postScenesDraftResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body?.text_content !== "string" || !body.text_content.trim()) {
      return NextResponse.json({ ok: false, error: "MISSING_TEXT" }, { status: 400 });
    }
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await runDraft(pool, { storyId, ...buildDraftPayload(body) });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "DRAFT_FAILED");
    const status = getScenesApiStatusFromMessage(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function postScenesOutlineResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await runOutline(pool, { storyId, ...buildOutlinePayload(body) });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "OUTLINE_FAILED");
    const status = getScenesApiStatusFromMessage(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function postScenesRewriteResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await runRewrite(pool, { storyId, ...buildRewritePayload(body) });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "REWRITE_FAILED");
    const status = getScenesApiStatusFromMessage(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function postScenesEvaluateResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await runEvaluate(pool, { storyId, ...buildEvaluatePayload(body) });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "EVALUATE_FAILED");
    const status = getScenesApiStatusFromMessage(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function postScenesIntakeResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body?.workunit_id !== "string") {
      return NextResponse.json({ ok: false, error: "MISSING_WORKUNIT_ID" }, { status: 400 });
    }
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await runIntake(pool, { storyId, ...buildIntakePayload(body) });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "INTAKE_FAILED");
    return NextResponse.json({ ok: false, error: msg }, { status: msg.includes("STORY_ARCHIVED") ? 409 : 400 });
  }
}

export async function postScenesLockResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await runLock(pool, { storyId, ...buildLockPayload(body) });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "LOCK_FAILED");
    const status = getScenesApiStatusFromMessage(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function getSceneVersionsResponse(storySlug: string, sceneId: string, includeStoryColumns: boolean): Promise<NextResponse> {
  const storyId = await resolveStoryId(pool, storySlug);

  const sceneSelect = includeStoryColumns
    ? `id, story_id, workunit_id, chapter_id, idx, title, status, current_version_id, created_at, updated_at`
    : `id, chapter_id, idx, title, status, current_version_id, created_at, updated_at`;
  const versionSelect = includeStoryColumns
    ? `id, story_id, scene_id, version_no, kind, summary, created_at`
    : `id, scene_id, version_no, kind, summary, created_at`;
  const currentSelect = includeStoryColumns
    ? `id, story_id, version_no, kind, text_content, beats_json, eval_json, summary, created_at`
    : `id, version_no, kind, text_content, beats_json, eval_json, summary, created_at`;

  const sceneRes = await pool.query(
    `SELECT ${sceneSelect}
     FROM narrative_scene WHERE story_id=$1 AND id=$2`,
    [storyId, sceneId]
  );
  if (sceneRes.rowCount === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const versionsRes = await pool.query(
    `SELECT ${versionSelect}
     FROM narrative_scene_version
     WHERE story_id=$1 AND scene_id=$2
     ORDER BY version_no DESC
     LIMIT 50`,
    [storyId, sceneId]
  );

  const currentRes =
    sceneRes.rows[0].current_version_id
      ? await pool.query(
        `SELECT ${currentSelect}
           FROM narrative_scene_version WHERE story_id=$1 AND id=$2`,
        [storyId, sceneRes.rows[0].current_version_id]
      )
      : { rows: [] as unknown[] };

  return NextResponse.json({
    scene: sceneRes.rows[0],
    versions: versionsRes.rows,
    current: (currentRes.rows as Array<Record<string, unknown>>)[0] ?? null,
  });
}

export async function postSceneCommitDraftResponse(
  req: NextRequest,
  storySlug: string,
  sceneId: string
): Promise<NextResponse> {
  const sceneIdNum = Number(sceneId);
  const body = await req.json();
  const textContent = body?.text_content;
  const summary = typeof body?.summary === "string" ? body.summary : null;

  if (!textContent || typeof textContent !== "string") {
    return NextResponse.json({ ok: false, error: "MISSING_TEXT" }, { status: 400 });
  }

  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await runDraft(pool, {
      storyId,
      sceneId: sceneIdNum,
      textContent,
      summary,
      llmParams: {},
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "COMMIT_FAILED";
    const status = msg.includes("LOCKED") || msg.includes("STORY_ARCHIVED") ? 409 : msg.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function postScenesUnlockResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sceneId = Number(body.scene_id);
    if (!sceneId) return NextResponse.json({ ok: false, error: "MISSING_SCENE_ID" }, { status: 400 });
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await runUnlock(pool, { storyId, sceneId });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "UNLOCK_FAILED");
    const status = getScenesApiStatusFromMessage(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function getFullChapterResponse(storySlug: string, chapterId: string): Promise<NextResponse> {
  const storyId = await resolveStoryId(pool, storySlug);
  const sql = `
    SELECT s.id, s.idx, s.title, s.status, COALESCE(v.text_content, '') AS text_content
    FROM narrative_scene s
    LEFT JOIN narrative_scene_version v ON v.id = s.current_version_id
    WHERE s.story_id = $1 AND s.chapter_id = $2
    ORDER BY s.idx ASC
  `;
  const { rows } = await pool.query(sql, [storyId, chapterId]);

  // also check for staging data
  const stagingRes = await pool.query(
    `SELECT llm_prose, user_prose, status FROM public.narrative_chapter_staging
     WHERE story_id = $1 AND chapter_id = $2`,
    [storyId, chapterId]
  );
  const staging = stagingRes.rows[0] || null;

  // --- V3 BRIDGE START ---
  let v3Draft = null;
  if (process.env.V3_BRIDGE_ENABLED !== "0") {
    const draftRes = await pool.query<{ full_text: string; status: string }>(
      `SELECT full_text, status FROM public.chapter_draft
       WHERE story_id = $1 AND chapter_id = $2
       ORDER BY version_no DESC LIMIT 1`,
      [storyId, chapterId]
    );
    if (draftRes.rowCount && draftRes.rows[0].full_text) {
      const virtualScenes = parseVirtualScenesFromText(draftRes.rows[0].full_text);
      v3Draft = {
        full_text: draftRes.rows[0].full_text,
        status: draftRes.rows[0].status,
        virtual_scenes: virtualScenes
      };

      if (rows.length === 0) {
        const items = virtualScenes.map(v => ({
          id: -1,
          idx: v.idx,
          title: v.title,
          status: v.status,
          text_content: v.text_content
        }));

        return NextResponse.json({
          items,
          staging,
          v3_draft: v3Draft
        });
      }
    }
  }
  // --- V3 BRIDGE END ---

  // STAGING LOCKOUT: If we have a draft in staging, we ignore the individual scenes.
  // This prevents "Old District" and other ghosts from polluting the reading view.
  if (staging) {
    return NextResponse.json({
      items: rows, // Allow scenes even if staging exists
      staging,
      v3_draft: v3Draft
    });
  }

  return NextResponse.json({
    items: rows,
    staging: null,
    v3_draft: v3Draft
  });
}

export async function postNewChapterResponse(_req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);

    // 1. Find the latest chapter_id across split scenes, staged chapter drafts AND auto-write source docs.
    const maxRes = await pool.query<{ chapter_id: string }>(
      `WITH chapter_ids AS (
         SELECT chapter_id::text AS chapter_id
         FROM public.narrative_scene
         WHERE story_id = $1
         UNION
         SELECT chapter_id::text AS chapter_id
         FROM public.narrative_chapter_staging
         WHERE story_id = $1
         UNION
         SELECT chapter_id::text AS chapter_id
         FROM public.story_chapter
         WHERE story_id = $1
         UNION
         SELECT
           COALESCE(
             origin->>'chapter_id',
             CASE
               WHEN (origin->>'source_path') IS NOT NULL AND (origin->>'source_path') ~ 'CHAPTER \d+'
               THEN 'ch' || LPAD(regexp_replace(origin->>'source_path', '.*CHAPTER (\d+).*', '\\1'), 2, '0')
               ELSE 'ch01'
             END
           ) AS chapter_id
         FROM public.source_doc
         WHERE story_id = $1 AND doc_type = 'ingest_chapter'
       )
       SELECT chapter_id
       FROM chapter_ids
       ORDER BY
         NULLIF(regexp_replace(chapter_id, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
         chapter_id DESC
       LIMIT 1`,
      [storyId]
    );

    let nextChapterId = "ch01";
    if (maxRes.rowCount && maxRes.rows[0].chapter_id) {
      const current = maxRes.rows[0].chapter_id;
      const match = current.match(/^ch(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        nextChapterId = `ch${String(num + 1).padStart(2, "0")}`;
      } else {
        // Fallback for non-standard slugs
        nextChapterId = `${current}_new`;
      }
    }

    // 2. We NO LONGER create the first scene via Intake automatically.
    // This prevents "Old District" (empty scene) from being saved before AutoWrite.
    // Instead, we just return the next available ID.
    const nextWorkunitId = `${nextChapterId}_s1`;

    return NextResponse.json({
      ok: true,
      chapter_id: nextChapterId,
      workunit_id: nextWorkunitId,
      is_new_slot: true
    });
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "CREATE_CHAPTER_FAILED");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function postChapterPlanResponse(req: NextRequest, storySlug: string, chapterId: string): Promise<NextResponse> {
  try {
    if (!isWritingV2ProductionEnabled()) {
      return NextResponse.json({ ok: false, error: "WRITING_V2_DISABLED" }, { status: 409 });
    }
    const body = (await req.json()) as Record<string, unknown>;
    const targetWordCount = Number(body.target_word_count || 1500);
    const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt : "";
    const writingIntentMode = parseWritingIntentMode(body.writing_intent_mode);

    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await runChapterPlanning(pool, {
      storyId,
      storySlug,
      chapterId,
      targetWordCount,
      userPrompt,
      writingIntentMode,
    });
    const planObj = result.plan as Record<string, unknown>;
    const blockedByConflictReview = Boolean(planObj?.blocked_by_conflict_review);
    const blockedByCanonConflict = Boolean(planObj?.blocked_by_canon_conflict);
    if (blockedByConflictReview || blockedByCanonConflict) {
      return NextResponse.json({
        ok: true,
        chapter_id: chapterId,
        status: blockedByConflictReview ? "BLOCKED_BY_CONFLICT_REVIEW" : "BLOCKED_BY_CANON_CONFLICT",
        blocking_reason: String(planObj?.blocked_reason || (blockedByConflictReview ? "BLOCKED_BY_CONFLICT_REVIEW" : "BLOCKED_BY_CANON_CONFLICT")),
        plan: result.plan,
        writing_intent_mode: writingIntentMode,
        retcon_accepted: Boolean(planObj?.retcon_accepted),
        canon_delta_report_v1: planObj?.canon_delta_report_v1 ?? null,
        conflict_root_cause_v1: planObj?.conflict_root_cause_v1 ?? null,
        reanalysis_actions_v1: planObj?.reanalysis_actions_v1 ?? null,
        conflict_resolution_mode: typeof planObj?.conflict_resolution_mode === "string" ? String(planObj.conflict_resolution_mode) : null,
        delta_classification: typeof planObj?.delta_classification === "string" ? String(planObj.delta_classification) : null,
        superseded_fact_refs: Array.isArray(planObj?.superseded_fact_refs) ? planObj.superseded_fact_refs : [],
        new_fact_candidates: Array.isArray(planObj?.new_fact_candidates) ? planObj.new_fact_candidates : [],
      });
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "PLAN_FAILED");
    const status = msg.includes("BLOCKED_BY_CANON_CONFLICT") || msg.includes("BLOCKED_BY_CONFLICT_REVIEW") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function postChapterAutoWriteResponse(req: NextRequest, storySlug: string, chapterId: string): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    if (!isWritingV2ProductionEnabled()) {
      return NextResponse.json({ ok: false, error: "WRITING_V2_DISABLED" }, { status: 409 });
    }
    const body = await req.json().catch(() => ({}));
    const targetWordCount = Number(body.target_word_count || 1500);
    const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt : "";
    const writingIntentMode = parseWritingIntentMode((body as Record<string, unknown>).writing_intent_mode);
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const planResult = await runChapterPlanning(pool, {
      storyId,
      storySlug,
      chapterId,
      targetWordCount,
      userPrompt,
      writingIntentMode,
    });
    const planObj = planResult.plan as Record<string, unknown>;
    const blockedByConflictReview = Boolean(planObj?.blocked_by_conflict_review);
    const blockedByCanonConflict = Boolean(planObj?.blocked_by_canon_conflict);
    if (blockedByConflictReview || blockedByCanonConflict) {
      const blockingReason = String(planObj?.blocked_reason || (blockedByConflictReview ? "BLOCKED_BY_CONFLICT_REVIEW" : "BLOCKED_BY_CANON_CONFLICT"));
      return NextResponse.json({
        ok: true,
        chapter_id: chapterId,
        status: blockedByConflictReview ? "BLOCKED_BY_CONFLICT_REVIEW" : "BLOCKED_BY_CANON_CONFLICT",
        blocking_reason: blockingReason,
        plan: planResult.plan,
        writing_intent_mode: writingIntentMode,
        retcon_accepted: Boolean(planObj?.retcon_accepted),
        canon_delta_report_v1: planObj?.canon_delta_report_v1 ?? null,
        conflict_root_cause_v1: planObj?.conflict_root_cause_v1 ?? null,
        reanalysis_actions_v1: planObj?.reanalysis_actions_v1 ?? null,
        conflict_resolution_mode: typeof planObj?.conflict_resolution_mode === "string" ? String(planObj.conflict_resolution_mode) : null,
        delta_classification: typeof planObj?.delta_classification === "string" ? String(planObj.delta_classification) : null,
        superseded_fact_refs: Array.isArray(planObj?.superseded_fact_refs) ? planObj.superseded_fact_refs : [],
        new_fact_candidates: Array.isArray(planObj?.new_fact_candidates) ? planObj.new_fact_candidates : [],
        truth_context_pack_v1: planObj?.truth_context_pack_v1 ?? null,
        pre_chapter_profile_v1: planObj?.pre_chapter_profile_v1 ?? null,
        analysis_delta_report_v1: planObj?.analysis_delta_report_v1 ?? null,
        entity_merge_challenge_v1: Array.isArray(planObj?.entity_merge_challenge_v1) ? planObj.entity_merge_challenge_v1 : [],
        entity_resolution_cache_v1: planObj?.entity_resolution_cache_v1 ?? null,
        final_review_ready: false,
        timeline_events: [
          buildArtifactPreviewEvent({
            storyId,
            chapterId,
            artifactId: `plan:${chapterId}`,
            artifactType: "plan",
            title: `Chapter ${chapterId} Plan`,
            status: "needs_approval",
            beatCount: Array.isArray(planObj?.beats) ? planObj.beats.length : null,
            previewLines: ["Plan created, but it needs review before writing can continue."],
            actions: ["open_full", "edit", "regenerate"],
          }),
          buildFailureRecoveryEvent({
            storyId,
            chapterId,
            workflowName: "Chapter Write",
            stoppedAtStep: "Planning",
            reason: blockingReason,
            fallbackReason: "The chapter plan needs review before writing can continue.",
            draftPreserved: false,
            detailLog: [blockingReason],
          }),
          buildApprovalGateEvent({
            storyId,
            chapterId,
            gateType: "approve_plan",
            description: "This plan needs your review before I can continue writing.",
            actions: ["open_full", "edit", "regenerate"],
          }),
        ],
      });
    }
    const writingResult = await enqueueCanonicalChapterWriteV3({
      storyId,
      chapterId,
      plan: planResult.plan,
      userPrompt,
      targetWordCount,
    });
    console.info(
      "[writing.auto_write.accepted]",
      JSON.stringify({
        story_id: storyId,
        chapter_id: chapterId,
        job_id: writingResult.job_id ?? null,
        task_type: writingResult.task_type,
        latency_ms: Date.now() - startedAt,
      })
    );
    return NextResponse.json({
      ok: true,
      chapter_id: chapterId,
      job_id: writingResult.job_id ?? null,
      status: writingResult.status,
      task_type: writingResult.task_type,
      plan: planResult.plan,
      chapter_output_contract_v1:
        (planResult.plan && typeof planResult.plan === "object" && !Array.isArray(planResult.plan) && (planResult.plan as Record<string, unknown>).chapter_output_contract_v1)
          ? (planResult.plan as Record<string, unknown>).chapter_output_contract_v1
          : buildChapterOutputContractV1(targetWordCount),
      memory_runtime_v5:
        (planResult.plan && typeof planResult.plan === "object" && !Array.isArray(planResult.plan) && (planResult.plan as Record<string, unknown>).memory_runtime_v5)
          ? (planResult.plan as Record<string, unknown>).memory_runtime_v5
          : null,
      final_review_ready: false,
      writing_intent_mode: writingIntentMode,
      retcon_accepted: Boolean(planObj?.retcon_accepted),
      truth_context_pack_v1: planObj?.truth_context_pack_v1 ?? null,
      pre_chapter_profile_v1: planObj?.pre_chapter_profile_v1 ?? null,
      analysis_delta_report_v1: planObj?.analysis_delta_report_v1 ?? null,
      entity_merge_challenge_v1: Array.isArray(planObj?.entity_merge_challenge_v1) ? planObj.entity_merge_challenge_v1 : [],
      timeline_events: [
        buildWorkflowProgressEvent({
          storyId,
          chapterId,
          jobId: writingResult.job_id ?? null,
          workflowName: "Chapter Write",
          jobStatus: writingResult.status,
          currentStepLabel: "Write chapter draft",
          steps: [
            { label: "Create chapter plan", status: "complete" },
            { label: "Write chapter draft", status: "active" },
            { label: "Extract chapter ledger", status: "pending" },
            { label: "Update memory rollup", status: "pending" },
          ],
        }),
        buildArtifactPreviewEvent({
          storyId,
          chapterId,
          jobId: writingResult.job_id ?? null,
          artifactId: `plan:${chapterId}`,
          artifactType: "plan",
          title: `Chapter ${chapterId} Plan`,
          status: "draft",
          beatCount: Array.isArray(planObj?.beats) ? planObj.beats.length : null,
          previewLines: ["Plan created and writing has started."],
          actions: ["open_full", "edit", "regenerate"],
        }),
      ],
    });
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "AUTO_WRITE_FAILED");
    const status = msg.includes("BLOCKED_BY_CANON_CONFLICT") || msg.includes("BLOCKED_BY_CONFLICT_REVIEW") ? 409 : 500;
    console.error(
      "[writing.auto_write.failed]",
      JSON.stringify({
        chapter_id: chapterId,
        latency_ms: Date.now() - startedAt,
        error: msg,
        stack: error instanceof Error ? error.stack : null,
      })
    );
    return NextResponse.json({
      ok: false,
      error: msg,
      timeline_events: [
        buildFailureRecoveryEvent({
          storyId: null,
          chapterId,
          workflowName: "Chapter Write",
          stoppedAtStep: "Preflight",
          reason: msg,
          fallbackReason: "The writing run stopped before it could start.",
          draftPreserved: false,
          detailLog: [msg],
        }),
      ],
    }, { status });
  }
}

export async function postChapterExecuteResponse(req: NextRequest, storySlug: string, chapterId: string): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    if (!isWritingV2ProductionEnabled()) {
      return NextResponse.json({ ok: false, error: "WRITING_V2_DISABLED" }, { status: 409 });
    }
    const body = await req.json();
    const plan = body.plan;
    if (!plan) return NextResponse.json({ ok: false, error: "MISSING_PLAN" }, { status: 400 });
    const blockedByConflictReview = Boolean(plan?.blocked_by_conflict_review);
    const blockedByCanonConflict = Boolean(plan?.blocked_by_canon_conflict);
    if (blockedByConflictReview || blockedByCanonConflict) {
      return NextResponse.json({
        ok: false,
        error: String(plan?.blocked_reason || (blockedByConflictReview ? "BLOCKED_BY_CONFLICT_REVIEW" : "BLOCKED_BY_CANON_CONFLICT")),
      }, { status: 409 });
    }

    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const result = await enqueueCanonicalChapterWriteV3({
      storyId,
      chapterId,
      plan,
      userPrompt: "",
      targetWordCount: targetWordCountFromPlan(plan, 1500),
    });
    console.info(
      "[writing.execute.accepted]",
      JSON.stringify({
        story_id: storyId,
        chapter_id: chapterId,
        job_id: result.job_id ?? null,
        task_type: result.task_type,
        latency_ms: Date.now() - startedAt,
        llm_tokens: null,
      })
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "EXECUTE_FAILED");
    console.error(
      "[writing.execute.failed]",
      JSON.stringify({
        chapter_id: chapterId,
        task_type: "CHAPTER_WRITE_V3",
        latency_ms: Date.now() - startedAt,
        error: msg,
      })
    );
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function postChapterExecuteControlResponse(req: NextRequest, storySlug: string, chapterId: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    if (!isWritingV2ProductionEnabled()) {
      return NextResponse.json({ ok: false, error: "WRITING_V2_DISABLED" }, { status: 409 });
    }
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    const jobId = Number(body.job_id || 0);
    if (!["pause", "abort"].includes(action)) {
      return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
    }
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_JOB_ID" }, { status: 400 });
    }

    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const jobRes = await client.query<{ id: number; status: string }>(
      `SELECT id, status
       FROM public.ingest_job
       WHERE id = $1
         AND story_id = $2
         AND mode IN ('AUTO_CHAPTER', 'AUTO_CHAPTER_V3')
         AND COALESCE(config_json->>'chapter_id', '') = $3
       LIMIT 1`,
      [jobId, storyId, chapterId]
    );
    if ((jobRes.rowCount ?? 0) === 0) {
      return NextResponse.json({
        ok: false,
        error: "JOB_NOT_FOUND",
        timeline_events: [
          buildFailureRecoveryEvent({
            storyId,
            chapterId,
            workflowName: "Chapter Write",
            stoppedAtStep: "Status lookup",
            reason: "JOB_NOT_FOUND",
            fallbackReason: "I couldn't find the writing run for this chapter.",
            draftPreserved: false,
            detailLog: ["JOB_NOT_FOUND"],
          }),
        ],
      }, { status: 404 });
    }
    const currentStatus = String(jobRes.rows[0].status || "").toUpperCase();
    if (["DONE", "FAILED", "CANCELLED"].includes(currentStatus)) {
      return NextResponse.json({ ok: false, error: `JOB_ALREADY_${currentStatus}` }, { status: 409 });
    }

    await client.query("BEGIN");
    if (action === "pause") {
      await client.query(
        `UPDATE public.ingest_job
         SET status = 'PAUSED', updated_at = now()
         WHERE id = $1`,
        [jobId]
      );
      const taskRes = await client.query<{ count: string }>(
        `WITH updated AS (
           UPDATE public.ingest_task
           SET status = 'PAUSED', updated_at = now()
           WHERE job_id = $1
             AND status IN ('PENDING', 'READY')
           RETURNING 1
         )
         SELECT COUNT(*)::text AS count FROM updated`,
        [jobId]
      );
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, job_id: jobId, status: "PAUSED", paused_tasks: Number(taskRes.rows[0]?.count || 0) });
    }

    await client.query(
      `UPDATE public.ingest_job
       SET status = 'CANCELLED', updated_at = now()
       WHERE id = $1`,
      [jobId]
    );
    const cancelRes = await client.query<{ count: string }>(
      `WITH updated AS (
         UPDATE public.ingest_task
         SET status = 'CANCELLED',
             error = COALESCE(NULLIF(error, ''), 'JOB_CANCELLED_BY_USER'),
             updated_at = now()
         WHERE job_id = $1
           AND status IN ('PENDING', 'READY', 'RUNNING', 'PAUSED')
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM updated`,
      [jobId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, job_id: jobId, status: "CANCELLED", cancelled_tasks: Number(cancelRes.rows[0]?.count || 0) });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = getScenesApiErrorMessage(error, "WRITING_CONTROL_FAILED");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function getChapterWritingStatusResponse(req: NextRequest, storySlug: string, chapterId: string): Promise<NextResponse> {
  try {
    if (!isWritingV2ProductionEnabled()) {
      return NextResponse.json({ ok: false, error: "WRITING_V2_DISABLED" }, { status: 409 });
    }
    const storyId = await resolveStoryId(pool, storySlug);
    const jobIdRaw = req.nextUrl.searchParams.get("job_id");
    const requestedJobId = Number(jobIdRaw || 0);

    const jobRes = requestedJobId > 0
      ? await pool.query<{
        id: number;
        status: string;
        total_tasks: number | null;
        completed_tasks: number | null;
      }>(
        `SELECT id, status, total_tasks, completed_tasks
         FROM public.ingest_job
         WHERE id = $1
           AND story_id = $2
           AND mode IN ('AUTO_CHAPTER', 'AUTO_CHAPTER_V3')
         LIMIT 1`,
        [requestedJobId, storyId]
      )
      : await pool.query<{
        id: number;
        status: string;
        total_tasks: number | null;
        completed_tasks: number | null;
      }>(
        `SELECT id, status, total_tasks, completed_tasks
         FROM public.ingest_job
         WHERE story_id = $1
           AND mode IN ('AUTO_CHAPTER', 'AUTO_CHAPTER_V3')
           AND COALESCE(config_json->>'chapter_id', '') = $2
         ORDER BY id DESC
         LIMIT 1`,
        [storyId, chapterId]
      );

    if ((jobRes.rowCount ?? 0) === 0) {
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const job = jobRes.rows[0];
    const taskProgressRes = await pool.query<{
      done_count: string;
      total_count: string;
      latest_task_type: string | null;
      latest_task_status: string | null;
      latest_task_error: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'DONE')::text AS done_count,
         COUNT(*)::text AS total_count,
         (array_agg(task_type ORDER BY seq_no DESC, id DESC))[1] AS latest_task_type,
         (array_agg(status ORDER BY seq_no DESC, id DESC))[1] AS latest_task_status,
         (array_agg(error ORDER BY seq_no DESC, id DESC))[1] AS latest_task_error
       FROM public.ingest_task
       WHERE job_id = $1`,
      [job.id]
    );
    const progress = taskProgressRes.rows[0] ?? {
      done_count: "0",
      total_count: "0",
      latest_task_type: null,
      latest_task_status: null,
      latest_task_error: null,
    };
    const doneTasks = Number(progress.done_count || 0);
    const totalTasks = Number(progress.total_count || 0);
    const narrativeTaskRows = await pool.query<{
      id: number;
      seq_no: number | null;
      task_type: string;
      status: string;
      payload_json: unknown;
      result_json: unknown;
      error: string | null;
      updated_at: string;
    }>(
      `SELECT id, seq_no, task_type, status, payload_json, result_json, error, updated_at::text AS updated_at
       FROM public.ingest_task
       WHERE job_id = $1
         AND task_type IN (
           'CHAPTER_WRITE_V3',
           'CHAPTER_LEDGER_EXTRACT',
           'MEMORY_ROLLUP_V3',
           'NARRATIVE_START',
           'NARRATIVE_STYLIST',
           'NARRATIVE_CRITIC',
           'NARRATIVE_REFINE',
           'NARRATIVE_FINALIZE'
         )
       ORDER BY seq_no ASC NULLS LAST, id ASC`,
      [job.id]
    ).catch(() => ({
      rowCount: 0,
      rows: [] as Array<{
        id: number;
        seq_no: number | null;
        task_type: string;
        status: string;
        payload_json: unknown;
        result_json: unknown;
        error: string | null;
        updated_at: string;
      }>,
    }));

    const stagingRes = await pool.query<{
      llm_prose: string | null;
      user_prose: string | null;
      status: string | null;
      plan_json: unknown;
    }>(
      `SELECT llm_prose, user_prose, status, plan_json
       FROM public.narrative_chapter_staging
       WHERE story_id = $1 AND chapter_id = $2
       LIMIT 1`,
      [storyId, chapterId]
    );
    const staging = stagingRes.rows[0];
    const draftRes = await pool.query<{
      full_text: string | null;
      status: string | null;
      metadata_json: unknown;
    }>(
      `SELECT full_text, status, metadata_json
       FROM public.chapter_draft
       WHERE story_id = $1 AND chapter_id = $2
       ORDER BY version_no DESC
       LIMIT 1`,
      [storyId, chapterId]
    ).catch(() => ({
      rowCount: 0,
      rows: [] as Array<{
        full_text: string | null;
        status: string | null;
        metadata_json: unknown;
      }>,
    }));
    const draft = draftRes.rows[0] ?? null;
    const jobStatus = String(job.status || "").toUpperCase();
    const draftProse = (draft?.full_text || "").trim();
    const stagingProse = (staging?.llm_prose || "").trim();
    const prose = draftProse || stagingProse;
    const proseSource = draftProse ? "chapter_draft.full_text" : stagingProse ? "narrative_chapter_staging.llm_prose" : null;
    const proseReady = jobStatus === "DONE" && prose.length > 0;
    const wordCount = proseReady ? prose.split(/\s+/).filter(Boolean).length : 0;

    const stagingPlanJson = staging?.plan_json && typeof staging.plan_json === "object" && !Array.isArray(staging.plan_json)
      ? (staging.plan_json as Record<string, unknown>)
      : null;
    const jobConfigRes = await pool.query<{ config_json: unknown }>(
      `SELECT config_json
       FROM public.ingest_job
       WHERE id = $1
       LIMIT 1`,
      [job.id]
    );
    const jobConfig = jobConfigRes.rows[0]?.config_json && typeof jobConfigRes.rows[0].config_json === "object" && !Array.isArray(jobConfigRes.rows[0].config_json)
      ? (jobConfigRes.rows[0].config_json as Record<string, unknown>)
      : {};
    const jobPlanRaw = jobConfig?.plan;
    const jobPlan =
      jobPlanRaw && typeof jobPlanRaw === "object" && !Array.isArray(jobPlanRaw)
        ? (jobPlanRaw as Record<string, unknown>)
        : null;
    const planJson = stagingPlanJson || jobPlan;
    const chapterOutputContractV1 =
      (planJson?.chapter_output_contract_v1 && typeof planJson.chapter_output_contract_v1 === "object" && !Array.isArray(planJson.chapter_output_contract_v1))
        ? (planJson.chapter_output_contract_v1 as Record<string, unknown>)
        : (
          jobConfig?.chapter_output_contract_v1 && typeof jobConfig.chapter_output_contract_v1 === "object" && !Array.isArray(jobConfig.chapter_output_contract_v1)
            ? (jobConfig.chapter_output_contract_v1 as Record<string, unknown>)
            : buildChapterOutputContractV1(1500)
        );
    const memoryRuntimeV5 =
      (planJson?.memory_runtime_v5 && typeof planJson.memory_runtime_v5 === "object" && !Array.isArray(planJson.memory_runtime_v5))
        ? (planJson.memory_runtime_v5 as Record<string, unknown>)
        : {};
    const contextGuardRaw = planJson?.context_guard;
    const contextGuard = contextGuardRaw && typeof contextGuardRaw === "object" && !Array.isArray(contextGuardRaw)
      ? (contextGuardRaw as Record<string, unknown>)
      : null;
    const locationAnchor = typeof contextGuard?.location_anchor === "string" ? contextGuard.location_anchor.trim() : "";
    const importantObjects = Array.isArray(contextGuard?.important_objects)
      ? contextGuard.important_objects.map((x: unknown) => String(x || "").trim()).filter(Boolean)
      : [];
    const proseLower = prose.toLowerCase();
    const trackedObjects = proseReady
      ? importantObjects.filter((obj: string) => proseLower.includes(obj.toLowerCase()))
      : [];
    const locationVerified = proseReady && locationAnchor
      ? proseLower.includes(locationAnchor.toLowerCase())
      : false;

    const integrityReport = proseReady ? {
      location_verified: locationVerified,
      objects_tracked: trackedObjects,
      character_drift_detected: false,
    } : null;
    const historianRes = await pool.query<{
      fact_status: string;
      narrative_score: string | number | null;
      emotional_target: string | null;
      open_loops: unknown;
      lore_debt: boolean;
      snapshot_json: unknown;
      created_at: string;
    }>(
      `SELECT fact_status, narrative_score::text, emotional_target, open_loops, lore_debt, snapshot_json, created_at
       FROM public.writing_snapshot_v3
       WHERE story_id = $1
         AND chapter_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [storyId, chapterId]
    ).catch(() => ({
      rowCount: 0, rows: [] as Array<{
        fact_status: string;
        narrative_score: string | number | null;
        emotional_target: string | null;
        open_loops: unknown;
        lore_debt: boolean;
        snapshot_json: unknown;
        created_at: string;
      }>
    }));
    const historianRow = Number(historianRes.rowCount ?? 0) > 0 ? historianRes.rows[0] : null;
    const historianSnapshot = historianRow
      ? {
        fact_status: historianRow.fact_status,
        narrative_score: Number(historianRow.narrative_score || 0),
        emotional_target: historianRow.emotional_target,
        open_loops: Array.isArray(historianRow.open_loops) ? historianRow.open_loops : [],
        lore_debt: Boolean(historianRow.lore_debt),
        created_at: historianRow.created_at,
        snapshot_v3:
          historianRow.snapshot_json && typeof historianRow.snapshot_json === "object" && !Array.isArray(historianRow.snapshot_json)
            ? (historianRow.snapshot_json as Record<string, unknown>)
            : {},
      }
      : null;
    const cutoverRes = await pool.query<{
      cutover_stage: string;
      parity_window_stats: unknown;
    }>(
      `SELECT cutover_stage, parity_window_stats
       FROM public.autowrite_cutover_state_v1
       WHERE story_id = $1
       LIMIT 1`,
      [storyId]
    ).catch(() => ({
      rowCount: 0,
      rows: [] as Array<{
        cutover_stage: string;
        parity_window_stats: unknown;
      }>,
    }));
    const cutoverRow = Number(cutoverRes.rowCount ?? 0) > 0 ? cutoverRes.rows[0] : null;
    const qualityGateReportV1 = computeQualityGateReportV1({
      proseReady,
      proseWordCount: wordCount,
      contract: {
        word_range: {
          min: Number(((chapterOutputContractV1.word_range as Record<string, unknown> | undefined)?.min) || 0),
          target: Number(((chapterOutputContractV1.word_range as Record<string, unknown> | undefined)?.target) || 0),
          max: Number(((chapterOutputContractV1.word_range as Record<string, unknown> | undefined)?.max) || 0),
        },
        scene_range: {
          min: Number(((chapterOutputContractV1.scene_range as Record<string, unknown> | undefined)?.min) || 0),
          max: Number(((chapterOutputContractV1.scene_range as Record<string, unknown> | undefined)?.max) || 0),
        },
        pacing_target: String(chapterOutputContractV1.pacing_target || ""),
        voice_target: String(chapterOutputContractV1.voice_target || ""),
        taboo_constraints: Array.isArray(chapterOutputContractV1.taboo_constraints)
          ? chapterOutputContractV1.taboo_constraints.map((x) => String(x || "").trim()).filter(Boolean)
          : [],
      },
      integrityReport,
      historianSnapshot,
      memoryRuntimeV5,
    });
    const blockedByConflictReview = Boolean(planJson?.blocked_by_conflict_review);
    const blockedByCanonConflict = Boolean(planJson?.blocked_by_canon_conflict);
    const blockingReason = typeof planJson?.blocked_reason === "string" ? String(planJson.blocked_reason) : null;
    const writingIntentMode = String(planJson?.writing_intent_mode || "CONTINUE_CANON");
    const retconAccepted = Boolean(planJson?.retcon_accepted);
    const finalReviewReady = proseReady && qualityGateReportV1.pass && jobStatus === "DONE" && !blockedByConflictReview && !blockedByCanonConflict;
    const conflictReportV1 =
      (planJson?.conflict_report_v1 && typeof planJson.conflict_report_v1 === "object" && !Array.isArray(planJson.conflict_report_v1))
        ? (planJson.conflict_report_v1 as Record<string, unknown>)
        : null;
    const resolutionStatus = typeof planJson?.resolution_status === "string" ? String(planJson.resolution_status) : null;
    const entityAssignments = Array.isArray(planJson?.entity_assignments) ? planJson?.entity_assignments : [];
    const planningInputPackJson = {
      source: "PERSISTED_PLAN_AND_JOB_CONFIG",
      job_id: job.id,
      chapter_id: chapterId,
      story_id: storyId,
      chapter_output_contract_v1: chapterOutputContractV1,
      memory_runtime_v5: memoryRuntimeV5,
      memory_pack_signature:
        typeof memoryRuntimeV5.memory_pack_signature === "string"
          ? String(memoryRuntimeV5.memory_pack_signature)
          : null,
      evidence_refs:
        memoryRuntimeV5.evidence_refs && typeof memoryRuntimeV5.evidence_refs === "object"
          ? memoryRuntimeV5.evidence_refs
          : null,
      plan_source: stagingPlanJson ? "narrative_chapter_staging.plan_json" : jobPlan ? "ingest_job.config_json.plan" : "none",
    } as Record<string, unknown>;

    const planningOutputJson =
      (planJson && typeof planJson === "object")
        ? planJson
        : (jobPlan && typeof jobPlan === "object" ? jobPlan : null);

    const narrativeTasks = narrativeTaskRows.rows.map((row) => {
      const payload =
        row.payload_json && typeof row.payload_json === "object" && !Array.isArray(row.payload_json)
          ? (row.payload_json as Record<string, unknown>)
          : null;
      const result =
        row.result_json && typeof row.result_json === "object" && !Array.isArray(row.result_json)
          ? (row.result_json as Record<string, unknown>)
          : null;
      return {
        id: row.id,
        seq_no: row.seq_no,
        task_type: row.task_type,
        status: row.status,
        payload_json: payload,
        result_json: result,
        error: row.error,
        updated_at: row.updated_at,
      };
    });
    const timelineEvents = buildChapterWritingTimelineEvents({
      storyId,
      chapterId,
      jobId: job.id,
      jobStatus,
      doneTasks,
      totalTasks,
      latestTaskType: progress.latest_task_type,
      latestTaskStatus: progress.latest_task_status,
      latestTaskError: progress.latest_task_error,
      narrativeTasks,
      proseReady,
      wordCount,
      planJson,
      memoryRuntimeV5,
      finalReviewReady,
      blockedByConflictReview,
      blockedByCanonConflict,
      blockingReason,
    });
    const proseTaskTypes = new Set(["CHAPTER_WRITE_V3", "NARRATIVE_STYLIST", "NARRATIVE_CRITIC", "NARRATIVE_REFINE", "NARRATIVE_FINALIZE"]);
    const reversedNarrativeTasks = [...narrativeTasks].reverse();
    const latestProseInputTask = reversedNarrativeTasks.find(
      (taskRow) => proseTaskTypes.has(String(taskRow.task_type || "").toUpperCase()) && !!taskRow.payload_json
    ) ?? null;
    const latestProseOutputTask = reversedNarrativeTasks.find(
      (taskRow) => proseTaskTypes.has(String(taskRow.task_type || "").toUpperCase()) && !!taskRow.result_json
    ) ?? null;

    const proseInputPackJson = latestProseInputTask
      ? {
        source: "INGEST_TASK_PAYLOAD",
        task_id: latestProseInputTask.id,
        task_type: latestProseInputTask.task_type,
        task_status: latestProseInputTask.status,
        updated_at: latestProseInputTask.updated_at,
        payload_json: latestProseInputTask.payload_json,
      }
      : null;
    const proseOutputJson = {
      source: "INGEST_TASK_RESULT_AND_STAGING",
      latest_result_task: latestProseOutputTask
        ? {
          task_id: latestProseOutputTask.id,
          task_type: latestProseOutputTask.task_type,
          task_status: latestProseOutputTask.status,
          updated_at: latestProseOutputTask.updated_at,
          error: latestProseOutputTask.error,
          result_json: latestProseOutputTask.result_json,
        }
        : null,
      staging_output: {
        staging_status: staging?.status ?? null,
        llm_prose: staging?.llm_prose ?? null,
        user_prose: staging?.user_prose ?? null,
      },
      chapter_draft_output: {
        draft_status: draft?.status ?? null,
        prose_source: proseSource,
        full_text: draft?.full_text ?? null,
        metadata_json:
          draft?.metadata_json && typeof draft.metadata_json === "object" && !Array.isArray(draft.metadata_json)
            ? (draft.metadata_json as Record<string, unknown>)
            : null,
      },
    };

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      status: jobStatus,
      progress: {
        done_tasks: doneTasks,
        total_tasks: totalTasks,
      },
      latest_task: {
        task_type: progress.latest_task_type,
        status: progress.latest_task_status,
        error: progress.latest_task_error,
      },
      staging_ready: proseReady,
      prose_source: proseSource,
      prose: proseReady ? prose : "",
      word_count: wordCount,
      integrity_report: integrityReport,
      historian_snapshot: historianSnapshot,
      chapter_output_contract_v1: chapterOutputContractV1,
      memory_runtime_v5: memoryRuntimeV5,
      memory_pack_signature:
        typeof (memoryRuntimeV5.memory_pack_signature) === "string" ? String(memoryRuntimeV5.memory_pack_signature) : null,
      quality_gate_report_v1: qualityGateReportV1,
      final_review_ready: finalReviewReady,
      conflict_report_v1: conflictReportV1,
      blocked_by_conflict_review: blockedByConflictReview,
      blocked_by_canon_conflict: blockedByCanonConflict,
      blocking_reason: blockingReason,
      resolution_status: resolutionStatus,
      writing_intent_mode: writingIntentMode,
      retcon_accepted: retconAccepted,
      entity_assignments: entityAssignments,
      fact_lifecycle_v1:
        (planJson?.fact_lifecycle_v1 && typeof planJson.fact_lifecycle_v1 === "object" && !Array.isArray(planJson.fact_lifecycle_v1))
          ? (planJson.fact_lifecycle_v1 as Record<string, unknown>)
          : null,
      canon_delta_report_v1:
        (planJson?.canon_delta_report_v1 && typeof planJson.canon_delta_report_v1 === "object" && !Array.isArray(planJson.canon_delta_report_v1))
          ? (planJson.canon_delta_report_v1 as Record<string, unknown>)
          : null,
      truth_context_pack_v1:
        (planJson?.truth_context_pack_v1 && typeof planJson.truth_context_pack_v1 === "object" && !Array.isArray(planJson.truth_context_pack_v1))
          ? (planJson.truth_context_pack_v1 as Record<string, unknown>)
          : null,
      pre_chapter_profile_v1:
        (planJson?.pre_chapter_profile_v1 && typeof planJson.pre_chapter_profile_v1 === "object" && !Array.isArray(planJson.pre_chapter_profile_v1))
          ? (planJson.pre_chapter_profile_v1 as Record<string, unknown>)
          : null,
      post_chapter_profile_v1:
        (planJson?.post_chapter_profile_v1 && typeof planJson.post_chapter_profile_v1 === "object" && !Array.isArray(planJson.post_chapter_profile_v1))
          ? (planJson.post_chapter_profile_v1 as Record<string, unknown>)
          : null,
      analysis_delta_report_v1:
        (planJson?.analysis_delta_report_v1 && typeof planJson.analysis_delta_report_v1 === "object" && !Array.isArray(planJson.analysis_delta_report_v1))
          ? (planJson.analysis_delta_report_v1 as Record<string, unknown>)
          : null,
      entity_merge_challenge_v1:
        Array.isArray(planJson?.entity_merge_challenge_v1) ? planJson.entity_merge_challenge_v1 : [],
      entity_resolution_cache_v1:
        (planJson?.entity_resolution_cache_v1 && typeof planJson.entity_resolution_cache_v1 === "object" && !Array.isArray(planJson.entity_resolution_cache_v1))
          ? (planJson.entity_resolution_cache_v1 as Record<string, unknown>)
          : null,
      conflict_root_cause_v1:
        (planJson?.conflict_root_cause_v1 && typeof planJson.conflict_root_cause_v1 === "object" && !Array.isArray(planJson.conflict_root_cause_v1))
          ? (planJson.conflict_root_cause_v1 as Record<string, unknown>)
          : null,
      reanalysis_actions_v1:
        (planJson?.reanalysis_actions_v1 && typeof planJson.reanalysis_actions_v1 === "object" && !Array.isArray(planJson.reanalysis_actions_v1))
          ? (planJson.reanalysis_actions_v1 as Record<string, unknown>)
          : null,
      conflict_resolution_mode:
        typeof planJson?.conflict_resolution_mode === "string" ? String(planJson.conflict_resolution_mode) : null,
      delta_classification:
        typeof planJson?.delta_classification === "string" ? String(planJson.delta_classification) : null,
      superseded_fact_refs:
        Array.isArray(planJson?.superseded_fact_refs) ? planJson.superseded_fact_refs : [],
      new_fact_candidates:
        Array.isArray(planJson?.new_fact_candidates) ? planJson.new_fact_candidates : [],
      plan_continuity_gate_v1:
        (planJson?.plan_continuity_gate_v1 && typeof planJson.plan_continuity_gate_v1 === "object" && !Array.isArray(planJson.plan_continuity_gate_v1))
          ? (planJson.plan_continuity_gate_v1 as Record<string, unknown>)
          : null,
      canonical_diff_preview:
        (planJson?.canonical_diff_preview && typeof planJson.canonical_diff_preview === "object" && !Array.isArray(planJson.canonical_diff_preview))
          ? (planJson.canonical_diff_preview as Record<string, unknown>)
          : null,
      character_state_cards_used:
        Array.isArray(planJson?.character_state_cards_used) ? planJson.character_state_cards_used : [],
      continuity_evidence_refs:
        Array.isArray(planJson?.continuity_evidence_refs) ? planJson.continuity_evidence_refs : [],
      planning_input_pack_json: planningInputPackJson,
      planning_output_json: planningOutputJson,
      prose_input_pack_json: proseInputPackJson,
      prose_output_json: proseOutputJson,
      cutover_stage: cutoverRow?.cutover_stage ?? "STAGE_1_SHADOW",
      cutover_parity_window_stats:
        cutoverRow?.parity_window_stats && typeof cutoverRow.parity_window_stats === "object" && !Array.isArray(cutoverRow.parity_window_stats)
          ? (cutoverRow.parity_window_stats as Record<string, unknown>)
          : {},
      timeline_events: timelineEvents,
    });
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "WRITING_STATUS_FAILED");
    return NextResponse.json({
      ok: false,
      error: msg,
      timeline_events: [
        buildFailureRecoveryEvent({
          storyId: null,
          chapterId,
          workflowName: "Chapter Write",
          stoppedAtStep: "Status lookup",
          reason: msg,
          fallbackReason: "I couldn't read the writing run status.",
          draftPreserved: false,
          detailLog: [msg],
        }),
      ],
    }, { status: 500 });
  }
}

export async function postChapterAutoWriteRetryResponse(req: NextRequest, storySlug: string, chapterId: string): Promise<NextResponse> {
  try {
    if (!isWritingV2ProductionEnabled()) {
      return NextResponse.json({ ok: false, error: "WRITING_V2_DISABLED" }, { status: 409 });
    }
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "refine").trim().toLowerCase();
    const forceReplan = mode === "replan";
    const targetWordCount = Number(body.target_word_count || 1500);
    const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt : "";
    const writingIntentMode = parseWritingIntentMode((body as Record<string, unknown>).writing_intent_mode);
    const storyId = await resolveStoryIdForWrite(pool, storySlug);

    let plan: Record<string, unknown> | null = null;
    if (!forceReplan) {
      const stagingRes = await pool.query<{ plan_json: unknown }>(
        `SELECT plan_json
         FROM public.narrative_chapter_staging
         WHERE story_id = $1 AND chapter_id = $2
         LIMIT 1`,
        [storyId, chapterId]
      );
      const row = stagingRes.rows[0];
      if (row?.plan_json && typeof row.plan_json === "object" && !Array.isArray(row.plan_json)) {
        plan = row.plan_json as Record<string, unknown>;
      }
      if (!plan) {
        const jobPlanRes = await pool.query<{ config_json: unknown }>(
          `SELECT config_json
           FROM public.ingest_job
           WHERE story_id = $1
             AND mode = 'AUTO_CHAPTER_V3'
             AND config_json->>'pipeline_type' = 'CHAPTER_WRITE_V3'
             AND COALESCE(config_json->>'chapter_id', '') = $2
           ORDER BY id DESC
           LIMIT 1`,
          [storyId, chapterId]
        );
        const configJson = jobPlanRes.rows[0]?.config_json;
        const jobConfig = configJson && typeof configJson === "object" && !Array.isArray(configJson)
          ? (configJson as Record<string, unknown>)
          : null;
        if (jobConfig?.plan && typeof jobConfig.plan === "object" && !Array.isArray(jobConfig.plan)) {
          plan = jobConfig.plan as Record<string, unknown>;
        }
      }
    }
    if (!plan) {
      const planResult = await runChapterPlanning(pool, {
        storyId,
        storySlug,
        chapterId,
        targetWordCount,
        userPrompt,
        writingIntentMode,
      });
      plan = planResult.plan as Record<string, unknown>;
    }
    const blockedByConflictReview = Boolean(plan?.blocked_by_conflict_review);
    const blockedByCanonConflict = Boolean(plan?.blocked_by_canon_conflict);
    if (blockedByConflictReview || blockedByCanonConflict) {
      return NextResponse.json({
        ok: true,
        mode: forceReplan ? "replan" : "refine",
        chapter_id: chapterId,
        status: blockedByConflictReview ? "BLOCKED_BY_CONFLICT_REVIEW" : "BLOCKED_BY_CANON_CONFLICT",
        blocking_reason: String(plan?.blocked_reason || (blockedByConflictReview ? "BLOCKED_BY_CONFLICT_REVIEW" : "BLOCKED_BY_CANON_CONFLICT")),
        plan,
        writing_intent_mode: writingIntentMode,
        retcon_accepted: Boolean(plan?.retcon_accepted),
        canon_delta_report_v1: plan?.canon_delta_report_v1 ?? null,
        conflict_root_cause_v1: plan?.conflict_root_cause_v1 ?? null,
        reanalysis_actions_v1: plan?.reanalysis_actions_v1 ?? null,
        conflict_resolution_mode: typeof plan?.conflict_resolution_mode === "string" ? String(plan.conflict_resolution_mode) : null,
        delta_classification: typeof plan?.delta_classification === "string" ? String(plan.delta_classification) : null,
        superseded_fact_refs: Array.isArray(plan?.superseded_fact_refs) ? plan.superseded_fact_refs : [],
        new_fact_candidates: Array.isArray(plan?.new_fact_candidates) ? plan.new_fact_candidates : [],
        truth_context_pack_v1: plan?.truth_context_pack_v1 ?? null,
        pre_chapter_profile_v1: plan?.pre_chapter_profile_v1 ?? null,
        analysis_delta_report_v1: plan?.analysis_delta_report_v1 ?? null,
        entity_merge_challenge_v1: Array.isArray(plan?.entity_merge_challenge_v1) ? plan.entity_merge_challenge_v1 : [],
        entity_resolution_cache_v1: plan?.entity_resolution_cache_v1 ?? null,
        final_review_ready: false,
      });
    }

    const writingResult = await enqueueCanonicalChapterWriteV3({
      storyId,
      chapterId,
      plan,
      userPrompt,
      targetWordCount,
    });

    return NextResponse.json({
      ok: true,
      mode: forceReplan ? "replan" : "refine",
      chapter_id: chapterId,
      job_id: writingResult.job_id ?? null,
      status: writingResult.status,
      task_type: writingResult.task_type,
      plan,
      chapter_output_contract_v1:
        (plan.chapter_output_contract_v1 && typeof plan.chapter_output_contract_v1 === "object" && !Array.isArray(plan.chapter_output_contract_v1))
          ? plan.chapter_output_contract_v1
          : buildChapterOutputContractV1(targetWordCount),
      final_review_ready: false,
      writing_intent_mode: writingIntentMode,
      retcon_accepted: Boolean(plan?.retcon_accepted),
      truth_context_pack_v1: plan?.truth_context_pack_v1 ?? null,
      pre_chapter_profile_v1: plan?.pre_chapter_profile_v1 ?? null,
      analysis_delta_report_v1: plan?.analysis_delta_report_v1 ?? null,
      entity_merge_challenge_v1: Array.isArray(plan?.entity_merge_challenge_v1) ? plan.entity_merge_challenge_v1 : [],
    });
  } catch (error: unknown) {
    const msg = getScenesApiErrorMessage(error, "AUTO_WRITE_RETRY_FAILED");
    const status = msg.includes("BLOCKED_BY_CANON_CONFLICT") || msg.includes("BLOCKED_BY_CONFLICT_REVIEW") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function postChapterSplitResponse(req: NextRequest, storySlug: string, chapterId: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const body = await req.json();
    const prose = body.prose;
    if (!prose) return NextResponse.json({ ok: false, error: "MISSING_PROSE" }, { status: 400 });

    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const chapterNoMatch = chapterId.match(/(\d+)/);
    const chapterNo = chapterNoMatch ? parseInt(chapterNoMatch[1], 10) : 1;

    // Use ingestJobsService logic but simplified
    // 1. Create source_doc
    // 2. Create ingest_job (SPLIT_DRAFT)
    // 3. Create ingest_task (CHAPTER_SPLIT_LLM)

    // Note: I'm essentially duplicating logic from ingestJobsService here for brevity and direct studio access.
    // In a mature system, I'd refactor ingestJobsService to export a lower-level 'createJob' helper.

    await client.query("BEGIN");
    const ingestRunId = "00000000-0000-0000-0000-000000000000"; // Trigger manual mode
    const textSha = createHash("sha256").update(prose, "utf8").digest("hex");

    const sourceDocRes = await client.query<{ id: string }>(
      `INSERT INTO public.source_doc (story_id, doc_type, raw_text, raw_text_sha256, char_len, origin)
       VALUES ($1, 'ingest_chapter', $2, $3, char_length($2), $4)
       ON CONFLICT (story_id, raw_text_sha256) DO UPDATE SET updated_at = now()
       RETURNING id::text`,
      [storyId, prose, textSha, JSON.stringify({ source_type: "autowrite_v2", chapter_id: chapterId })]
    );

    const jobIdRes = await client.query<{ id: number }>(
      `INSERT INTO public.ingest_job (story_id, created_by, status, mode, total_tasks, completed_tasks)
       VALUES ($1, 'autowrite_v2', 'SPLIT_DRAFT', 'AUTO_CHAPTER', 1, 0)
       RETURNING id`,
      [storyId]
    );
    const jobId = jobIdRes.rows[0].id;

    await client.query(
      `INSERT INTO public.ingest_task (job_id, story_id, task_type, unit_type, status, seq_no, payload_json, available_at)
       VALUES ($1, $2, 'CHAPTER_SPLIT_LLM', 'split_draft', 'READY', 1, $3, NOW())`,
      [jobId, storyId, JSON.stringify({
        chapter_id: chapterId,
        chapter_no: chapterNo,
        source_doc_id: sourceDocRes.rows[0].id,
        source_doc_sha256: textSha,
        split_mode: "auto"
      })]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, job_id: jobId });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json({ ok: false, error: "SPLIT_TRIGGER_FAILED" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function postChapterStageResponse(req: NextRequest, storySlug: string, chapterId: string): Promise<NextResponse> {
  try {
    const body = await req.json();
    const prose = body.prose;
    const plan = body.plan;
    if (!prose) return NextResponse.json({ ok: false, error: "MISSING_PROSE" }, { status: 400 });

    const storyId = await resolveStoryIdForWrite(pool, storySlug);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. DELETE stale scene ghosts for this chapter
      await client.query(
        `DELETE FROM public.narrative_scene WHERE story_id = $1 AND chapter_id = $2`,
        [storyId, chapterId]
      );

      // 2. UPSERT staging record
      await client.query(
        `INSERT INTO public.narrative_chapter_staging (story_id, chapter_id, llm_prose, user_prose, plan_json)
         VALUES ($1, $2, $3, $3, $4)
         ON CONFLICT (story_id, chapter_id) DO UPDATE
         SET llm_prose = EXCLUDED.llm_prose,
             user_prose = COALESCE(public.narrative_chapter_staging.user_prose, EXCLUDED.llm_prose),
             plan_json = EXCLUDED.plan_json,
             updated_at = now()`,
        [storyId, chapterId, prose, JSON.stringify(plan)]
      );

      await client.query("COMMIT");

      // TRIGGER RETCON
      await invalidateDownstream(client, storyId, chapterId);

      return NextResponse.json({ ok: true });
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: "STAGE_FAILED" }, { status: 500 });
  }
}

export async function postChapterResplitResponse(req: NextRequest, storySlug: string, chapterId: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const body = await req.json();
    const prose = body.prose;
    if (!prose) return NextResponse.json({ ok: false, error: "MISSING_PROSE" }, { status: 400 });

    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const chapterNoMatch = chapterId.match(/(\d+)/);
    const chapterNo = chapterNoMatch ? parseInt(chapterNoMatch[1], 10) : 1;

    await client.query("BEGIN");

    // 1. Delete existing scenes for this chapter to allow fresh split
    // WARNING: This is a destructive action as requested by the user flow "split chia Ä‘Ã´i / spliting láº¡i thÃ´i"
    await client.query(
      `DELETE FROM public.narrative_scene WHERE story_id = $1 AND chapter_id = $2`,
      [storyId, chapterId]
    );

    // 2. Standard split logic (reuse from postChapterSplitResponse pattern)
    const textSha = createHash("sha256").update(prose, "utf8").digest("hex");
    const sourceDocRes = await client.query<{ id: string }>(
      `INSERT INTO public.source_doc (story_id, doc_type, raw_text, raw_text_sha256, char_len, origin)
       VALUES ($1, 'ingest_chapter', $2, $3, char_length($2), $4)
       ON CONFLICT (story_id, raw_text_sha256) DO UPDATE SET updated_at = now()
       RETURNING id::text`,
      [storyId, prose, textSha, JSON.stringify({ source_type: "autowrite_v2_resplit", chapter_id: chapterId })]
    );

    const jobIdRes = await client.query<{ id: number }>(
      `INSERT INTO public.ingest_job (story_id, created_by, status, mode, total_tasks, completed_tasks)
       VALUES ($1, 'autowrite_v2', 'SPLIT_DRAFT', 'AUTO_CHAPTER', 1, 0)
       RETURNING id`,
      [storyId]
    );
    const jobId = jobIdRes.rows[0].id;

    await client.query(
      `INSERT INTO public.ingest_task (job_id, story_id, task_type, unit_type, status, seq_no, payload_json, available_at)
       VALUES ($1, $2, 'CHAPTER_SPLIT_LLM', 'split_draft', 'READY', 1, $3, NOW())`,
      [jobId, storyId, JSON.stringify({
        chapter_id: chapterId,
        chapter_no: chapterNo,
        source_doc_id: sourceDocRes.rows[0].id,
        source_doc_sha256: textSha,
        split_mode: "auto"
      })]
    );

    // 3. Update staging record to record the final user prose before learning
    await client.query(
      `UPDATE public.narrative_chapter_staging SET user_prose = $3, status = 'SPLIT' WHERE story_id = $1 AND chapter_id = $2`,
      [storyId, chapterId, prose]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, job_id: jobId });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json({ ok: false, error: "RESPLIT_FAILED" }, { status: 500 });
  } finally {
    client.release();
  }
}

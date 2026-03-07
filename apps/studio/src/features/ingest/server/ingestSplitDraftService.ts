import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";

function parseJobId(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_JOB_ID");
  return Math.floor(n);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeScenes(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object" && !Array.isArray(x))
    .map((x) => x as Record<string, unknown>);
}

function normalizeStrategyAttempts(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object" && !Array.isArray(x))
    .map((x) => x as Record<string, unknown>);
}

function excerptAt(text: string, at: number, radius = 80): string {
  if (!text) return "";
  const safeAt = Math.max(0, Math.min(at, text.length));
  const left = Math.max(0, safeAt - radius);
  const right = Math.min(text.length, safeAt + radius);
  return text.slice(left, right).replace(/\s+/g, " ").trim();
}

function buildSceneTextPreview(
  chapterText: string,
  start: number,
  end: number,
  chapterRawText?: string,
  sourceTrace?: {
    source_doc_sha256?: string | null;
    source_type?: string | null;
    source_role?: string | null;
  }
): {
  head_excerpt: string;
  tail_excerpt: string;
  scene_text: string;
  flags: string[];
  boundary_debug: Record<string, unknown>;
} {
  const safeStart = Math.max(0, Math.min(start, chapterText.length));
  const safeEnd = Math.max(safeStart, Math.min(end, chapterText.length));
  const sceneText = chapterText.slice(safeStart, safeEnd).trim();
  const head_excerpt = sceneText.slice(0, 220);
  const tail_excerpt = sceneText.slice(Math.max(0, sceneText.length - 220));
  const scene_text = sceneText;
  const flags: string[] = [];

  if (sceneText.length === 0) {
    flags.push("EMPTY_SCENE");
    return {
      head_excerpt,
      tail_excerpt,
      scene_text,
      flags,
      boundary_debug: {
        start_basis_ctx: excerptAt(chapterText, safeStart),
        end_basis_ctx: excerptAt(chapterText, safeEnd),
        start_raw_ctx: chapterRawText ? excerptAt(chapterRawText, safeStart) : "",
        end_raw_ctx: chapterRawText ? excerptAt(chapterRawText, safeEnd) : "",
        source_doc_sha256: sourceTrace?.source_doc_sha256 ?? null,
        source_type: sourceTrace?.source_type ?? null,
        source_role: sourceTrace?.source_role ?? null,
      },
    };
  }

  if (/^[a-z]/.test(sceneText)) flags.push("STARTS_LOWERCASE");
  if (/^[,.;:!?]/.test(sceneText)) flags.push("STARTS_WITH_PUNCT");
  if (!/[.!?…'"\)\]]$/.test(sceneText)) flags.push("ENDS_WITHOUT_TERMINAL_PUNCT");
  if (/[A-Za-z]{2,}$/.test(sceneText.slice(Math.max(0, sceneText.length - 12)))) flags.push("TAIL_LOOKS_CONTINUED");

  if (/^(And|But|Or|So|Because|Then|Yet)\b/.test(sceneText)) flags.push("CONJUNCTION_HEAD_CONTINUED");

  const prev = safeStart > 0 ? chapterText[safeStart - 1] : "";
  const first = safeStart < chapterText.length ? chapterText[safeStart] : "";
  const last = safeEnd > 0 ? chapterText[safeEnd - 1] : "";
  const next = safeEnd < chapterText.length ? chapterText[safeEnd] : "";
  const alpha = /[A-Za-z]/;
  if ((alpha.test(prev) && alpha.test(first)) || (alpha.test(last) && alpha.test(next))) {
    flags.push("MID_WORD_CUT");
  }
  const leftCtx = chapterText.slice(Math.max(0, safeStart - 24), safeStart);
  const rightCtx = chapterText.slice(safeStart, Math.min(chapterText.length, safeStart + 24));
  if (/\b(?:Mr|Mrs|Ms|Dr|Prof|St)\.\s*$/.test(leftCtx) && /^[A-Z][a-z]{1,20}\b/.test(rightCtx)) {
    flags.push("ABBREV_OR_NAME_CUT");
  }
  if (/["“‘]\s*$/.test(leftCtx) || /^["”’]/.test(rightCtx.trimStart())) {
    flags.push("QUOTE_CONTINUITY_BREAK");
  }
  return {
    head_excerpt,
    tail_excerpt,
    scene_text,
    flags,
    boundary_debug: {
      start_basis_ctx: excerptAt(chapterText, safeStart),
      end_basis_ctx: excerptAt(chapterText, safeEnd),
      start_raw_ctx: chapterRawText ? excerptAt(chapterRawText, safeStart) : "",
      end_raw_ctx: chapterRawText ? excerptAt(chapterRawText, safeEnd) : "",
      source_doc_sha256: sourceTrace?.source_doc_sha256 ?? null,
      source_type: sourceTrace?.source_type ?? null,
      source_role: sourceTrace?.source_role ?? null,
    },
  };
}

function enrichScenesWithPreview(
  rawScenes: Array<Record<string, unknown>>,
  chapterText: string,
  chapterRawText?: string,
  sourceTrace?: {
    source_doc_sha256?: string | null;
    source_type?: string | null;
    source_role?: string | null;
  }
): Array<Record<string, unknown>> {
  return rawScenes.map((scene) => {
    const start = Number(scene.start);
    const end = Number(scene.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return scene;
    const preview = buildSceneTextPreview(chapterText, Math.floor(start), Math.floor(end), chapterRawText, sourceTrace);
    const sceneTextSha =
      (typeof scene.scene_text_sha256 === "string" && scene.scene_text_sha256.trim().length > 0
        ? scene.scene_text_sha256
        : typeof scene.scene_text_sha === "string" && scene.scene_text_sha.trim().length > 0
          ? scene.scene_text_sha
          : preview.scene_text
            ? sha256Hex(preview.scene_text)
            : null) ?? null;
    return {
      ...scene,
      ...preview,
      scene_text_sha256: sceneTextSha,
    };
  });
}

function normalizeSplitMode(raw: unknown): "manual" | "auto" {
  return raw === "auto" ? "auto" : "manual";
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

type ChapterRow = {
  chapter_id?: string | null;
  scenes: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type HydrationTraceMeta = {
  prompt_version_id: number | null;
  hydration_output_hash: string | null;
  hydration_output_text: string | null;
  chunk_prompt_trace: Array<Record<string, unknown>>;
  trace_phase: string | null;
  trace_status: string | null;
  trace_source: string | null;
  trace_created_at: string | null;
  prompt_unavailable_reason: string | null;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x)).filter((x) => x.trim().length > 0);
}

function normalizeChunkPromptTrace(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object" && !Array.isArray(x))
    .map((x) => x as Record<string, unknown>);
}

function normalizeSupervisorDecision(value: unknown): "auto_pass" | "auto_retry_once" | "manual_review" {
  if (value === "manual_review" || value === "auto_retry_once") return value;
  return "auto_pass";
}

function normalizeReasonCodes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x.length > 0)
      .slice(0, 12);
  }
  if (typeof value === "string" && value.trim().length > 0) return [value.trim().slice(0, 120)];
  return [];
}

export async function getIngestSplitDraftResponse(storySlug: string, rawJobId: string): Promise<NextResponse> {
  try {
    const jobId = parseJobId(rawJobId);
    const storyId = await resolveStoryId(pool, storySlug);

    const jobRes = await pool.query<{
      id: number;
      ingest_run_id: string | null;
      status: string;
      split_draft_json: unknown;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, ingest_run_id::text, status, split_draft_json, created_at, updated_at
       FROM public.ingest_job
       WHERE id = $1 AND story_id = $2
       LIMIT 1`,
      [jobId, storyId]
    );
    if (jobRes.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const taskRes = await pool.query<{
      id: number;
      seq_no: number;
      status: string;
      payload_json: unknown;
      result_json: unknown;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, seq_no, status, payload_json, result_json, created_at, updated_at
       FROM public.ingest_task
       WHERE story_id = $1
         AND job_id = $2
         AND task_type = 'CHAPTER_SPLIT_LLM'
       ORDER BY seq_no ASC, id ASC`,
      [storyId, jobId]
    );

    const job = jobRes.rows[0];
    const splitDraft = asObject(job.split_draft_json);
    const hydrationByTask: Record<number, HydrationTraceMeta> = {};
    if (taskRes.rows.length > 0) {
      try {
        const taskIds = taskRes.rows.map((r) => Number(r.id)).filter((x) => Number.isFinite(x) && x > 0);
        if (taskIds.length > 0) {
          const hydrationRes = await pool.query<{
            task_id: number;
            prompt_version_id: number | null;
            hydration_output_hash: string | null;
            hydration_output_text: string | null;
            hydration_render_steps_json: unknown;
            llm_request_meta_json: unknown;
            created_at: string;
          }>(
            `SELECT task_id,
                    prompt_version_id,
                    hydration_output_hash,
                    hydration_output_text,
                    hydration_render_steps_json,
                    llm_request_meta_json,
                    created_at::text
             FROM (
               SELECT task_id,
                      prompt_version_id,
                      hydration_output_hash,
                      hydration_output_text,
                      hydration_render_steps_json,
                      llm_request_meta_json,
                      created_at,
                      ROW_NUMBER() OVER (
                        PARTITION BY task_id
                        ORDER BY
                          CASE UPPER(COALESCE(llm_request_meta_json->>'trace_phase',''))
                            WHEN 'POST_LLM' THEN 2
                            WHEN 'PRE_LLM' THEN 1
                            ELSE 0
                          END DESC,
                          created_at DESC,
                          id DESC
                      ) AS rn
               FROM public.agent_prompt_hydration_trace
               WHERE story_id = $1
                 AND task_id = ANY($2::bigint[])
                 AND agent_name = 'SPLITTER'
             ) t
             WHERE rn = 1`,
            [storyId, taskIds]
          );
          for (const row of hydrationRes.rows) {
            const renderSteps = asObject(row.hydration_render_steps_json);
            const llmMeta = asObject(row.llm_request_meta_json);
            const tracePhaseRaw = String(llmMeta.trace_phase || renderSteps.trace_phase || "").trim().toUpperCase();
            const traceStatusRaw = String(llmMeta.trace_status || renderSteps.trace_status || "").trim().toUpperCase();
            const traceSourceRaw = String(llmMeta.trace_source || renderSteps.trace_source || "").trim().toLowerCase();
            const chunkPromptTrace = normalizeChunkPromptTrace(renderSteps.chunk_prompt_trace);
            const promptText =
              typeof row.hydration_output_text === "string" && row.hydration_output_text.trim().length > 0
                ? row.hydration_output_text
                : null;
            const promptUnavailableReason =
              promptText
                ? null
                : tracePhaseRaw === "PRE_LLM"
                  ? "PROMPT_PENDING_PRE_LLM"
                  : tracePhaseRaw === "POST_LLM"
                    ? "PROMPT_EMPTY_POST_LLM"
                    : "PROMPT_UNAVAILABLE";
            hydrationByTask[row.task_id] = {
              prompt_version_id: row.prompt_version_id ?? null,
              hydration_output_hash: row.hydration_output_hash ?? null,
              hydration_output_text: promptText,
              chunk_prompt_trace: chunkPromptTrace,
              trace_phase: tracePhaseRaw || null,
              trace_status: traceStatusRaw || null,
              trace_source: traceSourceRaw || null,
              trace_created_at: row.created_at ?? null,
              prompt_unavailable_reason: promptUnavailableReason,
            };
          }
        }
      } catch {
        // Compatibility fallback for environments without hydration trace table.
      }
    }
    const chapterRows: ChapterRow[] = [];
    for (const row of taskRes.rows) {
      const payload = asObject(row.payload_json);
      const result = asObject(row.result_json);
      const hydrationMeta = hydrationByTask[row.id];
      const effectiveSourceDocId =
        (typeof result.source_doc_id === "string" && result.source_doc_id.trim().length > 0
          ? result.source_doc_id
          : typeof payload.source_doc_id === "string" && payload.source_doc_id.trim().length > 0
            ? payload.source_doc_id
            : null) ?? null;
      const chapterText =
        typeof result.chapter_text_basis === "string"
          ? result.chapter_text_basis
          : typeof result.chapter_text === "string"
            ? result.chapter_text
            : "";
      let chapterRawText = "";
      let sourceDocSha256: string | null = null;
      let sourceTypeByOrigin: string | null = null;
      let sourceRoleByOrigin: string | null = null;
      let isStable = false;
      let version: number | null = null;

      if (effectiveSourceDocId) {
        const rawRes = await pool.query<{
          raw_text: string;
          sha256: string | null;
          source_type: string | null;
          source_role: string | null;
          is_stable: boolean;
          version: number;
        }>(
          `SELECT raw_text,
                  NULLIF(raw_text_sha256,'') AS sha256,
                  NULLIF(origin->>'source_type','') AS source_type,
                  NULLIF(origin->>'source_role','') AS source_role,
                  is_stable,
                  version
             FROM public.source_doc
            WHERE story_id = $1
              AND id::text = $2
            LIMIT 1`,
          [storyId, effectiveSourceDocId]
        );
        chapterRawText = typeof rawRes.rows[0]?.raw_text === "string" ? rawRes.rows[0].raw_text : "";
        sourceDocSha256 = rawRes.rows[0]?.sha256 ?? null;
        sourceTypeByOrigin = rawRes.rows[0]?.source_type ?? null;
        sourceRoleByOrigin = rawRes.rows[0]?.source_role ?? null;
        isStable = Boolean(rawRes.rows[0]?.is_stable);
        version = rawRes.rows[0]?.version !== undefined ? Number(rawRes.rows[0].version) : null;
      }
      const rawScenes = normalizeScenes(result.scenes);
      const qualityReport =
        result.quality_report && typeof result.quality_report === "object"
          ? (result.quality_report as Record<string, unknown>)
          : {};
      let previousQualityReport: Record<string, unknown> = {};
      if (typeof result.chapter_id === "string" && result.chapter_id.trim().length > 0) {
        const prevRes = await pool.query<{ result_json: unknown }>(
          `SELECT result_json
             FROM public.ingest_task
            WHERE story_id = $1
              AND task_type = 'CHAPTER_SPLIT_LLM'
              AND status = 'DONE'
              AND id <> $2
              AND COALESCE(result_json->>'chapter_id','') = $3
            ORDER BY updated_at DESC, id DESC
            LIMIT 1`,
          [storyId, row.id, result.chapter_id]
        );
        if ((prevRes.rowCount ?? 0) > 0) {
          const prevObj = asObject(prevRes.rows[0]?.result_json);
          previousQualityReport =
            prevObj.quality_report && typeof prevObj.quality_report === "object"
              ? (prevObj.quality_report as Record<string, unknown>)
              : {};
        }
      }
      const qualityDelta = {
        flagged_pct: asNumber(qualityReport.flagged_pct) - asNumber(previousQualityReport.flagged_pct),
        mid_word_cut_count:
          asNumber(qualityReport.mid_word_cut_count) - asNumber(previousQualityReport.mid_word_cut_count),
        abbrev_or_name_cut_count:
          asNumber(qualityReport.abbrev_or_name_cut_count) - asNumber(previousQualityReport.abbrev_or_name_cut_count),
        fragmentation_score:
          asNumber(qualityReport.fragmentation_score) - asNumber(previousQualityReport.fragmentation_score),
      };
      const splitControls =
        result.split_controls && typeof result.split_controls === "object"
          ? (result.split_controls as Record<string, unknown>)
          : {};
      const contextWindowResult = asObject(result.context_window);
      const contextWindow = {
        story_summary:
          (typeof splitControls.story_summary === "string" ? splitControls.story_summary : null) ??
          (typeof contextWindowResult.story_summary === "string" ? contextWindowResult.story_summary : null),
        arc_context:
          (typeof splitControls.arc_context === "string" ? splitControls.arc_context : null) ??
          (typeof contextWindowResult.arc_context === "string" ? contextWindowResult.arc_context : null),
        approved_context_ids:
          asStringArray(splitControls.approved_context_ids).length > 0
            ? asStringArray(splitControls.approved_context_ids)
            : asStringArray(contextWindowResult.approved_context_ids),
        golden_chapter_ids:
          asStringArray(splitControls.golden_chapter_ids).length > 0
            ? asStringArray(splitControls.golden_chapter_ids)
            : asStringArray(contextWindowResult.golden_chapter_ids),
        pacing_metadata:
          splitControls.pacing_metadata && typeof splitControls.pacing_metadata === "object"
            ? asObject(splitControls.pacing_metadata)
            : contextWindowResult.pacing_metadata && typeof contextWindowResult.pacing_metadata === "object"
              ? asObject(contextWindowResult.pacing_metadata)
              : {},
      };
      const chapterScenes = chapterText
        ? enrichScenesWithPreview(rawScenes, chapterText, chapterRawText, {
          source_doc_sha256:
            ((result.source_doc_sha256 as string | undefined) ??
              (payload.source_doc_sha256 as string | undefined) ??
              sourceDocSha256 ??
              null) as string | null,
          source_type:
            ((result.source_type as string | undefined) ??
              (payload.source_type as string | undefined) ??
              sourceTypeByOrigin ??
              null) as string | null,
          source_role:
            ((result.source_role as string | undefined) ??
              (payload.source_role as string | undefined) ??
              sourceRoleByOrigin ??
              null) as string | null,
        })
        : rawScenes;
      const boundaryEvidence = chapterScenes
        .slice(0, Math.max(0, chapterScenes.length - 1))
        .map((scene, idx) => ({
          boundary_index: idx + 1,
          at: Number(scene.end),
          reason: typeof scene.reason === "string" ? scene.reason : null,
          flags: Array.isArray(scene.flags) ? scene.flags : [],
          left_scene_idx: Number(scene.idx),
        }))
        .filter((x) => Number.isFinite(x.at));
      const hardFail = Boolean(result.hard_fail);
      const supervisorDecisionRaw = normalizeSupervisorDecision(result.supervisor_decision);
      const supervisorDecision = hardFail && supervisorDecisionRaw === "auto_pass" ? "manual_review" : supervisorDecisionRaw;
      const safeToApprove = !hardFail && Boolean(result.safe_to_approve);
      const reasonCodesRaw = [
        ...normalizeReasonCodes(result.reason_codes),
        ...normalizeReasonCodes(result.reason_code),
      ];
      const reasonCodes = Array.from(new Set(reasonCodesRaw));
      if (reasonCodes.length === 0 && typeof result.rerun_reason === "string" && result.rerun_reason.trim().length > 0) {
        reasonCodes.push(result.rerun_reason.trim().slice(0, 120));
      }
      if (reasonCodes.length === 0 && hardFail) {
        reasonCodes.push("HARD_FAIL");
      }
      const decisionEvidence = {
        strategy_selected: typeof result.strategy_selected === "string" ? result.strategy_selected : null,
        safe_to_approve: safeToApprove,
        hard_fail: hardFail,
        supervisor_decision: supervisorDecision,
        reason_codes: reasonCodes,
        rerun_reason: typeof result.rerun_reason === "string" ? result.rerun_reason : "",
        context_hash: typeof result.context_hash === "string" ? result.context_hash : null,
        context_pack_version:
          typeof result.context_pack_version === "string"
            ? result.context_pack_version
            : typeof splitControls.context_pack_version === "string"
              ? splitControls.context_pack_version
              : null,
        preference_rule_version:
          typeof result.preference_rule_version === "string"
            ? result.preference_rule_version
            : typeof splitControls.preference_rule_version === "string"
              ? splitControls.preference_rule_version
              : null,
      };
      const splitRuntime =
        result.split_runtime && typeof result.split_runtime === "object"
          ? asObject(result.split_runtime)
          : {};
      const analysisChunkArtifact =
        result.analysis_chunk_artifact && typeof result.analysis_chunk_artifact === "object"
          ? asObject(result.analysis_chunk_artifact)
          : {};
      const analysisChunkDiagnostics =
        analysisChunkArtifact.diagnostics && typeof analysisChunkArtifact.diagnostics === "object"
          ? asObject(analysisChunkArtifact.diagnostics)
          : {};
      chapterRows.push({
        task_id: row.id,
        seq_no: row.seq_no,
        status: row.status,
        source_path:
          (result.source_path as string | undefined) ??
          (payload.source_path as string | undefined) ??
          null,
        source_doc_id:
          (result.source_doc_id as string | undefined) ??
          (payload.source_doc_id as string | undefined) ??
          null,
        source_doc_sha256:
          (result.source_doc_sha256 as string | undefined) ??
          (payload.source_doc_sha256 as string | undefined) ??
          sourceDocSha256 ??
          null,
        source_type:
          (result.source_type as string | undefined) ??
          (payload.source_type as string | undefined) ??
          sourceTypeByOrigin ??
          null,
        source_role:
          (result.source_role as string | undefined) ??
          (payload.source_role as string | undefined) ??
          sourceRoleByOrigin ??
          null,
        chapter_id:
          (result.chapter_id as string | undefined) ??
          (payload.chapter_id as string | undefined) ??
          null,
        chapter_title: (result.chapter_title as string | undefined) ?? null,
        split_mode: normalizeSplitMode(result.split_mode ?? payload.split_mode),
        split_controls: splitControls,
        text_basis: typeof result.text_basis === "string" ? result.text_basis : "unknown",
        repair_report:
          result.repair_report && typeof result.repair_report === "object"
            ? (result.repair_report as Record<string, unknown>)
            : {},
        autofix_report:
          result.autofix_report && typeof result.autofix_report === "object"
            ? (result.autofix_report as Record<string, unknown>)
            : {},
        quality_report: qualityReport,
        previous_quality_report: previousQualityReport,
        quality_delta: qualityDelta,
        hard_fail: hardFail,
        safe_to_approve: safeToApprove,
        rerun_reason: typeof result.rerun_reason === "string" ? result.rerun_reason : "",
        decision_reason_codes: reasonCodes,
        strategy_selected: typeof result.strategy_selected === "string" ? result.strategy_selected : null,
        strategy_attempts: normalizeStrategyAttempts(result.strategy_attempts),
        feedback_penalties:
          result.feedback_penalties && typeof result.feedback_penalties === "object"
            ? (result.feedback_penalties as Record<string, unknown>)
            : {},
        issue_hints:
          result.issue_hints && typeof result.issue_hints === "object"
            ? (result.issue_hints as Record<string, unknown>)
            : {},
        issue_hints_explicit:
          result.issue_hints_explicit && typeof result.issue_hints_explicit === "object"
            ? (result.issue_hints_explicit as Record<string, unknown>)
            : {},
        issue_hints_inferred:
          result.issue_hints_inferred && typeof result.issue_hints_inferred === "object"
            ? (result.issue_hints_inferred as Record<string, unknown>)
            : {},
        boundary_type_hints:
          result.boundary_type_hints && typeof result.boundary_type_hints === "object"
            ? (result.boundary_type_hints as Record<string, unknown>)
            : {},
        strategy_bias:
          result.strategy_bias && typeof result.strategy_bias === "object"
            ? (result.strategy_bias as Record<string, unknown>)
            : {},
        llm_calls_used: Number.isFinite(Number(result.llm_calls_used)) ? Number(result.llm_calls_used) : null,
        llm_calls_budget: Number.isFinite(Number(result.llm_calls_budget)) ? Number(result.llm_calls_budget) : null,
        window_rerun_report:
          result.window_rerun_report && typeof result.window_rerun_report === "object"
            ? (result.window_rerun_report as Record<string, unknown>)
            : {},
        supervisor_decision: supervisorDecision,
        supervisor_retry_used: Boolean(result.supervisor_retry_used),
        chapter_text_stats:
          result.chapter_text_stats && typeof result.chapter_text_stats === "object"
            ? (result.chapter_text_stats as Record<string, unknown>)
            : {},
        prompt_version_id:
          Number.isFinite(Number(result.prompt_version_id)) ? Number(result.prompt_version_id) : hydrationMeta?.prompt_version_id ?? null,
        hydration_output_hash: typeof result.hydration_output_hash === "string" ? result.hydration_output_hash : hydrationMeta?.hydration_output_hash ?? null,
        hydration_output_text: typeof result.hydration_output_text === "string" ? result.hydration_output_text : hydrationMeta?.hydration_output_text ?? null,
        prompt_trace_phase:
          typeof result.prompt_trace_phase === "string"
            ? result.prompt_trace_phase
            : hydrationMeta?.trace_phase ?? null,
        prompt_trace_status:
          typeof result.prompt_trace_status === "string"
            ? result.prompt_trace_status
            : hydrationMeta?.trace_status ?? null,
        prompt_trace_source:
          typeof result.prompt_trace_source === "string"
            ? result.prompt_trace_source
            : hydrationMeta?.trace_source ?? null,
        prompt_trace_created_at:
          typeof result.prompt_trace_created_at === "string"
            ? result.prompt_trace_created_at
            : hydrationMeta?.trace_created_at ?? null,
        prompt_unavailable_reason:
          typeof result.prompt_unavailable_reason === "string"
            ? result.prompt_unavailable_reason
            : hydrationMeta?.prompt_unavailable_reason ?? null,
        chunk_prompt_trace:
          normalizeChunkPromptTrace(result.chunk_prompt_trace).length > 0
            ? normalizeChunkPromptTrace(result.chunk_prompt_trace)
            : normalizeChunkPromptTrace(result.split_prompt_trace_chunks).length > 0
              ? normalizeChunkPromptTrace(result.split_prompt_trace_chunks)
              : hydrationMeta?.chunk_prompt_trace ?? [],
        boundary_evidence: boundaryEvidence,
        context_window: contextWindow,
        context_hash: typeof result.context_hash === "string" ? result.context_hash : null,
        context_pack_version:
          typeof result.context_pack_version === "string"
            ? result.context_pack_version
            : typeof splitControls.context_pack_version === "string"
              ? splitControls.context_pack_version
              : null,
        preference_rule_version:
          typeof result.preference_rule_version === "string"
            ? result.preference_rule_version
            : typeof splitControls.preference_rule_version === "string"
              ? splitControls.preference_rule_version
              : null,
        decision_evidence: decisionEvidence,
        split_runtime: splitRuntime,
        analysis_chunk_artifact: analysisChunkArtifact,
        analysis_chunk_diagnostics: analysisChunkDiagnostics,
        operational_state: typeof result.operational_state === "string" ? result.operational_state : null,
        operational_state_reason: typeof result.operational_state_reason === "string" ? result.operational_state_reason : null,
        scenes: chapterScenes,
        is_stable: isStable,
        version: version,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }
    const chapterIds = Array.from(
      new Set(
        chapterRows
          .map((c) => (typeof c.chapter_id === "string" ? c.chapter_id : ""))
          .filter((x) => Boolean(x))
      )
    );
    const profileByChapter: Record<string, Record<string, unknown>> = {};
    const feedbackByChapter: Record<string, Record<string, unknown>> = {};
    if (chapterIds.length > 0) {
      try {
        const profileRes = await pool.query<{ chapter_id: string; profile_json: unknown }>(
          `SELECT chapter_id, profile_json
           FROM public.split_strategy_profile
           WHERE story_id = $1
             AND chapter_id = ANY($2::text[])`,
          [storyId, chapterIds]
        );
        for (const row of profileRes.rows) {
          profileByChapter[row.chapter_id] = asObject(row.profile_json);
        }
      } catch {
        // Table may not exist yet on old environments.
      }
      try {
        const feedbackRes = await pool.query<{
          chapter_id: string;
          good_count: number;
          bad_count: number;
          by_strategy: unknown;
          last_feedback_at: string | null;
        }>(
          `SELECT
             chapter_id,
             COUNT(*) FILTER (WHERE rating > 0)::int AS good_count,
             COUNT(*) FILTER (WHERE rating < 0)::int AS bad_count,
             COALESCE(
               jsonb_agg(
                 jsonb_build_object(
                   'strategy', strategy,
                   'good', good_count,
                   'bad', bad_count
                 )
               ) FILTER (WHERE strategy IS NOT NULL),
               '[]'::jsonb
             ) AS by_strategy,
             MAX(created_at)::text AS last_feedback_at
           FROM (
             SELECT chapter_id, strategy,
                    COUNT(*) FILTER (WHERE rating > 0)::int AS good_count,
                    COUNT(*) FILTER (WHERE rating < 0)::int AS bad_count,
                    MAX(created_at) AS created_at
             FROM public.split_feedback
             WHERE story_id = $1
               AND chapter_id = ANY($2::text[])
             GROUP BY chapter_id, strategy
           ) t
           GROUP BY chapter_id`,
          [storyId, chapterIds]
        );
        for (const row of feedbackRes.rows) {
          feedbackByChapter[row.chapter_id] = {
            good_count: Number(row.good_count) || 0,
            bad_count: Number(row.bad_count) || 0,
            by_strategy: Array.isArray(row.by_strategy) ? row.by_strategy : [],
            last_feedback_at: row.last_feedback_at ?? null,
          };
        }
      } catch {
        // split_feedback may not exist yet.
      }
    }
    const chapters = chapterRows.map((row) => {
      const chapterId = typeof row.chapter_id === "string" ? row.chapter_id : "";
      return {
        ...row,
        strategy_profile: chapterId && profileByChapter[chapterId] ? profileByChapter[chapterId] : {},
        feedback_summary: chapterId && feedbackByChapter[chapterId] ? feedbackByChapter[chapterId] : {},
      };
    });

    const scenes = chapters.length > 0 ? chapters[0].scenes : normalizeScenes(splitDraft.scenes);
    let feedbackHealth = {
      total_feedback: 0,
      valid_feedback: 0,
      mismatch_feedback: 0,
      data_coverage_pct: 100,
      mode_changed_feedback: 0,
    };
    try {
      const healthRes = await pool.query<{
        total_feedback: string;
        valid_feedback: string;
        mismatch_feedback: string;
        mode_changed_feedback: string;
      }>(
        `SELECT
           COUNT(*)::text AS total_feedback,
           COUNT(*) FILTER (WHERE version_pair_valid = true)::text AS valid_feedback,
           COUNT(*) FILTER (WHERE version_pair_valid = false OR reason_code = 'VERSION_MISMATCH')::text AS mismatch_feedback,
           COUNT(*) FILTER (
             WHERE original_detection_mode IS NOT NULL
               AND current_detection_mode IS NOT NULL
               AND original_detection_mode <> current_detection_mode
           )::text AS mode_changed_feedback
         FROM public.split_feedback
         WHERE story_id = $1
           AND created_at >= now() - interval '60 days'`,
        [storyId]
      );
      const row = healthRes.rows[0];
      const total = Number(row?.total_feedback ?? 0);
      const valid = Number(row?.valid_feedback ?? 0);
      const mismatch = Number(row?.mismatch_feedback ?? 0);
      const modeChanged = Number(row?.mode_changed_feedback ?? 0);
      feedbackHealth = {
        total_feedback: total,
        valid_feedback: valid,
        mismatch_feedback: mismatch,
        data_coverage_pct: total > 0 ? Math.round((valid / total) * 1000) / 10 : 100,
        mode_changed_feedback: modeChanged,
      };
    } catch {
      // Compatibility fallback for environments without versioned columns.
    }

    const isMature = await computeStoryMaturity(storyId);

    return NextResponse.json({
      ok: true,
      jobId,
      story_id: storyId,
      ingest_run_id: job.ingest_run_id,
      status: job.status,
      is_mature: isMature,
      split_draft: {
        chapters,
        scenes,
        feedback_health: feedbackHealth,
        core_thesis: typeof splitDraft.core_thesis === "string" ? splitDraft.core_thesis : null,
        chapter_text_stats: asObject(splitDraft.chapter_text_stats),
      },
      task_count: taskRes.rowCount,
      tasks: taskRes.rows.map((r) => ({
        id: r.id,
        seq_no: r.seq_no,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      created_at: job.created_at,
      updated_at: job.updated_at,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "INGEST_SPLIT_DRAFT_GET_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: msg.includes("INVALID_JOB_ID") ? 400 : 500 });
  }
}

async function computeStoryMaturity(storyId: number): Promise<boolean> {
  const THRESHOLD_RUNS = 8;
  const THRESHOLD_HUMAN_FB = 3;
  const WIN_RATE = 0.65;

  try {
    const profileRes = await pool.query<{ profile_json: unknown }>(
      `SELECT profile_json FROM public.split_strategy_profile WHERE story_id = $1 AND chapter_id = '__global__'`,
      [storyId]
    );
    if (profileRes.rowCount === 0) return false;
    const profile = asObject(profileRes.rows[0]?.profile_json);
    const stats = asObject(profile.strategy_stats);
    let totalRuns = 0;
    let totalWins = 0;
    for (const key in stats) {
      const s = asObject(stats[key]);
      totalRuns += Number(s.total_runs || 0);
      totalWins += Number(s.win_count || 0);
    }
    const globalWinRate = (totalWins + 1.0) / (totalRuns + 2.0);

    const fbRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM public.split_feedback
       WHERE story_id = $1 
         AND COALESCE(note, '') NOT LIKE 'SYSTEM AUTO-REJECT:%'
         AND created_at >= now() - interval '60 days'`,
      [storyId]
    );
    const humanFb = Number(fbRes.rows[0]?.count || 0);

    return totalRuns >= THRESHOLD_RUNS && humanFb >= THRESHOLD_HUMAN_FB && globalWinRate >= WIN_RATE;
  } catch (e) {
    console.error("computeStoryMaturity_failed", e);
    return false;
  }
}

import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { ensureIngestWorkerRunning } from "@/features/ingest/server/workerControl";
import { reconcileTerminalJobTasks } from "@/features/ingest/server/ingestTaskReconcileService";

type JobMode = "AUTO_LOCK" | "REVIEW_GATE";
type SplitMode = "manual" | "auto";
type ReprocessReasonCode =
  | "BOUNDARY_QUALITY"
  | "MID_WORD_CUT"
  | "SCENE_SPLIT_TOO_WIDE"
  | "SCENE_SPLIT_TOO_FRAGMENTED"
  | "QUOTE_CONTINUITY_BREAK"
  | "SYSTEMIC_ENTITY_SPLIT"
  | "OTHER";

const REPROCESS_REASON_CODES = new Set<string>([
  "BOUNDARY_QUALITY",
  "MID_WORD_CUT",
  "SCENE_SPLIT_TOO_WIDE",
  "SCENE_SPLIT_TOO_FRAGMENTED",
  "QUOTE_CONTINUITY_BREAK",
  "SYSTEMIC_ENTITY_SPLIT",
  "OTHER",
]);
const VALID_STRATEGIES = new Set(["S0_BASE", "S1_STRICT_BOUNDARY", "S1_TARGETED_WINDOW_REPAIR", "S2_MERGE_FIX", "S3_SEMANTIC_RESPLIT"]);
const ALLOW_FORCED_STRATEGY_LEARNING = String(process.env.ALLOW_FORCED_STRATEGY_LEARNING ?? "").toLowerCase() === "true";

function parseJobMode(value: unknown): JobMode {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "AUTO_LOCK";
  if (raw === "AUTO_LOCK" || raw === "REVIEW_GATE") return raw;
  throw new Error("INVALID_JOB_MODE");
}

function parseSplitMode(value: unknown): SplitMode {
  return value === "auto" ? "auto" : "manual";
}

function parseReprocessReasonCode(value: unknown): ReprocessReasonCode {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!raw || !REPROCESS_REASON_CODES.has(raw)) throw new Error("REPROCESS_REASON_CODE_REQUIRED");
  return raw as ReprocessReasonCode;
}

function parseReprocessNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, 2000);
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
    if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  }
  return fallback;
}

function parseMaxLlmCalls(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(3, Math.max(1, Math.floor(n)));
}

function estimateScenesForReprocess(text: string): number {
  const SCENE_HEADING_RE = /^\s*##\s*Scene\b.*$/gim;
  const SCENE_DASH_RE = /^\s*---\s*$/gim;
  const headingCount = Array.from(text.matchAll(SCENE_HEADING_RE)).length;
  if (headingCount > 0) return headingCount;
  const dashCount = Array.from(text.matchAll(SCENE_DASH_RE)).length;
  if (dashCount > 0) return dashCount + 1;
  const chars = Math.max(0, text.length);
  return Math.max(4, Math.min(20, Math.ceil(chars / 1200)));
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function parseChapterIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const val = typeof item === "string" ? item.trim() : "";
    if (!val) continue;
    if (seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }
  return out;
}

function chapterIdToNo(chapterId: string): number | null {
  const m = chapterId.match(/(\d{1,4})$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function buildSplitIdempotencyKey(storyId: number, sourcePath: string, chapterText: string, ingestRunId: string): string {
  const digest = createHash("sha256").update(`${storyId}:split_v1:${sourcePath}\n${chapterText}`).digest("hex");
  const runToken = ingestRunId.slice(0, 8);
  return `split_v1:${digest}:${runToken}`;
}

function parseVersioningSplitControls(raw: unknown): Record<string, unknown> {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const parseStringArray = (value: unknown, maxItems = 20, maxLen = 120): string[] => {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const v of value) {
      const text = typeof v === "string" ? v.trim().slice(0, maxLen) : "";
      if (!text || out.includes(text)) continue;
      out.push(text);
      if (out.length >= maxItems) break;
    }
    return out;
  };
  const out: Record<string, unknown> = {};
  const runtimeMode = typeof src.runtime_mode === "string" ? src.runtime_mode.trim().toUpperCase() : "";
  if (runtimeMode === "S3_STRATEGIC") out.runtime_mode = runtimeMode;
  if (typeof src.context_pack_version === "string" && src.context_pack_version.trim()) {
    out.context_pack_version = src.context_pack_version.trim().slice(0, 64);
  }
  if (typeof src.preference_rule_version === "string" && src.preference_rule_version.trim()) {
    out.preference_rule_version = src.preference_rule_version.trim().slice(0, 64);
  }
  const contextWindowRaw =
    src.context_window && typeof src.context_window === "object" && !Array.isArray(src.context_window)
      ? (src.context_window as Record<string, unknown>)
      : {};
  const storySummary =
    (typeof src.story_summary === "string" ? src.story_summary : typeof contextWindowRaw.story_summary === "string" ? contextWindowRaw.story_summary : "")
      .trim()
      .slice(0, 4000);
  const arcContext =
    (typeof src.arc_context === "string" ? src.arc_context : typeof contextWindowRaw.arc_context === "string" ? contextWindowRaw.arc_context : "")
      .trim()
      .slice(0, 4000);
  const approvedContextIds = parseStringArray(src.approved_context_ids ?? contextWindowRaw.approved_context_ids);
  const goldenChapterIds = parseStringArray(src.golden_chapter_ids ?? contextWindowRaw.golden_chapter_ids);
  const pacingMetadata =
    src.pacing_metadata && typeof src.pacing_metadata === "object" && !Array.isArray(src.pacing_metadata)
      ? (src.pacing_metadata as Record<string, unknown>)
      : contextWindowRaw.pacing_metadata && typeof contextWindowRaw.pacing_metadata === "object" && !Array.isArray(contextWindowRaw.pacing_metadata)
        ? (contextWindowRaw.pacing_metadata as Record<string, unknown>)
        : {};
  if (storySummary || arcContext || approvedContextIds.length > 0 || goldenChapterIds.length > 0 || Object.keys(pacingMetadata).length > 0) {
    out.context_window = {
      story_summary: storySummary || null,
      arc_context: arcContext || null,
      approved_context_ids: approvedContextIds,
      golden_chapter_ids: goldenChapterIds,
      pacing_metadata: pacingMetadata,
    };
  }
  return out;
}

export async function postIngestReprocessScenesResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();

  try {
    const body = (await req.json()) as {
      chapter_ids?: unknown;
      review_mode?: unknown;
      split_mode?: unknown;
      self_healing_enabled?: unknown;
      auto_retry_enabled?: unknown;
      max_llm_calls?: unknown;
      created_by?: unknown;
      reprocess_reason_code?: unknown;
      reprocess_note?: unknown;
      source_job_id?: unknown;
      forced_strategy?: unknown;
      allow_learning?: unknown;
      split_controls?: unknown;
      runtime_mode?: unknown;
      context_pack_version?: unknown;
      preference_rule_version?: unknown;
      story_summary?: unknown;
      arc_context?: unknown;
      approved_context_ids?: unknown;
      golden_chapter_ids?: unknown;
      pacing_metadata?: unknown;
    };
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const chapterIds = parseChapterIds(body.chapter_ids);
    const chapterNos = chapterIds.map(chapterIdToNo).filter((x): x is number => x !== null);
    if (chapterIds.length === 0) {
      return NextResponse.json({ ok: false, error: "CHAPTER_IDS_REQUIRED" }, { status: 400 });
    }
    const reviewMode = parseJobMode(body.review_mode);
    const splitMode = parseSplitMode(body.split_mode);
    const selfHealingEnabled = parseBool(body.self_healing_enabled, true);
    const autoRetryEnabled = parseBool(body.auto_retry_enabled, true);
    const maxLlmCalls = parseMaxLlmCalls(body.max_llm_calls, 5);
    const createdBy = typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim().slice(0, 120) : "ui";
    const reprocessReasonCode = parseReprocessReasonCode(body.reprocess_reason_code);
    const reprocessNote = parseReprocessNote(body.reprocess_note);
    const sourceJobId = Number(body.source_job_id);
    const hasSourceJobId = Number.isFinite(sourceJobId) && sourceJobId > 0;
    const forcedStrategyRaw = typeof body.forced_strategy === "string" ? body.forced_strategy.trim() : null;
    const forcedStrategy = forcedStrategyRaw && VALID_STRATEGIES.has(forcedStrategyRaw) ? forcedStrategyRaw : null;
    const allowLearning = parseBool(body.allow_learning, false);
    const versioningControls = parseVersioningSplitControls({
      ...(body.split_controls && typeof body.split_controls === "object" && !Array.isArray(body.split_controls)
        ? (body.split_controls as Record<string, unknown>)
        : {}),
      runtime_mode: body.runtime_mode,
      context_pack_version: body.context_pack_version,
      preference_rule_version: body.preference_rule_version,
      story_summary: body.story_summary,
      arc_context: body.arc_context,
      approved_context_ids: body.approved_context_ids,
      golden_chapter_ids: body.golden_chapter_ids,
      pacing_metadata: body.pacing_metadata,
    });
    if (allowLearning && forcedStrategy && !ALLOW_FORCED_STRATEGY_LEARNING) {
      throw new Error("FORCED_STRATEGY_LEARNING_DISABLED");
    }

    await client.query("BEGIN");
    const ingestRunId = randomUUID();

    const chapterRowsRes = await client.query<{
      chapter_id: string;
      chapter_no: number | null;
      text_content: string | null;
      source_path: string | null;
      source_doc_id: string | null;
      source_type: string | null;
      source_role: string | null;
    }>(
      `WITH input_params AS (
         SELECT $1::bigint AS story_id, $2::text[] AS chapter_ids, $3::int[] AS chapter_nos
       ),
       latest_source AS (
         SELECT
           COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')) AS chapter_id,
           NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')), '\\D', '', 'g'), '')::int AS chapter_no_guess,
           NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_no',''), '\\D', '', 'g'), '')::int AS chapter_no_origin,
           sd.id::text AS source_doc_id,
           sd.raw_text AS text_content,
           sd.origin->>'source_path' AS source_path,
           sd.origin->>'source_type' AS source_type,
           sd.origin->>'source_role' AS source_role,
           sd.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', ''))
             ORDER BY
               CASE
                 WHEN COALESCE(sd.origin->>'source_role','') = 'canonical_truth' THEN 0
                 WHEN COALESCE(sd.origin->>'source_type','') = 'reprocess_scene_only' THEN 2
                 ELSE 1
               END ASC,
               sd.created_at DESC
           ) AS rn
         FROM public.source_doc sd, input_params ip
         WHERE sd.story_id = ip.story_id
           AND sd.doc_type = 'ingest_chapter'
           AND (
             sd.origin->>'chapter_id' = ANY(ip.chapter_ids)
             OR replace(sd.origin->>'source_path', 'chapter:', '') = ANY(ip.chapter_ids)
             OR (cardinality(ip.chapter_nos) > 0 AND NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_no',''), '\\D', '', 'g'), '')::int = ANY(ip.chapter_nos))
             OR (cardinality(ip.chapter_nos) > 0 AND NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')), '\\D', '', 'g'), '')::int = ANY(ip.chapter_nos))
           )
       )
       SELECT
         ls.chapter_id::text AS chapter_id,
         COALESCE(ls.chapter_no_origin, ls.chapter_no_guess, NULLIF(regexp_replace(ls.chapter_id, '\\D', '', 'g'), '')::int) AS chapter_no,
         ls.text_content,
         COALESCE(ls.source_path, CONCAT('chapter:', ls.chapter_id)) AS source_path,
         ls.source_doc_id,
         ls.source_type,
         ls.source_role
       FROM latest_source ls
       WHERE ls.rn = 1
       ORDER BY chapter_no NULLS LAST, ls.chapter_id ASC`,
      [storyId, chapterIds, chapterNos]
    );

    const requestedChapterNos = new Set(chapterNos);
    const dedupedByKey = new Map<
      string,
      {
        chapter_id: string;
        chapter_no: number | null;
        text_content: string | null;
        source_path: string | null;
        source_doc_id: string | null;
        source_type: string | null;
        source_role: string | null;
      }
    >();
    const rowScore = (row: {
      chapter_id: string;
      chapter_no: number | null;
      source_path: string | null;
      source_doc_id: string | null;
      source_type: string | null;
      source_role: string | null;
    }): number => {
      let score = 0;
      if (chapterIds.includes(row.chapter_id)) score += 100;
      if (typeof row.source_path === "string" && row.source_path.startsWith("chapter:")) score += 20;
      if (typeof row.source_doc_id === "string" && row.source_doc_id.length > 0) score += 10;
      if (typeof row.chapter_no === "number" && requestedChapterNos.has(row.chapter_no)) score += 5;
      if (row.source_role === "canonical_truth") score += 50;
      if (row.source_type === "reprocess_scene_only") score -= 40;
      return score;
    };
    for (const row of chapterRowsRes.rows) {
      const key = Number.isFinite(Number(row.chapter_no)) ? `no:${Number(row.chapter_no)}` : `id:${row.chapter_id}`;
      const prev = dedupedByKey.get(key);
      const rowReprocessOnly = row.source_type === "reprocess_scene_only";
      const prevReprocessOnly = prev?.source_type === "reprocess_scene_only";
      const shouldTake =
        !prev ||
        (prevReprocessOnly && !rowReprocessOnly) ||
        (prevReprocessOnly === rowReprocessOnly && rowScore(row) > rowScore(prev));
      if (shouldTake) {
        dedupedByKey.set(key, row);
      }
    }
    const chapterRows = Array.from(dedupedByKey.values());

    const found = new Set(chapterRows.map((r) => r.chapter_id));
    const foundNos = new Set(
      chapterRows
        .map((r) => (Number.isFinite(Number(r.chapter_no)) ? Number(r.chapter_no) : null))
        .filter((x): x is number => x !== null)
    );
    const missing = chapterIds.filter((id) => {
      if (found.has(id)) return false;
      const n = chapterIdToNo(id);
      return n === null || !foundNos.has(n);
    });
    if (missing.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CHAPTER_NOT_FOUND", missing }, { status: 404 });
    }

    const chapterPayloads = chapterRows
      .map((row) => {
        const raw = normalizeLineEndings(String(row.text_content ?? "").trim());
        return {
          chapter_id: row.chapter_id,
          chapter_no: row.chapter_no,
          source_path: row.source_path || `chapter:${row.chapter_id}`,
          source_doc_id: row.source_doc_id,
          source_type: row.source_type,
          source_role: row.source_role,
          text: raw,
        };
      })
      .filter((x) => x.text.length > 0);

    if (chapterPayloads.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CHAPTER_TEXT_EMPTY" }, { status: 409 });
    }

    const createJobRes = await client.query<{ id: number }>(
      `INSERT INTO public.ingest_job
        (story_id, created_by, mode, status, ingest_run_id, config_json, total_tasks, completed_tasks)
       VALUES
        ($1::bigint, $2::text, $3::text, 'SPLIT_DRAFT', $4::uuid, $5::jsonb, $6::integer, 0)
       RETURNING id`,
      [
        storyId,
        createdBy,
        reviewMode,
        ingestRunId,
        JSON.stringify({
          input_mode: "REPROCESS_SCENES",
          total_chapters: chapterPayloads.length,
          total_scenes_estimate: chapterPayloads.length,
          auto_split_v1: true,
          split_mode: splitMode,
          split_controls: {
            self_healing_enabled: selfHealingEnabled,
            auto_retry_enabled: autoRetryEnabled,
            max_llm_calls: maxLlmCalls,
            ...(forcedStrategy ? { forced_strategy: forcedStrategy } : {}),
            ...(allowLearning ? { allow_learning: true } : {}),
            ...versioningControls,
          },
          source: "existing_chapters",
          reprocess_reason_code: reprocessReasonCode,
          reprocess_note: reprocessNote,
          chapter_ids: chapterPayloads.map((c) => c.chapter_id),
        }),
        chapterPayloads.length,
      ]
    );
    const jobId = Number(createJobRes.rows[0]?.id ?? 0);

    // Context Extraction for Agentic Critic Loop
    const previousContextsByChapter = new Map<string, string[]>();
    if (hasSourceJobId) {
      const oldTasksRes = await client.query<{
        chapter_id: string | null;
        scenes: unknown;
      }>(
        `SELECT
           t.result_json->>'chapter_id' AS chapter_id,
           t.result_json->'scenes' AS scenes
         FROM public.ingest_task t
         WHERE t.job_id = $1
           AND t.story_id = $2
           AND t.task_type = 'CHAPTER_SPLIT_LLM'`,
        [sourceJobId, storyId]
      );
      for (const row of oldTasksRes.rows) {
        if (!row.chapter_id || !Array.isArray(row.scenes)) continue;
        const pts: number[] = [];
        for (const s of row.scenes) {
          if (s && typeof s === "object" && "end" in s && typeof s.end === "number") {
            pts.push(s.end);
          }
        }
        if (pts.length > 0) {
          const textMatches = chapterPayloads.find((c) => c.chapter_id === row.chapter_id);
          if (textMatches && textMatches.text) {
            const ctxArr: string[] = [];
            for (const at of pts) {
              if (at <= 10 || at >= textMatches.text.length - 10) continue;
              const left = Math.max(0, at - 45);
              const right = Math.min(textMatches.text.length, at + 45);
              let snippet = textMatches.text.slice(left, right);
              snippet = snippet.replace(/\n\s*/g, " ");
              ctxArr.push(snippet);
            }
            if (ctxArr.length > 0) {
              previousContextsByChapter.set(row.chapter_id, ctxArr);
            }
          }
        }
      }
    }

    for (let i = 0; i < chapterPayloads.length; i += 1) {
      const chapter = chapterPayloads[i];
      const textSha = sha256Hex(chapter.text);
      const sourceDocId = chapter.source_doc_id;
      if (!sourceDocId) throw new Error("SOURCE_DOC_CREATE_FAILED");

      await client.query(
        `INSERT INTO public.ingest_task
          (job_id, story_id, task_type, unit_type, source_path, seq_no, status, attempts, idempotency_key, payload_json)
         VALUES
          ($1::bigint, $2::bigint, 'CHAPTER_SPLIT_LLM', 'split_draft', $3::text, $4::integer, 'READY', 0, $5::text, $6::jsonb)`,
        [
          jobId,
          storyId,
          chapter.source_path,
          i + 1,
          buildSplitIdempotencyKey(storyId, chapter.source_path, chapter.text, ingestRunId),
          JSON.stringify({
            chapter_no: chapter.chapter_no,
            chapter_id: chapter.chapter_id,
            source_doc_id: sourceDocId,
            source_doc_sha256: textSha,
            estimated_scenes: estimateScenesForReprocess(chapter.text),
            ingest_run_id: ingestRunId,
            split_mode: splitMode,
            split_controls: {
              self_healing_enabled: selfHealingEnabled,
              auto_retry_enabled: autoRetryEnabled,
              max_llm_calls: maxLlmCalls,
              ...(forcedStrategy ? { forced_strategy: forcedStrategy } : {}),
              ...(allowLearning ? { allow_learning: true } : {}),
              ...versioningControls,
            },
            source_type: chapter.source_type ?? "reprocess_scene_only",
            source_role: chapter.source_role ?? null,
            reprocess_reason_code: reprocessReasonCode,
            reprocess_note: reprocessNote,
            previous_split_contexts: previousContextsByChapter.get(chapter.chapter_id) || [],
          }),
        ]
      );
    }

    if (hasSourceJobId) {
      const oldTasksRes = await client.query<{
        id: number;
        chapter_id: string | null;
        strategy_selected: string | null;
        quality_self_signal: number | null;
        supervisor_decision: string | null;
        source_type: string | null;
        source_role: string | null;
      }>(
        `SELECT
           t.id,
           t.result_json->>'chapter_id' AS chapter_id,
           t.result_json->>'strategy_selected' AS strategy_selected,
           (t.result_json->>'quality_self_signal')::numeric AS quality_self_signal,
           t.result_json->>'supervisor_decision' AS supervisor_decision,
           t.result_json->>'source_type' AS source_type,
           t.result_json->>'source_role' AS source_role
         FROM public.ingest_task t
         WHERE t.job_id = $1
           AND t.story_id = $2
           AND t.task_type = 'CHAPTER_SPLIT_LLM'
           AND (t.human_outcome IS NULL OR t.human_outcome = '')`,
        [sourceJobId, storyId]
      );

      if (oldTasksRes.rows.length > 0) {
        const oldTaskIds = oldTasksRes.rows.map((r) => r.id);

        await client.query(
          `UPDATE public.ingest_task
           SET human_outcome = 'FAILED_HUMAN_REJECTED',
               human_verdict_by = $1,
               human_verdict_at = now(),
               updated_at = now()
           WHERE id = ANY($2::bigint[])`,
          [createdBy, oldTaskIds]
        );

        const correctionSeqBase = chapterPayloads.length;
        let correctionSeq = correctionSeqBase + 1;

        for (const oldTask of oldTasksRes.rows) {
          await client.query(
            `INSERT INTO public.supervisor_memory
               (story_id, job_id, chapter_task_id, chapter_id, label, strategy_selected,
                supervisor_decision, human_outcome, quality_self_signal, is_reprocess,
                source_type, source_role, signals_json, created_at, updated_at)
             VALUES
               ($1, $2, $3, $4, 'FAILED_PATTERN', $5, $6, 'FAILED_HUMAN_REJECTED',
                $7, false, $8, $9, '{}'::jsonb, now(), now())
             ON CONFLICT (story_id, chapter_task_id) DO UPDATE
               SET label = EXCLUDED.label,
                   human_outcome = EXCLUDED.human_outcome,
                   updated_at = now()`,
            [
              storyId,
              sourceJobId,
              oldTask.id,
              oldTask.chapter_id,
              oldTask.strategy_selected,
              oldTask.supervisor_decision,
              oldTask.quality_self_signal ?? null,
              oldTask.source_type,
              oldTask.source_role,
            ]
          );

          if (oldTask.strategy_selected && oldTask.chapter_id) {
            await client.query(
              `INSERT INTO public.ingest_task
                 (job_id, story_id, task_type, unit_type, source_path, seq_no, status, attempts, idempotency_key, payload_json)
               VALUES
                 ($1, $2, 'SPLIT_PROFILE_CORRECTION', 'profile_correction', $3, $4, 'READY', 0, $5, $6::jsonb)`,
              [
                jobId,
                storyId,
                `profile_correction:${oldTask.chapter_id}`,
                correctionSeq,
                `profile_correction:${storyId}:${oldTask.chapter_id}:${ingestRunId}`,
                JSON.stringify({
                  chapter_id: oldTask.chapter_id,
                  story_id: storyId,
                  strategy: oldTask.strategy_selected,
                  correction_reward: -0.5,
                  source_task_id: oldTask.id,
                  reason: reprocessReasonCode,
                }),
              ]
            );
            correctionSeq += 1;
          }
        }

        // [AUTO-CLOSE] Dọn dẹp Job cũ: Khi đã reprocess thì Job cũ chắc chắn không còn là master draft nữa
        await client.query(
          `UPDATE public.ingest_job
           SET status = 'CANCELLED', 
               updated_at = now()
           WHERE id = $1 AND status IN ('SPLIT_DRAFT', 'AWAIT_APPROVAL')`,
          [sourceJobId]
        );
        await reconcileTerminalJobTasks(client, storyId, sourceJobId, "JOB_CANCELLED_BY_REPROCESS");
      }
    }

    await client.query("COMMIT");
    const worker = await ensureIngestWorkerRunning();
    return NextResponse.json({
      ok: true,
      job_id: jobId,
      story_id: storyId,
      ingest_run_id: ingestRunId,
      review_mode: reviewMode,
      split_mode: splitMode,
      split_controls: {
        self_healing_enabled: selfHealingEnabled,
        auto_retry_enabled: autoRetryEnabled,
        max_llm_calls: maxLlmCalls,
        forced_strategy: forcedStrategy,
        allow_learning: allowLearning,
        ...versioningControls,
      },
      chapter_ids: chapterPayloads.map((c) => c.chapter_id),
      reprocess_reason_code: reprocessReasonCode,
      summary: {
        mode: "REPROCESS_SCENES",
        total_chapters: chapterPayloads.length,
        total_scenes_estimate: chapterPayloads.length,
      },
      worker,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "INGEST_REPROCESS_SCENES_FAILED";
    const status =
      msg.includes("STORY_ARCHIVED") || msg.includes("CHAPTER_TEXT_EMPTY")
        ? 409
        : msg.includes("INVALID_JOB_MODE") || msg.includes("REPROCESS_REASON_CODE_REQUIRED") || msg.includes("FORCED_STRATEGY_LEARNING_DISABLED")
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { validateAndNormalizeInput } from "@/features/ingest/server/inputContract";
import type { SplitMode } from "@/features/ingest/server/inputContract";
import { parseIngestRequest } from "@/features/ingest/server/uploadParser";
import { ensureIngestWorkerRunning } from "@/features/ingest/server/workerControl";
import { reconcileTerminalJobTasks } from "@/features/ingest/server/ingestTaskReconcileService";

type JobMode = "AUTO_LOCK" | "REVIEW_GATE";
type JobAction = "cancel_job" | "retry_failed_tasks" | "retry_task";
type RetryProfileCode =
  | "auto_recovery_outline"
  | "auto_recovery_budget"
  | "auto_recovery_artifact"
  | "auto_recovery_transport";
type RootCauseClass = "OUTLINE" | "BUDGET" | "ARTIFACT" | "LLM_TRANSPORT" | "UNKNOWN";

function parseJobMode(value: unknown): JobMode {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "AUTO_LOCK";
  if (raw === "AUTO_LOCK" || raw === "REVIEW_GATE") return raw;
  throw new Error("INVALID_JOB_MODE");
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseNonNegativeInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function parseAction(value: unknown): JobAction {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "cancel_job" || raw === "retry_failed_tasks" || raw === "retry_task") return raw;
  throw new Error("INVALID_ACTION");
}

function parseSplitMode(value: unknown): SplitMode {
  return value === "auto" ? "auto" : "manual";
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function buildChapterId(chapterNo: number | null | undefined): string | null {
  if (!Number.isFinite(Number(chapterNo))) return null;
  const n = Math.floor(Number(chapterNo));
  if (n <= 0 || n > 9999) return null;
  return `ch${String(n).padStart(2, "0")}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inferRootCause(taskError: string | null, resultJson: Record<string, unknown>): RootCauseClass {
  const splitRuntime = asRecord(resultJson.split_runtime);
  const runtimeRoot = String(splitRuntime.root_cause_class || "").toUpperCase();
  if (
    runtimeRoot === "OUTLINE" ||
    runtimeRoot === "BUDGET" ||
    runtimeRoot === "ARTIFACT" ||
    runtimeRoot === "LLM_TRANSPORT" ||
    runtimeRoot === "UNKNOWN"
  ) {
    return runtimeRoot as RootCauseClass;
  }
  const err = String(taskError || resultJson.error || "").toUpperCase();
  if (err.includes("OUTLINE_COVERAGE_FAIL")) return "OUTLINE";
  if (
    err.includes("TIMEOUT") ||
    err.includes("CONNECTION") ||
    err.includes("TRANSPORT") ||
    err.includes("ECONNREFUSED")
  ) {
    return "LLM_TRANSPORT";
  }
  const stopReason = String(splitRuntime.phase_stop_reason || "").toUpperCase();
  if (stopReason.includes("BUDGET_EXCEEDED") || stopReason.includes("TIME_BUDGET")) return "BUDGET";
  const artifact = asRecord(resultJson.analysis_chunk_artifact);
  const artifactStatus = String(artifact.status || "").toUpperCase();
  const diagnostics = asRecord(artifact.diagnostics);
  const oversized = Number(diagnostics.oversized_count || 0);
  if (artifactStatus === "NOT_READY" || oversized > 0 || err.includes("ARTIFACT_NOT_READY")) return "ARTIFACT";
  return "UNKNOWN";
}

function budgetTierByChapterChars(chapterChars: number): {
  profile: "short" | "medium" | "long" | "retry_recovery";
  total: number;
  outline: number;
  primary: number;
  repair: number;
} {
  if (chapterChars > 13000) {
    return { profile: "long", total: 320, outline: 90, primary: 190, repair: 80 };
  }
  if (chapterChars > 7000) {
    return { profile: "medium", total: 220, outline: 60, primary: 110, repair: 40 };
  }
  return { profile: "short", total: 180, outline: 55, primary: 95, repair: 30 };
}

function buildRetryPatch(task: {
  payload_json: unknown;
  result_json: unknown;
  error: string | null;
  attempts?: number | null;
}, requestedProfile?: RetryProfileCode | null): {
  retryProfileUsed: RetryProfileCode;
  rootCauseClass: RootCauseClass;
  recommendedActionCode: string;
  splitControlsPatch: Record<string, unknown>;
  retryProfileAutoCorrected?: boolean;
} {
  const payload = asRecord(task.payload_json);
  const result = asRecord(task.result_json);
  const currentControls = asRecord(payload.split_controls);
  const rootCause = inferRootCause(task.error, result);
  const artifact = asRecord(result.analysis_chunk_artifact);
  const diagnostics = asRecord(artifact.diagnostics);
  const chapterStats = asRecord(result.chapter_text_stats);
  const chapterChars =
    toFiniteNumber(chapterStats.chars) ??
    (typeof result.chapter_text_basis === "string" ? result.chapter_text_basis.length : 0);
  const attempts = Math.max(0, Math.floor(Number(task.attempts || 0)));
  let profile =
    requestedProfile ||
    (rootCause === "OUTLINE"
      ? "auto_recovery_outline"
      : rootCause === "BUDGET"
        ? "auto_recovery_budget"
        : rootCause === "ARTIFACT"
          ? "auto_recovery_artifact"
          : "auto_recovery_transport");
  let retryProfileAutoCorrected = false;
  if (rootCause === "BUDGET" && profile === "auto_recovery_transport") {
    profile = "auto_recovery_budget";
    retryProfileAutoCorrected = true;
  }

  const patch: Record<string, unknown> = {
    self_healing_enabled: true,
    auto_retry_enabled: true,
    retry_profile_used: profile,
    retry_root_cause: rootCause,
    retry_requested_at: new Date().toISOString(),
  };
  const forcedExisting = typeof currentControls.forced_strategy === "string" ? currentControls.forced_strategy : "";
  if (forcedExisting) {
    patch.forced_strategy = null;
    patch.recovery_override = true;
  }

  if (profile === "auto_recovery_outline") {
    patch.max_llm_calls = Math.max(4, Number(currentControls.max_llm_calls || 0));
    return {
      retryProfileUsed: profile,
      rootCauseClass: rootCause,
      recommendedActionCode: "RETRY_WITH_OUTLINE_RECOVERY",
      splitControlsPatch: patch,
      retryProfileAutoCorrected,
    };
  }

  if (profile === "auto_recovery_budget") {
    const currentMaxCalls = Number(currentControls.max_llm_calls || 0);
    const isLongChapter = chapterChars > 10000;
    const useAggressiveRecovery = isLongChapter && attempts <= 2;
    if (useAggressiveRecovery) {
      patch.max_llm_calls = Math.max(8, currentMaxCalls);
      patch.total_budget_sec = 600;
      patch.outline_budget_sec = 120;
      patch.primary_budget_sec = 360;
      patch.repair_budget_sec = 180;
      patch.budget_profile = "retry_recovery";
      patch.recovery_override = true;
    } else {
      const tier = budgetTierByChapterChars(chapterChars);
      patch.max_llm_calls = Math.max(6, currentMaxCalls);
      if (isLongChapter) {
        patch.total_budget_sec = 360;
        patch.outline_budget_sec = 90;
        patch.primary_budget_sec = 210;
        patch.repair_budget_sec = 90;
        patch.budget_profile = "long";
      } else {
        patch.total_budget_sec = tier.total;
        patch.outline_budget_sec = tier.outline;
        patch.primary_budget_sec = tier.primary;
        patch.repair_budget_sec = tier.repair;
        patch.budget_profile = tier.profile;
      }
      patch.manual_review_hint = attempts > 2;
      if (attempts > 2) {
        const existingReasons = Array.isArray(payload.reason_codes)
          ? payload.reason_codes.map((v) => String(v)).filter(Boolean)
          : [];
        patch.reason_codes = [...new Set([...existingReasons, "BUDGET_RECOVERY_CAP_REACHED_MANUAL_REVIEW"])];
      }
    }
    return {
      retryProfileUsed: profile,
      rootCauseClass: rootCause,
      recommendedActionCode: "RETRY_WITH_BUDGET_RECOVERY",
      splitControlsPatch: patch,
      retryProfileAutoCorrected,
    };
  }

  if (profile === "auto_recovery_artifact") {
    const oversized = Number(diagnostics.oversized_count || 0);
    patch.max_llm_calls = Math.max(4, Number(currentControls.max_llm_calls || 0));
    patch.repair_budget_sec = Math.max(45, Number(currentControls.repair_budget_sec || 0));
    patch.analysis_chunk_max_chars = 4000;
    patch.expect_oversized_repair = oversized > 0;
    return {
      retryProfileUsed: profile,
      rootCauseClass: rootCause,
      recommendedActionCode: "RETRY_WITH_ARTIFACT_RECOVERY",
      splitControlsPatch: patch,
      retryProfileAutoCorrected,
    };
  }

  patch.max_llm_calls = Math.max(3, Number(currentControls.max_llm_calls || 0));
  return {
    retryProfileUsed: profile,
    rootCauseClass: rootCause,
    recommendedActionCode: "RETRY_AFTER_LLM_HEALTH_CHECK",
    splitControlsPatch: patch,
    retryProfileAutoCorrected,
  };
}

function applyRetryPatchToPayload(
  payloadJson: unknown,
  patch: ReturnType<typeof buildRetryPatch>
): Record<string, unknown> {
  const payload = asRecord(payloadJson);
  const splitControls = asRecord(payload.split_controls);
  return {
    ...payload,
    retry_profile: patch.retryProfileUsed,
    split_controls: {
      ...splitControls,
      ...patch.splitControlsPatch,
    },
  };
}

export async function getIngestJobsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const limit = Math.min(parsePositiveInt(req.nextUrl.searchParams.get("limit"), 20), 100);
    const offset = parseNonNegativeInt(req.nextUrl.searchParams.get("offset"), 0);
    const jobIdRaw = req.nextUrl.searchParams.get("job_id");
    const jobId = jobIdRaw && Number.isFinite(Number(jobIdRaw)) ? Number(jobIdRaw) : null;

    const countRes = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM public.ingest_job
       WHERE story_id = $1 AND created_by <> 'system_replay'`,
      [storyId]
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const jobsRes = await pool.query(
      `SELECT id, story_id, created_by, mode, status, config_json, total_tasks, completed_tasks, created_at, updated_at
       FROM public.ingest_job
       WHERE story_id = $1 AND created_by <> 'system_replay'
       ORDER BY created_at DESC
       LIMIT $2
       OFFSET $3`,
      [storyId, limit, offset]
    );

    let tasks: Array<Record<string, unknown>> = [];
    if (jobId !== null) {
      const taskRes = await pool.query(
        `SELECT id, job_id, story_id, task_type, unit_type, source_path, seq_no, status, attempts, error, created_at, updated_at,
                payload_json->>'chapter_task_id' AS chapter_task_id,
                payload_json->'approved_scene'->>'idx' AS approved_scene_idx,
                payload_json,
                result_json
         FROM public.ingest_task
         WHERE story_id = $1 AND job_id = $2
         ORDER BY seq_no ASC
         LIMIT 500`,
        [storyId, jobId]
      );
      tasks = taskRes.rows;
    }

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      jobs: jobsRes.rows,
      tasks,
      pagination: {
        limit,
        offset,
        total,
        has_prev: offset > 0,
        has_next: offset + jobsRes.rows.length < total,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "INGEST_LIST_JOBS_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function createIngestJobResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();

  try {
    const parsed = await parseIngestRequest(req);
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const reviewMode = parseJobMode(parsed.reviewMode);
    const splitMode = parseSplitMode(parsed.splitMode);
    const selfHealingEnabled = parsed.selfHealingEnabled !== false;
    const autoRetryEnabled = parsed.autoRetryEnabled !== false;
    const maxLlmCalls = Math.min(5, Math.max(1, Number(parsed.maxLlmCalls ?? 3)));
    const validateBeforeSplit = parsed.validateBeforeSplit === true;
    const validation = validateAndNormalizeInput(parsed.payload, { splitMode });

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          errors: validation.errors,
          summary: validation.summary,
        },
        { status: 400 }
      );
    }

    await client.query("BEGIN");
    const ingestRunId = randomUUID();

    const jobStatus = "RUNNING";
    const createJobRes = await client.query<{ id: number }>(
      `INSERT INTO public.ingest_job
        (story_id, created_by, mode, status, ingest_run_id, config_json, total_tasks, completed_tasks)
       VALUES
        ($1, $2, $3, $4, $5::uuid, $6::jsonb, $7, 0)
       RETURNING id`,
      [
        storyId,
        parsed.createdBy ?? "ui",
        reviewMode,
        jobStatus,
        ingestRunId,
        JSON.stringify({
          input_mode: validation.summary.mode,
          total_chapters: validation.summary.total_chapters,
          total_scenes_estimate: validation.summary.total_scenes_estimate,
          auto_split_v1: true,
          split_mode: splitMode,
          validate_before_split: validateBeforeSplit,
          split_controls: {
            self_healing_enabled: selfHealingEnabled,
            auto_retry_enabled: autoRetryEnabled,
            max_llm_calls: maxLlmCalls,
          },
        }),
        validation.chapters.length,
      ]
    );
    const jobId = Number(createJobRes.rows[0]?.id ?? 0);

    const coolOffSeconds = Number(process.env.LLM_COOL_OFF_SECONDS ?? "60");
    let taskIdx = 0;
    for (const chapter of validation.chapters) {
      const normalizedText = normalizeLineEndings(chapter.text);
      const textSha = sha256Hex(normalizedText);
      const chapterId = buildChapterId(chapter.chapter_no);
      const sourceDocRes = await client.query<{ id: string }>(
        `INSERT INTO public.source_doc
          (story_id, doc_type, origin, raw_text, raw_text_sha256, char_len)
         VALUES
          ($1::bigint, 'ingest_chapter', $2::jsonb, $3::text, $4::text, char_length($3::text))
         ON CONFLICT (story_id, raw_text_sha256)
         DO UPDATE SET
           origin = public.source_doc.origin || EXCLUDED.origin
         RETURNING id::text`,
        [
          storyId,
          JSON.stringify({
            ingest_job_id: jobId,
            ingest_run_id: ingestRunId,
            chapter_no: chapter.chapter_no,
            chapter_id: chapterId,
            source_path: chapter.source_path,
            source_type: "canonical_chapter",
            source_role: "canonical_truth",
          }),
          normalizedText,
          textSha,
        ]
      );
      const sourceDocId = sourceDocRes.rows[0]?.id;
      if (!sourceDocId) {
        throw new Error("SOURCE_DOC_CREATE_FAILED");
      }

      // Stagger tasks
      const delaySec = taskIdx * coolOffSeconds;
      const availableAtSql = `NOW() + INTERVAL '${delaySec} seconds'`;

      await client.query(
        `INSERT INTO public.ingest_task
          (job_id, story_id, task_type, unit_type, source_path, seq_no, status, attempts, payload_json, available_at)
         VALUES
          ($1::bigint, $2::bigint, 'CHAPTER_INGEST', 'chapter_ingest', $3::text, $4::integer, 'READY', 0, $5::jsonb, ${availableAtSql})`,
        [
          jobId,
          storyId,
          chapter.source_path,
          chapter.seq_no,
          JSON.stringify({
            chapter_no: chapter.chapter_no,
            chapter_id: chapterId,
            source_doc_id: sourceDocId,
            source_doc_sha256: textSha,
            estimated_scenes: chapter.estimated_scenes,
            ingest_run_id: ingestRunId,
            validate_before_split: validateBeforeSplit,
            split_mode: splitMode,
            split_controls: {
              self_healing_enabled: selfHealingEnabled,
              auto_retry_enabled: autoRetryEnabled,
              max_llm_calls: maxLlmCalls,
            },
          }),
        ]
      );
      taskIdx++;
    }

    await client.query("COMMIT");
    const worker = await ensureIngestWorkerRunning();
    return NextResponse.json({
      ok: true,
      job_id: jobId,
      story_id: storyId,
      review_mode: reviewMode,
      split_mode: splitMode,
      split_controls: {
        self_healing_enabled: selfHealingEnabled,
        auto_retry_enabled: autoRetryEnabled,
        max_llm_calls: maxLlmCalls,
      },
      ingest_run_id: ingestRunId,
      summary: validation.summary,
      worker,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "INGEST_CREATE_JOB_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

export async function patchIngestJobResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();

  try {
    const body = (await req.json()) as {
      action?: string;
      job_id?: number | string;
      task_id?: number | string;
      retry_profile?: string;
    };
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const action = parseAction(body.action);
    const jobId = Number(body.job_id);
    const taskId = body.task_id === undefined ? null : Number(body.task_id);
    const retryProfileRaw = typeof body.retry_profile === "string" ? body.retry_profile.trim().toLowerCase() : "";
    const retryProfile: RetryProfileCode | null = (
      retryProfileRaw === "auto_recovery_outline" ||
      retryProfileRaw === "auto_recovery_budget" ||
      retryProfileRaw === "auto_recovery_artifact" ||
      retryProfileRaw === "auto_recovery_transport"
    )
      ? (retryProfileRaw as RetryProfileCode)
      : null;

    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_JOB_ID" }, { status: 400 });
    }

    await client.query("BEGIN");

    const jobRes = await client.query(
      `SELECT id, status
       FROM public.ingest_job
       WHERE id = $1 AND story_id = $2
       FOR UPDATE`,
      [jobId, storyId]
    );
    if (jobRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    if (action === "cancel_job") {
      await client.query(
        `UPDATE public.ingest_job
         SET status = 'CANCELLED', updated_at = now()
         WHERE id = $1`,
        [jobId]
      );
      await reconcileTerminalJobTasks(client, storyId, jobId, "JOB_CANCELLED_BY_USER");
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, action, job_id: jobId, status: "CANCELLED" });
    }

    if (action === "retry_failed_tasks") {
      const currentJobStatus = String(jobRes.rows[0]?.status || "").toUpperCase();
      if (["DONE", "CANCELLED", "REJECTED"].includes(currentJobStatus)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "JOB_TERMINAL_RETRY_BLOCKED" }, { status: 409 });
      }
      const failedRes = await client.query<{
        id: number;
        task_type: string;
        payload_json: unknown;
        result_json: unknown;
        error: string | null;
        attempts: number;
      }>(
        `SELECT id, task_type, payload_json, result_json, error, attempts
         FROM public.ingest_task
         WHERE story_id = $1
           AND job_id = $2
           AND status = 'FAILED'
           AND attempts < 8
         FOR UPDATE`,
        [storyId, jobId]
      );
      let retried = 0;
      for (const row of failedRes.rows) {
        const payload = asRecord(row.payload_json);
        let nextPayload: Record<string, unknown> = payload;
        if (row.task_type === "CHAPTER_SPLIT_LLM") {
          const patch = buildRetryPatch(
            { payload_json: row.payload_json, result_json: row.result_json, error: row.error, attempts: row.attempts },
            retryProfile
          );
          nextPayload = applyRetryPatchToPayload(payload, patch);
        }
        await client.query(
          `UPDATE public.ingest_task it
           SET status = 'PENDING',
               error = NULL,
               updated_at = now(),
               payload_json = COALESCE(
                 CASE
                   WHEN it.task_type = 'CHAPTER_SPLIT_LLM' THEN
                     (
                       SELECT $4::jsonb || jsonb_build_object(
                         'source_doc_id', sd.id::text,
                         'source_doc_sha256', sd.raw_text_sha256
                       )
                       FROM public.source_doc sd
                       WHERE sd.story_id = it.story_id
                         AND sd.is_stable = true
                         AND COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')) = (it.payload_json->>'chapter_id')
                       ORDER BY sd.created_at DESC
                       LIMIT 1
                     )
                   ELSE $4::jsonb
                 END,
                 $4::jsonb
               )
           WHERE id = $1
             AND story_id = $2
             AND job_id = $3`,
          [row.id, storyId, jobId, JSON.stringify(nextPayload)]
        );
        retried += 1;
      }

      await client.query(
        `UPDATE public.ingest_job
         SET status = 'RUNNING', updated_at = now()
         WHERE id = $1`,
        [jobId]
      );

      await client.query("COMMIT");
      const worker = await ensureIngestWorkerRunning();
      return NextResponse.json({
        ok: true,
        action,
        job_id: jobId,
        retried,
        worker,
      });
    }

    if (action === "retry_task") {
      if (taskId === null || !Number.isFinite(taskId) || taskId <= 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "INVALID_TASK_ID" }, { status: 400 });
      }
      const currentJobStatus = String(jobRes.rows[0]?.status || "").toUpperCase();
      if (["DONE", "CANCELLED", "REJECTED"].includes(currentJobStatus)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "JOB_TERMINAL_RETRY_BLOCKED" }, { status: 409 });
      }

      const taskStateRes = await client.query<{
        id: number;
        task_type: string;
        payload_json: unknown;
        result_json: unknown;
        error: string | null;
        attempts: number;
      }>(
        `SELECT id, task_type, payload_json, result_json, error, attempts
         FROM public.ingest_task
         WHERE id = $1
           AND story_id = $2
           AND job_id = $3
           AND (
             status = 'FAILED' OR 
             status = 'RUNNING' OR 
             (status = 'DONE' AND upper(coalesce(result_json->>'operational_state', '')) = 'NEEDS_RETRY')
           )
           AND attempts < 8
         FOR UPDATE`,
        [taskId, storyId, jobId]
      );
      if (taskStateRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "TASK_NOT_RETRYABLE" }, { status: 409 });
      }
      const taskRow = taskStateRes.rows[0];
      let nextPayload = asRecord(taskRow.payload_json);
      let retryDiagnostics: Record<string, unknown> | null = null;
      if (taskRow.task_type === "CHAPTER_SPLIT_LLM") {
        const patch = buildRetryPatch(
          { payload_json: taskRow.payload_json, result_json: taskRow.result_json, error: taskRow.error, attempts: taskRow.attempts },
          retryProfile
        );
        const runtime = asRecord(asRecord(taskRow.result_json).split_runtime);
        const rootCauseSecondary = Array.isArray(runtime.root_cause_secondary)
          ? runtime.root_cause_secondary.map((v) => String(v)).filter(Boolean)
          : [];
        nextPayload = applyRetryPatchToPayload(nextPayload, patch);
        retryDiagnostics = {
          retry_profile_used: patch.retryProfileUsed,
          root_cause_class: patch.rootCauseClass,
          root_cause_secondary: rootCauseSecondary,
          recommended_action_code: patch.recommendedActionCode,
          retry_profile_auto_corrected: Boolean(patch.retryProfileAutoCorrected),
        };
      }
      await client.query(
        `UPDATE public.ingest_task it
         SET status = 'PENDING',
             error = NULL,
             updated_at = now(),
             payload_json = COALESCE(
               CASE
                 WHEN it.task_type = 'CHAPTER_SPLIT_LLM' THEN
                   (
                     SELECT $4::jsonb || jsonb_build_object(
                       'source_doc_id', sd.id::text,
                       'source_doc_sha256', sd.raw_text_sha256
                     )
                     FROM public.source_doc sd
                     WHERE sd.story_id = it.story_id
                       AND sd.is_stable = true
                       AND COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')) = (it.payload_json->>'chapter_id')
                     ORDER BY sd.created_at DESC
                     LIMIT 1
                   )
                 ELSE $4::jsonb
               END,
               $4::jsonb
             )
         WHERE id = $1
           AND story_id = $2
           AND job_id = $3`,
        [taskId, storyId, jobId, JSON.stringify(nextPayload)]
      );

      await client.query(
        `UPDATE public.ingest_job
         SET status = 'RUNNING', updated_at = now()
         WHERE id = $1`,
        [jobId]
      );

      await client.query("COMMIT");
      const worker = await ensureIngestWorkerRunning();
      return NextResponse.json({
        ok: true,
        action,
        job_id: jobId,
        task_id: taskId,
        worker,
        retry_diagnostics: retryDiagnostics,
      });
    }

    await client.query("ROLLBACK");
    return NextResponse.json({ ok: false, error: "UNSUPPORTED_ACTION" }, { status: 400 });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "INGEST_JOB_ACTION_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

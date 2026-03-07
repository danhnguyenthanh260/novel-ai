/* eslint-disable max-lines */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { ensureIngestWorkerRunning } from "@/features/ingest/server/workerControl";
import { createHash, randomUUID } from "crypto";
import { reconcileTerminalJobTasks } from "@/features/ingest/server/ingestTaskReconcileService";

const VALID_STRATEGIES = new Set(["S0_BASE", "S1_STRICT_BOUNDARY", "S1_TARGETED_WINDOW_REPAIR", "S2_MERGE_FIX", "S3_SEMANTIC_RESPLIT"]);
const ALLOW_FORCED_STRATEGY_LEARNING = String(process.env.ALLOW_FORCED_STRATEGY_LEARNING ?? "").toLowerCase() === "true";

function parseBool(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        const s = value.trim().toLowerCase();
        if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
        if (s === "0" || s === "false" || s === "no" || s === "off") return false;
    }
    return fallback;
}

function parseSplitControls(raw: unknown): Record<string, unknown> {
    const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    const parseStringArray = (value: unknown, maxItems = 20, maxLen = 120): string[] => {
        if (!Array.isArray(value)) return [];
        const items: string[] = [];
        for (const v of value) {
            const text = typeof v === "string" ? v.trim().slice(0, maxLen) : "";
            if (!text || items.includes(text)) continue;
            items.push(text);
            if (items.length >= maxItems) break;
        }
        return items;
    };
    if (typeof src.forced_strategy === "string" && src.forced_strategy.trim()) {
        const forced = src.forced_strategy.trim();
        if (!VALID_STRATEGIES.has(forced)) {
            throw new Error("INVALID_FORCED_STRATEGY");
        }
        out.forced_strategy = forced;
    }
    if (src.self_healing_enabled !== undefined) {
        out.self_healing_enabled = parseBool(src.self_healing_enabled, true);
    }
    if (src.max_llm_calls !== undefined) {
        const n = Number(src.max_llm_calls);
        out.max_llm_calls = Number.isFinite(n) ? Math.min(5, Math.max(1, Math.floor(n))) : 5;
    } else {
        out.max_llm_calls = 5;
    }
    const allowLearning = parseBool(src.allow_learning, false);
    if (allowLearning && out.forced_strategy && !ALLOW_FORCED_STRATEGY_LEARNING) {
        throw new Error("FORCED_STRATEGY_LEARNING_DISABLED");
    }
    if (allowLearning) out.allow_learning = true;
    if (typeof src.runtime_mode === "string" && src.runtime_mode.trim()) {
        const mode = src.runtime_mode.trim().toUpperCase();
        if (mode === "S3_STRATEGIC") out.runtime_mode = mode;
    }
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

function buildSplitIdempotencyKey(storyId: number, sourcePath: string, sourceDocSha256: string, ingestRunId: string): string {
    return createHash("sha256")
        .update(`${storyId}:split_v2:${sourcePath}:${sourceDocSha256}:${ingestRunId}`)
        .digest("hex");
}

function parsePositiveInt(value: unknown, field: string): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`INVALID_${field}`);
    return Math.floor(n);
}


// ---------------------------------------------------------------------------
// Approve chapter data → create CHAPTER_SPLIT_LLM task, job → SPLIT_DRAFT
// ---------------------------------------------------------------------------

export async function approveChapterDataResponse(
    req: NextRequest,
    storySlug: string
): Promise<NextResponse> {
    const client = await pool.connect();
    try {
        const body = await req.json().catch(() => ({}));
        const jobId = Number(body?.job_id);
        const splitMode: string = body?.split_mode === "auto" ? "auto" : "manual";
        const splitControls = parseSplitControls(body?.split_controls);

        if (!Number.isFinite(jobId) || jobId <= 0) {
            return NextResponse.json({ ok: false, error: "INVALID_JOB_ID" }, { status: 400 });
        }

        const storyId = await resolveStoryIdForWrite(pool, storySlug);
        await client.query("BEGIN");

        const jobRes = await client.query<{ id: number; config_json: Record<string, unknown> }>(
            `SELECT id, config_json
       FROM public.ingest_job
       WHERE id = $1 AND story_id = $2 AND status = 'AWAITING_DATA_APPROVAL'
       FOR UPDATE
       LIMIT 1`,
            [jobId, storyId]
        );
        if (!jobRes.rows[0]) {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND_OR_NOT_AWAITING" }, { status: 404 });
        }

        const ingestRunId = randomUUID();
        let splitTasksInserted = 0;
        const seqRes = await client.query<{ next_seq: number }>(
            `SELECT COALESCE(MAX(seq_no), 0)::int + 1 AS next_seq
             FROM public.ingest_task
             WHERE job_id = $1`,
            [jobId]
        );
        let nextSeqNo = Number(seqRes.rows[0]?.next_seq ?? 1);

        const validateTasksRes = await client.query<{
            id: number;
            source_path: string;
            seq_no: number;
            payload_json: Record<string, unknown>;
        }>(
            `SELECT id, source_path, seq_no, payload_json
       FROM public.ingest_task
       WHERE job_id = $1 AND task_type = 'CHAPTER_VALIDATE' AND status = 'DONE'
       ORDER BY seq_no ASC`,
            [jobId]
        );

        if (validateTasksRes.rows.length > 0) {
            const coolOffSeconds = Number(process.env.LLM_COOL_OFF_SECONDS ?? "60");
            let taskIdx = 0;
            for (const vt of validateTasksRes.rows) {
                const payload = vt.payload_json ?? {};
                const sourceDocId = String(payload.source_doc_id ?? "");
                const chapterNo = payload.chapter_no;
                const sourceDocSha256 = String(payload.source_doc_sha256 ?? "");
                const idempotencyKey = createHash("sha256")
                    .update(`${storyId}:split_v1:${vt.source_path}:${ingestRunId}`)
                    .digest("hex");
                const delaySec = taskIdx * coolOffSeconds;
                const availableAtSql = `NOW() + INTERVAL '${delaySec} seconds'`;

                await client.query(
                    `INSERT INTO public.ingest_task
          (job_id, story_id, task_type, unit_type, source_path, seq_no, status, attempts, idempotency_key, payload_json, available_at)
         VALUES
          ($1::bigint, $2::bigint, 'CHAPTER_SPLIT_LLM', 'split_draft', $3::text, $4::integer, 'READY', 0, $5::text, $6::jsonb, ${availableAtSql})`,
                    [
                        jobId,
                        storyId,
                        vt.source_path,
                        nextSeqNo++,
                        idempotencyKey,
                        JSON.stringify({
                            chapter_no: chapterNo,
                            source_doc_id: sourceDocId,
                            source_doc_sha256: sourceDocSha256,
                            ingest_run_id: ingestRunId,
                            split_mode: splitMode,
                            split_controls: splitControls,
                        }),
                    ]
                );
                splitTasksInserted++;
                taskIdx++;
            }
        } else {
            const ingestTasksRes = await client.query<{
                id: number;
                source_path: string;
                seq_no: number;
                payload_json: Record<string, unknown>;
                result_json: Record<string, unknown>;
            }>(
                `SELECT id, source_path, seq_no, payload_json, result_json
                 FROM public.ingest_task
                 WHERE job_id = $1
                   AND task_type = 'CHAPTER_INGEST'
                   AND status = 'DONE'
                 ORDER BY seq_no ASC`,
                [jobId]
            );
            if (!ingestTasksRes.rows.length) {
                await client.query("ROLLBACK");
                return NextResponse.json({ ok: false, error: "NO_CHAPTER_INGEST_TASKS_DONE" }, { status: 400 });
            }

            for (const row of ingestTasksRes.rows) {
                const payload = row.payload_json ?? {};
                const result = row.result_json ?? {};
                const sourceDocId = String(result.source_doc_id ?? payload.source_doc_id ?? "").trim();
                const sourceDocSha256 = String(result.source_doc_sha256 ?? payload.source_doc_sha256 ?? "").trim();
                const chapterNo = payload.chapter_no;
                const chapterIdPayload = typeof payload.chapter_id === "string" ? payload.chapter_id : null;
                if (!sourceDocId || !sourceDocSha256) continue;

                const existedSplit = await client.query<{ c: number }>(
                    `SELECT count(*)::int AS c
                     FROM public.ingest_task
                     WHERE job_id = $1
                       AND story_id = $2
                       AND task_type = 'CHAPTER_SPLIT_LLM'
                       AND payload_json->>'chapter_task_id' = $3`,
                    [jobId, storyId, String(row.id)]
                );
                if (Number(existedSplit.rows[0]?.c ?? 0) > 0) continue;

                const srcRes = await client.query<{ chapter_id: string | null }>(
                    `SELECT origin->>'chapter_id' AS chapter_id
                     FROM public.source_doc
                     WHERE story_id = $1 AND id::text = $2
                     LIMIT 1`,
                    [storyId, sourceDocId]
                );
                const chapterIdResolved = srcRes.rows[0]?.chapter_id || chapterIdPayload || "";
                if (chapterIdResolved) {
                    await client.query(
                        `UPDATE public.source_doc
                         SET is_stable = false
                         WHERE story_id = $1
                           AND doc_type = 'ingest_chapter'
                           AND COALESCE(origin->>'chapter_id', '') = $2
                           AND id::text <> $3`,
                        [storyId, chapterIdResolved, sourceDocId]
                    );
                }
                await client.query(
                    `UPDATE public.source_doc
                     SET is_stable = true,
                         version = version + 1
                     WHERE story_id = $1 AND id::text = $2`,
                    [storyId, sourceDocId]
                );
                await client.query(
                    `UPDATE public.ingest_task
                     SET human_outcome = 'APPROVED_HUMAN',
                         human_verdict_by = 'batch_approve',
                         human_verdict_at = now(),
                         updated_at = now()
                     WHERE id = $1`,
                    [row.id]
                );
                await client.query(
                    `INSERT INTO public.ingest_task
                      (job_id, story_id, task_type, unit_type, source_path, seq_no, status, attempts, idempotency_key, payload_json, available_at)
                     VALUES
                      ($1::bigint, $2::bigint, 'CHAPTER_SPLIT_LLM', 'split_draft', $3::text, $4::integer, 'READY', 0, $5::text, $6::jsonb, NOW())`,
                    [
                        jobId,
                        storyId,
                        row.source_path,
                        nextSeqNo++,
                        buildSplitIdempotencyKey(storyId, row.source_path || "", sourceDocSha256, ingestRunId),
                        JSON.stringify({
                            chapter_no: chapterNo,
                            chapter_id: chapterIdResolved || chapterIdPayload,
                            source_doc_id: sourceDocId,
                            source_doc_sha256: sourceDocSha256,
                            ingest_run_id: ingestRunId,
                            split_mode: splitMode,
                            split_controls: splitControls,
                            chapter_task_id: row.id,
                        }),
                    ]
                );
                splitTasksInserted++;
            }

            if (splitTasksInserted === 0) {
                await client.query("ROLLBACK");
                return NextResponse.json({ ok: false, error: "NO_CHAPTERS_APPROVED_OR_ALREADY_QUEUED" }, { status: 409 });
            }
        }

        await client.query(
            `UPDATE public.ingest_job
       SET status = 'SPLIT_DRAFT', updated_at = now(),
           total_tasks = total_tasks + $1
       WHERE id = $2`,
            [splitTasksInserted, jobId]
        );

        await client.query("COMMIT");
        const worker = await ensureIngestWorkerRunning();
        return NextResponse.json({ ok: true, job_id: jobId, split_tasks_inserted: splitTasksInserted, worker });
    } catch (err: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        const msg = err instanceof Error ? err.message : "APPROVE_CHAPTER_DATA_FAILED";
        const status = msg === "INVALID_FORCED_STRATEGY" || msg === "FORCED_STRATEGY_LEARNING_DISABLED" ? 400 : 500;
        return NextResponse.json({ ok: false, error: msg }, { status });
    } finally {
        client.release();
    }
}

export async function approveIngestChapterResponse(
    req: NextRequest,
    storySlug: string,
    rawJobId: string,
    rawChapterTaskId: string
): Promise<NextResponse> {
    const client = await pool.connect();
    try {
        const storyId = await resolveStoryIdForWrite(pool, storySlug);
        const jobId = parsePositiveInt(rawJobId, "JOB_ID");
        const chapterTaskId = parsePositiveInt(rawChapterTaskId, "CHAPTER_TASK_ID");
        const body = (await req.json().catch(() => ({}))) as {
            created_by?: unknown;
            split_mode?: unknown;
            split_controls?: unknown;
        };
        const createdBy = typeof body.created_by === "string" && body.created_by.trim()
            ? body.created_by.trim().slice(0, 120)
            : "ui";
        const splitMode: "manual" | "auto" = body?.split_mode === "auto" ? "auto" : "manual";
        const splitControls = parseSplitControls(body?.split_controls);

        await client.query("BEGIN");
        const jobRes = await client.query<{ id: number; status: string; ingest_run_id: string | null }>(
            `SELECT id, status, ingest_run_id::text
             FROM public.ingest_job
             WHERE id = $1 AND story_id = $2
             FOR UPDATE`,
            [jobId, storyId]
        );
        if (!jobRes.rows[0]) {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
        }
        const job = jobRes.rows[0];
        if (!["AWAITING_DATA_APPROVAL", "RUNNING", "SPLIT_DRAFT"].includes(job.status)) {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "JOB_NOT_CHAPTER_APPROVABLE" }, { status: 409 });
        }

        const ingestTaskRes = await client.query<{
            id: number;
            source_path: string;
            seq_no: number;
            payload_json: Record<string, unknown> | null;
            result_json: Record<string, unknown> | null;
            status: string;
        }>(
            `SELECT id, source_path, seq_no, payload_json, result_json, status
             FROM public.ingest_task
             WHERE id = $1
               AND job_id = $2
               AND story_id = $3
               AND task_type = 'CHAPTER_INGEST'
             LIMIT 1`,
            [chapterTaskId, jobId, storyId]
        );
        const ingestTask = ingestTaskRes.rows[0];
        if (!ingestTask) {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "CHAPTER_INGEST_TASK_NOT_FOUND" }, { status: 404 });
        }
        if (String(ingestTask.status || "").toUpperCase() !== "DONE") {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "CHAPTER_INGEST_NOT_DONE" }, { status: 409 });
        }

        const payload = ingestTask.payload_json ?? {};
        const result = ingestTask.result_json ?? {};
        const sourceDocId = String(result.source_doc_id ?? payload.source_doc_id ?? "").trim();
        const sourceDocSha = String(result.source_doc_sha256 ?? payload.source_doc_sha256 ?? "").trim();
        const chapterNo = Number.isFinite(Number(payload.chapter_no)) ? Math.floor(Number(payload.chapter_no)) : null;
        const chapterIdPayload = typeof payload.chapter_id === "string" && payload.chapter_id.trim()
            ? payload.chapter_id.trim()
            : null;
        if (!sourceDocId || !sourceDocSha) {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "CHAPTER_SOURCE_DOC_MISSING" }, { status: 409 });
        }

        const srcRes = await client.query<{ chapter_id: string | null }>(
            `SELECT origin->>'chapter_id' AS chapter_id
             FROM public.source_doc
             WHERE story_id = $1 AND id::text = $2
             LIMIT 1`,
            [storyId, sourceDocId]
        );
        if (!srcRes.rows[0]) {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "SOURCE_DOC_NOT_FOUND" }, { status: 404 });
        }
        const chapterId = srcRes.rows[0].chapter_id || chapterIdPayload || "";

        const existedSplitRes = await client.query<{ existing_count: number }>(
            `SELECT count(*)::int AS existing_count
             FROM public.ingest_task
             WHERE job_id = $1
               AND story_id = $2
               AND task_type = 'CHAPTER_SPLIT_LLM'
               AND payload_json->>'chapter_task_id' = $3`,
            [jobId, storyId, String(chapterTaskId)]
        );
        if (Number(existedSplitRes.rows[0]?.existing_count ?? 0) > 0) {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "CHAPTER_ALREADY_SPLIT_QUEUED" }, { status: 409 });
        }

        if (chapterId) {
            await client.query(
                `UPDATE public.source_doc
                 SET is_stable = false
                 WHERE story_id = $1
                   AND doc_type = 'ingest_chapter'
                   AND COALESCE(origin->>'chapter_id', '') = $2
                   AND id::text <> $3`,
                [storyId, chapterId, sourceDocId]
            );
        }
        await client.query(
            `UPDATE public.source_doc
             SET is_stable = true,
                 version = version + 1
             WHERE story_id = $1 AND id::text = $2`,
            [storyId, sourceDocId]
        );

        await client.query(
            `UPDATE public.ingest_task
             SET human_outcome = 'APPROVED_HUMAN',
                 human_verdict_by = $1,
                 human_verdict_at = now(),
                 updated_at = now()
             WHERE id = $2`,
            [createdBy, chapterTaskId]
        );

        const nextSeqRes = await client.query<{ next_seq: number }>(
            `SELECT COALESCE(MAX(seq_no), 0)::int + 1 AS next_seq
             FROM public.ingest_task
             WHERE job_id = $1`,
            [jobId]
        );
        const nextSeqNo = Number(nextSeqRes.rows[0]?.next_seq ?? 1);

        await client.query(
            `INSERT INTO public.ingest_task
              (job_id, story_id, task_type, unit_type, source_path, seq_no, status, attempts, idempotency_key, payload_json, available_at)
             VALUES
              ($1::bigint, $2::bigint, 'CHAPTER_SPLIT_LLM', 'split_draft', $3::text, $4::integer, 'READY', 0, $5::text, $6::jsonb, NOW())`,
            [
                jobId,
                storyId,
                ingestTask.source_path,
                nextSeqNo,
                buildSplitIdempotencyKey(
                    storyId,
                    ingestTask.source_path || "",
                    sourceDocSha,
                    job.ingest_run_id || ""
                ),
                JSON.stringify({
                    chapter_no: chapterNo,
                    chapter_id: chapterId || chapterIdPayload,
                    source_doc_id: sourceDocId,
                    source_doc_sha256: sourceDocSha,
                    ingest_run_id: job.ingest_run_id,
                    split_mode: splitMode,
                    split_controls: splitControls,
                    chapter_task_id: chapterTaskId,
                }),
            ]
        );

        await client.query(
            `UPDATE public.ingest_job
             SET status = 'SPLIT_DRAFT',
                 total_tasks = total_tasks + 1,
                 updated_at = now()
             WHERE id = $1`,
            [jobId]
        );

        await client.query("COMMIT");
        const worker = await ensureIngestWorkerRunning();
        return NextResponse.json({
            ok: true,
            job_id: jobId,
            chapter_task_id: chapterTaskId,
            source_doc_id: sourceDocId,
            status: "SPLIT_DRAFT",
            worker,
        });
    } catch (err: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        const msg = err instanceof Error ? err.message : "APPROVE_INGEST_CHAPTER_FAILED";
        const status =
            String(msg).startsWith("INVALID_") || msg === "INVALID_FORCED_STRATEGY" || msg === "FORCED_STRATEGY_LEARNING_DISABLED"
                ? 400
                : 500;
        return NextResponse.json({ ok: false, error: msg }, { status });
    } finally {
        client.release();
    }
}
// ---------------------------------------------------------------------------
// Reject chapter data → job → CANCELLED
// ---------------------------------------------------------------------------

export async function rejectChapterDataResponse(
    req: NextRequest,
    storySlug: string
): Promise<NextResponse> {
    const client = await pool.connect();
    try {
        const body = await req.json().catch(() => ({}));
        const jobId = Number(body?.job_id);
        const note = typeof body?.note === "string" ? body.note.slice(0, 1000) : null;
        const createdBy = typeof body?.created_by === "string" ? body.created_by : "ui";

        if (!Number.isFinite(jobId) || jobId <= 0) {
            return NextResponse.json({ ok: false, error: "INVALID_JOB_ID" }, { status: 400 });
        }

        const storyId = await resolveStoryIdForWrite(pool, storySlug);
        await client.query("BEGIN");

        const upd = await client.query(
            `UPDATE public.ingest_job
       SET status = 'CANCELLED', updated_at = now()
       WHERE id = $1 AND story_id = $2 AND status = 'AWAITING_DATA_APPROVAL'
       RETURNING id`,
            [jobId, storyId]
        );
        if (!upd.rowCount) {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND_OR_NOT_AWAITING" }, { status: 404 });
        }

        // Mark all CHAPTER_VALIDATE tasks as FAILED_HUMAN_REJECTED
        await client.query(
            `UPDATE public.ingest_task
       SET human_outcome = 'FAILED_HUMAN_REJECTED',
           human_verdict_by = $1,
           human_verdict_at = now(),
           updated_at = now()
       WHERE job_id = $2 AND task_type = 'CHAPTER_VALIDATE' AND human_outcome IS NULL`,
            [createdBy, jobId]
        );
        await reconcileTerminalJobTasks(client, storyId, jobId, "JOB_CANCELLED_BY_VALIDATION_REJECT");

        await client.query("COMMIT");
        return NextResponse.json({ ok: true, job_id: jobId, note });
    } catch (err: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        const msg = err instanceof Error ? err.message : "REJECT_CHAPTER_DATA_FAILED";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    } finally {
        client.release();
    }
}

// ---------------------------------------------------------------------------
// Post custom validation rule
// ---------------------------------------------------------------------------

export async function postValidateRuleFeedbackResponse(
    req: NextRequest,
    storySlug: string
): Promise<NextResponse> {
    try {
        const body = await req.json().catch(() => ({}));
        const pattern = typeof body?.pattern === "string" ? body.pattern.trim() : "";
        const description = typeof body?.description === "string" ? body.description.trim() : null;
        const severity = body?.severity === "error" || body?.severity === "info" ? body.severity : "warning";
        const chapterId = typeof body?.chapter_id === "string" ? body.chapter_id.trim() || null : null;
        const createdBy = typeof body?.created_by === "string" ? body.created_by : "ui";

        if (!pattern) {
            return NextResponse.json({ ok: false, error: "PATTERN_REQUIRED" }, { status: 400 });
        }

        const storyId = await resolveStoryId(pool, storySlug);
        const res = await pool.query<{ id: number }>(
            `INSERT INTO public.validate_rule_feedback
         (story_id, chapter_id, pattern, description, severity, created_by, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
            [storyId, chapterId, pattern, description, severity, createdBy]
        );
        return NextResponse.json({ ok: true, rule_id: res.rows[0]?.id });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "POST_RULE_FAILED";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Load validate report for a job
// ---------------------------------------------------------------------------

export async function getValidateReportResponse(
    req: NextRequest,
    storySlug: string
): Promise<NextResponse> {
    try {
        const jobIdRaw = req.nextUrl.searchParams.get("job_id");
        const jobId = Number(jobIdRaw);
        if (!Number.isFinite(jobId) || jobId <= 0) {
            return NextResponse.json({ ok: false, error: "INVALID_JOB_ID" }, { status: 400 });
        }
        const storyId = await resolveStoryId(pool, storySlug);

        const tasksRes = await pool.query(
            `SELECT id, task_type, source_path, seq_no, status, result_json, payload_json
       FROM public.ingest_task
       WHERE job_id = $1
         AND story_id = $2
         AND task_type IN ('CHAPTER_VALIDATE', 'CHAPTER_INGEST')
       ORDER BY seq_no ASC`,
            [jobId, storyId]
        );

        const rulesRes = await pool.query(
            `SELECT id, chapter_id, pattern, description, severity, active, created_at
       FROM public.validate_rule_feedback
       WHERE story_id = $1 AND active = true
       ORDER BY id ASC
       LIMIT 100`,
            [storyId]
        );

        return NextResponse.json({
            ok: true,
            chapters: tasksRes.rows,
            custom_rules: rulesRes.rows,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "GET_VALIDATE_REPORT_FAILED";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}






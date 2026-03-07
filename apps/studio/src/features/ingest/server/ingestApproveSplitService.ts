import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { ensureIngestWorkerRunning } from "@/features/ingest/server/workerControl";

type ApprovedScene = {
  idx: number;
  start: number;
  end: number;
  title: string | null;
  summary: string | null;
  reason: string | null;
};

type SplitTaskResult = {
  source_doc_id: string | null;
  chapter_text: string | null;
  chapter_no: number | null;
  chapter_id: string | null;
  supervisor_decision: string | null;
  issue_hints: Record<string, unknown>;
  quality_report: Record<string, unknown>;
  scenes: ApprovedScene[];
  strategy_selected: string | null;
  quality_self_signal: number | null;
};

type PromotionScope = "iterative" | "rollout";

function parsePositiveInt(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_ID");
  return Math.floor(n);
}

function parseApprovedScenes(raw: unknown): ApprovedScene[] {
  if (!Array.isArray(raw)) return [];
  const out: ApprovedScene[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const idx = Number(row.idx);
    const start = Number(row.start);
    const end = Number(row.end);
    if (!Number.isFinite(idx) || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (idx <= 0 || start < 0 || end <= start) continue;
    out.push({
      idx: Math.floor(idx),
      start: Math.floor(start),
      end: Math.floor(end),
      title: typeof row.title === "string" && row.title.trim() ? row.title.trim().slice(0, 240) : null,
      summary: typeof row.summary === "string" && row.summary.trim() ? row.summary.trim().slice(0, 3000) : null,
      reason: typeof row.reason === "string" && row.reason.trim() ? row.reason.trim().slice(0, 500) : null,
    });
  }
  out.sort((a, b) => a.start - b.start || a.idx - b.idx);
  return out;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseSplitTaskResult(raw: unknown): SplitTaskResult {
  const obj = asObject(raw);
  return {
    source_doc_id: typeof obj.source_doc_id === "string" && obj.source_doc_id.trim() ? obj.source_doc_id.trim() : null,
    chapter_text: typeof obj.chapter_text === "string" && obj.chapter_text.length > 0 ? obj.chapter_text : null,
    chapter_no: Number.isFinite(Number(obj.chapter_no)) ? Math.floor(Number(obj.chapter_no)) : null,
    chapter_id: typeof obj.chapter_id === "string" && obj.chapter_id.trim() ? obj.chapter_id.trim() : null,
    supervisor_decision: typeof obj.supervisor_decision === "string" ? obj.supervisor_decision : null,
    issue_hints: asObject(obj.issue_hints),
    quality_report: asObject(obj.quality_report),
    scenes: parseApprovedScenes(obj.scenes),
    strategy_selected: typeof obj.strategy_selected === "string" && obj.strategy_selected.trim() ? obj.strategy_selected.trim() : null,
    quality_self_signal: Number.isFinite(Number(obj.quality_self_signal)) ? Number(obj.quality_self_signal) : null,
  };
}

function normalizeCreatedBy(raw: unknown): string {
  const x = typeof raw === "string" ? raw.trim() : "";
  return x ? x.slice(0, 120) : "ui";
}

function parsePromotionScope(raw: unknown): PromotionScope {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return value === "rollout" ? "rollout" : "iterative";
}

function parseEnvBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const x = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(x)) return true;
  if (["0", "false", "no", "off"].includes(x)) return false;
  return fallback;
}

function requireShadowGateForRollout(): boolean {
  const primary = parseEnvBool(process.env.INGEST_PROMOTION_REQUIRE_SHADOW, false);
  const fallback = parseEnvBool(process.env.AGENT_PROMOTE_REQUIRE_SHADOW, false);
  return primary || fallback;
}

async function checkShadowEvidenceForTask(
  client: { query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rowCount: number; rows: T[] }> },
  storyId: number,
  splitTaskId: number
): Promise<{ ok: boolean; reason: string; pairStatus?: string; noWriteInvariantOk?: boolean | null }> {
  const res = await client.query<{
    pair_status: string | null;
    compare_json: unknown;
  }>(
    `SELECT pair_status, compare_json
     FROM public.shadow_run_pair
     WHERE story_id = $1
       AND task_id = $2
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [storyId, splitTaskId]
  );
  if (res.rowCount === 0) {
    return { ok: false, reason: "SHADOW_EVIDENCE_NOT_FOUND" };
  }
  const row = res.rows[0];
  const pairStatus = typeof row?.pair_status === "string" ? row.pair_status : null;
  const compare = row?.compare_json && typeof row.compare_json === "object" && !Array.isArray(row.compare_json)
    ? (row.compare_json as Record<string, unknown>)
    : {};
  const noWriteInvariantOk =
    typeof compare.no_write_invariant_ok === "boolean"
      ? compare.no_write_invariant_ok
      : null;
  if (pairStatus !== "COMPARED") {
    return { ok: false, reason: "SHADOW_PAIR_NOT_COMPARED", pairStatus: pairStatus ?? "UNKNOWN", noWriteInvariantOk };
  }
  if (noWriteInvariantOk !== true) {
    return { ok: false, reason: "SHADOW_NO_WRITE_INVARIANT_FAILED", pairStatus: pairStatus ?? "UNKNOWN", noWriteInvariantOk };
  }
  return { ok: true, reason: "OK", pairStatus: pairStatus ?? "COMPARED", noWriteInvariantOk };
}

function ensureNonOverlapping(scenes: ApprovedScene[]): boolean {
  if (scenes.length === 0) return false;
  let prevEnd = -1;
  for (const s of scenes) {
    if (s.start < prevEnd) return false;
    prevEnd = s.end;
  }
  return true;
}

async function markSplitTaskHumanOutcome(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  splitTaskId: number,
  outcome: "APPROVED_HUMAN" | "FAILED_HUMAN_REJECTED",
  createdBy: string
): Promise<void> {
  await client.query(
    `UPDATE public.ingest_task
     SET result_json = jsonb_set(
       jsonb_set(
         jsonb_set(
           COALESCE(result_json, '{}'::jsonb),
           '{human_outcome}',
           to_jsonb($1::text),
           true
         ),
         '{human_verdict_by}',
         to_jsonb($2::text),
         true
       ),
       '{human_verdict_at}',
       to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')),
       true
     ),
     human_outcome = $1::text,
     human_verdict_by = $2::text,
     human_verdict_at = now(),
     updated_at = now()
     WHERE id = $3`,
    [outcome, createdBy, splitTaskId]
  );
}

export async function approveChapterSplitResponse(
  req: NextRequest,
  storySlug: string,
  rawJobId: string,
  rawChapterTaskId: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const jobId = parsePositiveInt(rawJobId);
    const chapterTaskId = parsePositiveInt(rawChapterTaskId);
    const body = (await req.json()) as { approved_scenes?: unknown; created_by?: unknown; promotion_scope?: unknown };
    const createdBy = normalizeCreatedBy(body.created_by);
    const promotionScope = parsePromotionScope(body.promotion_scope);

    await client.query("BEGIN");
    const jobRes = await client.query<{
      id: number;
      status: string;
      ingest_run_id: string | null;
      total_tasks: number;
    }>(
      `SELECT id, status, ingest_run_id::text, total_tasks
       FROM public.ingest_job
       WHERE id = $1 AND story_id = $2
       FOR UPDATE`,
      [jobId, storyId]
    );
    if (jobRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }
    const job = jobRes.rows[0];
    if (!["AWAIT_APPROVAL", "SPLIT_DRAFT", "RUNNING"].includes(job.status)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "JOB_NOT_APPROVABLE" }, { status: 409 });
    }

    const seqRes = await client.query<{ next_seq: number }>(
      `SELECT COALESCE(MAX(seq_no), 0) + 1 AS next_seq
       FROM public.ingest_task
       WHERE job_id = $1`,
      [jobId]
    );
    let nextSeq = Number(seqRes.rows[0]?.next_seq ?? 1);
    const splitTaskRes = await client.query<{ id: number; result_json: unknown; seq_no: number }>(
      `SELECT id, result_json, seq_no
       FROM public.ingest_task
       WHERE job_id = $1
         AND story_id = $2
         AND task_type = 'CHAPTER_SPLIT_LLM'
         AND id = $3
       LIMIT 1`,
      [jobId, storyId, chapterTaskId]
    );
    const splitResult = parseSplitTaskResult(splitTaskRes.rows[0]?.result_json);
    const splitTaskId = Number(splitTaskRes.rows[0]?.id ?? 0);
    if (splitTaskId <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "SPLIT_TASK_NOT_FOUND" }, { status: 409 });
    }
    const approvedScenesInput = parseApprovedScenes(body.approved_scenes);
    const approvedScenes = approvedScenesInput.length > 0 ? approvedScenesInput : splitResult.scenes;
    // Bypass supervisor_decision === "manual_review" and hasSystemicEntitySplitGate
    // because this route IS the human explicitly performing manual review and approving.
    if (!ensureNonOverlapping(approvedScenes)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "INVALID_APPROVED_SCENES" }, { status: 400 });
    }
    const approvedIdxSet = Array.from(new Set(approvedScenes.map((s) => s.idx))).sort((a, b) => a - b);
    if (approvedIdxSet.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "APPROVED_SCENES_EMPTY" }, { status: 400 });
    }
    const enforceShadowGate = requireShadowGateForRollout() && promotionScope === "rollout";
    if (enforceShadowGate) {
      const shadowGate = await checkShadowEvidenceForTask(client, storyId, splitTaskId);
      if (!shadowGate.ok) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            ok: false,
            error: "SHADOW_EVIDENCE_REQUIRED",
            reason: shadowGate.reason,
            pair_status: shadowGate.pairStatus ?? null,
            no_write_invariant_ok: shadowGate.noWriteInvariantOk ?? null,
          },
          { status: 409 }
        );
      }
    }

    const existingSceneTasksRes = await client.query<{ existing_count: number }>(
      `SELECT count(*)::int AS existing_count
       FROM public.ingest_task
       WHERE job_id = $1
         AND story_id = $2
         AND task_type = 'SCENE_CREATE'
         AND payload_json->>'chapter_task_id' = $3`,
      [jobId, storyId, String(splitTaskId)]
    );
    if (Number(existingSceneTasksRes.rows[0]?.existing_count ?? 0) > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CHAPTER_ALREADY_APPROVED" }, { status: 409 });
    }

    let maxCharLen = 0;
    if (splitResult.source_doc_id) {
      const sourceDocRes = await client.query<{ char_len: number }>(
        `SELECT char_len
         FROM public.source_doc
         WHERE story_id = $1
           AND id::text = $2
         LIMIT 1`,
        [storyId, splitResult.source_doc_id]
      );
      maxCharLen = Number(sourceDocRes.rows[0]?.char_len ?? 0);
    } else if (splitResult.chapter_text) {
      maxCharLen = splitResult.chapter_text.length;
    }

    if (maxCharLen <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "SPLIT_SOURCE_NOT_FOUND" }, { status: 409 });
    }
    const chapterId = splitResult.chapter_id ?? "ch00";
    const splitSeqNo = Number(splitTaskRes.rows[0]?.seq_no ?? 0);

    await client.query(
      `UPDATE public.narrative_scene
       SET status = 'ARCHIVED',
           is_verified = false,
           updated_at = now()
       WHERE story_id = $1
         AND chapter_id = $2
         AND status <> 'ARCHIVED'
         AND NOT (idx = ANY($3::int[]))`,
      [storyId, chapterId, approvedIdxSet]
    );

    for (const scene of approvedScenes) {
      if (scene.end > maxCharLen) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "APPROVED_SCENE_RANGE_OUT_OF_BOUNDS" }, { status: 400 });
      }
      await client.query(
        `INSERT INTO public.ingest_task
          (job_id, story_id, unit_type, source_path, seq_no, status, attempts, task_type, payload_json, result_json)
         VALUES
          ($1, $2, 'scene', $3, $4, 'READY', 0, 'SCENE_CREATE', $5::jsonb, '{}'::jsonb)`,
        [
          jobId,
          storyId,
          `split_scene_${scene.idx}`,
          nextSeq,
          JSON.stringify({
            approved_scene: scene,
            ingest_run_id: job.ingest_run_id,
            created_by: createdBy,
            is_verified: true, // [DATA HYGIENE] Mark as verified ground truth
            source_doc_id: splitResult.source_doc_id,
            chapter_task_id: splitTaskId,
            split_seq_no: splitSeqNo,
            chapter_no: splitResult.chapter_no,
            chapter_id: chapterId,
            workunit_id: `${chapterId}_s${String(scene.idx).padStart(2, "0")}`,
          }),
        ]
      );
      nextSeq += 1;
    }

    await client.query(
      `UPDATE public.ingest_job
       SET status = 'RUNNING',
           split_draft_json = jsonb_build_object(
             'approved_scenes', $3::jsonb,
             'approved_at', now(),
             'approved_by', $4::text,
             'approved_chapter_task_id', $6::bigint,
             'human_outcome', 'APPROVED_HUMAN'
           ),
           total_tasks = GREATEST(total_tasks, completed_tasks + $5::integer),
           updated_at = now()
       WHERE id = $1 AND story_id = $2`,
      [jobId, storyId, JSON.stringify(approvedScenes), createdBy, approvedScenes.length, splitTaskId]
    );
    await markSplitTaskHumanOutcome(client, splitTaskId, "APPROVED_HUMAN", createdBy);

    const isReprocessRes = await client.query<{ reprocess_count: number }>(
      `SELECT COUNT(*)::int AS reprocess_count
       FROM public.supervisor_memory
       WHERE story_id = $1 AND chapter_id = $2 AND label = 'FAILED_PATTERN'`,
      [storyId, chapterId]
    );
    const isReprocess = Number(isReprocessRes.rows[0]?.reprocess_count ?? 0) > 0;
    await client.query(
      `INSERT INTO public.supervisor_memory
         (story_id, job_id, chapter_task_id, chapter_id, label, strategy_selected,
          supervisor_decision, human_outcome, quality_self_signal, is_reprocess,
          signals_json, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, 'APPROVED_HUMAN', $8, $9, '{}'::jsonb, now(), now())
       ON CONFLICT (story_id, chapter_task_id) DO UPDATE
         SET label = EXCLUDED.label,
             human_outcome = EXCLUDED.human_outcome,
             updated_at = now()`,
      [
        storyId,
        jobId,
        splitTaskId,
        chapterId,
        isReprocess ? "SUCCESS_AFTER_REPROCESS" : "SUCCESS_NO_REPROCESS",
        splitResult.strategy_selected,
        splitResult.supervisor_decision,
        splitResult.quality_self_signal ?? null,
        isReprocess,
      ]
    );

    await client.query("COMMIT");
    const worker = await ensureIngestWorkerRunning();
    return NextResponse.json({
      ok: true,
      job_id: jobId,
      story_id: storyId,
      chapter_task_id: splitTaskId,
      status: "RUNNING",
      enqueued_scene_tasks: approvedScenes.length,
      promotion_scope: promotionScope,
      shadow_gate_applied: enforceShadowGate,
      worker,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "INGEST_APPROVE_SPLIT_CHAPTER_FAILED";
    const status = msg.includes("INVALID_ID") ? 400 : msg.includes("STORY_ARCHIVED") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

export async function approveJobSplitResponse(
  req: NextRequest,
  storySlug: string,
  rawJobId: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const jobId = parsePositiveInt(rawJobId);
    const body = (await req.json()) as { approved_scenes?: unknown; created_by?: unknown; chapter_task_id?: unknown; promotion_scope?: unknown };
    const requestedChapterTaskId = Number(body.chapter_task_id);
    const createdBy = normalizeCreatedBy(body.created_by);
    const promotionScope = parsePromotionScope(body.promotion_scope);

    await client.query("BEGIN");
    const jobRes = await client.query<{
      id: number;
      status: string;
      ingest_run_id: string | null;
      total_tasks: number;
    }>(
      `SELECT id, status, ingest_run_id::text, total_tasks
       FROM public.ingest_job
       WHERE id = $1 AND story_id = $2
       FOR UPDATE`,
      [jobId, storyId]
    );
    if (jobRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
    }
    const job = jobRes.rows[0];
    if (!["AWAIT_APPROVAL", "SPLIT_DRAFT", "RUNNING"].includes(job.status)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "JOB_NOT_APPROVABLE" }, { status: 409 });
    }

    const seqRes = await client.query<{ next_seq: number }>(
      `SELECT COALESCE(MAX(seq_no), 0) + 1 AS next_seq
       FROM public.ingest_task
       WHERE job_id = $1`,
      [jobId]
    );
    let nextSeq = Number(seqRes.rows[0]?.next_seq ?? 1);
    const splitTaskRes = await client.query<{ id: number; result_json: unknown; seq_no: number }>(
      `SELECT id, result_json, seq_no
       FROM public.ingest_task
       WHERE job_id = $1
         AND story_id = $2
         AND task_type = 'CHAPTER_SPLIT_LLM'
         ${Number.isFinite(requestedChapterTaskId) && requestedChapterTaskId > 0 ? "AND id = $3" : ""}
       ORDER BY seq_no ASC, id ASC
       LIMIT 1`,
      Number.isFinite(requestedChapterTaskId) && requestedChapterTaskId > 0
        ? [jobId, storyId, Math.floor(requestedChapterTaskId)]
        : [jobId, storyId]
    );
    const splitResult = parseSplitTaskResult(splitTaskRes.rows[0]?.result_json);
    const splitTaskId = Number(splitTaskRes.rows[0]?.id ?? 0);
    if (splitTaskId <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "SPLIT_TASK_NOT_FOUND" }, { status: 409 });
    }
    const approvedScenesInput = parseApprovedScenes(body.approved_scenes);
    const approvedScenes = approvedScenesInput.length > 0 ? approvedScenesInput : splitResult.scenes;
    // Bypass supervisor_decision === "manual_review" and hasSystemicEntitySplitGate
    // because this route IS the human explicitly performing manual review and approving.
    if (!ensureNonOverlapping(approvedScenes)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "INVALID_APPROVED_SCENES" }, { status: 400 });
    }
    const enforceShadowGate = requireShadowGateForRollout() && promotionScope === "rollout";
    if (enforceShadowGate) {
      const shadowGate = await checkShadowEvidenceForTask(client, storyId, splitTaskId);
      if (!shadowGate.ok) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            ok: false,
            error: "SHADOW_EVIDENCE_REQUIRED",
            reason: shadowGate.reason,
            pair_status: shadowGate.pairStatus ?? null,
            no_write_invariant_ok: shadowGate.noWriteInvariantOk ?? null,
          },
          { status: 409 }
        );
      }
    }

    let maxCharLen = 0;
    if (splitResult.source_doc_id) {
      const sourceDocRes = await client.query<{ char_len: number }>(
        `SELECT char_len
         FROM public.source_doc
         WHERE story_id = $1
           AND id::text = $2
         LIMIT 1`,
        [storyId, splitResult.source_doc_id]
      );
      maxCharLen = Number(sourceDocRes.rows[0]?.char_len ?? 0);
    } else if (splitResult.chapter_text) {
      maxCharLen = splitResult.chapter_text.length;
    }

    if (maxCharLen <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "SPLIT_SOURCE_NOT_FOUND" }, { status: 409 });
    }
    const chapterId = splitResult.chapter_id ?? "ch00";
    const splitSeqNo = Number(splitTaskRes.rows[0]?.seq_no ?? 0);
    const existingSceneTasksRes = await client.query<{ existing_count: number }>(
      `SELECT count(*)::int AS existing_count
       FROM public.ingest_task
       WHERE job_id = $1
         AND story_id = $2
         AND task_type = 'SCENE_CREATE'
         AND payload_json->>'chapter_task_id' = $3`,
      [jobId, storyId, String(splitTaskId)]
    );
    if (Number(existingSceneTasksRes.rows[0]?.existing_count ?? 0) > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CHAPTER_ALREADY_APPROVED" }, { status: 409 });
    }

    for (const scene of approvedScenes) {
      if (scene.end > maxCharLen) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "APPROVED_SCENE_RANGE_OUT_OF_BOUNDS" }, { status: 400 });
      }
      await client.query(
        `INSERT INTO public.ingest_task
          (job_id, story_id, unit_type, source_path, seq_no, status, attempts, task_type, payload_json, result_json)
         VALUES
          ($1, $2, 'scene', $3, $4, 'READY', 0, 'SCENE_CREATE', $5::jsonb, '{}'::jsonb)`,
        [
          jobId,
          storyId,
          `split_scene_${scene.idx}`,
          nextSeq,
          JSON.stringify({
            approved_scene: scene,
            ingest_run_id: job.ingest_run_id,
            created_by: createdBy,
            source_doc_id: splitResult.source_doc_id,
            chapter_task_id: splitTaskId,
            split_seq_no: splitSeqNo,
            chapter_no: splitResult.chapter_no,
            chapter_id: chapterId,
            workunit_id: `${chapterId}_s${String(scene.idx).padStart(2, "0")}`,
          }),
        ]
      );
      nextSeq += 1;
    }

    await client.query(
      `UPDATE public.ingest_job
       SET status = 'RUNNING',
           split_draft_json = jsonb_build_object(
             'approved_scenes', $3::jsonb,
             'approved_at', now(),
             'approved_by', $4::text,
             'approved_chapter_task_id', $6::bigint,
             'human_outcome', 'APPROVED_HUMAN'
           ),
           total_tasks = GREATEST(total_tasks, completed_tasks + $5::integer),
           updated_at = now()
       WHERE id = $1 AND story_id = $2`,
      [jobId, storyId, JSON.stringify(approvedScenes), createdBy, approvedScenes.length, splitTaskId]
    );
    await markSplitTaskHumanOutcome(client, splitTaskId, "APPROVED_HUMAN", createdBy);

    const isReprocessRes2 = await client.query<{ reprocess_count: number }>(
      `SELECT COUNT(*)::int AS reprocess_count
       FROM public.supervisor_memory
       WHERE story_id = $1 AND chapter_id = $2 AND label = 'FAILED_PATTERN'`,
      [storyId, chapterId]
    );
    const isReprocess2 = Number(isReprocessRes2.rows[0]?.reprocess_count ?? 0) > 0;
    await client.query(
      `INSERT INTO public.supervisor_memory
         (story_id, job_id, chapter_task_id, chapter_id, label, strategy_selected,
          supervisor_decision, human_outcome, quality_self_signal, is_reprocess,
          signals_json, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, 'APPROVED_HUMAN', $8, $9, '{}'::jsonb, now(), now())
       ON CONFLICT (story_id, chapter_task_id) DO UPDATE
         SET label = EXCLUDED.label,
             human_outcome = EXCLUDED.human_outcome,
             updated_at = now()`,
      [
        storyId,
        jobId,
        splitTaskId,
        chapterId,
        isReprocess2 ? "SUCCESS_AFTER_REPROCESS" : "SUCCESS_NO_REPROCESS",
        splitResult.strategy_selected,
        splitResult.supervisor_decision,
        splitResult.quality_self_signal ?? null,
        isReprocess2,
      ]
    );

    await client.query("COMMIT");
    const worker = await ensureIngestWorkerRunning();
    return NextResponse.json({
      ok: true,
      job_id: jobId,
      story_id: storyId,
      chapter_task_id: splitTaskId,
      status: "RUNNING",
      enqueued_scene_tasks: approvedScenes.length,
      promotion_scope: promotionScope,
      shadow_gate_applied: enforceShadowGate,
      worker,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "INGEST_APPROVE_SPLIT_FAILED";
    const status = msg.includes("INVALID_ID") ? 400 : msg.includes("STORY_ARCHIVED") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

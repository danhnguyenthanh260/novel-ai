import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

type ReviewAction = "submit_response" | "apply_response";

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return null;
}

function parseAction(value: unknown): ReviewAction {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "submit_response" || raw === "apply_response") return raw;
  throw new Error("INVALID_ACTION");
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value;
}

function extractScoreNumbers(scores: Record<string, unknown>): number[] {
  const out: number[] = [];
  for (const value of Object.values(scores)) {
    if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  }
  return out;
}

function calcHumanOverall(scoresJson: unknown): number | null {
  const obj = asObject(scoresJson);
  const nums = extractScoreNumbers(obj);
  if (nums.length === 0) return null;
  const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
  return Math.max(0, Math.min(5, avg));
}

function calcAiOverall(evalJson: unknown): number | null {
  const obj = asObject(evalJson);
  const raw = obj.overall;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(5, raw));
}

function calcFusedOverall(human: number | null, ai: number | null): number | null {
  if (human !== null && ai !== null) return human * 0.7 + ai * 0.3;
  if (human !== null) return human;
  if (ai !== null) return ai;
  return null;
}

function criticalFlagCount(flagsJson: unknown): number {
  const obj = asObject(flagsJson);
  const critical = obj.critical;
  return Array.isArray(critical) ? critical.length : 0;
}

function decideReviewOutcome(args: { fused: number | null; human: number | null; criticalCount: number }): "LOCK" | "REWRITE" {
  if (args.criticalCount > 0) return "REWRITE";
  if (args.human !== null && args.human < 3.5) return "REWRITE";
  if (args.fused !== null && args.fused < 3.4) return "REWRITE";
  return "LOCK";
}

async function refreshJobProgress(client: PoolClient, jobId: number): Promise<void> {
  const countRes = await client.query(
    `SELECT
       count(*) FILTER (WHERE status = 'DONE')::int AS done_count,
       count(*)::int AS total_count,
       count(*) FILTER (WHERE status IN ('PENDING','RUNNING','WAIT_REVIEW'))::int AS active_count,
       count(*) FILTER (WHERE status = 'FAILED')::int AS failed_count
     FROM public.ingest_task
     WHERE job_id = $1`,
    [jobId]
  );
  const row = countRes.rows[0] ?? {};
  const doneCount = Number(row.done_count ?? 0);
  const totalCount = Number(row.total_count ?? 0);
  const activeCount = Number(row.active_count ?? 0);
  const failedCount = Number(row.failed_count ?? 0);

  const nextStatus =
    failedCount > 0 ? "FAILED" : totalCount > 0 && doneCount === totalCount ? "DONE" : activeCount > 0 ? "RUNNING" : "RUNNING";

  await client.query(
    `UPDATE public.ingest_job
     SET completed_tasks = $2,
         status = $3,
         updated_at = now()
     WHERE id = $1`,
    [jobId, doneCount, nextStatus]
  );
}

export async function getReviewsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const requestId = parsePositiveInt(req.nextUrl.searchParams.get("request_id"));
    const statusFilter = (req.nextUrl.searchParams.get("status") ?? "").trim().toUpperCase();
    const limitRaw = parsePositiveInt(req.nextUrl.searchParams.get("limit"));
    const limit = Math.min(limitRaw ?? 40, 100);

    const params: Array<string | number> = [storyId];
    const where: string[] = ["r.story_id = $1"];
    if (statusFilter && ["OPEN", "SUBMITTED", "APPLIED"].includes(statusFilter)) {
      params.push(statusFilter);
      where.push(`r.status = $${params.length}`);
    }
    if (requestId !== null) {
      params.push(requestId);
      where.push(`r.id = $${params.length}`);
    }

    params.push(limit);
    const listRes = await pool.query(
      `SELECT
         r.id,
         r.story_id,
         r.scene_version_id,
         r.job_id,
         r.status,
         r.rubric_version,
         r.created_at,
         v.scene_id,
         v.version_no,
         s.workunit_id,
         s.chapter_id,
         s.idx
       FROM public.review_request r
       JOIN public.narrative_scene_version v ON v.id = r.scene_version_id
       JOIN public.narrative_scene s ON s.id = v.scene_id
       WHERE ${where.join(" AND ")}
       ORDER BY r.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    let responses: Array<Record<string, unknown>> = [];
    if (requestId !== null) {
      const responseRes = await pool.query(
        `SELECT
           id,
           request_id,
           reviewer_name,
           scores_json,
           flags_json,
           suggestions_text,
           canon_proposals_json,
           created_at
         FROM public.review_response
         WHERE request_id = $1
         ORDER BY created_at DESC`,
        [requestId]
      );
      responses = responseRes.rows;
    }

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      requests: listRes.rows,
      responses,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_REVIEWS_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function postReviewsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as {
      action?: string;
      request_id?: number | string;
      response_id?: number | string;
      reviewer_name?: string;
      scores_json?: unknown;
      flags_json?: unknown;
      suggestions_text?: string;
      canon_proposals_json?: unknown;
      applied_by?: string;
    };

    const action = parseAction(body.action);
    const requestId = parsePositiveInt(body.request_id);
    if (requestId === null) {
      return NextResponse.json({ ok: false, error: "INVALID_REQUEST_ID" }, { status: 400 });
    }

    await client.query("BEGIN");

    const reqRes = await client.query(
      `SELECT id, story_id, scene_version_id, job_id, status
       FROM public.review_request
       WHERE id = $1 AND story_id = $2
       FOR UPDATE`,
      [requestId, storyId]
    );
    if (reqRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "REVIEW_REQUEST_NOT_FOUND" }, { status: 404 });
    }
    const requestRow = reqRes.rows[0];

    if (action === "submit_response") {
      const reviewerName = typeof body.reviewer_name === "string" ? body.reviewer_name.trim() : "";
      const suggestionsText = typeof body.suggestions_text === "string" ? body.suggestions_text : null;
      const insertRes = await client.query(
        `INSERT INTO public.review_response
          (request_id, reviewer_name, scores_json, flags_json, suggestions_text, canon_proposals_json)
         VALUES
          ($1, $2, $3::jsonb, $4::jsonb, $5, $6::jsonb)
         RETURNING id`,
        [
          requestId,
          reviewerName || null,
          JSON.stringify(asObject(body.scores_json)),
          JSON.stringify(asObject(body.flags_json)),
          suggestionsText,
          JSON.stringify(asArray(body.canon_proposals_json)),
        ]
      );

      await client.query(
        `UPDATE public.review_request
         SET status = CASE WHEN status = 'APPLIED' THEN status ELSE 'SUBMITTED' END
         WHERE id = $1`,
        [requestId]
      );

      await client.query("COMMIT");
      return NextResponse.json({
        ok: true,
        action,
        request_id: requestId,
        response_id: Number(insertRes.rows[0]?.id ?? 0),
      });
    }

    const responseId = parsePositiveInt(body.response_id);
    const responseRes =
      responseId !== null
        ? await client.query(
            `SELECT id, canon_proposals_json, scores_json, flags_json
             FROM public.review_response
             WHERE id = $1 AND request_id = $2
             LIMIT 1`,
            [responseId, requestId]
          )
        : await client.query(
            `SELECT id, canon_proposals_json, scores_json, flags_json
             FROM public.review_response
             WHERE request_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [requestId]
          );
    if (responseRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "REVIEW_RESPONSE_NOT_FOUND" }, { status: 404 });
    }

    const selectedResponse = responseRes.rows[0];
    const proposals = asArray(selectedResponse.canon_proposals_json);
    const insertedCanonIds: number[] = [];
    const humanOverall = calcHumanOverall(selectedResponse.scores_json);
    const criticalCount = criticalFlagCount(selectedResponse.flags_json);

    const aiRes = await client.query(
      `SELECT eval_json
       FROM public.narrative_scene_version
       WHERE id = $1 AND story_id = $2
       LIMIT 1`,
      [requestRow.scene_version_id, storyId]
    );
    const aiOverall = aiRes.rowCount ? calcAiOverall(aiRes.rows[0].eval_json) : null;
    const fusedOverall = calcFusedOverall(humanOverall, aiOverall);
    const decision = decideReviewOutcome({
      fused: fusedOverall,
      human: humanOverall,
      criticalCount,
    });

    for (const raw of proposals) {
      const obj = asObject(raw);
      const categoryRaw = typeof obj.category === "string" ? obj.category.trim().toLowerCase() : "lore";
      const content = typeof obj.content === "string" ? obj.content.trim() : "";
      if (!content) continue;
      const category = ["character", "location", "item", "lore", "event", "relationship"].includes(categoryRaw)
        ? categoryRaw
        : "lore";
      const importanceRaw = Number(obj.importance ?? 3);
      const importance = Number.isFinite(importanceRaw) ? Math.max(1, Math.min(5, Math.floor(importanceRaw))) : 3;

      const ins = await client.query<{ id: number }>(
        `INSERT INTO public.story_canon_fact(story_id, category, content, importance, source_ref)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [storyId, category, content, importance, `review:${requestId}:${selectedResponse.id}`]
      );
      insertedCanonIds.push(Number(ins.rows[0]?.id ?? 0));
    }

    const sceneRes = await client.query(
      `SELECT scene_id
       FROM public.narrative_scene_version
       WHERE id = $1 AND story_id = $2
       LIMIT 1`,
      [requestRow.scene_version_id, storyId]
    );
    if ((sceneRes.rowCount ?? 0) > 0) {
      const sceneId = Number(sceneRes.rows[0].scene_id);
      await client.query(
        `UPDATE public.narrative_scene
         SET status = $3, updated_at = now()
         WHERE id = $1 AND story_id = $2`,
        [sceneId, storyId, decision === "LOCK" ? "LOCKED" : "EVALUATED"]
      );

      if (requestRow.job_id) {
        await client.query(
          `UPDATE public.ingest_task
           SET status = 'DONE', updated_at = now()
           WHERE job_id = $1
             AND story_id = $2
             AND unit_type = 'scene'
             AND status = 'WAIT_REVIEW'
             AND payload_json->>'scene_id' = $3`,
          [requestRow.job_id, storyId, String(sceneId)]
        );
        await refreshJobProgress(client, Number(requestRow.job_id));
      }
    }

    await client.query(
      `UPDATE public.review_request
       SET status = 'APPLIED'
       WHERE id = $1`,
      [requestId]
    );

    await client.query("SAVEPOINT review_apply_log_insert");
    try {
      await client.query(
        `INSERT INTO public.review_apply_log
          (request_id, response_id, applied_by, canon_inserted_ids, human_overall, ai_overall, fused_overall, decision)
         VALUES
          ($1, $2, $3, $4::bigint[], $5, $6, $7, $8)`,
        [
          requestId,
          Number(selectedResponse.id),
          typeof body.applied_by === "string" && body.applied_by.trim() ? body.applied_by.trim() : "operator",
          insertedCanonIds,
          humanOverall,
          aiOverall,
          fusedOverall,
          decision,
        ]
      );
      await client.query("RELEASE SAVEPOINT review_apply_log_insert");
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err ? String((err as { code?: string }).code ?? "") : "";
      if (code !== "42703" && code !== "23514") {
        await client.query("ROLLBACK TO SAVEPOINT review_apply_log_insert");
        throw err;
      }
      await client.query("ROLLBACK TO SAVEPOINT review_apply_log_insert");
      await client.query(
        `INSERT INTO public.review_apply_log
          (request_id, applied_by, canon_inserted_ids)
         VALUES
          ($1, $2, $3::bigint[])`,
        [
          requestId,
          typeof body.applied_by === "string" && body.applied_by.trim() ? body.applied_by.trim() : "operator",
          insertedCanonIds,
        ]
      );
      await client.query("RELEASE SAVEPOINT review_apply_log_insert");
    }

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      action,
      request_id: requestId,
      response_id: Number(selectedResponse.id),
      canon_inserted_ids: insertedCanonIds,
      policy: {
        decision,
        human_overall: humanOverall,
        ai_overall: aiOverall,
        fused_overall: fusedOverall,
        critical_flags: criticalCount,
      },
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "POST_REVIEW_ACTION_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}

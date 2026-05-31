
/* eslint-disable complexity, max-lines-per-function */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";

export async function postAgentPromptPromoteCanaryResponse(
  req: NextRequest,
  storySlug: string,
  versionIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryId(storySlug);
    const versionId = Number(versionIdRaw || 0);
    if (!versionId) return NextResponse.json({ ok: false, error: "INVALID_VERSION_ID" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const trafficPercentRaw = Number(body.traffic_percent ?? 10);
    const trafficPercent = Math.max(1, Math.min(100, Number.isFinite(trafficPercentRaw) ? trafficPercentRaw : 10));

    await client.query("BEGIN");
    const verRes = await client.query<{
      profile_id: number;
      status: string;
      agent_name: string;
      scope: string;
      p_story_id: number | null;
      chapter_id: string | null;
    }>(
      `SELECT
         apv.profile_id,
         apv.status,
         app.agent_name,
         app.scope,
         app.story_id AS p_story_id,
         app.chapter_id
       FROM public.agent_prompt_version apv
       JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
       WHERE apv.id = $1
       LIMIT 1`,
      [versionId]
    );
    if (!verRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    }
    const row = verRes.rows[0];

    const baselineRes = await client.query<{ id: number }>(
      `SELECT id
       FROM public.agent_prompt_version
       WHERE profile_id = $1
         AND status = 'ACTIVE'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [row.profile_id]
    );
    if (!baselineRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "ACTIVE_BASELINE_REQUIRED" }, { status: 409 });
    }
    const baselineVersionId = Number(baselineRes.rows[0].id);
    if (baselineVersionId === versionId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CANDIDATE_MUST_DIFFER_FROM_BASELINE" }, { status: 409 });
    }

    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'CANARY'
       WHERE id = $1`,
      [versionId]
    );

    await client.query(
      `UPDATE public.agent_prompt_experiment
       SET status = 'PAUSED', end_at = now()
       WHERE agent_name = $1
         AND scope = $2
         AND COALESCE(story_id, 0) = COALESCE($3, 0)
         AND COALESCE(chapter_id, '') = COALESCE($4, '')
         AND status = 'RUNNING'`,
      [row.agent_name, row.scope, row.p_story_id, row.chapter_id]
    );

    const expRes = await client.query<{ id: number }>(
      `INSERT INTO public.agent_prompt_experiment
         (agent_name, scope, story_id, chapter_id, baseline_version_id, candidate_version_id, traffic_percent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RUNNING')
       RETURNING id`,
      [row.agent_name, row.scope, row.p_story_id ?? (row.scope === "global" ? null : storyId), row.chapter_id, baselineVersionId, versionId, trafficPercent]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'PROMOTE_CANARY', 'CANARY_START', 'studio', 'studio')`,
      [row.agent_name, baselineVersionId, versionId]
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      experiment_id: Number(expRes.rows[0].id),
      baseline_version_id: baselineVersionId,
      candidate_version_id: versionId,
      traffic_percent: trafficPercent,
      status: "RUNNING",
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "PROMOTE_AGENT_PROMPT_CANARY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function postAgentPromptArchiveResponse(
  req: NextRequest,
  storySlug: string,
  versionIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const versionId = Number(versionIdRaw || 0);
    if (!versionId) return NextResponse.json({ ok: false, error: "INVALID_VERSION_ID" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "ARCHIVE_BY_OPERATOR";

    await client.query("BEGIN");
    const rowRes = await client.query<{ profile_id: number; agent_name: string; status: string }>(
      `SELECT apv.profile_id, app.agent_name, apv.status
       FROM public.agent_prompt_version apv
       JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
       WHERE apv.id = $1
       LIMIT 1`,
      [versionId]
    );
    if (!rowRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    }
    const row = rowRes.rows[0];
    if (row.status === "ACTIVE") {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "ACTIVE_PROMPT_CANNOT_BE_ARCHIVED_DIRECTLY" }, { status: 409 });
    }

    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ARCHIVED'
       WHERE id = $1`,
      [versionId]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'ARCHIVE', $4, 'studio', 'studio')`,
      [row.agent_name, null, versionId, reason]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, version_id: versionId, status: "ARCHIVED" });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "ARCHIVE_PROMPT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function postAgentPromptRollbackResponse(
  req: NextRequest,
  storySlug: string,
  versionIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const fromVersionId = Number(versionIdRaw || 0);
    if (!fromVersionId) return NextResponse.json({ ok: false, error: "INVALID_VERSION_ID" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const targetVersionId = Number(body.to_version_id ?? 0);
    if (!targetVersionId) return NextResponse.json({ ok: false, error: "TARGET_VERSION_ID_REQUIRED" }, { status: 400 });
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "ROLLBACK_BY_OPERATOR";

    await client.query("BEGIN");
    const fromRes = await client.query<{ profile_id: number; agent_name: string }>(
      `SELECT apv.profile_id, app.agent_name
       FROM public.agent_prompt_version apv
       JOIN public.agent_prompt_profile app ON app.id = apv.profile_id
       WHERE apv.id = $1
       LIMIT 1`,
      [fromVersionId]
    );
    const toRes = await client.query<{ profile_id: number }>(
      `SELECT profile_id
       FROM public.agent_prompt_version
       WHERE id = $1
       LIMIT 1`,
      [targetVersionId]
    );
    if (!fromRes.rowCount || !toRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    }
    const profileId = Number(fromRes.rows[0].profile_id);
    if (profileId !== Number(toRes.rows[0].profile_id)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "ROLLBACK_PROFILE_MISMATCH" }, { status: 409 });
    }
    const agentName = fromRes.rows[0].agent_name;

    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ARCHIVED'
       WHERE profile_id = $1
         AND status = 'ACTIVE'`,
      [profileId]
    );
    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ACTIVE'
       WHERE id = $1`,
      [targetVersionId]
    );
    await client.query(
      `UPDATE public.agent_prompt_experiment
       SET status = 'ROLLED_BACK', end_at = now()
       WHERE status = 'RUNNING'
         AND (baseline_version_id = $1 OR candidate_version_id = $1 OR baseline_version_id = $2 OR candidate_version_id = $2)`,
      [fromVersionId, targetVersionId]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'ROLLBACK', $4, 'studio', 'studio')`,
      [agentName, fromVersionId, targetVersionId, reason]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, from_version_id: fromVersionId, to_version_id: targetVersionId, status: "ACTIVE" });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "ROLLBACK_PROMPT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

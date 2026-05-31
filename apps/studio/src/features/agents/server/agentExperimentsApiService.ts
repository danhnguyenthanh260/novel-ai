
import { NextRequest, NextResponse } from "next/server";
import { diffLines } from "diff";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";

type AgentExperimentRow = {
  id: number;
  agent_name: string;
  scope: string;
  story_id: number | null;
  chapter_id: string | null;
  baseline_version_id: number;
  candidate_version_id: number;
  traffic_percent: number;
  status: string;
  start_at: string;
  end_at: string | null;
};

export async function getAgentExperimentsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const status = (req.nextUrl.searchParams.get("status") ?? "").trim().toUpperCase();
    const where: string[] = [`(story_id = $1 OR story_id IS NULL)`];
    const params: Array<string | number> = [storyId];
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const sql = `
      SELECT
        id, agent_name, scope, story_id, chapter_id, baseline_version_id, candidate_version_id,
        traffic_percent, status, start_at::text, end_at::text
      FROM public.agent_prompt_experiment
      WHERE ${where.join(" AND ")}
      ORDER BY start_at DESC, id DESC
      LIMIT 200
    `;
    const rows = await pool.query<AgentExperimentRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_EXPERIMENTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function getAgentPromptDiffResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    await resolveStoryId(storySlug);
    const leftId = Number(req.nextUrl.searchParams.get("left_version_id") ?? 0);
    const rightId = Number(req.nextUrl.searchParams.get("right_version_id") ?? 0);
    if (!leftId || !rightId) return NextResponse.json({ ok: false, error: "LEFT_RIGHT_VERSION_ID_REQUIRED" }, { status: 400 });

    const rows = await pool.query<{
      id: number;
      system_prompt: string;
      developer_prompt: string | null;
    }>(
      `SELECT id, system_prompt, developer_prompt
       FROM public.agent_prompt_version
       WHERE id IN ($1, $2)`,
      [leftId, rightId]
    );
    if ((rows.rowCount ?? 0) < 2) return NextResponse.json({ ok: false, error: "PROMPT_VERSION_NOT_FOUND" }, { status: 404 });
    const left = rows.rows.find((r) => Number(r.id) === leftId)!;
    const right = rows.rows.find((r) => Number(r.id) === rightId)!;

    const leftText = `${left.system_prompt}\n\n[developer]\n${left.developer_prompt ?? ""}`;
    const rightText = `${right.system_prompt}\n\n[developer]\n${right.developer_prompt ?? ""}`;
    const chunks = diffLines(leftText, rightText).map((c) => ({
      added: Boolean(c.added),
      removed: Boolean(c.removed),
      value: c.value,
      count: c.count ?? 0,
    }));
    return NextResponse.json({ ok: true, left_version_id: leftId, right_version_id: rightId, chunks });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_PROMPT_DIFF_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentExperimentPauseResponse(
  _req: NextRequest,
  storySlug: string,
  experimentIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const experimentId = Number(experimentIdRaw || 0);
    if (!experimentId) return NextResponse.json({ ok: false, error: "INVALID_EXPERIMENT_ID" }, { status: 400 });

    const expRes = await client.query<{ id: number }>(
      `UPDATE public.agent_prompt_experiment
       SET status = 'PAUSED', end_at = now()
       WHERE id = $1
         AND status = 'RUNNING'
       RETURNING id`,
      [experimentId]
    );
    if (!expRes.rowCount) return NextResponse.json({ ok: false, error: "EXPERIMENT_NOT_RUNNING" }, { status: 409 });
    return NextResponse.json({ ok: true, experiment_id: experimentId, status: "PAUSED" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "PAUSE_EXPERIMENT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

export async function postAgentExperimentRollbackResponse(
  _req: NextRequest,
  storySlug: string,
  experimentIdRaw: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    await resolveStoryId(storySlug);
    const experimentId = Number(experimentIdRaw || 0);
    if (!experimentId) return NextResponse.json({ ok: false, error: "INVALID_EXPERIMENT_ID" }, { status: 400 });

    await client.query("BEGIN");
    const expRes = await client.query<{
      id: number;
      agent_name: string;
      baseline_version_id: number;
      candidate_version_id: number;
      status: string;
    }>(
      `SELECT id, agent_name, baseline_version_id, candidate_version_id, status
       FROM public.agent_prompt_experiment
       WHERE id = $1
       LIMIT 1`,
      [experimentId]
    );
    if (!expRes.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "EXPERIMENT_NOT_FOUND" }, { status: 404 });
    }
    const exp = expRes.rows[0];

    await client.query(
      `UPDATE public.agent_prompt_experiment
       SET status = 'ROLLED_BACK', end_at = now()
       WHERE id = $1`,
      [experimentId]
    );
    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ACTIVE'
       WHERE id = $1`,
      [exp.baseline_version_id]
    );
    await client.query(
      `UPDATE public.agent_prompt_version
       SET status = 'ARCHIVED'
       WHERE id = $1`,
      [exp.candidate_version_id]
    );
    await client.query(
      `INSERT INTO public.agent_tuning_event
         (agent_name, from_version_id, to_version_id, action, reason, author, approved_by)
       VALUES ($1, $2, $3, 'ROLLBACK', 'ROLLBACK_EXPERIMENT', 'studio', 'studio')`,
      [exp.agent_name, exp.candidate_version_id, exp.baseline_version_id]
    );
    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      experiment_id: experimentId,
      status: "ROLLED_BACK",
      baseline_version_id: exp.baseline_version_id,
      candidate_version_id: exp.candidate_version_id,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "ROLLBACK_EXPERIMENT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

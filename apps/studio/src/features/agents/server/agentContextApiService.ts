
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";

export async function getAgentContextSnapshotResponse(
  _req: NextRequest,
  storySlug: string,
  snapshotIdRaw: string
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const snapshotId = Number(snapshotIdRaw || 0);
    if (!snapshotId) return NextResponse.json({ ok: false, error: "INVALID_SNAPSHOT_ID" }, { status: 400 });

    const row = await pool.query<{
      id: number;
      story_id: number;
      chapter_id: string | null;
      snapshot_json: unknown;
      snapshot_hash: string;
      created_at: string;
    }>(
      `SELECT id, story_id, chapter_id, snapshot_json, snapshot_hash, created_at::text
       FROM public.agent_context_snapshot
       WHERE id = $1
         AND story_id = $2
       LIMIT 1`,
      [snapshotId, storyId]
    );
    if (!row.rowCount) return NextResponse.json({ ok: false, error: "SNAPSHOT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, item: row.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_CONTEXT_SNAPSHOT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentTuningEventRow = {
  id: number;
  agent_name: string;
  from_version_id: number | null;
  to_version_id: number;
  action: string;
  reason: string;
  author: string;
  approved_by: string | null;
  created_at: string;
};

export async function getAgentTuningEventsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));

    const where: string[] = [];
    const params: Array<string | number> = [];
    if (agentName) {
      params.push(agentName);
      where.push(`ev.agent_name = $${params.length}`);
    }
    params.push(storyId);
    where.push(`(pr.story_id = $${params.length} OR pr.story_id IS NULL)`);
    params.push(limit);

    const sql = `
      SELECT
        ev.id,
        ev.agent_name,
        ev.from_version_id,
        ev.to_version_id,
        ev.action,
        ev.reason,
        ev.author,
        ev.approved_by,
        ev.created_at::text
      FROM public.agent_tuning_event ev
      JOIN public.agent_prompt_version v ON v.id = ev.to_version_id
      JOIN public.agent_prompt_profile pr ON pr.id = v.profile_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ev.created_at DESC, ev.id DESC
      LIMIT $${params.length}
    `;
    const rows = await pool.query<AgentTuningEventRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_TUNING_EVENTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

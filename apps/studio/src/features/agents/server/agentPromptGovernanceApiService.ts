
/* eslint-disable complexity */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { isPlainObject, resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";
import {
  ALLOWED_SCOPES,
  validatePromptContracts,
} from "@/features/agents/server/agentPromptPolicy";

type AgentPromptVersionRow = {
  version_id: number;
  profile_id: number;
  agent_name: string;
  scope: string;
  story_id: number | null;
  chapter_id: string | null;
  version_no: number;
  status: string;
  created_by: string;
  created_at: string;
  change_note: string | null;
  system_prompt: string;
  developer_prompt: string | null;
  output_contract_json: unknown;
  guardrail_json: unknown;
};

export async function getAgentPromptsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const scope = (req.nextUrl.searchParams.get("scope") ?? "").trim();
    const chapterId = (req.nextUrl.searchParams.get("chapter_id") ?? "").trim();

    const where: string[] = [];
    const params: Array<string | number> = [];

    if (agentName) {
      params.push(agentName);
      where.push(`app.agent_name = $${params.length}`);
    }
    if (scope) {
      if (!ALLOWED_SCOPES.has(scope)) return NextResponse.json({ ok: false, error: "INVALID_SCOPE" }, { status: 400 });
      params.push(scope);
      where.push(`app.scope = $${params.length}`);
    }
    if (chapterId) {
      params.push(chapterId);
      where.push(`app.chapter_id = $${params.length}`);
    }

    // default story scoping: include matching story + global
    params.push(storyId);
    where.push(`(app.story_id = $${params.length} OR app.story_id IS NULL)`);

    const sql = `
      SELECT
        apv.id AS version_id,
        app.id AS profile_id,
        app.agent_name,
        app.scope,
        app.story_id,
        app.chapter_id,
        apv.version_no,
        apv.status,
        apv.created_by,
        apv.created_at::text,
        apv.change_note,
        apv.system_prompt,
        apv.developer_prompt,
        apv.output_contract_json,
        apv.guardrail_json
      FROM public.agent_prompt_profile app
      JOIN public.agent_prompt_version apv ON apv.profile_id = app.id
      WHERE ${where.join(" AND ")}
      ORDER BY app.agent_name ASC, app.scope ASC, COALESCE(app.chapter_id, '') ASC, apv.version_no DESC
      LIMIT 300
    `;
    const rows = await pool.query<AgentPromptVersionRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_PROMPTS_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentPromptResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryId(storySlug);
    const body = (await req.json()) as Record<string, unknown>;
    const agentName = typeof body.agent_name === "string" ? body.agent_name.trim() : "";
    const scope = typeof body.scope === "string" ? body.scope.trim() : "story";
    const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : null;
    const createdBy = typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim() : "studio";
    const changeNote = typeof body.change_note === "string" ? body.change_note : null;
    const systemPrompt = typeof body.system_prompt === "string" ? body.system_prompt.trim() : "";
    const developerPrompt = typeof body.developer_prompt === "string" ? body.developer_prompt : null;
    const outputContract = isPlainObject(body.output_contract_json) ? body.output_contract_json : {};
    const guardrail = isPlainObject(body.guardrail_json) ? body.guardrail_json : {};

    if (!agentName) return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    if (!ALLOWED_SCOPES.has(scope)) return NextResponse.json({ ok: false, error: "INVALID_SCOPE" }, { status: 400 });
    if (!systemPrompt) return NextResponse.json({ ok: false, error: "SYSTEM_PROMPT_REQUIRED" }, { status: 400 });
    if (scope === "chapter" && !chapterId) return NextResponse.json({ ok: false, error: "CHAPTER_ID_REQUIRED" }, { status: 400 });
    const contractErr = validatePromptContracts(agentName, outputContract, guardrail);
    if (contractErr) return NextResponse.json({ ok: false, error: contractErr }, { status: 400 });

    const profileStoryId = scope === "global" ? null : storyId;

    await client.query("BEGIN");
    const existingProfile = await client.query<{ id: number }>(
      `SELECT id
       FROM public.agent_prompt_profile
       WHERE agent_name = $1
         AND scope = $2
         AND COALESCE(story_id, 0) = COALESCE($3, 0)
         AND COALESCE(chapter_id, '') = COALESCE($4, '')
       LIMIT 1`,
      [agentName, scope, profileStoryId, scope === "chapter" ? chapterId : null]
    );
    let profileId = Number(existingProfile.rows[0]?.id ?? 0);
    if (!profileId) {
      const profileRes = await client.query<{ id: number }>(
        `INSERT INTO public.agent_prompt_profile
           (agent_name, scope, story_id, chapter_id, status, created_by)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
         RETURNING id`,
        [agentName, scope, profileStoryId, scope === "chapter" ? chapterId : null, createdBy]
      );
      profileId = Number(profileRes.rows[0].id);
    } else {
      await client.query(
        `UPDATE public.agent_prompt_profile SET status = 'ACTIVE' WHERE id = $1`,
        [profileId]
      );
    }

    const nextVerRes = await client.query<{ next_no: number }>(
      `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no
       FROM public.agent_prompt_version
       WHERE profile_id = $1`,
      [profileId]
    );
    const versionNo = Number(nextVerRes.rows[0]?.next_no ?? 1);

    const versionRes = await client.query<{ id: number }>(
      `INSERT INTO public.agent_prompt_version
         (profile_id, version_no, system_prompt, developer_prompt, output_contract_json, guardrail_json, change_note, status, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'DRAFT', $8)
       RETURNING id`,
      [profileId, versionNo, systemPrompt, developerPrompt, JSON.stringify(outputContract), JSON.stringify(guardrail), changeNote, createdBy]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, profile_id: profileId, version_id: Number(versionRes.rows[0].id), version_no: versionNo });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "CREATE_AGENT_PROMPT_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}

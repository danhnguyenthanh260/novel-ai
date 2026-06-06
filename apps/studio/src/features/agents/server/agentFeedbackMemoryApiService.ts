
/* eslint-disable complexity */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { isPlainObject, resolveStoryId } from "@/features/agents/server/agentGovernanceServerUtils";

type AgentFeedbackRow = {
  id: number;
  story_id: number;
  chapter_id: string | null;
  agent_name: string;
  run_trace_id: number | null;
  feedback_source: string;
  feedback_type: string;
  feedback_text: string;
  weight: string;
  status: string;
  created_by: string;
  created_at: string;
};

const ALLOWED_FEEDBACK_SOURCE = new Set(["HUMAN", "SUPERVISOR", "CRITIC", "SYSTEM"]);
const ALLOWED_FEEDBACK_TYPE = new Set(["KEEP", "AVOID", "FIX", "RULE"]);

export async function getAgentFeedbackResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const status = (req.nextUrl.searchParams.get("status") ?? "").trim().toUpperCase();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];
    if (agentName) {
      params.push(agentName);
      where.push(`agent_name = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    params.push(limit);

    const sql = `
      SELECT
        id, story_id, chapter_id, agent_name, run_trace_id, feedback_source, feedback_type,
        feedback_text, weight::text, status, created_by, created_at::text
      FROM public.agent_feedback_loop
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `;
    const rows = await pool.query<AgentFeedbackRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_FEEDBACK_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentFeedbackResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const body = (await req.json()) as Record<string, unknown>;
    const agentName = typeof body.agent_name === "string" ? body.agent_name.trim() : "";
    const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : null;
    const runTraceId = Number(body.run_trace_id ?? 0) || null;
    const feedbackSource = typeof body.feedback_source === "string" ? body.feedback_source.trim().toUpperCase() : "HUMAN";
    const feedbackType = typeof body.feedback_type === "string" ? body.feedback_type.trim().toUpperCase() : "FIX";
    const feedbackText = typeof body.feedback_text === "string" ? body.feedback_text.trim() : "";
    const weightRaw = Number(body.weight ?? 1);
    const weight = Number.isFinite(weightRaw) ? Math.max(0.1, Math.min(10, weightRaw)) : 1;
    const createdBy = typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim() : "studio";

    if (!agentName) return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    if (!feedbackText) return NextResponse.json({ ok: false, error: "FEEDBACK_TEXT_REQUIRED" }, { status: 400 });
    if (!ALLOWED_FEEDBACK_SOURCE.has(feedbackSource)) return NextResponse.json({ ok: false, error: "INVALID_FEEDBACK_SOURCE" }, { status: 400 });
    if (!ALLOWED_FEEDBACK_TYPE.has(feedbackType)) return NextResponse.json({ ok: false, error: "INVALID_FEEDBACK_TYPE" }, { status: 400 });

    const row = await pool.query<{ id: number }>(
      `INSERT INTO public.agent_feedback_loop
         (story_id, chapter_id, agent_name, run_trace_id, feedback_source, feedback_type, feedback_text, weight, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9)
       RETURNING id`,
      [storyId, chapterId, agentName, runTraceId, feedbackSource, feedbackType, feedbackText, weight, createdBy]
    );
    return NextResponse.json({ ok: true, id: Number(row.rows[0].id) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "POST_AGENT_FEEDBACK_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentFeedbackMuteResponse(
  _req: NextRequest,
  storySlug: string,
  feedbackIdRaw: string
): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const feedbackId = Number(feedbackIdRaw || 0);
    if (!feedbackId) return NextResponse.json({ ok: false, error: "INVALID_FEEDBACK_ID" }, { status: 400 });

    const row = await pool.query<{ id: number }>(
      `UPDATE public.agent_feedback_loop
       SET status = 'MUTED'
       WHERE id = $1
         AND story_id = $2
         AND status <> 'MUTED'
       RETURNING id`,
      [feedbackId, storyId]
    );
    if (!row.rowCount) return NextResponse.json({ ok: false, error: "FEEDBACK_NOT_FOUND_OR_MUTED" }, { status: 404 });
    return NextResponse.json({ ok: true, id: feedbackId, status: "MUTED" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MUTE_AGENT_FEEDBACK_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

type AgentMemoryRow = {
  id: number;
  story_id: number;
  chapter_id: string | null;
  agent_name: string;
  source_run_trace_id: number | null;
  memory_type: string;
  memory_text: string;
  embedding_json: unknown;
  score: string;
  tags: unknown;
  created_at: string;
};

const ALLOWED_MEMORY_TYPE = new Set(["POSITIVE_EXAMPLE", "NEGATIVE_PATTERN", "STYLE_ANCHOR"]);

export async function getAgentMemoryResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const agentName = (req.nextUrl.searchParams.get("agent_name") ?? "").trim();
    const memoryType = (req.nextUrl.searchParams.get("memory_type") ?? "").trim().toUpperCase();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));

    const where: string[] = ["story_id = $1"];
    const params: Array<string | number> = [storyId];
    if (agentName) {
      params.push(agentName);
      where.push(`agent_name = $${params.length}`);
    }
    if (memoryType) {
      params.push(memoryType);
      where.push(`memory_type = $${params.length}`);
    }
    params.push(limit);
    const sql = `
      SELECT
        id, story_id, chapter_id, agent_name, source_run_trace_id, memory_type, memory_text,
        embedding_json, score::text, tags, created_at::text
      FROM public.agent_memory_vector
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `;
    const rows = await pool.query<AgentMemoryRow>(sql, params);
    return NextResponse.json({ ok: true, items: rows.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GET_AGENT_MEMORY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

export async function postAgentMemoryResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const body = (await req.json()) as Record<string, unknown>;
    const agentName = typeof body.agent_name === "string" ? body.agent_name.trim() : "";
    const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : null;
    const sourceRunTraceId = Number(body.source_run_trace_id ?? 0) || null;
    const memoryType = typeof body.memory_type === "string" ? body.memory_type.trim().toUpperCase() : "";
    const memoryText = typeof body.memory_text === "string" ? body.memory_text.trim() : "";
    const scoreRaw = Number(body.score ?? 0);
    const score = Number.isFinite(scoreRaw) ? Math.max(-100, Math.min(100, scoreRaw)) : 0;
    const tags = isPlainObject(body.tags) ? body.tags : {};
    const embedding = Array.isArray(body.embedding_json) ? body.embedding_json : [];
    const embeddingSafe = embedding.filter((x) => Number.isFinite(Number(x))).map((x) => Number(x));

    if (!agentName) return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    if (!memoryText) return NextResponse.json({ ok: false, error: "MEMORY_TEXT_REQUIRED" }, { status: 400 });
    if (!ALLOWED_MEMORY_TYPE.has(memoryType)) return NextResponse.json({ ok: false, error: "INVALID_MEMORY_TYPE" }, { status: 400 });

    const row = await pool.query<{ id: number }>(
      `INSERT INTO public.agent_memory_vector
         (story_id, chapter_id, agent_name, source_run_trace_id, memory_type, memory_text, embedding_json, score, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
       RETURNING id`,
      [storyId, chapterId, agentName, sourceRunTraceId, memoryType, memoryText, JSON.stringify(embeddingSafe), score, JSON.stringify(tags)]
    );
    return NextResponse.json({ ok: true, id: Number(row.rows[0].id) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "POST_AGENT_MEMORY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na <= 0 || nb <= 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function postAgentMemoryRetrieveResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(storySlug);
    const body = (await req.json()) as Record<string, unknown>;
    const agentName = typeof body.agent_name === "string" ? body.agent_name.trim() : "";
    const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : null;
    const embedding = Array.isArray(body.context_embedding) ? body.context_embedding : [];
    const contextEmbedding = embedding.filter((x) => Number.isFinite(Number(x))).map((x) => Number(x));
    const thresholdRaw = Number(body.similarity_threshold ?? 0.2);
    const similarityThreshold = Number.isFinite(thresholdRaw) ? Math.max(-1, Math.min(1, thresholdRaw)) : 0.2;
    const topKRaw = Number(body.top_k ?? 5);
    const topK = Math.max(1, Math.min(20, Number.isFinite(topKRaw) ? topKRaw : 5));

    if (!agentName) return NextResponse.json({ ok: false, error: "AGENT_NAME_REQUIRED" }, { status: 400 });
    if (contextEmbedding.length === 0) return NextResponse.json({ ok: false, error: "CONTEXT_EMBEDDING_REQUIRED" }, { status: 400 });

    const rows = await pool.query<AgentMemoryRow>(
      `SELECT
         id, story_id, chapter_id, agent_name, source_run_trace_id, memory_type, memory_text,
         embedding_json, score::text, tags, created_at::text
       FROM public.agent_memory_vector
       WHERE story_id = $1
         AND agent_name = $2
         AND (chapter_id = $3 OR chapter_id IS NULL)
       ORDER BY created_at DESC
       LIMIT 300`,
      [storyId, agentName, chapterId]
    );
    const scored = rows.rows
      .map((r) => {
        const emb = Array.isArray(r.embedding_json) ? r.embedding_json : [];
        const v = emb.filter((x) => Number.isFinite(Number(x))).map((x) => Number(x));
        return {
          ...r,
          similarity: cosineSimilarity(contextEmbedding, v),
        };
      })
      .filter((r) => r.similarity >= similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity || Number(b.score || 0) - Number(a.score || 0))
      .slice(0, topK);

    return NextResponse.json({ ok: true, items: scored });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "RETRIEVE_AGENT_MEMORY_FAILED";
    const statusCode = msg === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}

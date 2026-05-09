import { NextRequest, NextResponse } from "next/server";
import type { Pool, PoolClient } from "pg";
import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

const WORKSPACE = "write_assistant";
const MAX_TITLE_LENGTH = 72;
const MESSAGE_ROLES = new Set(["user", "assistant", "system", "tool", "workflow"]);
const STATUS_VALUES = new Set(["active", "archived"]);

type ConversationScope = "current_chapter" | "all_story";

type ConversationRow = {
  id: string;
  story_id: string | number;
  chapter_id: string | null;
  workspace: string;
  title: string | null;
  summary: string | null;
  status: string;
  state_json: unknown;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  block_type: string | null;
  content: string;
  metadata_json: unknown;
  sequence_no: number;
  created_at: string;
};

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function titleFromContent(content: string): string | null {
  const compact = content.trim().replace(/\s+/g, " ");
  if (!compact) return null;
  return compact.length > MAX_TITLE_LENGTH ? `${compact.slice(0, MAX_TITLE_LENGTH - 1)}…` : compact;
}

function mapConversation(row: ConversationRow) {
  return {
    id: row.id,
    story_id: Number(row.story_id),
    chapter_id: row.chapter_id,
    workspace: row.workspace,
    title: row.title,
    summary: row.summary,
    status: row.status,
    state_json: jsonObject(row.state_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message_preview: row.last_message_preview,
  };
}

function mapMessage(row: MessageRow) {
  const metadata = jsonObject(row.metadata_json);
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    block_type: row.block_type,
    content: row.content,
    metadata_json: metadata,
    block: metadata.block ?? null,
    sequence_no: Number(row.sequence_no),
    created_at: row.created_at,
  };
}

function parseScope(value: string | null): ConversationScope {
  return value === "all_story" ? "all_story" : "current_chapter";
}

async function assertConversation(poolOrClient: Pool | PoolClient, storyId: number, conversationId: string): Promise<boolean> {
  if (!validUuid(conversationId)) return false;
  const res = await poolOrClient.query(
    `SELECT id
     FROM public.assistant_conversation
     WHERE id = $1::uuid
       AND story_id = $2
       AND workspace = $3
     LIMIT 1`,
    [conversationId, storyId, WORKSPACE]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listAssistantConversationsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const chapterId = textValue(req.nextUrl.searchParams.get("chapter_id")) || null;
    const scope = parseScope(req.nextUrl.searchParams.get("scope"));
    const params: Array<string | number | null> = [storyId, WORKSPACE];
    const where = ["c.story_id = $1", "c.workspace = $2", "c.status = 'active'"];
    if (scope === "current_chapter") {
      params.push(chapterId);
      where.push(`c.chapter_id IS NOT DISTINCT FROM $${params.length}`);
    }
    const res = await pool.query<ConversationRow>(
      `SELECT
         c.id::text,
         c.story_id,
         c.chapter_id,
         c.workspace,
         c.title,
         c.summary,
         c.status,
         c.state_json,
         c.created_at::text,
         c.updated_at::text,
         lm.content AS last_message_preview
       FROM public.assistant_conversation c
       LEFT JOIN LATERAL (
         SELECT content
         FROM public.assistant_message m
         WHERE m.conversation_id = c.id
         ORDER BY m.sequence_no DESC
         LIMIT 1
       ) lm ON true
       WHERE ${where.join(" AND ")}
       ORDER BY c.updated_at DESC
       LIMIT 60`,
      params
    );
    return NextResponse.json({ ok: true, items: res.rows.map(mapConversation) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "LIST_ASSISTANT_CONVERSATIONS_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function createAssistantConversationResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const chapterId = textValue(body.chapter_id) || null;
    const title = titleFromContent(textValue(body.title));
    const stateJson = jsonObject(body.state_json);
    const res = await pool.query<ConversationRow>(
      `INSERT INTO public.assistant_conversation
        (story_id, chapter_id, workspace, title, state_json)
       VALUES
        ($1, $2, $3, $4, $5::jsonb)
       RETURNING
         id::text,
         story_id,
         chapter_id,
         workspace,
         title,
         summary,
         status,
         state_json,
         created_at::text,
         updated_at::text,
         NULL::text AS last_message_preview`,
      [storyId, chapterId, WORKSPACE, title, JSON.stringify(stateJson)]
    );
    return NextResponse.json({ ok: true, item: mapConversation(res.rows[0]) }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "CREATE_ASSISTANT_CONVERSATION_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function getAssistantConversationResponse(storySlug: string, conversationId: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    if (!validUuid(conversationId)) return NextResponse.json({ ok: false, error: "INVALID_CONVERSATION_ID" }, { status: 400 });
    const res = await pool.query<ConversationRow>(
      `SELECT
         c.id::text,
         c.story_id,
         c.chapter_id,
         c.workspace,
         c.title,
         c.summary,
         c.status,
         c.state_json,
         c.created_at::text,
         c.updated_at::text,
         NULL::text AS last_message_preview
       FROM public.assistant_conversation c
       WHERE c.id = $1::uuid
         AND c.story_id = $2
         AND c.workspace = $3
       LIMIT 1`,
      [conversationId, storyId, WORKSPACE]
    );
    if (res.rowCount === 0) return NextResponse.json({ ok: false, error: "CONVERSATION_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, item: mapConversation(res.rows[0]) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "GET_ASSISTANT_CONVERSATION_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

// eslint-disable-next-line complexity
export async function patchAssistantConversationResponse(req: NextRequest, storySlug: string, conversationId: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    if (!validUuid(conversationId)) return NextResponse.json({ ok: false, error: "INVALID_CONVERSATION_ID" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const stateJson = body.state_json === undefined ? null : jsonObject(body.state_json);
    const title = body.title === undefined ? undefined : titleFromContent(textValue(body.title));
    const status = body.status === undefined ? undefined : textValue(body.status).toLowerCase();
    if (status !== undefined && !STATUS_VALUES.has(status)) return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    const res = await pool.query<ConversationRow>(
      `UPDATE public.assistant_conversation
       SET
         title = COALESCE($4, title),
         status = COALESCE($5, status),
         state_json = CASE WHEN $6::jsonb IS NULL THEN state_json ELSE $6::jsonb END,
         updated_at = now()
       WHERE id = $1::uuid
         AND story_id = $2
         AND workspace = $3
       RETURNING
         id::text,
         story_id,
         chapter_id,
         workspace,
         title,
         summary,
         status,
         state_json,
         created_at::text,
         updated_at::text,
         NULL::text AS last_message_preview`,
      [conversationId, storyId, WORKSPACE, title ?? null, status ?? null, stateJson === null ? null : JSON.stringify(stateJson)]
    );
    if (res.rowCount === 0) return NextResponse.json({ ok: false, error: "CONVERSATION_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, item: mapConversation(res.rows[0]) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "PATCH_ASSISTANT_CONVERSATION_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function listAssistantMessagesResponse(storySlug: string, conversationId: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const exists = await assertConversation(pool, storyId, conversationId);
    if (!exists) return NextResponse.json({ ok: false, error: "CONVERSATION_NOT_FOUND" }, { status: 404 });
    const res = await pool.query<MessageRow>(
      `SELECT
         id::text,
         conversation_id::text,
         role,
         block_type,
         content,
         metadata_json,
         sequence_no,
         created_at::text
       FROM public.assistant_message
       WHERE conversation_id = $1::uuid
       ORDER BY sequence_no ASC`,
      [conversationId]
    );
    return NextResponse.json({ ok: true, items: res.rows.map(mapMessage) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "LIST_ASSISTANT_MESSAGES_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function appendAssistantMessageResponse(req: NextRequest, storySlug: string, conversationId: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as Record<string, unknown>;
    const role = textValue(body.role).toLowerCase();
    if (!MESSAGE_ROLES.has(role)) return NextResponse.json({ ok: false, error: "INVALID_ROLE" }, { status: 400 });
    const blockType = textValue(body.block_type) || null;
    const content = textValue(body.content);
    const metadataJson = jsonObject(body.metadata_json);

    await client.query("BEGIN");
    const exists = await assertConversation(client, storyId, conversationId);
    if (!exists) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CONVERSATION_NOT_FOUND" }, { status: 404 });
    }
    const insertRes = await client.query<MessageRow>(
      `WITH next_sequence AS (
         SELECT COALESCE(MAX(sequence_no), 0) + 1 AS sequence_no
         FROM public.assistant_message
         WHERE conversation_id = $1::uuid
       )
       INSERT INTO public.assistant_message
        (conversation_id, role, block_type, content, metadata_json, sequence_no)
       SELECT $1::uuid, $2, $3, $4, $5::jsonb, sequence_no
       FROM next_sequence
       RETURNING
         id::text,
         conversation_id::text,
         role,
         block_type,
         content,
         metadata_json,
         sequence_no,
         created_at::text`,
      [conversationId, role, blockType, content, JSON.stringify(metadataJson)]
    );
    const title = role === "user" ? titleFromContent(content) : null;
    await client.query(
      `UPDATE public.assistant_conversation
       SET
         title = COALESCE(title, $2),
         updated_at = now()
       WHERE id = $1::uuid`,
      [conversationId, title]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, item: mapMessage(insertRes.rows[0]) }, { status: 201 });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const message = error instanceof Error ? error.message : "APPEND_ASSISTANT_MESSAGE_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  } finally {
    client.release();
  }
}

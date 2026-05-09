import { NextRequest } from "next/server";
import {
  appendAssistantMessageResponse,
  listAssistantMessagesResponse,
} from "@/features/chat-orchestration/server/assistantConversationService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string; conversationId: string }> }) {
  const { slug, conversationId } = await ctx.params;
  return listAssistantMessagesResponse(slug, conversationId);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string; conversationId: string }> }) {
  const { slug, conversationId } = await ctx.params;
  return appendAssistantMessageResponse(req, slug, conversationId);
}

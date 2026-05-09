import { NextRequest } from "next/server";
import {
  getAssistantConversationResponse,
  patchAssistantConversationResponse,
} from "@/features/chat-orchestration/server/assistantConversationService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string; conversationId: string }> }) {
  const { slug, conversationId } = await ctx.params;
  return getAssistantConversationResponse(slug, conversationId);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string; conversationId: string }> }) {
  const { slug, conversationId } = await ctx.params;
  return patchAssistantConversationResponse(req, slug, conversationId);
}

import { NextRequest } from "next/server";
import {
  createAssistantConversationResponse,
  listAssistantConversationsResponse,
} from "@/features/chat-orchestration/server/assistantConversationService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return listAssistantConversationsResponse(req, slug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return createAssistantConversationResponse(req, slug);
}

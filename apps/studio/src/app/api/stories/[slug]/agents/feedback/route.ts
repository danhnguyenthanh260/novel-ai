import { NextRequest } from "next/server";
import { getAgentFeedbackResponse, postAgentFeedbackResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return getAgentFeedbackResponse(req, slug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return postAgentFeedbackResponse(req, slug);
}
